import * as z from "zod";
import {
  bodyFonts,
  designAssetKeys,
  headingFonts,
  MAX_CUSTOM_CSS_LENGTH,
  neutralTones,
  radii,
  themePresetIds,
} from "./constants";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid hex color");

/**
 * The design settings form. A null token falls back to the preset, so the
 * form only stores what differs from it and preset updates still apply.
 */
export const designSettingsSchema = z.object({
  appName: z.string().trim().min(1).max(100),
  hideAttribution: z.boolean(),
  themePreset: z.enum(themePresetIds),
  primaryColor: hexColor.nullable(),
  primaryColorDark: hexColor.nullable(),
  accentColor: hexColor.nullable(),
  backgroundColor: hexColor.nullable(),
  backgroundColorDark: hexColor.nullable(),
  neutralTone: z.enum(neutralTones).nullable(),
  fontBody: z.enum(bodyFonts).nullable(),
  fontHeading: z.enum(headingFonts).nullable(),
  radius: z.enum(radii).nullable(),
  customCss: z.string().max(MAX_CUSTOM_CSS_LENGTH).nullable(),
});

export type DesignSettings = z.infer<typeof designSettingsSchema>;

export const designAssetKeySchema = z.enum(designAssetKeys);

/** Upper bound for one uploaded logo or font. */
export const MAX_DESIGN_ASSET_SIZE = 512 * 1024;

export const uploadDesignAssetSchema = z.object({
  key: designAssetKeySchema,
  fileName: z.string().trim().min(1).max(200),
  // Base64 inflates by a third; the decoded size is checked again on the server
  dataBase64: z
    .string()
    .min(1)
    .max(Math.ceil((MAX_DESIGN_ASSET_SIZE * 4) / 3) + 4),
});

export const removeDesignAssetSchema = z.object({
  key: designAssetKeySchema,
});
