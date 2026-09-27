import { expect, test, type Page } from "@playwright/test";

// App smoke test on the Query to Quote seed (task 0.2). The end-to-end quote flow is
// e2e/golden-quote-flow.spec.ts, which grows with the build. Chat is scripted (spec §6.5).
const BASE_URL = process.env.QUERENT_BASE_URL || "http://127.0.0.1:3000";
async function choose(page: Page, name: string) {
  await page.goto(BASE_URL);
  await page.getByRole("button", { name: new RegExp(name) }).click();
}

test("customer persona: Dana at Wasatch chats and has Brandi as her rep", async ({
  page,
}) => {
  await choose(page, "Wasatch Mechanical Contractors");
  await expect(page.locator(".customer-header")).toContainText(
    "Wasatch Mechanical Contractors",
  );
  await expect(
    page.getByRole("complementary", { name: "Contacts" }).getByRole("region", { name: "Your rep" }),
  ).toContainText("Brandi Gallegos");
  const box = page.getByLabel("Ask a question");
  await box.fill("Do you have 1/2 in grade 8 hex bolts in stock?");
  await box.press("Enter");
  const answer = page.locator(".answer-bubble").last();
  await expect(answer).toContainText("HCS-12-13-2G8");
  await expect(answer).toContainText("64 at SLC");
  await expect(page.locator(".user-avatar").last()).toHaveText("DO");
});

test("supplier persona: Brandi sees the new customers, categories and catalog", async ({
  page,
}) => {
  await choose(page, "Herrick Industrial Supply");
  // The supplier persona opens the rep portal (task 3.1); e2e/rep-portal.spec.ts covers its shell.
  await expect(page).toHaveURL(/\/rep\/quotes$/);
  await expect(
    page.getByRole("button", { name: "Account: Brandi Gallegos" }),
  ).toHaveText("BG");
  const viewing = page.getByLabel("Viewing");
  await expect(viewing.locator("option")).toHaveText([
    "All customers",
    "Canyon Ridge Builders",
    "Great Basin Fabrication",
    "Uinta Facility Services",
    "Wasatch Mechanical Contractors",
  ]);
  await viewing.selectOption("wasatch");

  // Customer access lives under Settings (task 6.1; e2e/rep-settings.spec.ts covers every tab).
  await page
    .getByRole("navigation", { name: "Rep portal" })
    .getByRole("link", { name: "Settings" })
    .click();
  await page
    .getByRole("link", { name: "Customer access", exact: true })
    .click();
  for (const name of ["Items & stock", "Pricing", "Orders & quotes", "Account"])
    await expect(page.getByRole("switch", { name })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  const pricing = page.getByRole("switch", { name: "Pricing" });
  await pricing.click();
  await expect(pricing).toHaveAttribute("aria-checked", "false");
  await pricing.click();
  await expect(pricing).toHaveAttribute("aria-checked", "true");
});

test("customer experience fits a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await choose(page, "Wasatch Mechanical Contractors");
  await expect(page.getByLabel("Ask a question")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Contacts" })).toBeVisible();
});
