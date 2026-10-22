import { absoluteUrl } from "@rallly/utils/absolute-url";

// Corporate colors of BÜNDNIS 90/DIE GRÜNEN, the fork's default theme.
export const GRUENE_COLORS = {
  tanne: "#005538",
  klee: "#008939",
  grashalm: "#8abd24",
  sonne: "#fff17a",
  sand: "#f5f1e9",
} as const;

export const DEFAULT_PRIMARY_COLOR = GRUENE_COLORS.tanne;
export const DEFAULT_LOGO_URL = absoluteUrl("/static/logo.svg");
export const DEFAULT_LOGO_URL_DARK = absoluteUrl("/static/logo-dark.svg");
export const DEFAULT_LOGO_ICON_URL = absoluteUrl("/images/logo-mark.png");
export const DEFAULT_APP_NAME = "Termine";
export const LOGO_VIEWBOX = { width: 192, height: 128 };
export const LIGHT_MODE_BACKGROUND = "#ffffff";
export const DARK_MODE_BACKGROUND = "#171717";

export const themePresetIds = [
  "gruene",
  "gruene-klee",
  "gruene-sand",
  "rallly",
  "custom",
] as const;
export type ThemePresetId = (typeof themePresetIds)[number];

/** Tint of the neutral scale behind text, borders and surfaces. */
export const neutralTones = ["neutral", "green", "warm"] as const;
export type NeutralTone = (typeof neutralTones)[number];

/** `custom` is a font file uploaded in the design settings. */
export const bodyFonts = ["pt-sans", "inter", "system", "custom"] as const;
export type BodyFont = (typeof bodyFonts)[number];

/**
 * `custom` falls back to the body font while no heading font is uploaded, so
 * a preset can ask for the party typeface without shipping it: GrueneType's
 * license forbids redistributing the file, so each instance uploads its own.
 */
export const headingFonts = ["body", "pt-sans", "inter", "custom"] as const;
export type HeadingFont = (typeof headingFonts)[number];

export const radii = ["none", "small", "medium", "large"] as const;
export type Radius = (typeof radii)[number];

export type ThemeTokens = {
  primaryColor: string;
  primaryColorDark: string;
  accentColor: string;
  /** Null keeps the surface the neutral scale derives. */
  backgroundColor: string | null;
  backgroundColorDark: string | null;
  neutralTone: NeutralTone;
  fontBody: BodyFont;
  fontHeading: HeadingFont;
  radius: Radius;
};

export const THEME_PRESETS: Record<
  Exclude<ThemePresetId, "custom">,
  ThemeTokens
> = {
  // Tanne on light surfaces, Sonne on the dark green ones
  gruene: {
    primaryColor: GRUENE_COLORS.tanne,
    primaryColorDark: GRUENE_COLORS.sonne,
    accentColor: GRUENE_COLORS.sonne,
    backgroundColor: null,
    backgroundColorDark: null,
    neutralTone: "green",
    fontBody: "pt-sans",
    fontHeading: "custom",
    radius: "medium",
  },
  "gruene-klee": {
    primaryColor: GRUENE_COLORS.klee,
    primaryColorDark: GRUENE_COLORS.grashalm,
    accentColor: GRUENE_COLORS.grashalm,
    backgroundColor: null,
    backgroundColorDark: null,
    neutralTone: "green",
    fontBody: "pt-sans",
    fontHeading: "custom",
    radius: "medium",
  },
  "gruene-sand": {
    primaryColor: GRUENE_COLORS.tanne,
    primaryColorDark: GRUENE_COLORS.sonne,
    accentColor: GRUENE_COLORS.sonne,
    backgroundColor: null,
    backgroundColorDark: null,
    neutralTone: "warm",
    fontBody: "pt-sans",
    fontHeading: "custom",
    radius: "large",
  },
  rallly: {
    primaryColor: "#4f46e5",
    primaryColorDark: "#6366f1",
    accentColor: "#4f46e5",
    backgroundColor: null,
    backgroundColorDark: null,
    neutralTone: "neutral",
    fontBody: "inter",
    fontHeading: "body",
    radius: "medium",
  },
};

export const DEFAULT_THEME_PRESET = "gruene" satisfies ThemePresetId;

/** Keys of the files the design settings store in `instance_assets`. */
export const designAssetKeys = [
  "logo",
  "logoDark",
  "logoIcon",
  "fontBody",
  "fontHeading",
] as const;
export type DesignAssetKey = (typeof designAssetKeys)[number];

export const CUSTOM_BODY_FONT_FAMILY = "Instance Body";
export const CUSTOM_HEADING_FONT_FAMILY = "Instance Heading";

export const MAX_CUSTOM_CSS_LENGTH = 20_000;
