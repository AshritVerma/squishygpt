/*
 * Quizlet bulk exporter — browser console script.
 *
 * How to use:
 *   1. Log into https://quizlet.com in your browser.
 *   2. Open the profile page whose sets you want, e.g.
 *      https://quizlet.com/user/Serenab133/sets
 *   3. Open DevTools → Console. Paste this entire file and press Enter.
 *   4. Wait for the "Downloaded quizlet-export.json" log. Move the file into
 *      the repo's data/ folder, then run: npm run ingest:json
 *
 * Rate limiting & resuming:
 *   Quizlet's Cloudflare starts returning 403 after ~30 rapid requests. To
 *   handle this the script:
 *     - throttles between sets and retries 403/429 with exponential backoff, and
 *     - caches every set it successfully pulls in localStorage.
 *   So if it still gets cut off, just RE-RUN it (reload the page first, then
 *   paste again): already-cached sets are skipped and only the missing ones
 *   are fetched. After a run or two you'll have all of them, and each run
 *   downloads the full combined file (everything cached so far).
 *
 * Optional flags you can set BEFORE running:
 *   window.QZ_ONLY_FIRST  = true;   // Only process the first set (smoke test)
 *   window.QZ_LIMIT       = 5;      // Process only the first N sets
 *   window.QZ_THROTTLE_MS = 1200;   // Base delay between set fetches (default 900)
 *   window.QZ_MAX_ATTEMPTS = 6;     // Retries per set on 403/429 (default 5)
 *   window.QZ_DOM_FALLBACK = true;  // Try iframe DOM scrape if API fails (default off; noisy, rarely helps under rate limits)
 *   window.QZ_RESET = true;         // Clear the localStorage cache and start fresh
 *
 * Why this shape:
 *   Quizlet's server-side pages are gated by Cloudflare, but the same-origin
 *   in-browser web API returns clean JSON when you're logged in. So this
 *   script runs in the tab and uses `fetch(..., { credentials: "include" })`
 *   to piggy-back on your session cookie.
 */

