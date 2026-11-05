import { anthropicClient, CAPTION_MODEL } from "./anthropic";
import type { Card } from "./quizlet";

export interface FetchedImage {
  bytes: Buffer;
  mime: string;
}

// Anthropic's vision API accepts these image media types.
const SUPPORTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

function normalizeMime(contentType: string | null, url: string): string {
  const ct = (contentType || "").split(";")[0].trim().toLowerCase();
  if (SUPPORTED_MIME.has(ct)) return ct;
  // Fall back to the extension when the server sends a generic type.
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

/**
 * Quizlet's export links its 240px "_m" thumbnail; the "_b" rendition of the
 * same asset is full size, which keeps diagram labels legible for both Serena
 * and the caption model.
 */
function fullSizeUrl(url: string): string | null {
  const m = url.match(/^(https:\/\/o\.quizlet\.com\/.+)_m(\.\w+)$/);
  return m ? `${m[1]}_b${m[2]}` : null;
}

/** Download a card image, preferring Quizlet's full-size rendition. */
export async function fetchImage(url: string): Promise<FetchedImage> {
  const big = fullSizeUrl(url);
  if (big) {
    try {
      return await fetchImageAt(big);
    } catch {
      // Not every asset has a "_b" rendition; fall back to the linked one.
    }
  }
  return fetchImageAt(url);
}

async function fetchImageAt(url: string): Promise<FetchedImage> {
  const res = await fetch(url, {
    headers: {
      // Some CDNs 403 a request with no UA / referer.
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Referer: "https://quizlet.com/",
    },
  });
  if (!res.ok) {
    throw new Error(`Image download failed (${res.status}) for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error(`Empty image body for ${url}`);
  const mime = normalizeMime(res.headers.get("content-type"), url);
  return { bytes: buf, mime };
}

/**
 * Ask Claude for a short clinical description of a card image. The card text is
 * given as context so the caption uses the same framing Serena studied with.
 * The caption is embedded with the card, so it is what makes an image-only card
 * findable by retrieval.
 */
export async function captionImage(
  image: FetchedImage,
  card: Card,
  side: "term" | "definition",
): Promise<string> {
  const cardText =
    [card.term && `Term: ${card.term}`, card.definition && `Definition: ${card.definition}`]
      .filter(Boolean)
      .join("\n") || "(no text on this card)";

  const prompt = `This image is attached to the ${side} side of an optometry flashcard.\n\nCARD TEXT (for terminology only):\n${cardText}\n\nWrite a one-to-two sentence clinical description of the image for a retrieval index: name the modality or view (e.g. fundus photo, OCT, slit lamp, diagram), the structures shown, and the findings or labels that are actually visible.\n\nDescribe only what you can see in the image. The card text tells you what the card is about, but it is not a description of the image: never state a finding just because the card mentions it. If the image looks normal or does not show what the card describes, say what it does show. Quote printed or handwritten labels exactly as written.\n\nReply with plain text only: no heading, no markdown, no preamble like "This image shows".`;

  const res = await anthropicClient().messages.create(
    {
      model: CAPTION_MODEL,
      max_tokens: 600,
      // Generation-5 models think by default and can spend the whole budget
      // before writing any caption; "between_tools" is how they turn it off.
      ...(/^claude-(haiku|sonnet|opus)-5/.test(CAPTION_MODEL)
        ? { thinking: { type: "between_tools" } as unknown as { type: "disabled" } }
        : {}),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: image.mime as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data: image.bytes.toString("base64"),
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    },
    // Bulk ingest runs many captions at once; ride out rate limits rather
    // than skipping images.
    { maxRetries: 8 },
  );

  // Captions are rendered as single "[Image N: ...]" context lines, so flatten
  // any markdown headings or line breaks the model adds anyway.
  const caption = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join(" ")
    .replace(/^\s*#+\s.*$/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // A cut-off or empty caption is worse than none: fail so a re-run retries.
  if (res.stop_reason === "max_tokens" || !caption) {
    throw new Error(`Incomplete caption (stop_reason: ${res.stop_reason})`);
  }
  return caption;
}

// The same image often appears on several cards; caption it once per process.
const captionCache = new Map<string, Promise<string>>();

/** Download an image and caption it, reusing the caption for repeated URLs. */
export async function describeImage(
  url: string,
  card: Card,
  side: "term" | "definition",
): Promise<{ image: FetchedImage; caption: string }> {
  const image = await fetchImage(url);
  let caption = captionCache.get(url);
  if (!caption) {
    caption = captionImage(image, card, side);
    captionCache.set(url, caption);
    caption.catch(() => captionCache.delete(url));
  }
  return { image, caption: await caption };
}

/** Run `fn` over `items` with at most `limit` calls in flight. */
export async function forEachConcurrent<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    },
  );
  await Promise.all(workers);
}

export const IMAGE_CONCURRENCY = Number(process.env.IMAGE_CONCURRENCY) || 6;
