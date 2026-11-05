import { test, expect, type Page } from "@playwright/test";

// The arcade's study games, played end to end. Card data and image bytes are
// mocked (the local DB may have no card images); wallet calls are real.

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const TERMS = [
  "Horner's syndrome",
  "Circle of Willis",
  "Tear film",
  "Maddox rod",
  "Gonioscopy",
  "Retinoschisis",
  "Vernal conjunctivitis",
  "Optic disc",
  "Iris nevus",
  "Keratoconus",
  "Pterygium",
  "Pinguecula",
  "Papilledema",
  "Drusen",
  "Arcus",
  "Chalazion",
];

const mockCards = (n: number) =>
  TERMS.slice(0, n).map((term, i) => ({
    imageId: 1000 + i,
    term,
    setTitle: "Mock Set",
    choices: [term, ...TERMS.filter((t) => t !== term).slice(0, 3)].sort(),
  }));

const termForSrc = (src: string | null) =>
  TERMS[Number(src?.split("/").pop()) - 1000];

const gamePic = (page: Page) => page.locator('img[alt="Flashcard image"]');

async function openArcade(page: Page, cards?: unknown[]) {
  await page.route("**/api/arcade/image-cards**", (route) => {
    const count = Number(
      new URL(route.request().url()).searchParams.get("count"),
    );
    return route.fulfill({ json: { cards: cards ?? mockCards(count) } });
  });
  await page.route("**/api/card-images/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG }),
  );
  await page.goto("/");
  await page.waitForSelector(".duration-700.opacity-100");
  await page.getByRole("button", { name: "Open Cleia's arcade" }).click();
}

test("arcade menu lists the study games", async ({ page }) => {
  await openArcade(page);
  await expect(page.getByText("Study with your cards 📸")).toBeVisible();
  for (const name of [/Name That Pic/, /Pic Match/, /Snap Judgment/]) {
    await expect(page.getByRole("button", { name })).toBeVisible();
  }
});

test("name that pic: a perfect run of 10", async ({ page }) => {
  await openArcade(page);
  await page.getByRole("button", { name: /Name That Pic/ }).click();
  await page.getByText("Tap to start").click();

  for (let round = 0; round < 10; round++) {
    const src = await gamePic(page).getAttribute("src");
    await page.getByRole("button", { name: termForSrc(src), exact: true }).click();
    if (round < 9) {
      await expect(gamePic(page)).not.toHaveAttribute("src", src!);
    }
  }
  await expect(page.getByText("10/10 right")).toBeVisible();
  await expect(page.getByRole("button", { name: "Play again" })).toBeVisible();
});

test("name that pic: a miss reveals the right answer", async ({ page }) => {
  await openArcade(page);
  await page.getByRole("button", { name: /Name That Pic/ }).click();
  await page.getByText("Tap to start").click();

  const right = termForSrc(await gamePic(page).getAttribute("src"));
  const wrong = page.locator("button[data-choice]").filter({
    hasNotText: right,
  });
  await wrong.first().click();
  await expect(
    page.getByRole("button", { name: right, exact: true }),
  ).toHaveClass(/emerald/);
  await expect(page.getByText("From “Mock Set”")).toBeVisible();
});

test("pic match: matching every picture to its term", async ({ page }) => {
  await openArcade(page);
  await page.getByRole("button", { name: /Pic Match/ }).click();
  await page.getByText("Tap to start").click();

  for (let pair = 0; pair < 6; pair++) {
    const tiles = page.locator(`button[data-pair="${pair}"]`);
    await tiles.nth(0).click();
    await tiles.nth(1).click();
    await expect(tiles.nth(0)).toHaveClass(/emerald/);
  }
  await expect(page.getByText(/6 moves/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Play again" })).toBeVisible();
});

test("snap judgment: right calls score, wrong ones teach", async ({ page }) => {
  await openArcade(page);
  await page.getByRole("button", { name: /Snap Judgment/ }).click();
  await page.getByText("Tap to start").click();

  const shownTerm = page.locator("p:has-text('Is this') span.font-bold");
  const answer = async (correctly: boolean) => {
    const src = await gamePic(page).getAttribute("src");
    const isTrue = (await shownTerm.textContent()) === termForSrc(src);
    const sayYes = correctly ? isTrue : !isTrue;
    await page.getByRole("button", { name: sayYes ? "✓ Yes" : "✗ Nope" }).click();
    return src;
  };

  for (let i = 0; i < 3; i++) {
    const src = await answer(true);
    await expect(gamePic(page)).not.toHaveAttribute("src", src!);
  }
  await expect(page.locator(".font-bold.text-\\[var\\(--accent\\)\\]")).toHaveText("30");

  const src = await answer(false);
  await expect(page.getByText(/^(It was!|Nope, it's)/)).toBeVisible();
  await expect(page.locator(".font-bold.text-\\[var\\(--accent\\)\\]")).toHaveText("25");
  await expect(page.getByText(termForSrc(src)).last()).toBeVisible();
});

test("study games explain when there are no card images", async ({ page }) => {
  await openArcade(page, []);
  await page.getByRole("button", { name: /Name That Pic/ }).click();
  await expect(page.getByText(/No card images yet/)).toBeVisible();
});
