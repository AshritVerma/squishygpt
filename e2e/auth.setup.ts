import { test as setup, expect } from "@playwright/test";

// Log in once with the site password and save the session cookie for all
// other tests to reuse.
setup("authenticate", async ({ request }) => {
  const password = process.env.SITE_PASSWORD;
  expect(
    password,
    "SITE_PASSWORD must be set (normally loaded from .env.local)",
  ).toBeTruthy();
  const res = await request.post("/api/login", { data: { password } });
  expect(res.ok()).toBeTruthy();
  await request.storageState({ path: "e2e/.auth/state.json" });
});
