import { test, expect, type Page } from "@playwright/test";

// Verifies usage events batch through to /api/track. The ingest endpoint is
// intercepted so tests are hermetic (no rows written) and no chat reaches
// Anthropic. The client flushes on a ~4s timer, so assertions poll.

interface CapturedEvent {
  name: string;
  props: Record<string, unknown>;
}

async function waitForHydration(page: Page) {
  await page.waitForSelector(".duration-700.opacity-100");
}

/** Intercept /api/track and collect every event from every batch. */
async function captureTrack(page: Page): Promise<CapturedEvent[]> {
  const events: CapturedEvent[] = [];
  await page.route("**/api/track", async (route) => {
    const req = route.request();
    let body: { events?: CapturedEvent[] } | null = null;
    try {
      body = req.postDataJSON();
    } catch {
      try {
        body = JSON.parse(req.postData() || "{}");
      } catch {
        body = null;
      }
    }
    for (const e of body?.events ?? []) events.push(e);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  return events;
}

async function mockChat(page: Page) {
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/plain" },
      body: "Woof! Mock answer.",
    }),
  );
}

const names = (events: CapturedEvent[]) => events.map((e) => e.name);

test("fires session_start and page_view on load", async ({ page }) => {
  const events = await captureTrack(page);
  await page.goto("/");
  await waitForHydration(page);

  await expect.poll(() => names(events), { timeout: 10_000 }).toContain(
    "session_start",
  );
  expect(names(events)).toContain("page_view");
});

test("suggestion_clicked batches through with an index", async ({ page }) => {
  await mockChat(page);
  const events = await captureTrack(page);
  await page.goto("/");
  await waitForHydration(page);

  await page.locator(".chip-in").first().click();

  await expect
    .poll(() => names(events), { timeout: 10_000 })
    .toContain("suggestion_clicked");
  const clicked = events.find((e) => e.name === "suggestion_clicked");
  expect(clicked?.props).toHaveProperty("index");
});

test("arcade open and game start are tracked", async ({ page }) => {
  const events = await captureTrack(page);
  await page.goto("/");
  await waitForHydration(page);

  await page.getByLabel("Open Cleia's arcade").click();
  await page.getByText("Cleia Runner").click();

  await expect
    .poll(() => names(events), { timeout: 10_000 })
    .toContain("arcade_game_started");
  expect(names(events)).toContain("arcade_opened");
  const started = events.find((e) => e.name === "arcade_game_started");
  expect(started?.props.game).toBe("runner");
});

test("easter egg (20/20) is tracked", async ({ page }) => {
  await mockChat(page);
  const events = await captureTrack(page);
  await page.goto("/");
  await waitForHydration(page);

  const box = page.getByPlaceholder(/Ask your optometry/);
  await box.fill("is 20/20 vision perfect?");
  await box.press("Enter");

  await expect
    .poll(() => names(events), { timeout: 10_000 })
    .toContain("easter_egg");
  const eggs = events
    .filter((e) => e.name === "easter_egg")
    .map((e) => e.props.egg);
  expect(eggs).toContain("2020");
});
