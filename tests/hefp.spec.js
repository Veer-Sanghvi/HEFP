const { test, expect } = require("@playwright/test");

async function setSlider(locator, value) {
  await locator.evaluate((el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

test.describe("HEFP thermal simulation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("loads with correct title and no console errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.reload();
    await expect(page).toHaveTitle(/Hot Engines and Fire Prevention/);
    expect(errors).toEqual([]);
  });

  test("steady-state defaults match the paper", async ({ page }) => {
    await expect(page.locator("#stat-bare")).toContainText("484.14");
    await expect(page.locator("#stat-tbc")).toContainText("477.50");
    await expect(page.locator("#stat-drop")).toContainText("6.64");
  });

  test("both defaults are flagged outside the safe autoignition band", async ({ page }) => {
    await expect(page.locator("#stat-bare-sub")).toContainText("outside the studied band");
    await expect(page.locator("#stat-tbc-sub")).toContainText("outside the studied band");
  });

  test("gas-side convection slider live-recomputes steady-state temps", async ({ page }) => {
    const before = await page.locator("#stat-tbc").textContent();
    await setSlider(page.locator("#h1"), 400);
    await expect(page.locator("#v-h1")).toContainText("400");
    await expect(page.locator("#stat-tbc")).not.toHaveText(before);
  });

  test("lower emissivity raises steady-state temp (less radiative cooling)", async ({ page }) => {
    const before = await page.locator("#stat-tbc").textContent();
    const beforeVal = parseFloat(before);
    await setSlider(page.locator("#eps"), 0.4);
    const afterVal = parseFloat(await page.locator("#stat-tbc").textContent());
    expect(afterVal).toBeGreaterThan(beforeVal);
  });

  test("reset-to-defaults restores paper values after a change", async ({ page }) => {
    await setSlider(page.locator("#Tgas"), 900);
    await expect(page.locator("#stat-bare")).not.toContainText("484.14");
    await page.locator("#reset-steady").click();
    await expect(page.locator("#stat-bare")).toContainText("484.14");
  });

  test("soak section reports crossing times and a danger window", async ({ page }) => {
    await expect(page.locator("#stat-t450")).toContainText("min");
    await expect(page.locator("#stat-t311")).toContainText("min");
    await expect(page.locator("#stat-window")).toContainText("min");
  });

  test("Monte Carlo run produces a 20,000-sample summary", async ({ page }) => {
    await page.locator("#run-mc").click();
    await expect(page.locator("#mc-summary")).toContainText("20,000", { timeout: 15000 });
  });

  test("RK4 convergence study is visible on load with 10 rows, no expand needed", async ({ page }) => {
    await expect(page.locator("#chart-conv")).toBeVisible();
    await expect(page.locator("#conv-table tbody tr")).toHaveCount(10);
  });
});