(async () => {
  const CACHE_KEY = "qz_export_cache_v1";

  const PROFILE_URL_RE = /\/user\/[^/]+\/sets\/?$/;
  if (!PROFILE_URL_RE.test(location.pathname)) {
    console.warn(
      "[quizlet-export] You are not on a /user/<name>/sets page. Navigate there first.",
    );
  }

  const THROTTLE_MS =
    typeof window.QZ_THROTTLE_MS === "number" ? window.QZ_THROTTLE_MS : 900;
  const MAX_ATTEMPTS =
    typeof window.QZ_MAX_ATTEMPTS === "number" ? window.QZ_MAX_ATTEMPTS : 5;
  const ONLY_FIRST = window.QZ_ONLY_FIRST === true;
  const LIMIT = typeof window.QZ_LIMIT === "number" ? window.QZ_LIMIT : null;
  const DOM_FALLBACK = window.QZ_DOM_FALLBACK === true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jitter = (ms) => ms + Math.floor(Math.random() * 400);

  // ---------------------------------------------------------------------------
  // Persistent cache so a re-run resumes instead of starting over.
  // ---------------------------------------------------------------------------
  function loadCache() {
    if (window.QZ_RESET === true) {
      localStorage.removeItem(CACHE_KEY);
      console.log("[quizlet-export] QZ_RESET set — cleared cache.");
      return {};
    }
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    } catch {
      return {};
    }
  }
  function saveCache(cache) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (err) {
      console.warn("[quizlet-export] Could not persist cache:", err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Auto-scroll the profile to load every set link, then collect them.
  // ---------------------------------------------------------------------------
  async function autoScroll() {
    let last = -1;
    let stable = 0;
    for (let i = 0; i < 200; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(400);
      const h = document.body.scrollHeight;
      if (h === last) {
        stable++;
        if (stable >= 3) break;
      } else {
        stable = 0;
        last = h;
      }
    }
    window.scrollTo(0, 0);
  }

  function collectSetsFromProfile() {
    const seen = new Map();
    const anchors = document.querySelectorAll("a[href*='-flash-cards']");
    for (const a of anchors) {
      const m = a.getAttribute("href")?.match(/\/(\d+)\/([^/?#]+)-flash-cards/);
      if (!m) continue;
      const id = m[1];
      if (seen.has(id)) continue;
      const title = (a.textContent || "").trim() || m[2].replace(/-/g, " ");
      const url = `https://quizlet.com/${id}/${m[2]}-flash-cards`;
      seen.set(id, { id, title, url });
    }
    return [...seen.values()];
  }

  // ---------------------------------------------------------------------------
  // 2. Pull term/definition cards for a single set (API, with retry/backoff).
  // ---------------------------------------------------------------------------
  function extractSidesFromItem(item) {
    // Each `cardSide` has a `label` ("word" | "definition") and a `media`
    // array whose entries have `plainText` (or `richText`).
    const sides =
      item?.cardSides ||
      item?.studiableItem?.cardSides ||
      item?.item?.cardSides ||
      [];
    let term = "";
    let definition = "";
    for (const side of sides) {
      const label = side.label || side.sideLabel || "";
      const media = side.media || side.mediaList || [];
      const text = media
        .map((m) => m?.plainText || m?.richText?.plainText || m?.text || "")
        .filter(Boolean)
        .join(" ")
        .trim();
      if (!text) continue;
      if (label === "word") term = text;
      else if (label === "definition") definition = text;
      else if (!term) term = text;
      else if (!definition) definition = text;
    }
    return { term, definition };
  }

  async function fetchCardsViaApiOnce(setId) {
    const url =
      `https://quizlet.com/webapi/3.4/studiable-item-documents` +
      `?filters[studiableContainerId]=${setId}` +
      `&filters[studiableContainerType]=1` +
      `&perPage=1000&page=1`;
    const res = await fetch(url, {
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      const err = new Error(`API ${res.status} for set ${setId}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const items =
      data?.responses?.[0]?.models?.studiableItem ||
      data?.responses?.[0]?.models?.studiableItemDocument ||
      data?.models?.studiableItem ||
      data?.items ||
      [];
    const cards = [];
    for (const item of items) {
      const { term, definition } = extractSidesFromItem(item);
      if (term && definition) cards.push({ term, definition });
    }
    return cards;
  }

  // Retries on rate-limit / transient errors with exponential backoff.
  async function fetchCardsViaApi(setId) {
    let lastErr;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await fetchCardsViaApiOnce(setId);
      } catch (err) {
        lastErr = err;
        const retryable =
          err.status === 403 ||
          err.status === 429 ||
          (err.status >= 500 && err.status < 600) ||
          err.status === undefined; // network hiccup
        if (!retryable || attempt === MAX_ATTEMPTS) break;
        const backoff = jitter(Math.min(2000 * 2 ** (attempt - 1), 60000));
        console.warn(
          `[quizlet-export]   ${err.message} — backing off ${(backoff / 1000).toFixed(1)}s (attempt ${attempt}/${MAX_ATTEMPTS})`,
        );
        await sleep(backoff);
      }
    }
    throw lastErr;
  }

  async function fetchCardsViaDom(setUrl) {
    // Optional fallback: open the set page in a hidden iframe and read the
    // rendered terms. Off by default — it triggers CSP/captcha noise and
    // doesn't work while you're being rate limited.
    return new Promise((resolve, reject) => {
      const frame = document.createElement("iframe");
      frame.style.cssText =
        "position:fixed;left:-9999px;top:-9999px;width:1024px;height:2048px;";
      frame.src = setUrl;
      const timeout = setTimeout(() => {
        frame.remove();
        reject(new Error(`DOM fallback timed out for ${setUrl}`));
      }, 30000);
      frame.addEventListener("load", async () => {
        try {
          await sleep(1500);
          const doc = frame.contentDocument;
          const cards = [];
          const rows =
            doc?.querySelectorAll(
              "[class*='SetPageTerm'], [data-testid='set-page-term']",
            ) || [];
          for (const row of rows) {
            const cells = row.querySelectorAll(
              "[class*='TermText'], [data-testid='term-text']",
            );
            if (cells.length >= 2) {
              const term = (cells[0].textContent || "").trim();
              const definition = (cells[1].textContent || "").trim();
              if (term && definition) cards.push({ term, definition });
            }
          }
          clearTimeout(timeout);
          frame.remove();
          resolve(cards);
        } catch (err) {
          clearTimeout(timeout);
          frame.remove();
          reject(err);
        }
      });
      document.body.appendChild(frame);
    });
  }

  async function fetchCardsForSet(set) {
    try {
      const cards = await fetchCardsViaApi(set.id);
      if (cards.length > 0) return { cards, via: "api" };
      throw new Error("API returned zero cards");
    } catch (apiErr) {
      if (!DOM_FALLBACK) throw apiErr;
      console.warn(
        `[quizlet-export] API failed for ${set.id} (${set.title}): ${apiErr.message}. Trying DOM fallback…`,
      );
      const cards = await fetchCardsViaDom(set.url);
      return { cards, via: "dom" };
    }
  }

  function download(results) {
    const blob = new Blob([JSON.stringify(results, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "quizlet-export.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  // ---------------------------------------------------------------------------
  // 3. Orchestrate: scroll → collect → fetch missing (resumable) → download.
  // ---------------------------------------------------------------------------
  console.log("[quizlet-export] Auto-scrolling profile to load all sets…");
  await autoScroll();
  let sets = collectSetsFromProfile();
  console.log(`[quizlet-export] Found ${sets.length} sets on this profile.`);

  if (ONLY_FIRST) sets = sets.slice(0, 1);
  else if (LIMIT) sets = sets.slice(0, LIMIT);

  const cache = loadCache();
  const cachedCount = sets.filter((s) => cache[s.id]?.cards?.length).length;
  if (cachedCount) {
    console.log(
      `[quizlet-export] Resuming: ${cachedCount}/${sets.length} sets already cached, fetching the rest.`,
    );
  }

  let fetched = 0;
  const failures = [];
  for (let i = 0; i < sets.length; i++) {
    const set = sets[i];
    const tag = `[${i + 1}/${sets.length}]`;

    if (cache[set.id]?.cards?.length) {
      console.log(`${tag} • ${set.title} — cached (${cache[set.id].cards.length})`);
      continue;
    }

    try {
      const { cards, via } = await fetchCardsForSet(set);
      if (cards.length === 0) throw new Error("No cards extracted");
      cache[set.id] = { title: set.title, url: set.url, cards };
      saveCache(cache);
      fetched++;
      console.log(`${tag} ✓ ${set.title} — ${cards.length} cards (${via})`);
    } catch (err) {
      failures.push({ set, error: err.message });
      console.error(`${tag} ✗ ${set.title} — ${err.message}`);
    }
    await sleep(jitter(THROTTLE_MS));
  }

  // Build the combined file from everything cached so far, in profile order.
  const results = sets
    .filter((s) => cache[s.id]?.cards?.length)
    .map((s) => ({
      title: cache[s.id].title,
      url: cache[s.id].url,
      cards: cache[s.id].cards,
    }));
  const totalCards = results.reduce((n, s) => n + s.cards.length, 0);

  console.log(
    `[quizlet-export] Done: ${results.length}/${sets.length} sets ready, ${totalCards} cards ` +
      `(fetched ${fetched} this run). ${failures.length} still failing.`,
  );
  if (failures.length) {
    console.warn(
      "[quizlet-export] Still missing — RE-RUN the script to retry just these (reload the page first):",
      failures.map((f) => `${f.set.title} (${f.error})`),
    );
  }

  download(results);
  console.log(
    "[quizlet-export] Downloaded quizlet-export.json — move it into data/ and run: npm run ingest:json",
  );

  window.__quizletExport = { results, failures, cache };
})();
