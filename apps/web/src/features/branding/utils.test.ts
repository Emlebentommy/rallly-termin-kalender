import { describe, expect, it } from "vitest";
import { getForegroundColor } from "@/lib/utils/color";
import {
  DEFAULT_APP_NAME,
  DEFAULT_LOGO_ICON_URL,
  DEFAULT_LOGO_URL,
  DEFAULT_LOGO_URL_DARK,
  DEFAULT_PRIMARY_COLOR,
  GRUENE_COLORS,
  THEME_PRESETS,
} from "./constants";
import {
  buildThemeCss,
  getNeutralScaleVars,
  getPrimaryColorVars,
  getRadiusVars,
  resolveBrandingConfig,
  resolveThemeTokens,
  sanitizeCustomCss,
} from "./utils";

describe("resolveBrandingConfig", () => {
  it("returns the default config when no sources are provided", () => {
    const config = resolveBrandingConfig({});
    const defaults = getPrimaryColorVars(DEFAULT_PRIMARY_COLOR);

    expect(config).toMatchObject({
      primaryColor: {
        light: defaults.light,
        lightForeground: defaults.lightForeground,
        // The default preset pairs Tanne with Sonne in dark mode
        dark: GRUENE_COLORS.sonne,
        darkForeground: getForegroundColor(GRUENE_COLORS.sonne),
      },
      logo: {
        light: DEFAULT_LOGO_URL,
        dark: DEFAULT_LOGO_URL_DARK,
      },
      logoIcon: DEFAULT_LOGO_ICON_URL,
      hideAttribution: false,
      appName: DEFAULT_APP_NAME,
      theme: { preset: "gruene" },
    });
  });

  it("resolves design asset references to the asset route", () => {
    const config = resolveBrandingConfig({
      db: { logo: "asset:logo:1700000000000" },
    });

    expect(config.logo.light).toContain(
      "/api/instance-assets/logo?v=1700000000000",
    );
  });

  it("uses env values when the db values are unset", () => {
    const config = resolveBrandingConfig({
      db: {
        appName: null,
        primaryColor: null,
        primaryColorDark: null,
        logo: null,
        logoDark: null,
        logoIcon: null,
        hideAttribution: null,
      },
      env: {
        appName: "Env App",
        logo: "https://example.com/logo.svg",
        logoIcon: "https://example.com/icon.png",
        hideAttribution: true,
      },
    });

    expect(config.appName).toBe("Env App");
    expect(config.logo.light).toBe("https://example.com/logo.svg");
    expect(config.logoIcon).toBe("https://example.com/icon.png");
    expect(config.hideAttribution).toBe(true);
  });

  it("prefers db values over env values per field", () => {
    const config = resolveBrandingConfig({
      db: {
        appName: "DB App",
        primaryColor: null,
        primaryColorDark: null,
        logo: "https://db.example.com/logo.svg",
        logoDark: null,
        logoIcon: null,
        hideAttribution: false,
      },
      env: {
        appName: "Env App",
        logo: "https://env.example.com/logo.svg",
        logoIcon: "https://env.example.com/icon.png",
        hideAttribution: true,
      },
    });

    // db wins where set
    expect(config.appName).toBe("DB App");
    expect(config.logo.light).toBe("https://db.example.com/logo.svg");
    expect(config.hideAttribution).toBe(false);
    // env fills fields the db leaves unset
    expect(config.logoIcon).toBe("https://env.example.com/icon.png");
  });

  it("falls back to the merged light logo for the dark logo", () => {
    const config = resolveBrandingConfig({
      env: {
        logo: "https://example.com/logo.svg",
      },
    });

    expect(config.logo.dark).toBe("https://example.com/logo.svg");
  });

  it("prefers an explicit dark logo over the light logo fallback", () => {
    const config = resolveBrandingConfig({
      db: {
        appName: null,
        primaryColor: null,
        primaryColorDark: null,
        logo: "https://example.com/logo.svg",
        logoDark: "https://example.com/logo-dark.svg",
        logoIcon: null,
        hideAttribution: null,
      },
    });

    expect(config.logo.dark).toBe("https://example.com/logo-dark.svg");
  });

  it("uses the default dark logo when no logo is set anywhere", () => {
    const config = resolveBrandingConfig({});

    expect(config.logo.dark).toBe(DEFAULT_LOGO_URL_DARK);
  });

  it("resolves storage keys to storage URLs", () => {
    const config = resolveBrandingConfig({
      db: {
        appName: null,
        primaryColor: null,
        primaryColorDark: null,
        logo: "branding/logo.png",
        logoDark: null,
        logoIcon: "branding/icon.png",
        hideAttribution: null,
      },
    });

    expect(config.logo.light).toContain("/api/storage/branding/logo.png");
    expect(config.logo.dark).toContain("/api/storage/branding/logo.png");
    expect(config.logoIcon).toContain("/api/storage/branding/icon.png");
  });

  it("computes the dark primary color from the merged light color when unset", () => {
    const config = resolveBrandingConfig({
      db: {
        appName: null,
        primaryColor: "#336699",
        primaryColorDark: null,
        logo: null,
        logoDark: null,
        logoIcon: null,
        hideAttribution: null,
      },
    });

    expect(config.primaryColor).toEqual(getPrimaryColorVars("#336699"));
  });

  it("uses an explicit dark primary color and computes its foreground", () => {
    const config = resolveBrandingConfig({
      db: {
        appName: null,
        primaryColor: "#336699",
        primaryColorDark: "#99ccff",
        logo: null,
        logoDark: null,
        logoIcon: null,
        hideAttribution: null,
      },
      env: {
        primaryColorDark: "#000000",
      },
    });

    expect(config.primaryColor.dark).toBe("#99ccff");
    expect(config.primaryColor.darkForeground).toBe(
      getForegroundColor("#99ccff"),
    );
    expect(config.primaryColor.light).toEqual(
      getPrimaryColorVars("#336699").light,
    );
  });
});

