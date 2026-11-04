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

/** Download an image URL into bytes + a normalized mime type. */
export async function fetchImage(url: string): Promise<FetchedImage> {
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

  const prompt = `This image is attached to the ${side} side of an optometry flashcard.\n\nCARD TEXT (for terminology only):\n${cardText}\n\nWrite a one-to-two sentence clinical description of the image for a retrieval index: name the modality or view (e.g. fundus photo, OCT, slit lamp, diagram), the structures shown, and the findings or labels that are actually visible.\n\nDescribe only what you can see in the image. The card text tells you what the card is about, but it is not a description of the image: never state a finding just because the card mentions it. If the image looks normal or does not show what the card describes, say what it does show.\n\nReply with plain text only: no heading, no markdown, no preamble like "This image shows".`;

  const res = await anthropicClient().messages.create({
    model: CAPTION_MODEL,
    max_tokens: 200,
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
  });

  // Captions are rendered as single "[Image N: ...]" context lines, so flatten
  // any markdown headings or line breaks the model adds anyway.
  return res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join(" ")
    .replace(/^\s*#+\s.*$/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
