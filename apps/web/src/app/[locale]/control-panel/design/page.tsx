import { Field, FieldContent, FieldGroup, FieldTitle } from "@rallly/ui/field";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Trans } from "react-i18next/TransWithoutContext";
import {
  PageSection,
  PageSectionContent,
  PageSectionDescription,
  PageSectionGroup,
  PageSectionHeader,
  PageSectionTitle,
} from "@/components/page-layout";
import { RouterLoadingIndicator } from "@/components/router-loading-indicator";
import {
  SettingsPage,
  SettingsPageContent,
} from "@/components/settings-layout";
import { loadDesignSettings } from "@/features/branding/loaders";
import { getTranslation } from "@/i18n/server";
import { DesignAssetField } from "./components/design-asset-field";
import { DesignPageHeader } from "./components/design-page-header";
import { DesignSettingsForm } from "./components/design-settings-form";

async function DesignSettings() {
  const [{ values, envDefaults, resolved, assets }, { t, i18n }] =
    await Promise.all([loadDesignSettings(), getTranslation()]);

  const fontAsset = (asset: (typeof assets)["fontBody"]) =>
    asset ? { url: asset.url, mimeType: asset.mimeType } : null;

  return (
    <PageSectionGroup>
      <DesignSettingsForm
        values={values}
        envDefaults={envDefaults}
        logos={{
          light: assets.logo?.url ?? null,
          dark: assets.logoDark?.url ?? assets.logo?.url ?? null,
        }}
        fonts={{
          fontBody: fontAsset(assets.fontBody),
          fontHeading: fontAsset(assets.fontHeading),
        }}
      />

      <PageSection variant="card">
        <PageSectionHeader>
          <PageSectionTitle>
            <Trans
              t={t}
              i18n={i18n}
              ns="app"
              i18nKey="logos"
              defaults="Logos"
            />
          </PageSectionTitle>
          <PageSectionDescription>
            <Trans
              t={t}
              i18n={i18n}
              ns="app"
              i18nKey="designLogosDescription"
              defaults="Without an upload, the default logo shows the calendar mark and the app name. Uploads take effect immediately."
            />
          </PageSectionDescription>
        </PageSectionHeader>
        <PageSectionContent>
          <FieldGroup variant="divided">
            <Field>
              <FieldContent>
                <FieldTitle>
                  <Trans
                    t={t}
                    i18n={i18n}
                    ns="app"
                    i18nKey="logo"
                    defaults="Logo"
                  />
                </FieldTitle>
              </FieldContent>
              <DesignAssetField
                assetKey="logo"
                current={assets.logo}
                previewUrl={resolved.logo.light}
              />
            </Field>
            <Field>
              <FieldContent>
                <FieldTitle>
                  <Trans
                    t={t}
                    i18n={i18n}
                    ns="app"
                    i18nKey="logoDark"
                    defaults="Logo (dark mode)"
                  />
                </FieldTitle>
              </FieldContent>
              <DesignAssetField
                assetKey="logoDark"
                current={assets.logoDark}
                previewUrl={resolved.logo.dark}
                dark
              />
            </Field>
            <Field>
              <FieldContent>
                <FieldTitle>
                  <Trans
                    t={t}
                    i18n={i18n}
                    ns="app"
                    i18nKey="logoIcon"
                    defaults="Logo icon"
                  />
                </FieldTitle>
              </FieldContent>
              <DesignAssetField
                assetKey="logoIcon"
                current={assets.logoIcon}
                previewUrl={resolved.logoIcon}
              />
            </Field>
          </FieldGroup>
        </PageSectionContent>
      </PageSection>

      <PageSection variant="card">
        <PageSectionHeader>
          <PageSectionTitle>
            <Trans
              t={t}
              i18n={i18n}
              ns="app"
              i18nKey="designFonts"
              defaults="Fonts"
            />
          </PageSectionTitle>
          <PageSectionDescription>
            <Trans
              t={t}
              i18n={i18n}
              ns="app"
              i18nKey="designFontsDescription"
              defaults="Upload a font your license allows you to use on your website, such as GrueneType Neue for headings. The file stays on this instance."
            />
          </PageSectionDescription>
        </PageSectionHeader>
        <PageSectionContent>
          <FieldGroup variant="divided">
            <Field>
              <FieldContent>
                <FieldTitle>
                  <Trans
                    t={t}
                    i18n={i18n}
                    ns="app"
                    i18nKey="designFontHeading"
                    defaults="Headings"
                  />
                </FieldTitle>
              </FieldContent>
              <DesignAssetField
                assetKey="fontHeading"
                current={assets.fontHeading}
              />
            </Field>
            <Field>
              <FieldContent>
                <FieldTitle>
                  <Trans
                    t={t}
                    i18n={i18n}
                    ns="app"
                    i18nKey="designFontBody"
                    defaults="Body text"
                  />
                </FieldTitle>
              </FieldContent>
              <DesignAssetField assetKey="fontBody" current={assets.fontBody} />
            </Field>
          </FieldGroup>
        </PageSectionContent>
      </PageSection>
    </PageSectionGroup>
  );
}

export default function DesignPage() {
  return (
    <SettingsPage>
      <DesignPageHeader />
      <SettingsPageContent>
        <Suspense fallback={<RouterLoadingIndicator />}>
          <DesignSettings />
        </Suspense>
      </SettingsPageContent>
    </SettingsPage>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const { t } = await getTranslation(locale);
  return {
    title: t("design", { defaultValue: "Design" }),
  };
}
