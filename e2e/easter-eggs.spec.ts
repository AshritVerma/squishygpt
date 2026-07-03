import { test, expect, type Page } from "@playwright/test";

// End-to-end coverage for the Squishy easter eggs. Chat calls are mocked so
// no test ever reaches Anthropic.

/** The SSR HTML renders Cleia's walker with opacity-0; the opacity-100 class
 *  only appears after hydration, so it doubles as a "React is live" signal. */
async function waitForHydration(page: Page) {
  await page.waitForSelector(".duration-700.opacity-100");
}

/** Header mascot (40px, always present). */
const headerMascot = (page: Page) => page.locator("[data-squishy]").first();
/** Empty-state hero mascot (216px, only before the first message). */
const heroMascot = (page: Page) => page.locator("[data-squishy]").nth(1);

async function mockChat(page: Page) {
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/plain" },
      body: "Woof! Mock answer from the brain.",
    }),
  );
}

async function sendMessage(page: Page, text: string) {
  const box = page.getByPlaceholder(/Ask your optometry/);
  await box.fill(text);
  await box.press("Enter");
}

test("squish and hold: flattens, slides glasses, boings back", async ({
  page,
}) => {
  await page.goto("/");
  await waitForHydration(page);

  const hero = heroMascot(page);
  const box = await hero.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await expect(hero).toHaveAttribute("data-squished", "true");

  await page.mouse.up();
  await expect(hero).toHaveAttribute("data-squished", "false");
  await expect(page.getByText("boing!!").first()).toBeVisible();
});

test("konami-ish swipe: circling the mascot makes it dizzy", async ({
  page,
}) => {
  await page.goto("/");
  await waitForHydration(page);

  const hero = heroMascot(page);
  const box = await hero.boundingBox();
  expect(box).toBeTruthy();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  const r = Math.min(box!.width, box!.height) * 0.35;

  // Three quick loops (the egg needs ~1.5).
  for (let i = 0; i <= 60; i++) {
    const a = (i / 20) * 2 * Math.PI;
    await page.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }

  await expect(hero).toHaveAttribute("data-reaction", "dizzy");
  await expect(page.getByText("woah… so dizzy!!").first()).toBeVisible();
});

test("20/20 in a question: star eyes and confetti", async ({ page }) => {
  await mockChat(page);
  await page.goto("/");
  await waitForHydration(page);

  await sendMessage(page, "is 20/20 vision actually perfect?");

  await expect(headerMascot(page)).toHaveAttribute("data-reaction", "stars");
  await expect(page.getByText("perfect vision!! ✨").first()).toBeVisible();
  await expect(page.locator(".confetti-layer")).toBeVisible();
});

test("complimenting the brain makes it bashful", async ({ page }) => {
  await mockChat(page);
  await page.goto("/");
  await waitForHydration(page);

  await sendMessage(page, "thank you squishy, good job!!");

  await expect(headerMascot(page)).toHaveAttribute("data-reaction", "bashful");
  await expect(page.getByText("aww stop it 🥹").first()).toBeVisible();
});

test("milestone evolution: 250th question earns the graduation cap", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("squishygpt.questions.v1", "249"),
  );
  await mockChat(page);
  await page.goto("/");
  await waitForHydration(page);

  const header = headerMascot(page);
  await expect(header).toHaveAttribute("data-level", "0");

  await sendMessage(page, "what is a phoropter?");

  await expect(header).toHaveAttribute("data-level", "1");
  await expect(page.locator('[data-accessory="cap"]').first()).toBeVisible();
  await expect(page.getByText("leveled up!! 🎓").first()).toBeVisible();
});

test("milestone evolution: loads fully evolved at 500+ questions", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("squishygpt.questions.v1", "600"),
  );
  await page.goto("/");
  await waitForHydration(page);

  const header = headerMascot(page);
  await expect(header).toHaveAttribute("data-level", "2");
  await expect(page.locator('[data-accessory="cap"]').first()).toBeVisible();
  await expect(
    page.locator('[data-accessory="stethoscope"]').first(),
  ).toBeVisible();
});

test("nap sync: Squishy gets drowsy while Cleia naps, wakes together", async ({
  page,
}) => {
  await page.goto("/?cleia=nap");
  await waitForHydration(page);

  const header = headerMascot(page);
  await expect(header).toHaveAttribute("data-drowsy", "true");
  await expect(
    page.getByText("shh… cleia's sleeping 💤").first(),
  ).toBeVisible();

  // Any activity wakes Cleia, which un-drowses Squishy.
  await page.keyboard.press("a");
  await expect(header).toHaveAttribute("data-drowsy", "false");
});

test("glasses steal: Cleia wears them, Squishy squints, then returned", async ({
  page,
}) => {
  await page.goto("/");
  await waitForHydration(page);

  const header = headerMascot(page);
  await page.evaluate(() =>
    window.dispatchEvent(new Event("squishy:steal-request")),
  );

  await expect(header).toHaveAttribute("data-glasses", "stolen");
  await expect(page.locator("[data-cleia-glasses]")).toBeVisible();
  await expect(
    page.getByText("hey!! give those back!!").first(),
  ).toBeVisible();

  // She keeps them for ~10s before giving them back.
  await expect(header).toHaveAttribute("data-glasses", "on", {
    timeout: 14_000,
  });
  await expect(page.locator("[data-cleia-glasses]")).toHaveCount(0);
});
