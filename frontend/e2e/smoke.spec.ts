import { expect, test } from "@playwright/test";

test("login screen is usable on desktop and mobile widths", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflows).toBe(false);
});

test("registration route exposes the expected required fields", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();
  await expect(page.getByLabel("Company name")).toBeVisible();
  await expect(page.getByLabel("Your name")).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
});

test("hub scan finds a parcel and can bulk-cancel a cancellable row", async ({ page }) => {
  const booked = { id: "4e15a0bf-3152-48d8-9207-78f2abcf8229", trackingNumber: "TN-E2E-0001", status: "BOOKED", recipientName: "Demo Recipient", recipientAddress: "1 Sample Street", assignedDriverId: null, assignedDriver: null };
  await page.context().addCookies([
    { name: "lms_session", value: "e2e-session", url: "http://127.0.0.1:3000" },
    { name: "lms_tenant", value: "7c95b936-76c7-4a46-8c15-34e04cc4294b", url: "http://127.0.0.1:3000" },
  ]);
  await page.route("**/api/backend/shipments/drivers", route => route.fulfill({ json: [] }));
  await page.route("**/api/backend/shipments/batch/cancel", route => route.fulfill({ json: { canceledCount: 1, skippedCount: 0, canceled: [booked.id], skipped: [] } }));
  await page.route("**/api/backend/shipments?*", route => route.fulfill({ json: { data: [booked], total: 1, page: 1, limit: 100, totalPages: 1 } }));

  await page.goto("/dispatch");
  await expect(page.getByRole("heading", { name: "Scan parcel at hub" })).toBeVisible();
  const scanForm = page.locator(".dispatch-scan-form");
  const desktopGrid = await scanForm.evaluate(element => getComputedStyle(element).gridTemplateColumns);
  expect(desktopGrid.split(" ")).toHaveLength(3);
  expect(await page.locator(".dispatch-scan-card").evaluate(element => getComputedStyle(element).paddingTop)).toBe("24px");
  await page.getByLabel("Tracking barcode").fill(booked.trackingNumber);
  await page.getByRole("button", { name: "Find parcel" }).click();
  await expect(page.getByText("PARCEL FOUND")).toBeVisible();
  await expect(page.getByRole("link", { name: booked.trackingNumber }).first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileGrid = await scanForm.evaluate(element => getComputedStyle(element).gridTemplateColumns);
  expect(mobileGrid.split(" ")).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("button", { name: "Clear tracking number" }).click();
  await page.getByLabel(`Select ${booked.trackingNumber}`).check();
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Cancel selected" }).click();
  await expect(page.locator(".feedback.success")).toHaveText("1 shipment canceled.");
});
