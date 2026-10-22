import "server-only";

import { cache } from "react";
import { env } from "@/env";
import { getInstanceSettings } from "@/features/instance-settings/data";
import { isSelfHosted } from "@/lib/constants";
import { isMaintenanceModeEnabled } from "@/lib/maintenance";
import { getDesignAssetUrl } from "@/lib/storage/resolve-storage-url";
import { resolveBrandingConfig } from "./utils";

function getDefaultBrandingConfig() {
  return resolveBrandingConfig({});
}

function getEnvBrandingValues() {
  return {
    appName: env.APP_NAME,
    primaryColor: env.PRIMARY_COLOR,
    primaryColorDark: env.PRIMARY_COLOR_DARK,
    logo: env.LOGO_URL,
    logoDark: env.LOGO_URL_DARK,
    logoIcon: env.LOGO_ICON_URL,
    hideAttribution: env.HIDE_ATTRIBUTION === "true",
  };
}

export async function getCustomBrandingConfig() {
  // Cloud keeps the env-only path; maintenance mode keeps skipping the
  // database so the maintenance page can render while it's unreachable
  const db =
    isSelfHosted && !isMaintenanceModeEnabled()
      ? await getInstanceSettings()
      : null;

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
  if (isSelfHosted && isMaintenanceModeEnabled()) {
    // The maintenance page must render while the database is unreachable
    return getDefaultBrandingConfig();
  }
  return getCustomBrandingConfig();
});
