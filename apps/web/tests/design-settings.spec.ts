import path from "node:path";
import { expect, test } from "@playwright/test";
import { prisma } from "@rallly/database";

import { deleteAllMessages } from "@rallly/test-helpers";
import { createUserInDb, loginWithEmail } from "./test-utils";

const ADMIN_EMAIL = "design-admin@rallly.co";
const MEMBER_EMAIL = "design-member@rallly.co";

async function resetDesign() {
  await prisma.instanceAsset.deleteMany();
  await prisma.instanceSettings.update({
    where: { id: 1 },
    data: {
      themePreset: null,
      primaryColor: null,
      primaryColorDark: null,
      accentColor: null,
      backgroundColor: null,
      backgroundColorDark: null,
      neutralTone: null,
      fontBody: null,
      fontHeading: null,
      radius: null,
      customCss: null,
      logo: null,
      logoDark: null,
      logoIcon: null,
      appName: null,
    },
  });
}

test.describe
  .serial("Design settings (/control-panel/design)", () => {
    test.beforeAll(async () => {
      await prisma.user.deleteMany({
        where: { email: { in: [ADMIN_EMAIL, MEMBER_EMAIL] } },
      });
      await resetDesign();
      await deleteAllMessages();
      await createUserInDb({
        email: ADMIN_EMAIL,
        name: "Design Admin",
        role: "admin",
      });
      await createUserInDb({ email: MEMBER_EMAIL, name: "Design Member" });
    });

    // Through the UI, not the database: the settings are cached by tag, and
    // only the actions invalidate it, so later specs in the shard see the
    // default design again.
    test.afterAll(async ({ browser }) => {
      const page = await browser.newPage();
      await loginWithEmail(page, { email: ADMIN_EMAIL });
      await page.goto("/control-panel/design");
      const removeLogo = page.getByRole("button", { name: "Remove" });
      if (await removeLogo.count()) {
        await removeLogo.first().click();
        await expect(removeLogo).toHaveCount(0);
      }
      await page.getByRole("button", { name: "Green · Tanne" }).click();
      const save = page.getByRole("button", { name: "Save" });
      if (await save.isEnabled()) {
        await save.click();
        await expect(page.getByText("Saved").first()).toBeVisible();
      }
      await page.close();
      await resetDesign();
    });

    test("applies the green theme without a license", async ({ page }) => {
      await page.goto("/login");
      const css = await page.locator("#instance-theme").textContent();

      expect(css).toContain("--font-sans:var(--font-pt-sans)");
      expect(css).toContain("--brand-accent:#fff17a");
    });

    test("an admin can switch the template and change single tokens", async ({
      page,
    }) => {
      await loginWithEmail(page, { email: ADMIN_EMAIL });
      await page.goto("/control-panel/design");

      await expect(
        page.getByText("Custom branding is available to Enterprise"),
      ).toHaveCount(0);

      await page.getByRole("button", { name: "Rallly classic" }).click();
      await page.getByRole("radio", { name: "Square" }).click();
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Saved").first()).toBeVisible();

      await expect
        .poll(async () => {
          const settings = await prisma.instanceSettings.findUnique({
            where: { id: 1 },
            select: { themePreset: true, radius: true, fontBody: true },
          });
          return settings;
        })
        // Tokens equal to the template are stored as null
        .toEqual({ themePreset: "rallly", radius: "none", fontBody: null });

      await page.reload();
      const css = await page.locator("#instance-theme").textContent();
      expect(css).toContain("--font-sans:var(--font-inter)");
      expect(css).toContain("--radius-lg:0rem");
    });

    test("an admin can upload a logo that is served from the database", async ({
      page,
      request,
    }) => {
      await loginWithEmail(page, { email: ADMIN_EMAIL });
      await page.goto("/control-panel/design");

      // A file chosen before hydration is lost, so the pick is retried until
      // the upload confirms; saving the same file twice is harmless
      await expect(async () => {
        await page
          .locator("input[type=file][accept*='image/svg+xml']")
          .first()
          .setInputFiles(
            path.join(__dirname, "../public/images/logo-mark.png"),
          );
        await expect(page.getByText("Saved").first()).toBeVisible({
          timeout: 3000,
        });
      }).toPass();

      await expect
        .poll(async () => {
          const settings = await prisma.instanceSettings.findUnique({
            where: { id: 1 },
            select: { logo: true },
          });
          return settings?.logo ?? "";
        })
        .toMatch(/^asset:logo:\d+$/);

      const response = await request.get("/api/instance-assets/logo");
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe("image/png");
      expect(response.headers()["content-security-policy"]).toContain(
        "sandbox",
      );
    });

    test("rejects a file whose content does not match the slot", async ({
      page,
    }) => {
      await loginWithEmail(page, { email: ADMIN_EMAIL });
      await page.goto("/control-panel/design");

      // A PNG offered as a font is refused by its content, not its name.
      // Retried like the upload above, for a pick made before hydration.
      await expect(async () => {
        await page
          .locator("input[type=file][accept*='.woff2']")
          .first()
          .setInputFiles({
            name: "not-a-font.woff2",
            mimeType: "font/woff2",
            buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]),
          });
        await expect(
          page.getByText("This file type is not supported here."),
        ).toBeVisible({ timeout: 3000 });
      }).toPass();
      await expect(
        prisma.instanceAsset.count({ where: { key: "fontHeading" } }),
      ).resolves.toBe(0);
    });

    test("a member without admin rights cannot open the page", async ({
      page,
    }) => {
      await loginWithEmail(page, { email: MEMBER_EMAIL });
      await page.goto("/control-panel/design");

      await expect(page).toHaveURL(/.*\/admin-setup/);
    });

    test("the old branding route leads to the design page", async ({
      page,
    }) => {
      await loginWithEmail(page, { email: ADMIN_EMAIL });
      await page.goto("/control-panel/branding");

      await expect(page).toHaveURL("/control-panel/design");
    });
  });
