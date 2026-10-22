"use client";

import type { ThemeTokens } from "@/features/branding/constants";
import {
  CUSTOM_BODY_FONT_FAMILY,
  CUSTOM_HEADING_FONT_FAMILY,
} from "@/features/branding/constants";
import {
  getBodyFontStack,
  getHeadingFontStack,
  getNeutralColor,
  getPrimaryColorVars,
  scaleRadius,
} from "@/features/branding/utils";
import { Trans } from "@/i18n/client";
import { getForegroundColor } from "@/lib/utils/color";

type FontAsset = { url: string; mimeType: string } | null;

/**
 * A miniature poll card drawn with inline styles from the unsaved form
 * values. The app's own theme variables are set once on the root and resolve
 * there, so they cannot be re-pointed for one subtree; the preview therefore
 * paints its colors directly instead of reusing app components.
 */
export function DesignPreview({
  tokens,
  appName,
  logoUrl,
  logoUrlDark,
  fonts,
}: {
  tokens: ThemeTokens;
  appName: string;
  logoUrl: string | null;
  logoUrlDark: string | null;
  fonts: { fontBody: FontAsset; fontHeading: FontAsset };
}) {
  // Uploaded fonts are registered under preview names, so a face picked but
  // not yet saved can be tried without touching the live theme.
  const previewFaces = [
    fonts.fontBody
      ? `@font-face{font-family:"${CUSTOM_BODY_FONT_FAMILY}";src:url("${fonts.fontBody.url}");font-display:swap;}`
      : "",
    fonts.fontHeading
      ? `@font-face{font-family:"${CUSTOM_HEADING_FONT_FAMILY}";src:url("${fonts.fontHeading.url}");font-display:swap;}`
      : "",
  ].join("");

  const assets = { fontBody: fonts.fontBody, fontHeading: fonts.fontHeading };
  const bodyFont = getBodyFontStack(tokens.fontBody, assets);
  const headingFont =
    getHeadingFontStack(tokens.fontHeading, bodyFont, assets) ?? bodyFont;
  const headingWeight =
    tokens.fontHeading === "custom" && fonts.fontHeading ? 400 : 700;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {previewFaces ? <style>{previewFaces}</style> : null}
      {(["light", "dark"] as const).map((mode) => (
        <PreviewCard
          key={mode}
          mode={mode}
          tokens={tokens}
          appName={appName}
          logoUrl={mode === "dark" ? (logoUrlDark ?? logoUrl) : logoUrl}
          bodyFont={bodyFont}
          headingFont={headingFont}
          headingWeight={headingWeight}
        />
      ))}
    </div>
  );
}

function PreviewCard({
  mode,
  tokens,
  appName,
  logoUrl,
  bodyFont,
  headingFont,
  headingWeight,
}: {
  mode: "light" | "dark";
  tokens: ThemeTokens;
  appName: string;
  logoUrl: string | null;
  bodyFont: string;
  headingFont: string;
  headingWeight: number;
}) {
  const dark = mode === "dark";
  const tone = tokens.neutralTone;
  const primary = dark
    ? tokens.primaryColorDark
    : getPrimaryColorVars(tokens.primaryColor).light;
  const primaryForeground = getForegroundColor(primary);
  const page = dark
    ? (tokens.backgroundColorDark ?? getNeutralColor(tone, 950))
    : getNeutralColor(tone, 100);
  const card = dark
    ? getNeutralColor(tone, 900)
    : (tokens.backgroundColor ?? "#ffffff");
  const border = getNeutralColor(tone, dark ? 800 : 200);
  const text = dark ? "#ffffff" : getNeutralColor(tone, 800);
  const muted = getNeutralColor(tone, dark ? 400 : 500);
  const radius = scaleRadius(tokens.radius, 1);
  const small = scaleRadius(tokens.radius, 0.5);

  const votes = [
    { label: "Mo 18:00", color: "#22c55e", mark: "✓" },
    { label: "Di 18:00", color: "#f59e0b", mark: "~" },
    { label: "Mi 17:00", color: "#71717a", mark: "✕" },
  ];

  return (
    <div
      className={dark ? "dark" : undefined}
      style={{
        background: page,
        color: text,
        fontFamily: bodyFont,
        borderRadius: radius,
        padding: 16,
      }}
    >
      <div className="mb-3 flex h-6 items-center gap-2">
        {logoUrl ? (
          // biome-ignore lint/performance/noImgElement: preview of an arbitrary uploaded file
          <img src={logoUrl} alt="" className="h-full w-auto" />
        ) : (
          <span
            className="inline-block size-5"
            style={{ background: primary, borderRadius: small }}
          />
        )}
        <span
          style={{
            fontFamily: headingFont,
            fontWeight: headingWeight,
            fontSize: 15,
          }}
        >
          {appName}
        </span>
      </div>
      <div
        style={{
          background: card,
          border: `1px solid ${border}`,
          borderRadius: radius,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 6,
            backgroundImage: `linear-gradient(to right in oklch, ${primary} 35%, ${tokens.accentColor})`,
          }}
        />
        <div style={{ padding: 14 }}>
          <div
            style={{
              fontFamily: headingFont,
              fontWeight: headingWeight,
              fontSize: 18,
              lineHeight: 1.2,
            }}
          >
            <Trans
              i18nKey="designPreviewTitle"
              defaults="Board meeting in November"
            />
          </div>
          <div style={{ color: muted, fontSize: 13, marginTop: 4 }}>
            <Trans
              i18nKey="designPreviewDescription"
              defaults="Pick the dates that work for you."
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {votes.map((vote) => (
              <span
                key={vote.label}
                className="inline-flex items-center gap-1.5"
                style={{
                  border: `1px solid ${border}`,
                  borderRadius: small,
                  padding: "3px 8px",
                  fontSize: 12,
                }}
              >
                <span
                  className="inline-flex size-3.5 items-center justify-center text-[9px] text-white"
                  style={{ background: vote.color, borderRadius: 999 }}
                >
                  {vote.mark}
                </span>
                {vote.label}
              </span>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <span
              style={{
                background: primary,
                color: primaryForeground,
                borderRadius: 999,
                padding: "6px 14px",
                fontSize: 13,
              }}
            >
              <Trans i18nKey="designPreviewSubmit" defaults="Submit" />
            </span>
            <span
              style={{
                border: `1px solid ${border}`,
                borderRadius: 999,
                padding: "6px 14px",
                fontSize: 13,
              }}
            >
              <Trans i18nKey="designPreviewCancel" defaults="Cancel" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
