import "server-only";

import { prisma } from "@rallly/database";
import { unstable_cache } from "next/cache";
import { isFeatureEnabled } from "@/lib/feature-flags/server";
import { instanceSettingsTag } from "./constants";
import type { FooterLink } from "./schema";
import { FOOTER_LINK_MAX_COUNT, footerLinkSchema } from "./schema";

// Stored links are re-validated on read, not just on write: a row edited
// directly in the database must not be able to put an unsafe href into an
// anchor, or turn the footer into a link farm. Invalid entries are dropped
// rather than failing the whole read, so one bad link cannot take down the
// login page.
function parseFooterLinks(value: unknown): FooterLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((entry) => {
      const parsed = footerLinkSchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, FOOTER_LINK_MAX_COUNT);
}

export const getInstanceSettings = unstable_cache(
  async () => {
    const instanceSettings = await prisma.instanceSettings.findUnique({
      where: {
        id: 1,
      },
      select: {
        instanceId: true,
        disableUserRegistration: true,
        appName: true,
        primaryColor: true,
        primaryColorDark: true,
        logo: true,
        logoDark: true,
        logoIcon: true,
        hideAttribution: true,
        footerLinks: true,
        themePreset: true,
        accentColor: true,
        backgroundColor: true,
        backgroundColorDark: true,
        neutralTone: true,
        fontBody: true,
        fontHeading: true,
        radius: true,
        customCss: true,
      },
    });

    // Metadata only: the bytes are read by the asset route, not by every page
    const fontAssets = await prisma.instanceAsset.findMany({
      where: { key: { in: ["fontBody", "fontHeading"] } },
      select: { key: true, mimeType: true, updatedAt: true },
    });
    const fontAsset = (key: string) => {
      const asset = fontAssets.find((entry) => entry.key === key);
      // A number, not a Date: the cache serializes its result
      return asset
        ? { mimeType: asset.mimeType, version: asset.updatedAt.getTime() }
        : null;
    };

    return {
      themePreset: instanceSettings?.themePreset ?? null,
      accentColor: instanceSettings?.accentColor ?? null,
      backgroundColor: instanceSettings?.backgroundColor ?? null,
      backgroundColorDark: instanceSettings?.backgroundColorDark ?? null,
      neutralTone: instanceSettings?.neutralTone ?? null,
      fontBody: instanceSettings?.fontBody ?? null,
      fontHeading: instanceSettings?.fontHeading ?? null,
      radius: instanceSettings?.radius ?? null,
      customCss: instanceSettings?.customCss ?? null,
      fontAssets: {
        fontBody: fontAsset("fontBody"),
        fontHeading: fontAsset("fontHeading"),
      },
      instanceId: instanceSettings?.instanceId ?? null,
      disableUserRegistration:
        instanceSettings?.disableUserRegistration ?? false,
      appName: instanceSettings?.appName ?? null,
      primaryColor: instanceSettings?.primaryColor ?? null,
      primaryColorDark: instanceSettings?.primaryColorDark ?? null,
      logo: instanceSettings?.logo ?? null,
      logoDark: instanceSettings?.logoDark ?? null,
      logoIcon: instanceSettings?.logoIcon ?? null,
      hideAttribution: instanceSettings?.hideAttribution ?? null,
      footerLinks: parseFooterLinks(instanceSettings?.footerLinks),
    };
  },
  [],
  {
    tags: [instanceSettingsTag],
  },
);

export async function getRegistrationEnabled() {
  if (!isFeatureEnabled("registration")) {
    return false;
  }
  const instanceSettings = await getInstanceSettings();

  return !instanceSettings.disableUserRegistration;
}

// Uncached twin of getRegistrationEnabled for the auth hooks in lib/auth.ts:
// an authorization decision must see the control panel toggle the moment it
// is written, not whenever the page cache revalidates.
export async function isRegistrationOpen() {
  if (!isFeatureEnabled("registration")) {
    return false;
  }
  const instanceSettings = await prisma.instanceSettings.findUnique({
    where: { id: 1 },
    select: { disableUserRegistration: true },
  });

  return !instanceSettings?.disableUserRegistration;
}

/** One uploaded design file with its bytes, for the asset route. */
export async function getInstanceAsset(key: string) {
  return await prisma.instanceAsset.findUnique({
    where: { key },
    select: { mimeType: true, data: true, updatedAt: true },
  });
}
