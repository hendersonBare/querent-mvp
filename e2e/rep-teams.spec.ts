import { expect, test, type APIRequest, type Browser, type Page, type TestInfo } from "@playwright/test";

// Teams and Reps (plan U7; Part 1 section 7; decisions 21, 45, 46, 47) at desktop width (decision 43).
// The Settings tabs Rep assignments and Reps moved here; their still-valid checks did too:
//   - Mara (a rep) has no Teams and Reps: /rep/teams (and the old /rep/team) send her to her Quotes, the
//     nav has no link, and every backing route answers 403.
//   - Brandi moves Wasatch to Mara (Connect a customer, with the move confirm): Dana's rep follows, Brandi
//     keeps her existing quotes; then she disconnects it back to herself (the new rep in the same step).
//   - Mara can be marked inactive only once Canyon Ridge has another rep (decision 21); an inactive rep's
//     session is refused and she is not offered a customer; reactivated, Canyon Ridge comes back with its
//     open quotes, each with an Activity entry.
//   - Teams are entities (decision 47): a team created with a rep, a team moved inside another, whose
//     count and the Analytics team filter take in the reps of the team inside it.
// The pixel proof against the frames is e2e/frames-teams.spec.ts; bulk reassign is in e2e/rep-reassign.spec.ts.
//
// beforeAll/afterAll reset the database to the seed pinned to the mockup's day (POST /api/test/reset;
// the server needs QUERENT_E2E_RESET=1). Seed: Brandi (manager) has Wasatch and Great Basin, Mara Canyon
// Ridge, Eli Utah Valley Electric and Weber Basin, Nora Uinta; Inside Sales is Brandi and Mara, Outside
// Sales Eli and Nora.

const SEED_DATE = "2026-09-23";
const COOKIE = "querent-persona";
const DESKTOP = { width: 1920, height: 1080 };
const SAMPLE = "Q-24817";

test.describe.configure({ mode: "serial" });

async function resetDemo(request: APIRequest, testInfo: TestInfo) {
  const api = await request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const response = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(response.status(), "POST /api/test/reset failed: start the server with QUERENT_E2E_RESET=1").toBe(200);
  } finally {
    await api.dispose();
  }
}
test.beforeAll(async ({ playwright }, testInfo) => resetDemo(playwright.request, testInfo));
test.afterAll(async ({ playwright }, testInfo) => resetDemo(playwright.request, testInfo));

async function signInAsBrandi(page: Page) {
  await page.setViewportSize(DESKTOP);
  await page.goto("/demo");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
}
async function signInAs(browser: Browser, testInfo: TestInfo, persona: string) {
  const context = await browser.newContext({ viewport: DESKTOP });
  await context.addCookies([{ name: COOKIE, value: persona, url: String(testInfo.project.use.baseURL) }]);
  return context.newPage();
}
async function openTeams(page: Page) {
  await page.getByRole("navigation", { name: "Rep portal" }).getByRole("link", { name: "Teams and Reps" }).click();
  await expect(page).toHaveURL(/\/rep\/teams$/);
  await expect(page.getByRole("heading", { name: "Teams and Reps", level: 1 })).toBeVisible();
}
/** From the page itself: the production session cookie is Secure, which Playwright's request client won't send over http. */
const fetchJson = (page: Page, path: string, init?: { method: string; body?: unknown }) =>
  page.evaluate(async ({ path, init }) => {
    const response = await fetch(path, init ? { method: init.method, headers: { "Content-Type": "application/json" }, body: init.body === undefined ? undefined : JSON.stringify(init.body) } : undefined);
    return { status: response.status, body: await response.json() };
  }, { path, init });
const reps = (page: Page) => page.getByRole("region", { name: "Reps" });
const teams = (page: Page) => page.getByRole("region", { name: "Teams" });
const repRow = (page: Page, name: string) => reps(page).getByRole("row").filter({ has: page.getByText(name, { exact: true }) }).first();
async function expand(page: Page, rep: string) {
  const row = repRow(page, rep);
  await row.getByRole("button", { name: /customers?$/ }).click();
  await expect(row.getByRole("button", { name: "Hide customers" })).toBeVisible();
  return reps(page).getByRole("group", { name: `Customers for ${rep}` });
}
async function shoot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

