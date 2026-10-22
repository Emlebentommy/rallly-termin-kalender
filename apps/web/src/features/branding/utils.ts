import { resolveStorageUrl } from "@/lib/storage/resolve-storage-url";
import { adjustColorForContrast, getForegroundColor } from "@/lib/utils/color";
import type { BrandingConfig } from "./client";
import type {
  BodyFont,
  HeadingFont,
  NeutralTone,
  Radius,
  ThemePresetId,
  ThemeTokens,
} from "./constants";
import {
  bodyFonts,
  CUSTOM_BODY_FONT_FAMILY,
  CUSTOM_HEADING_FONT_FAMILY,
  DARK_MODE_BACKGROUND,
  DEFAULT_APP_NAME,
  DEFAULT_LOGO_ICON_URL,
  DEFAULT_LOGO_URL,
  DEFAULT_LOGO_URL_DARK,
  DEFAULT_THEME_PRESET,
  headingFonts,
  LIGHT_MODE_BACKGROUND,
  MAX_CUSTOM_CSS_LENGTH,
  neutralTones,
  radii,
  THEME_PRESETS,
  themePresetIds,
} from "./constants";

export function getPrimaryColorVars(primaryColor: string) {
  const light = adjustColorForContrast(primaryColor, LIGHT_MODE_BACKGROUND);
  const dark = adjustColorForContrast(primaryColor, DARK_MODE_BACKGROUND);
  return {
    light,
    lightForeground: getForegroundColor(light),
    dark,
    darkForeground: getForegroundColor(dark),
  };
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function pick<T extends string>(
  allowed: readonly T[],
  value: string | null | undefined,
) {
  return value && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function hexOrUndefined(value: string | null | undefined) {
  return value && HEX_COLOR.test(value) ? value : undefined;
}

export interface ThemeValues {
  themePreset?: string | null;
  accentColor?: string | null;
  backgroundColor?: string | null;
  backgroundColorDark?: string | null;
  neutralTone?: string | null;
  fontBody?: string | null;
  fontHeading?: string | null;
  radius?: string | null;
}

/**
 * The preset sets every token; each stored field then overrides one of them.
 * `custom` starts from the default preset, so switching to it changes nothing
 * until a field is edited. Unknown or malformed stored values are ignored
 * rather than failing the page, as a row may be edited by hand.
 */
export function resolveThemeTokens(values: ThemeValues = {}): {
  preset: ThemePresetId;
  tokens: ThemeTokens;
} {
  const preset =
    pick(themePresetIds, values.themePreset) ?? DEFAULT_THEME_PRESET;
  const base =
    THEME_PRESETS[preset === "custom" ? DEFAULT_THEME_PRESET : preset];

  return {
    preset,
    tokens: {
      ...base,
      accentColor: hexOrUndefined(values.accentColor) ?? base.accentColor,
      backgroundColor:
        hexOrUndefined(values.backgroundColor) ?? base.backgroundColor,
      backgroundColorDark:
        hexOrUndefined(values.backgroundColorDark) ?? base.backgroundColorDark,
      neutralTone: pick(neutralTones, values.neutralTone) ?? base.neutralTone,
      fontBody: pick(bodyFonts, values.fontBody) ?? base.fontBody,
      fontHeading: pick(headingFonts, values.fontHeading) ?? base.fontHeading,
      radius: pick(radii, values.radius) ?? base.radius,
    },
  };
}

// Lightness of Tailwind's zinc scale; tinted tones keep it so contrast between
// steps stays what the components were designed against.
const NEUTRAL_STEPS = [
  [50, 0.985],
  [100, 0.967],
  [200, 0.92],
  [300, 0.871],
  [400, 0.705],
  [500, 0.552],
  [600, 0.442],
  [700, 0.37],
  [800, 0.274],
  [900, 0.21],
  [950, 0.141],
] as const;

const NEUTRAL_TINTS: Record<
  Exclude<NeutralTone, "neutral">,
  { hue: number; chroma: Record<number, number> }
> = {
  // Green grey of the party's digital material (see the BAG worksheet app)
  green: {
    hue: 158,
    chroma: {
      50: 0.006,
      100: 0.009,
      200: 0.013,
      300: 0.017,
      400: 0.022,
      500: 0.024,
      600: 0.024,
      700: 0.022,
      800: 0.022,
      900: 0.026,
      950: 0.022,
    },
  },
  // Sand: the light steps land on the corporate Sand (#f5f1e9)
  warm: {
    hue: 84,
    chroma: {
      50: 0.008,
      100: 0.012,
      200: 0.016,
      300: 0.018,
      400: 0.02,
      500: 0.02,
      600: 0.018,
      700: 0.016,
      800: 0.012,
      900: 0.01,
      950: 0.008,
    },
  },
};

/** CSS custom properties for the neutral scale; empty for plain zinc. */
export function getNeutralScaleVars(tone: NeutralTone): Record<string, string> {
  if (tone === "neutral") {
    return {};
  }
  const tint = NEUTRAL_TINTS[tone];
  const vars: Record<string, string> = { "--gray-hue": String(tint.hue) };
  for (const [step, lightness] of NEUTRAL_STEPS) {
    vars[`--color-gray-${step}`] =
      `oklch(${lightness} ${tint.chroma[step]} ${tint.hue})`;
  }
  return vars;
}

// Tailwind's default radius scale in rem, scaled as one so components keep
// their relative rounding.
const RADIUS_SCALE = {
  "--radius-xs": 0.125,
  "--radius-sm": 0.25,
  "--radius-md": 0.375,
  "--radius-lg": 0.5,
  "--radius-xl": 0.75,
  "--radius-2xl": 1,
  "--radius-3xl": 1.5,
  "--radius-4xl": 2,
  "--radius": 0.625,
} as const;

const RADIUS_FACTOR: Record<Radius, number> = {
  none: 0,
  small: 0.5,
  medium: 1,
  large: 1.5,
};

export function getRadiusVars(radius: Radius): Record<string, string> {
  if (radius === "medium") {
    return {};
  }
  const factor = RADIUS_FACTOR[radius];
  return Object.fromEntries(
    Object.entries(RADIUS_SCALE).map(([name, rem]) => [
      name,
      `${Math.round(rem * factor * 1000) / 1000}rem`,
    ]),
  );
}

const SYSTEM_STACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const EMOJI_STACK =
  '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';

const FONT_STACKS: Record<Exclude<BodyFont, "custom">, string> = {
  "pt-sans": `var(--font-pt-sans), ${SYSTEM_STACK}, ${EMOJI_STACK}`,
  inter: `var(--font-inter), ${SYSTEM_STACK}, ${EMOJI_STACK}`,
  system: `${SYSTEM_STACK}, ${EMOJI_STACK}`,
};

export type ThemeFontAsset = { url: string; mimeType: string };

export type ThemeAssets = {
  fontBody?: ThemeFontAsset | null;
  fontHeading?: ThemeFontAsset | null;
};

export function getBodyFontStack(font: BodyFont, assets: ThemeAssets = {}) {
  if (font === "custom") {
    return assets.fontBody
      ? `"${CUSTOM_BODY_FONT_FAMILY}", ${FONT_STACKS["pt-sans"]}`
      : FONT_STACKS["pt-sans"];
  }
  return FONT_STACKS[font];
}

/** Null when headings use the body font. */
export function getHeadingFontStack(
  font: HeadingFont,
  bodyStack: string,
  assets: ThemeAssets = {},
) {
  switch (font) {
    case "body":
      return null;
    case "custom":
      return assets.fontHeading
        ? `"${CUSTOM_HEADING_FONT_FAMILY}", ${bodyStack}`
        : null;
    default:
      return FONT_STACKS[font];
  }
}

const FONT_FORMATS: Record<string, string> = {
  "font/woff2": "woff2",
  "font/woff": "woff",
  "font/ttf": "truetype",
  "font/otf": "opentype",
};

function fontFace(family: string, asset: ThemeFontAsset) {
  const format = FONT_FORMATS[asset.mimeType];
  return `@font-face{font-family:"${family}";src:url("${asset.url}")${format ? ` format("${format}")` : ""};font-display:swap;}`;
}

/**
 * Admin-authored CSS goes into a <style> element, so the one thing it must
 * not do is close it. Everything else is the admin's call.
 */
export function sanitizeCustomCss(css: string | null | undefined) {
  if (!css) {
    return "";
  }
  return css.slice(0, MAX_CUSTOM_CSS_LENGTH).replace(/<\/?style/gi, "");
}

function declarations(vars: Record<string, string>) {
  return Object.entries(vars)
    .map(([name, value]) => `${name}:${value};`)
    .join("");
}

const HEADING_SELECTOR =
  'h1,h2,[data-slot="dialog-title"],[data-slot="sheet-title"]';

/**
 * The stylesheet that applies a theme to the whole app. Selectors are one
 * step more specific than the shared ones in @rallly/tailwind-config
 * (`html:root` over `:root`), and unlayered, so they win over Tailwind's
 * layered defaults regardless of where Next places the <style> element.
 */
export function buildThemeCss({
  tokens,
  assets = {},
  customCss,
}: {
  tokens: ThemeTokens;
  assets?: ThemeAssets;
  customCss?: string | null;
}) {
  const bodyStack = getBodyFontStack(tokens.fontBody, assets);
  const headingStack = getHeadingFontStack(
    tokens.fontHeading,
    bodyStack,
    assets,
  );

  const usesCustomHeading =
    tokens.fontHeading === "custom" && Boolean(assets.fontHeading);

  const rootVars: Record<string, string> = {
    ...getNeutralScaleVars(tokens.neutralTone),
    ...getRadiusVars(tokens.radius),
    "--font-sans": bodyStack,
    // For display text outside headings, such as the default wordmark
    "--font-heading": headingStack ?? bodyStack,
    "--font-heading-weight": usesCustomHeading ? "400" : "700",
    "--brand-accent": tokens.accentColor,
    "--brand-accent-foreground": getForegroundColor(tokens.accentColor),
  };

  const rules = [`html:root{${declarations(rootVars)}}`];

  if (tokens.backgroundColor) {
    rules.push(`html:root:not(.dark){--background:${tokens.backgroundColor};}`);
  }
  if (tokens.backgroundColorDark) {
    rules.push(`html.dark:root{--background:${tokens.backgroundColorDark};}`);
  }

  if (assets.fontBody && tokens.fontBody === "custom") {
    rules.push(fontFace(CUSTOM_BODY_FONT_FAMILY, assets.fontBody));
  }

  if (headingStack) {
    if (usesCustomHeading && assets.fontHeading) {
      rules.push(fontFace(CUSTOM_HEADING_FONT_FAMILY, assets.fontHeading));
      // Display faces such as GrueneType ship one weight; a synthesized bold
      // smears them, so headings take the face as drawn.
      rules.push(
        `${HEADING_SELECTOR}{font-family:${headingStack};font-weight:400;font-synthesis:none;letter-spacing:0;}`,
      );
    } else {
      rules.push(`${HEADING_SELECTOR}{font-family:${headingStack};}`);
    }
  }

  const custom = sanitizeCustomCss(customCss);
  if (custom) {
    rules.push(custom);
  }

  return rules.join("\n");
}

interface BrandingValues extends ThemeValues {
  appName?: string | null;
  primaryColor?: string | null;
  primaryColorDark?: string | null;
  logo?: string | null;
  logoDark?: string | null;
  logoIcon?: string | null;
  hideAttribution?: boolean | null;
  customCss?: string | null;
}

/**
 * Merges branding values per field (db → env → preset/default), then applies
 * the derived rules: dark logo falls back to the light logo, the dark primary
 * color comes from the preset unless the light one was overridden (then it is
 * computed from it), and foreground colors are computed from their
 * backgrounds. Logo values may be storage keys, absolute URLs or design asset
 * references.
 */
export function resolveBrandingConfig({
  db,
  env,
  assets,
}: {
  db?: BrandingValues | null;
  env?: BrandingValues;
  assets?: ThemeAssets;
}): BrandingConfig {
  const { preset, tokens: presetTokens } = resolveThemeTokens(db ?? {});

  const overriddenPrimary = db?.primaryColor ?? env?.primaryColor;
  const primaryColor = overriddenPrimary ?? presetTokens.primaryColor;
  const vars = getPrimaryColorVars(primaryColor);
  const primaryColorDark =
    db?.primaryColorDark ??
    env?.primaryColorDark ??
    (overriddenPrimary ? vars.dark : presetTokens.primaryColorDark);

  const tokens: ThemeTokens = {
    ...presetTokens,
    primaryColor: vars.light,
    primaryColorDark,
  };

  const logo = db?.logo ?? env?.logo ?? null;
  const logoDark = db?.logoDark ?? env?.logoDark ?? logo;

  return {
    primaryColor: {
      light: vars.light,
      lightForeground: vars.lightForeground,
      dark: primaryColorDark,
      darkForeground: getForegroundColor(primaryColorDark),
    },
    logo: {
      light: resolveStorageUrl(logo ?? DEFAULT_LOGO_URL),
      dark: resolveStorageUrl(logoDark ?? DEFAULT_LOGO_URL_DARK),
    },
    logoIcon: resolveStorageUrl(
      db?.logoIcon ?? env?.logoIcon ?? DEFAULT_LOGO_ICON_URL,
    ),
    hideAttribution: db?.hideAttribution ?? env?.hideAttribution ?? false,
    appName: db?.appName ?? env?.appName ?? DEFAULT_APP_NAME,
    theme: {
      preset,
      tokens,
      css: buildThemeCss({ tokens, assets, customCss: db?.customCss }),
    },
  };
}
