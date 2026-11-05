import { test, expect, type Page } from "@playwright/test";

// Regression coverage for the "Sorry, I couldn't reach the brain just now"
// outage: a single failing dependency (embeddings quota) used to 500 the chat
// route and leave the generic apology as the only thing Serena ever saw.
//
// Chat responses are mocked, so nothing here reaches Anthropic or OpenAI.

const STORAGE_KEY = "squishygpt.conversations.v1";

async function waitForHydration(page: Page) {
  await page.waitForSelector(".duration-700.opacity-100");
}

/** Keep the cross-device sync from overwriting seeded local history. */
async function stubStateSync(page: Page) {
  await page.route("**/api/state**", (route) =>
    route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: null }),
    }),
  );
}

async function sendMessage(page: Page, text: string) {
  const box = page.getByPlaceholder(/Ask your optometry/);
  await box.fill(text);
  await box.press("Enter");
}

test.describe("chat degrades instead of breaking", () => {
  test.beforeEach(async ({ page }) => {
    await stubStateSync(page);
  });

  test("an API error is shown verbatim, not hidden behind the generic apology", async ({
    page,
  }) => {
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 429,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "I'm out of Claude credits or being rate limited right now.",
        }),
      }),
    );

    await page.goto("/");
    await waitForHydration(page);
    await sendMessage(page, "what is CRVO?");

    await expect(page.getByText(/out of Claude credits/)).toBeVisible();
    await expect(page.getByText(/couldn't reach the brain/)).toHaveCount(0);
  });

  test("a non-JSON failure still falls back to a readable message", async ({
    page,
  }) => {
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 500,
        headers: { "Content-Type": "text/html" },
        body: "<html><body>Internal Server Error</body></html>",
      }),
    );

    await page.goto("/");
    await waitForHydration(page);
    await sendMessage(page, "what is CRAO?");

    await expect(page.getByText(/couldn't reach the brain/)).toBeVisible();
  });

  test("keyword-only retrieval is flagged as degraded", async ({ page }) => {
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "X-Retrieval-Mode": "keyword",
        },
        body: "Phenylephrine is an alpha-1 agonist.",
      }),
    );

    await page.goto("/");
    await waitForHydration(page);
    await sendMessage(page, "phenylephrine vs apraclonidine");

    await expect(page.getByText(/Set matching is degraded/)).toBeVisible();
    await expect(page.getByText(/alpha-1 agonist/)).toBeVisible();
  });

  test("a fully grounded answer carries no degradation warning", async ({
    page,
  }) => {
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "X-Retrieval-Mode": "vector",
        },
        body: "CRVO shows flame haemorrhages in all four quadrants.",
      }),
    );

    await page.goto("/");
    await waitForHydration(page);
    await sendMessage(page, "what is CRVO?");

    await expect(page.getByText(/flame haemorrhages/)).toBeVisible();
    await expect(page.getByText(/Set matching is degraded/)).toHaveCount(0);
    await expect(page.getByText(/couldn't search your study sets/)).toHaveCount(
      0,
    );
  });

  test("an empty assistant turn in saved history is never sent upstream", async ({
    page,
  }) => {
    // An interrupted stream used to leave an empty assistant bubble behind.
    // Claude rejects empty turns, so every later question in that conversation
    // failed until the chat was deleted.
    await page.addInitScript(
      ([key, convos]) => {
        window.localStorage.setItem(key as string, convos as string);
      },
      [
        STORAGE_KEY,
        JSON.stringify([
          {
            id: "poisoned",
            title: "conversation with an empty reply",
            updatedAt: Date.now(),
            messages: [
              { id: "u1", role: "user", content: "what is CRAO?" },
              { id: "a1", role: "assistant", content: "" },
            ],
          },
        ]),
      ],
    );

    const bodies: string[] = [];
    await page.route("**/api/chat", (route) => {
      bodies.push(route.request().postData() ?? "");
      return route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/plain" },
        body: "CRVO is a central retinal vein occlusion.",
      });
    });

    await page.goto("/");
    await waitForHydration(page);

    await page.getByLabel("Open conversation history").click();
    await page.getByText("conversation with an empty reply").click();
    await sendMessage(page, "and CRVO?");

    await expect(page.getByText(/central retinal vein occlusion/)).toBeVisible();

    expect(bodies).toHaveLength(1);
    const sent = JSON.parse(bodies[0]).messages as {
      role: string;
      content: string;
    }[];
    expect(sent.every((m) => m.content.trim().length > 0)).toBe(true);
    expect(sent.at(-1)?.content).toBe("and CRVO?");
  });
});

test.describe("chat API rejects malformed input cleanly", () => {
  // These paths return before any upstream call, so they cost nothing and
  // pin down the JSON error shape the UI depends on.
  const cases: { name: string; body: string }[] = [
    { name: "no messages", body: JSON.stringify({ messages: [] }) },
    {
      name: "whitespace-only question",
      body: JSON.stringify({ messages: [{ role: "user", content: "   " }] }),
    },
    {
      name: "assistant turns only",
      body: JSON.stringify({ messages: [{ role: "assistant", content: "hi" }] }),
    },
    { name: "not json", body: "definitely not json" },
  ];

  for (const { name, body } of cases) {
    test(`${name} -> 400 with a JSON error`, async ({ request }) => {
      const res = await request.post("/api/chat", {
        headers: { "Content-Type": "application/json" },
        data: body,
      });
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toBeTruthy();
    });
  }
});
