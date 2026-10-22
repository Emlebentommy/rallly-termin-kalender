import "server-only";

import { cache } from "react";
import { env } from "@/env";
import { getInstanceSettings } from "@/features/instance-settings/data";
import { isMaintenanceModeEnabled } from "@/lib/maintenance";
import { getDesignAssetUrl } from "@/lib/storage/resolve-storage-url";
import { resolveBrandingConfig } from "./utils";

function getDefaultBrandingConfig() {
  return resolveBrandingConfig({});
}

function getEnvBrandingValues() {
  return {
    // The env schema defaults APP_NAME to "Rallly"; only an operator-set
    // value may override the instance default
    appName: process.env.APP_NAME ? env.APP_NAME : undefined,
    primaryColor: env.PRIMARY_COLOR,
    primaryColorDark: env.PRIMARY_COLOR_DARK,
    logo: env.LOGO_URL,
    logoDark: env.LOGO_URL_DARK,
    logoIcon: env.LOGO_ICON_URL,
    hideAttribution: env.HIDE_ATTRIBUTION === "true",
  };
}

export async function getCustomBrandingConfig() {
  // The fork is self-hosted only, so the stored design applies in every
  // mode; maintenance mode keeps skipping the database so the maintenance
  // page can render while it's unreachable
  const db = isMaintenanceModeEnabled() ? null : await getInstanceSettings();

  const fontAsset = (
    key: "fontBody" | "fontHeading",
    asset: { mimeType: string; version: number } | null | undefined,
  ) =>
    asset
      ? { url: getDesignAssetUrl(key, asset.version), mimeType: asset.mimeType }
      : null;

  return resolveBrandingConfig({
    db,
    env: getEnvBrandingValues(),
    assets: {
      fontBody: fontAsset("fontBody", db?.fontAssets.fontBody),
      fontHeading: fontAsset("fontHeading", db?.fontAssets.fontHeading),
    },
  });
}

/**
 * Returns the branding config for the current instance. This fork applies the
 * instance's own design without the upstream white label license check.
 */
export const getInstanceBrandingConfig = cache(async () => {
  if (isMaintenanceModeEnabled()) {
    // The maintenance page must render while the database is unreachable
    return getDefaultBrandingConfig();
  }
  return getCustomBrandingConfig();
});