describe("resolveThemeTokens", () => {
  it("uses the default preset when nothing is stored", () => {
    expect(resolveThemeTokens({})).toEqual({
      preset: "gruene",
      tokens: THEME_PRESETS.gruene,
    });
  });

  it("overrides single tokens on top of the preset", () => {
    const { preset, tokens } = resolveThemeTokens({
      themePreset: "rallly",
      radius: "large",
      accentColor: "#123456",
    });

    expect(preset).toBe("rallly");
    expect(tokens).toEqual({
      ...THEME_PRESETS.rallly,
      radius: "large",
      accentColor: "#123456",
    });
  });

  it("starts the custom preset from the default preset", () => {
    expect(resolveThemeTokens({ themePreset: "custom" }).tokens).toEqual(
      THEME_PRESETS.gruene,
    );
  });

  it("ignores unknown or malformed stored values", () => {
    const { preset, tokens } = resolveThemeTokens({
      themePreset: "neon",
      neutralTone: "purple",
      accentColor: "red",
      fontBody: "comic-sans",
    });

    expect(preset).toBe("gruene");
    expect(tokens).toEqual(THEME_PRESETS.gruene);
  });
});

describe("getNeutralScaleVars", () => {
  it("keeps the built-in zinc scale for the neutral tone", () => {
    expect(getNeutralScaleVars("neutral")).toEqual({});
  });

  it("tints every step of the scale", () => {
    const vars = getNeutralScaleVars("green");

    expect(vars["--gray-hue"]).toBe("158");
    expect(Object.keys(vars)).toHaveLength(12);
    expect(vars["--color-gray-100"]).toMatch(/^oklch\(0\.967 [\d.]+ 158\)$/);
  });
});

describe("getRadiusVars", () => {
  it("keeps the default scale for medium", () => {
    expect(getRadiusVars("medium")).toEqual({});
  });

  it("scales every radius token together", () => {
    expect(getRadiusVars("none")["--radius-lg"]).toBe("0rem");
    expect(getRadiusVars("large")["--radius-lg"]).toBe("0.75rem");
  });
});

describe("buildThemeCss", () => {
  it("sets the body font, accent and neutral scale on the root", () => {
    const css = buildThemeCss({ tokens: THEME_PRESETS.gruene });

    expect(css).toContain("html:root{");
    expect(css).toContain("--font-sans:var(--font-pt-sans)");
    expect(css).toContain(`--brand-accent:${GRUENE_COLORS.sonne}`);
    expect(css).toContain("--color-gray-50:oklch(");
  });

  it("falls back to the body font when no heading font is uploaded", () => {
    const css = buildThemeCss({ tokens: THEME_PRESETS.gruene });

    expect(css).not.toContain("@font-face");
    expect(css).not.toContain("h1,");
  });

  it("registers an uploaded heading font and drops synthesized bold", () => {
    const css = buildThemeCss({
      tokens: THEME_PRESETS.gruene,
      assets: {
        fontHeading: {
          url: "https://example.com/api/instance-assets/fontHeading?v=1",
          mimeType: "font/woff",
        },
      },
    });

    expect(css).toContain(
      '@font-face{font-family:"Instance Heading";src:url("https://example.com/api/instance-assets/fontHeading?v=1") format("woff")',
    );
    expect(css).toContain("font-weight:400;font-synthesis:none");
  });

  it("only overrides the background of the mode it was set for", () => {
    const css = buildThemeCss({
      tokens: { ...THEME_PRESETS.gruene, backgroundColor: "#f5f1e9" },
    });

    expect(css).toContain("html:root:not(.dark){--background:#f5f1e9;}");
    expect(css).not.toContain("html.dark:root");
  });

  it("appends custom CSS last", () => {
    const css = buildThemeCss({
      tokens: THEME_PRESETS.gruene,
      customCss: ".poll-title{letter-spacing:1px}",
    });

    expect(css.endsWith(".poll-title{letter-spacing:1px}")).toBe(true);
  });
});

describe("sanitizeCustomCss", () => {
  it("cannot close the style element it is rendered into", () => {
    expect(
      sanitizeCustomCss("a{}</style><script>alert(1)</script>"),
    ).not.toMatch(/<\/style/i);
    expect(sanitizeCustomCss("a{}</STYLE >")).not.toMatch(/<\/style/i);
  });

  it("returns an empty string for nothing", () => {
    expect(sanitizeCustomCss(null)).toBe("");
  });
});