test("Mara (a rep) has no Teams and Reps: redirected, no nav link, and every backing route refuses her", async ({ browser }, testInfo) => {
  const page = await signInAs(browser, testInfo, "mara");
  for (const path of ["/rep/teams", "/rep/team"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/rep\/quotes$/);
  }
  await expect(page.getByRole("navigation", { name: "Rep portal" }).getByRole("link", { name: "Teams and Reps" })).toHaveCount(0);
  const api = page.request;
  expect((await api.get("/api/rep/teams")).status()).toBe(403);
  expect((await api.post("/api/rep/teams", { data: { name: "Hacked" } })).status()).toBe(403);
  expect((await api.patch("/api/rep/teams/1", { data: { name: "Hacked" } })).status()).toBe(403);
  expect((await api.delete("/api/rep/teams/1")).status()).toBe(403);
  expect((await api.put("/api/rep/teams/1/members", { data: { add: ["mara"] } })).status()).toBe(403);
  expect((await api.get("/api/rep/team/reps")).status()).toBe(403);
  expect((await api.put("/api/rep/team/reps/eli", { data: { active: false } })).status()).toBe(403);
  expect((await api.put("/api/rep/settings/assignments", { data: { customer_id: "wasatch", rep_id: "mara" } })).status()).toBe(403);
  // Rep assignments moved to Teams and Reps: Settings has no such tab, for her or anyone.
  await page.goto("/rep/settings");
  await expect(page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "Rep assignments" })).toHaveCount(0);
  await page.context().close();
});

