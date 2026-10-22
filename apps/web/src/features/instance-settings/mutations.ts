import "server-only";

import { prisma } from "@rallly/database";
import { updateTag } from "next/cache";
import { replaceStoredAsset } from "@/lib/storage/asset-upload";
import {
  isDesignAssetRef,
  toDesignAssetRef,
} from "@/lib/storage/resolve-storage-url";
import { instanceSettingsTag } from "./constants";
import type { BrandingLogoType, FooterLink } from "./schema";

export async function updateInstanceSettings(data: {
  disableUserRegistration?: boolean;
  appName?: string;
  primaryColor?: string | null;
  primaryColorDark?: string | null;
  hideAttribution?: boolean;
  themePreset?: string;
  accentColor?: string | null;
  backgroundColor?: string | null;
  backgroundColorDark?: string | null;
  neutralTone?: string | null;
  fontBody?: string | null;
  fontHeading?: string | null;
  radius?: string | null;
  customCss?: string | null;
}) {
  // The id 1 row is seeded by migration, so it always exists
  await prisma.instanceSettings.update({
    where: {
      id: 1,
    },
    data,
  });

  updateTag(instanceSettingsTag);
}

export async function updateInstanceLogo({
  logoType,
  imageKey,
}: {
  logoType: BrandingLogoType;
  imageKey: string | null;
}) {
  const instanceSettings = await prisma.instanceSettings.findUnique({
    where: {
      id: 1,
    },
    select: {
      logo: true,
      logoDark: true,
      logoIcon: true,
    },
  });

  await replaceStoredAsset({
    currentKey: instanceSettings?.[logoType],
    nextKey: imageKey,
    persist: async () => {
      await prisma.instanceSettings.update({
        where: {
          id: 1,
        },
        data: {
          [logoType]: imageKey,
        },
      });

      updateTag(instanceSettingsTag);
    },
  });
}

export async function updateInstanceFooterLinks(footerLinks: FooterLink[]) {
  await prisma.instanceSettings.update({
    where: {
      id: 1,
    },
    data: {
      footerLinks,
    },
  });

  updateTag(instanceSettingsTag);
}

const LOGO_ASSET_KEYS = ["logo", "logoDark", "logoIcon"] as const;
type LogoAssetKey = (typeof LOGO_ASSET_KEYS)[number];

const isLogoAssetKey = (key: string): key is LogoAssetKey =>
  (LOGO_ASSET_KEYS as readonly string[]).includes(key);

/**
 * Stores a logo or font uploaded in the design settings. A logo slot then
 * points at the new row with a versioned reference, so every cached copy of
 * the previous file is bypassed at once.
 */
export async function saveInstanceAsset({
  key,
  mimeType,
  fileName,
  data,
}: {
  key: string;
  mimeType: string;
  fileName: string;
  data: Uint8Array<ArrayBuffer>;
}) {
  await prisma.$transaction(async (tx) => {
    const asset = await tx.instanceAsset.upsert({
      where: { key },
      create: { key, mimeType, fileName, data },
      update: { mimeType, fileName, data },
      select: { updatedAt: true },
    });

    if (isLogoAssetKey(key)) {
      await tx.instanceSettings.update({
        where: { id: 1 },
        data: { [key]: toDesignAssetRef(key, asset.updatedAt.getTime()) },
      });
    }
  });

  updateTag(instanceSettingsTag);
}

export async function removeInstanceAsset(key: string) {
  await prisma.$transaction(async (tx) => {
    await tx.instanceAsset.deleteMany({ where: { key } });

    if (isLogoAssetKey(key)) {
      const settings = await tx.instanceSettings.findUnique({
        where: { id: 1 },
        select: { [key]: true },
      });
      const current = settings?.[key];
      // Only a reference to the removed row is cleared; a logo set another
      // way (storage upload, URL) is not this asset's to remove.
      if (typeof current === "string" && isDesignAssetRef(current)) {
        await tx.instanceSettings.update({
          where: { id: 1 },
          data: { [key]: null },
        });
      }
    }
  });

  updateTag(instanceSettingsTag);
}
