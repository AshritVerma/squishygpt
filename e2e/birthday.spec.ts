import { test, expect, type Page } from "@playwright/test";

// End-to-end coverage for Serena's birthday mode (Aug 25). Every test uses
// the ?cleia=birthday preview param, which turns on all client-side party
// features without waiting for the real date. The server-side gift payout is
// date-gated for real, so those tests mock /api/wallet/birthday.

/** The SSR HTML renders Cleia's walker with opacity-0; the opacity-100 class
 *  only appears after hydration, so it doubles as a "React is live" signal. */
async function waitForHydration(page: Page) {
  await page.waitForSelector(".duration-700.opacity-100");
}

/** Header mascot (40px, always present). */
const headerMascot = (page: Page) => page.locator("[data-squishy]").first();
/** Empty-state hero mascot (216px, only before the first message). */
const heroMascot = (page: Page) => page.locator("[data-squishy]").nth(1);

const gotoBirthday = async (page: Page) => {
  await page.goto("/?cleia=birthday");
  await waitForHydration(page);
};

test("party mode: hats on, birthday greeting, cleia cheers", async ({
  page,
}) => {
  await gotoBirthday(page);

  // Cleia's cheer first: her greeting bubble is replaced by the 900ms hop
  // cheer, so match either while the window is open.
  await expect(page.getByText(/HAPPY BIRTHDAY/).first()).toBeVisible();

  await expect(headerMascot(page)).toHaveAttribute("data-party", "true");
  await expect(heroMascot(page)).toHaveAttribute("data-party", "true");
  await expect(page.locator('[data-accessory="party"]').first()).toBeVisible();

  await expect(page.getByText("It's your day, Dr. Serena 🎉")).toBeVisible();
  await expect(page.getByText("happy birthday, doctor 🎂")).toBeVisible({
    timeout: 10_000,
  });
});

test("birthday fact and party suggestions replace the study ones", async ({
  page,
}) => {
  await gotoBirthday(page);

  await expect(
    page.getByText(/the world's best future optometrist was born/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "How old is Serena in dog years?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "What did Cleia get me for my birthday?" }),
  ).toBeVisible();
});

test("gift claim: confetti and cleia's announcement on payout", async ({
  page,
}) => {
  // The real server only pays on Aug 25, so pretend it's the day.
  await page.route("**/api/wallet/birthday", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        awarded: 500,
        wallet: { balance: 500, lifetime: 500, claims: [] },
      }),
    }),
  );
  await gotoBirthday(page);

  await expect(page.locator(".confetti-layer").first()).toBeVisible();
  await expect(
    page.getByText("i saved up 500 paw points for you!! 🎁🐾").first(),
  ).toBeVisible({ timeout: 8_000 });
});

test("balloons: poppable, the golden one hides the gift note", async ({
  page,
}) => {
  await gotoBirthday(page);

  const balloons = page.getByTestId("birthday-balloon");
  const gift = page.getByTestId("gift-balloon");
  await expect(balloons).toHaveCount(5);
  await expect(gift).toHaveCount(1);

  // Balloons drift constantly, so dispatch the click instead of aiming.
  await balloons.first().dispatchEvent("click");
  await expect(balloons).toHaveCount(4);

  await gift.dispatchEvent("click");
  const note = page.getByTestId("gift-balloon-note");
  await expect(note).toBeVisible();
  await expect(note.getByText(/500 paw/)).toBeVisible();

  // The note opens the year-in-review recap.
  await note.getByRole("button", { name: /See your year in review/ }).click();
  await expect(page.getByTestId("birthday-recap")).toBeVisible();
});

