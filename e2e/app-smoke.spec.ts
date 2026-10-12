import { expect, test, type Page } from "@playwright/test";

// App smoke test on the Query to Quote seed (task 0.2). The end-to-end quote flow is
// e2e/golden-quote-flow.spec.ts, which grows with the build. Chat is scripted (spec §6.5).
const BASE_URL = process.env.QUERENT_BASE_URL || "http://127.0.0.1:3000";
async function choose(page: Page, name: string) {
  await page.goto(`${BASE_URL}/demo`);
  await page.getByRole("button", { name: new RegExp(name) }).click();
}

test("customer persona: Dana at Wasatch chats and has Brandi as her rep", async ({
  page,
}) => {
  await choose(page, "Wasatch Mechanical Contractors");
  // The customer site (plan U10): the account chip names Wasatch; My rep opens Brandi's sheet.
  await expect(page.getByRole("button", { name: /Wasatch Mechanical Contractors/ })).toContainText("Signed in");
  await page.getByRole("button", { name: "My rep" }).click();
  await expect(page.getByRole("dialog", { name: "Your rep" })).toContainText("Brandi Gallegos");
  await page.keyboard.press("Escape");
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
  // The supplier persona opens the rep portal (task 3.1); e2e/rep-portal.spec.ts and
  // e2e/frames-shell.spec.ts cover its shell (the rail's user block, plan U2).
  await expect(page).toHaveURL(/\/rep\/quotes$/);
  await expect(page.getByRole("complementary").first()).toContainText("BGBrandi G.Manager");
  // Brandi is the manager: Customers lists the whole organization (task U1; no "Viewing" picker).
  await expect(page.getByLabel("Viewing")).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Rep portal" })
    .getByRole("link", { name: "Customers" })
    .click();
  // Each row's customer name opens its page (plan U5, C_CUBase).
  await expect(
    page.getByRole("table", { name: "Customers" }).getByRole("link"),
  ).toHaveText([
    "Canyon Ridge Builders",
    "Great Basin Fabrication",
    "Uinta Facility Services",
    "Utah Valley Electric",
    "Wasatch Mechanical Contractors",
    "Weber Basin Fabricators",
  ]);

  // Customer access lives under Settings (task 6.1; e2e/rep-settings.spec.ts covers every tab),
  // with its own customer filter.
  await page
    .getByRole("navigation", { name: "Rep portal" })
    .getByRole("link", { name: "Settings" })
    .click();
  await page
    .getByRole("link", { name: "Customer access", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Customer" }).selectOption("wasatch");
  await expect(page).toHaveURL(/\/rep\/settings\?tab=access&customer=wasatch$/);
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
