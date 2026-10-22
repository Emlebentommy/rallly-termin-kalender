import "server-only";

import { cache } from "react";
import { env } from "@/env";
import {
  getInstanceSettings,
  listInstanceAssets,
} from "@/features/instance-settings/data";
import { getDesignAssetUrl } from "@/lib/storage/resolve-storage-url";
import type { DesignAssetKey } from "./constants";
import { designAssetKeys } from "./constants";
import { getCustomBrandingConfig, getInstanceBrandingConfig } from "./data";
import type { DesignSettings } from "./schema";
import { resolveThemeTokens } from "./utils";

/** The instance's effective branding, for pages that render its identity. */
export const loadInstanceBranding = cache(() => getInstanceBrandingConfig());

/**
 * Values for the control panel design page. `values` holds what is stored:
 * a null token means "use the preset", so the form can tell an override from
 * an inherited value. `envDefaults` are the operator's environment settings,
 * which apply where nothing is stored, and `resolved` is the effective theme.
 */
export const loadDesignSettings = cache(async () => {
  const [db, resolved, assetRows] = await Promise.all([
    getInstanceSettings(),
    getCustomBrandingConfig(),
    listInstanceAssets(),
  ]);

  const values: DesignSettings = {
    appName: db.appName ?? resolved.appName,
    hideAttribution: db.hideAttribution ?? resolved.hideAttribution,
    themePreset: resolveThemeTokens(db).preset,
    primaryColor: db.primaryColor,
    primaryColorDark: db.primaryColorDark,
    accentColor: db.accentColor,
    backgroundColor: db.backgroundColor,
    backgroundColorDark: db.backgroundColorDark,
    neutralTone: db.neutralTone as DesignSettings["neutralTone"],
    fontBody: db.fontBody as DesignSettings["fontBody"],
    fontHeading: db.fontHeading as DesignSettings["fontHeading"],
    radius: db.radius as DesignSettings["radius"],
    customCss: db.customCss,
  };

  const assets = Object.fromEntries(
    designAssetKeys.map((key) => {
      const row = assetRows.find((asset) => asset.key === key);
      return [
        key,
        row
          ? {
              url: getDesignAssetUrl(key, row.updatedAt.getTime()),
              fileName: row.fileName,
              mimeType: row.mimeType,
            }
          : null,
      ];
    }),
  ) as Record<
    DesignAssetKey,
    { url: string; fileName: string | null; mimeType: string } | null
  >;

  return {
    values,
    // Checked against process.env because the parsed env applies defaults
    // (APP_NAME), which would read as operator-set
    envDefaults: {
      primaryColor: process.env.PRIMARY_COLOR ? env.PRIMARY_COLOR : undefined,
      primaryColorDark: process.env.PRIMARY_COLOR_DARK
        ? env.PRIMARY_COLOR_DARK
        : undefined,
    },
    resolved: {
      primaryColor: resolved.primaryColor,
      tokens: resolved.theme.tokens,
      logo: resolved.logo,
      logoIcon: resolved.logoIcon,
    },
    assets,
  };
});