test("popping every balloon throws confetti and retires them for the day", async ({
  page,
}) => {
  await gotoBirthday(page);

  // Gift first (and close its note), then the rest — the last pop retires
  // the whole layer, so the note must already be out of the way.
  await page.getByTestId("gift-balloon").dispatchEvent("click");
  await page
    .getByTestId("gift-balloon-note")
    .getByRole("button", { name: /Back to the balloons/ })
    .click();
  for (let i = 0; i < 5; i++) {
    await page.getByTestId("birthday-balloon").first().dispatchEvent("click");
  }

  await expect(page.locator(".confetti-layer").first()).toBeVisible();
  await expect(page.getByTestId("birthday-balloon")).toHaveCount(0);
  await expect(page.getByTestId("gift-balloon")).toHaveCount(0);

  // Gone for the rest of the day, even after a reload.
  await page.reload();
  await waitForHydration(page);
  await expect(page.getByTestId("gift-balloon")).toHaveCount(0);
});

test("the letter from squishy & cleia opens and reads her stats", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("squishygpt.questions.v1", "342"),
  );
  await gotoBirthday(page);

  await page.getByTestId("birthday-letter").click();
  const letter = page.getByTestId("birthday-letter-open");
  await expect(letter).toBeVisible();
  await expect(letter.getByText(/Happy birthday/)).toBeVisible();
  await expect(letter.getByText(/342 questions/)).toBeVisible();

  await letter
    .getByRole("button", { name: /See your year in review/ })
    .click();
  await expect(letter).not.toBeVisible();
  await expect(page.getByTestId("birthday-recap")).toBeVisible();
});

test("serena wrapped: header gift button opens the recap with stats", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("squishygpt.questions.v1", "342"),
  );
  await gotoBirthday(page);

  await page.getByRole("button", { name: "Open your birthday recap" }).click();
  const recap = page.getByTestId("birthday-recap");
  await expect(recap).toBeVisible();
  await expect(recap.getByText("Wrapped")).toBeVisible();
  await expect(recap.getByText("Questions asked")).toBeVisible();
  await expect(recap.getByText("342", { exact: true })).toBeVisible();

  await recap.getByRole("button", { name: "Close recap" }).click();
  await expect(recap).not.toBeVisible();
});

test("paw shop: birthday exclusives appear, today only", async ({ page }) => {
  await gotoBirthday(page);

  await page.getByRole("button", { name: "Open Cleia's arcade" }).click();
  await page.getByRole("button", { name: /Paw Shop/ }).click();

  const shop = page.getByTestId("birthday-shop");
  await expect(shop).toBeVisible();
  await expect(shop.getByText("today only!!")).toBeVisible();
  await expect(shop.getByText("Birthday dinner, anywhere")).toBeVisible();
  await expect(shop.getByText("One no-questions-asked gift")).toBeVisible();
  await expect(shop.getByText("Queen-for-the-day pass")).toBeVisible();
});

test("arcade: treat catch becomes cake catch at 2x points", async ({
  page,
}) => {
  await gotoBirthday(page);

  await page.getByRole("button", { name: "Open Cleia's arcade" }).click();
  const cakeCatch = page.getByRole("button", { name: /Cake Catch 🎂/ });
  await expect(cakeCatch).toBeVisible();
  await expect(
    page.getByText("Birthday special: catch the cake, 2× points!"),
  ).toBeVisible();

  await cakeCatch.click();
  await expect(
    page.getByText(/Birthday mode!! Catch the cake, dodge grapes/),
  ).toBeVisible();
});

test("login page joins the party", async ({ browser }) => {
  // A fresh, unauthenticated context so /login doesn't bounce to the app.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login?cleia=birthday");

  await expect(
    page.getByText("happy birthday, dr. serena!! 🎂🎈"),
  ).toBeVisible();
  await expect(headerMascot(page)).toHaveAttribute("data-party", "true");
  await expect(page.locator(".confetti-layer")).toBeVisible();
  await context.close();
});

test("no party on a regular day", async ({ page }) => {
  await page.goto("/");
  await waitForHydration(page);

  await expect(headerMascot(page)).toHaveAttribute("data-party", "false");
  await expect(page.getByTestId("birthday-balloon")).toHaveCount(0);
  await expect(page.getByTestId("birthday-letter")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open your birthday recap" }),
  ).toHaveCount(0);
  await expect(page.getByText("Hi Squishy! 👋")).toBeVisible();
});
