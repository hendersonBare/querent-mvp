import { expect, test, type Page } from "@playwright/test";
const BASE_URL = process.env.QUERENT_BASE_URL || "http://127.0.0.1:3000";
async function choose(page: Page, name: string) {
  await page.goto(BASE_URL);
  await page.getByRole("button", { name: new RegExp(name) }).click();
}
async function switchWorkspace(page: Page) {
  await page.getByRole("button", { name: "Switch workspace" }).click();
  await expect(
    page.getByText("Who would you like to explore as?"),
  ).toBeVisible();
}
async function ask(page: Page, question: string) {
  const before = await page.locator(".answer-bubble").count();
  await page.getByLabel("Ask a question").fill(question);
  await page.getByLabel("Ask a question").press("Enter");
  await expect(page.locator(".answer-bubble")).toHaveCount(before + 1);
  return page.locator(".answer-bubble").last();
}
test("public customer and supplier golden path", async ({ page }) => {
  await choose(page, "Wasatch Excavation");
  await expect(
    await ask(page, "What is the status of PO-48213?"),
  ).toContainText("shipped");
  await switchWorkspace(page);
  await page.getByRole("button", { name: /Century Equipment/ }).click();
  await page.getByLabel("Viewing").selectOption("wasatch");
  await page
    .getByRole("button", { name: "Customer access", exact: true })
    .click();
  const financing = page.getByRole("switch", { name: "Financing" });
  if ((await financing.getAttribute("aria-checked")) === "true")
    await financing.click();
  await expect(financing).toHaveAttribute("aria-checked", "false");
  await switchWorkspace(page);
  await page.getByRole("button", { name: /Wasatch Excavation/ }).click();
  await expect(await ask(page, "What is the balance on FIN-1004?")).toHaveText(
    "That information isn’t available here.",
  );
  await switchWorkspace(page);
  await page.getByRole("button", { name: /Century Equipment/ }).click();
  await page.getByLabel("Viewing").selectOption("wasatch");
  await page.getByRole("button", { name: "Customer access", exact: true }).click();
  await page.getByRole("switch", { name: "Financing" }).click();
  await expect(page.getByRole("switch", { name: "Financing" })).toHaveAttribute("aria-checked", "true");
});
test("customer experience fits a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await choose(page, "Wasatch Excavation");
  await expect(page.getByLabel("Ask a question")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Expand contacts" }),
  ).toBeVisible();
});
