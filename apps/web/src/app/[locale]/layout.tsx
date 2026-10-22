import "./globals.css";

import { supportedLngs } from "@rallly/languages";
import { Toaster } from "@rallly/ui/sonner";
import { TooltipProvider } from "@rallly/ui/tooltip";
import { domAnimation, LazyMotion } from "motion/react";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import type React from "react";
import { Suspense } from "react";
import { PostHogSessionInit } from "@/app/[locale]/components/posthog-init";
import type { Params } from "@/app/[locale]/types";
import { RouterLoadingBar } from "@/components/router-loading-indicator";
import { SkipNavLink } from "@/components/skip-nav-link";
import { BrandingProvider } from "@/features/branding/client";
import { getInstanceBrandingConfig } from "@/features/branding/data";
import { InstancePolicyProvider } from "@/features/instance-policy/client";
import { loadInstancePolicy } from "@/features/instance-policy/loaders";
import { I18nProvider } from "@/i18n/client";
import { initI18next } from "@/i18n/i18n";
import { chunkRegistrationLogScript } from "@/lib/chunk-registration-log";
import { TimeZoneSync } from "@/lib/datetime/timezone-sync";
import { FeatureFlagsProvider } from "@/lib/feature-flags/client";
import { featureFlagConfig } from "@/lib/feature-flags/config";
import { ThemeProvider } from "@/lib/theme";
import { TRPCProvider } from "@/trpc/client/provider";

// Both faces register as CSS variables; the instance theme picks one as
// --font-sans (features/branding/utils.ts).
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

// PT Sans (SIL Open Font License), the body face of the party's corporate
// design. Bundled rather than fetched from Google at build time.
const ptSans = localFont({
  src: [
    {
      path: "../../fonts/pt-sans/pt-sans-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../fonts/pt-sans/pt-sans-latin-400-italic.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../fonts/pt-sans/pt-sans-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../fonts/pt-sans/pt-sans-latin-700-italic.woff2",
      weight: "700",
      style: "italic",
    },
  ],
  display: "swap",
  variable: "--font-pt-sans",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

async function loadData(locale: string) {
  const [brandingConfig, instancePolicy, { i18n }] = await Promise.all([
    getInstanceBrandingConfig(),
    loadInstancePolicy(),
    initI18next({ lng: locale }),
  ]);

  return {
    resources: i18n.store.data,
    brandingConfig,
    instancePolicy,
  };
}

export default async function Root({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<Params>;
}) {
  const { locale } = await params;

  if (!supportedLngs.includes(locale)) {
    notFound();
  }

  const { brandingConfig, instancePolicy, resources } = await loadData(locale);

  const brandingStyles = {
    "--primary-light": brandingConfig.primaryColor.light,
    "--primary-light-foreground": brandingConfig.primaryColor.lightForeground,
    "--primary-dark": brandingConfig.primaryColor.dark,
    "--primary-dark-foreground": brandingConfig.primaryColor.darkForeground,
  } as React.CSSProperties;

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${ptSans.variable}`}
      suppressHydrationWarning={true}
      style={brandingStyles}
    >
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static diagnostics script with no user input
          dangerouslySetInnerHTML={{ __html: chunkRegistrationLogScript }}
        />
        <style
          id="instance-theme"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: generated from validated design settings; admin CSS is stripped of </style
          dangerouslySetInnerHTML={{ __html: brandingConfig.theme.css }}
        />
      </head>
      <body>
        <ThemeProvider>
          <FeatureFlagsProvider value={featureFlagConfig}>
            <InstancePolicyProvider value={instancePolicy}>
              <BrandingProvider value={brandingConfig}>
                <Toaster />
                <RouterLoadingBar />
                <I18nProvider locale={locale} resources={resources}>
                  <TRPCProvider>
                    <LazyMotion features={domAnimation}>
                      <SkipNavLink />
                      <TimeZoneSync>
                        <TooltipProvider>
                          <Suspense>
                            <PostHogSessionInit>{children}</PostHogSessionInit>
                          </Suspense>
                        </TooltipProvider>
                      </TimeZoneSync>
                    </LazyMotion>
                  </TRPCProvider>
                </I18nProvider>
              </BrandingProvider>
            </InstancePolicyProvider>
          </FeatureFlagsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const brandingConfig = await getInstanceBrandingConfig();

  return {
    title: {
      template: "%s",
      default: brandingConfig.appName,
    },
  };
}