test("Brandi moves Wasatch to Mara: Dana's rep follows, Brandi's existing quotes stay; then she disconnects it back to herself", async ({ page, browser }, testInfo) => {
  await signInAsBrandi(page);
  await openTeams(page);
  await expect(reps(page).getByText("3 reps. Managers are not listed.")).toBeVisible();
  await expect(repRow(page, "Mara Jensen").getByRole("button", { name: "1 customer" })).toBeVisible();
  await expect(page.getByText("Brandi Gallegos", { exact: true })).toHaveCount(0);

  const customers = await expand(page, "Mara Jensen");
  await expect(customers.getByRole("listitem")).toHaveText(["Canyon Ridge Builders CRB-3318x"]);
  await customers.getByRole("button", { name: /Connect a customer$/ }).click();
  await page.getByRole("searchbox", { name: "Search customers" }).fill("wasatch");
  await page.getByRole("option", { name: /Wasatch Mechanical Contractors/ }).click();
  const confirm = page.getByRole("dialog", { name: "Wasatch Mechanical Contractors is with Brandi Gallegos" });
  await expect(confirm).toContainText("Connecting it to Mara Jensen takes it off Brandi Gallegos. Brandi will keep 1 customer.");
  await expect(confirm.getByRole("checkbox", { name: /^Also move this customer's open quotes \(\d+ quotes?\)$/ })).not.toBeChecked();
  await shoot(page, testInfo, "u7-move-approval");
  await confirm.getByRole("button", { name: "Move to Mara Jensen" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(repRow(page, "Mara Jensen").getByRole("button", { name: "Hide customers" })).toBeVisible();
  await expect(customers.getByRole("listitem")).toHaveText(["Canyon Ridge Builders CRB-3318x", "Wasatch Mechanical Contractors WAS-1142x"]);

  // The Customers list's rep follows.
  await page.goto("/rep/customers");
  await expect(page.getByRole("row", { name: /Wasatch Mechanical Contractors/ })).toContainText("Mara Jensen");
  // Dana's My rep sheet names Mara now.
  const dana = await browser.newContext({ viewport: DESKTOP }).then((c) => c.newPage());
  await dana.goto("/demo");
  await dana.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
  await dana.getByRole("button", { name: "My rep" }).click();
  await expect(dana.getByRole("dialog", { name: "Your rep" })).toContainText("Mara Jensen");
  // Brandi keeps Q-24817: the open quotes stayed (the box was clear).
  expect((await fetchJson(page, `/api/rep/quotes/${SAMPLE}`)).body.quote.rep_id).toBe("brandi");

  // Back to Brandi: the X asks who takes it, in the same step; Brandi (the manager) can take it.
  await page.goto("/rep/teams");
  const back = await expand(page, "Mara Jensen");
  await back.getByRole("button", { name: "Disconnect Wasatch Mechanical Contractors" }).click();
  const disconnect = page.getByRole("dialog", { name: "Disconnect Wasatch Mechanical Contractors?" });
  await expect(disconnect).toContainText("Every customer needs a rep. Pick who takes Wasatch Mechanical Contractors from Mara Jensen.");
  await expect(disconnect.getByRole("button", { name: "Disconnect and reassign" })).toBeDisabled();
  await disconnect.getByRole("radio", { name: /^Brandi Gallegos/ }).click();
  await shoot(page, testInfo, "u7-disconnect");
  await disconnect.getByRole("button", { name: "Disconnect and reassign" }).click();
  await expect(disconnect).toHaveCount(0);
  await expect(back.getByRole("listitem")).toHaveText(["Canyon Ridge Builders CRB-3318x"]);
  await dana.reload();
  await dana.getByRole("button", { name: "My rep" }).click();
  await expect(dana.getByRole("dialog", { name: "Your rep" })).toContainText("Brandi Gallegos");
  await dana.context().close();
});

test("Mara can be marked inactive only after Canyon Ridge has another rep; reactivated, it comes back with its open quotes", async ({ page, browser }, testInfo) => {
  await signInAsBrandi(page);
  await page.goto("/rep/teams");
  const mara = repRow(page, "Mara Jensen").getByRole("switch", { name: "Mara Jensen active" });
  await expect(mara).toHaveAttribute("aria-checked", "true");
  // Toggled off and saved while Canyon Ridge is hers: refused, and the server says why (decision 21).
  await mara.click();
  await reps(page).getByRole("button", { name: "Save" }).click();
  await expect(reps(page).getByRole("alert")).toHaveText("Mara Jensen still has 1 customer. Reassign it before marking Mara Jensen inactive.");
  expect((await fetchJson(page, "/api/rep/team/reps/mara", { method: "PUT", body: { active: false } }))).toMatchObject({ status: 409, body: { code: "has_customers" } });
  await page.reload();
  await expect(repRow(page, "Mara Jensen").getByRole("switch", { name: "Mara Jensen active" })).toHaveAttribute("aria-checked", "true");

  // Canyon Ridge to Eli, with its open quotes.
  const before = (await fetchJson(page, "/api/rep/teams")).body;
  const open = before.customers.find((c: { id: string }) => c.id === "canyon-ridge").open_quote_reps.filter((r: string) => r !== "eli").length;
  expect(open).toBeGreaterThan(0);
  const customers = await expand(page, "Mara Jensen");
  await customers.getByRole("button", { name: "Disconnect Canyon Ridge Builders" }).click();
  const disconnect = page.getByRole("dialog", { name: "Disconnect Canyon Ridge Builders?" });
  await disconnect.getByRole("radio", { name: /^Eli Porter/ }).click();
  await disconnect.getByRole("checkbox", { name: /^Also move this customer's open quotes/ }).check({ force: true });
  await disconnect.getByRole("button", { name: "Disconnect and reassign" }).click();
  await expect(disconnect).toHaveCount(0);
  await expect(repRow(page, "Mara Jensen").getByRole("button", { name: /0 customers|Hide customers/ })).toBeVisible();
  const after = (await fetchJson(page, "/api/rep/teams")).body;
  expect(after.reps.find((r: { id: string }) => r.id === "mara").open_quotes).toHaveLength(0);
  // Each moved quote has an Activity entry: who moved it, from whom, to whom.
  const moved = before.reps.find((r: { id: string }) => r.id === "mara").open_quotes[0].quote_number;
  expect(JSON.stringify((await fetchJson(page, `/api/rep/quotes/${moved}`)).body)).toContain(`Brandi Gallegos reassigned ${moved} from Mara Jensen to Eli Porter`);

  // Now she can be marked inactive.
  await repRow(page, "Mara Jensen").getByRole("switch", { name: "Mara Jensen active" }).click();
  await reps(page).getByRole("button", { name: "Save" }).click();
  await expect(reps(page).getByRole("alert")).toHaveCount(0);
  await page.reload();
  await expect(repRow(page, "Mara Jensen").getByRole("switch", { name: "Mara Jensen active" })).toHaveAttribute("aria-checked", "false");
  // Her session is refused, and she is not offered a customer.
  const maraPage = await signInAs(browser, testInfo, "mara");
  expect((await maraPage.request.get("/api/rep/badges")).status()).toBe(403);
  await maraPage.goto("/rep/quotes");
  await expect(maraPage).toHaveURL(/\/$/);
  await maraPage.context().close();
  const eliCustomers = await expand(page, "Eli Porter");
  await eliCustomers.getByRole("button", { name: "Disconnect Canyon Ridge Builders" }).click();
  await expect(page.getByRole("dialog", { name: "Disconnect Canyon Ridge Builders?" }).getByRole("radio", { name: /^Mara Jensen/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel" }).click();
  await shoot(page, testInfo, "u7-mara-inactive");

  // Reactivated: Canyon Ridge back to Mara through Connect a customer, with its open quotes.
  await repRow(page, "Mara Jensen").getByRole("switch", { name: "Mara Jensen active" }).click();
  await reps(page).getByRole("button", { name: "Save" }).click();
  await page.reload();
  await expect(repRow(page, "Mara Jensen").getByRole("switch", { name: "Mara Jensen active" })).toHaveAttribute("aria-checked", "true");
  const maraCustomers = await expand(page, "Mara Jensen");
  await maraCustomers.getByRole("button", { name: /Connect a customer$/ }).click();
  await page.getByRole("option", { name: /Canyon Ridge Builders/ }).click();
  const confirm = page.getByRole("dialog", { name: "Canyon Ridge Builders is with Eli Porter" });
  await confirm.getByRole("checkbox", { name: /^Also move this customer's open quotes \(\d+ quotes?\)$/ }).check({ force: true });
  await confirm.getByRole("button", { name: "Move to Mara Jensen" }).click();
  await expect(confirm).toHaveCount(0);
  const done = (await fetchJson(page, "/api/rep/teams")).body;
  expect(done.customers.find((c: { id: string }) => c.id === "canyon-ridge").rep_id).toBe("mara");
  expect(done.reps.find((r: { id: string }) => r.id === "mara").open_quotes.length).toBeGreaterThan(0);
});

test("teams: Brandi creates a team with a rep, moves a team inside another, and Analytics counts the reps of the team inside", async ({ page }, testInfo) => {
  await signInAsBrandi(page);
  await page.goto("/rep/teams");
  await expect(teams(page).getByRole("checkbox")).toHaveCount(2);

  await teams(page).getByRole("button", { name: "Create team" }).click();
  const create = page.getByRole("dialog", { name: "Create team" });
  await create.getByRole("textbox", { name: "Team name" }).fill("Counter and Yard");
  await create.getByText("Nora Chen", { exact: true }).click();
  await shoot(page, testInfo, "u7-create-team");
  await create.getByRole("button", { name: "Create team" }).click();
  await expect(create).toHaveCount(0);
  await expect(teams(page).getByText("Counter and Yard", { exact: true })).toBeVisible();
  await expect(repRow(page, "Nora Chen")).toContainText("Counter and Yard");

  // Counter and Yard inside Inside Sales: Inside Sales now counts Brandi, Mara and Nora.
  await teams(page).getByText("Counter and Yard", { exact: true }).click();
  await expect(teams(page).getByRole("list", { name: "Reps in Counter and Yard" })).toHaveText("Nora Chen");
  await teams(page).getByRole("button", { name: "Move into other team" }).click();
  const move = page.getByRole("dialog", { name: "Move Counter and Yard into another team" });
  await expect(move).toContainText("Reps in Counter and Yard stay in it, and also count in the team you pick.");
  await move.getByRole("radio", { name: /^Inside Sales/ }).click();
  await move.getByRole("button", { name: "Move team" }).click();
  await expect(move).toHaveCount(0);
  await expect(teams(page).getByRole("checkbox", { name: /^Inside Sales/ })).toHaveAccessibleName(/3 reps/);
  await shoot(page, testInfo, "u7-team-moved");

  // Analytics' team filter reads the entities: Inside Sales takes in Nora through Counter and Yard.
  const analytics = (await fetchJson(page, "/api/rep/analytics?teams=Inside%20Sales&breakdown=team")).body;
  expect(analytics.filter.teams).toEqual(["Inside Sales"]);
  expect(analytics.options.teams).toEqual(expect.arrayContaining(["Inside Sales", "Outside Sales", "Counter and Yard"]));
  expect(analytics.groups.rows.map((r: { name: string }) => r.name)).toEqual(["Inside Sales", "Counter and Yard"]);
  expect(analytics.groups.rows.find((r: { name: string }) => r.name === "Inside Sales").rep_ids.sort()).toEqual(["brandi", "mara", "nora"]);
});
