"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { mutationOptions } from "@next-safe-action/adapter-tanstack-query";
import { cn } from "@rallly/ui";
import { Button } from "@rallly/ui/button";
import type { Color } from "@rallly/ui/color-picker";
import { ColorPicker, parseColor } from "@rallly/ui/color-picker";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@rallly/ui/field";
import { Input } from "@rallly/ui/input";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@rallly/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@rallly/ui/select";
import { toast } from "@rallly/ui/sonner";
import { Switch } from "@rallly/ui/switch";
import { Textarea } from "@rallly/ui/textarea";
import { useMutation } from "@tanstack/react-query";
import { CheckIcon, RotateCcwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import {
  PageSection,
  PageSectionContent,
  PageSectionDescription,
  PageSectionGroup,
  PageSectionHeader,
  PageSectionTitle,
} from "@/components/page-layout";
import type {
  BodyFont,
  HeadingFont,
  NeutralTone,
  Radius,
  ThemePresetId,
  ThemeTokens,
} from "@/features/branding/constants";
import {
  MAX_CUSTOM_CSS_LENGTH,
  THEME_PRESETS,
} from "@/features/branding/constants";
import type { DesignSettings } from "@/features/branding/schema";
import { designSettingsSchema } from "@/features/branding/schema";
import { getNeutralColor } from "@/features/branding/utils";
import { Trans, useTranslation } from "@/i18n/client";
import { saveDesignSettingsAction } from "../actions";
import { DesignPreview } from "./design-preview";

type PresetId = Exclude<ThemePresetId, "custom">;

const PRESET_ORDER: PresetId[] = [
  "gruene",
  "gruene-klee",
  "gruene-sand",
  "rallly",
];

type TokenField =
  | "primaryColor"
  | "primaryColorDark"
  | "accentColor"
  | "backgroundColor"
  | "backgroundColorDark"
  | "neutralTone"
  | "fontBody"
  | "fontHeading"
  | "radius";

const TOKEN_FIELDS: TokenField[] = [
  "primaryColor",
  "primaryColorDark",
  "accentColor",
  "backgroundColor",
  "backgroundColorDark",
  "neutralTone",
  "fontBody",
  "fontHeading",
  "radius",
];

type FontAsset = { url: string; mimeType: string } | null;

export function DesignSettingsForm({
  values,
  envDefaults,
  logos,
  fonts,
}: {
  values: DesignSettings;
  envDefaults: { primaryColor?: string; primaryColorDark?: string };
  logos: { light: string | null; dark: string | null };
  fonts: { fontBody: FontAsset; fontHeading: FontAsset };
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const form = useForm<DesignSettings>({
    resolver: zodResolver(designSettingsSchema),
    defaultValues: values,
  });

  const watched = useWatch({ control: form.control }) as DesignSettings;
  const presetId: PresetId =
    watched.themePreset === "custom" ? "gruene" : watched.themePreset;
  const preset = THEME_PRESETS[presetId];

  // What each token resolves to: the stored override, else the operator's
  // environment (colors only), else the preset
  const effective: ThemeTokens = {
    primaryColor:
      watched.primaryColor ?? envDefaults.primaryColor ?? preset.primaryColor,
    primaryColorDark:
      watched.primaryColorDark ??
      envDefaults.primaryColorDark ??
      preset.primaryColorDark,
    accentColor: watched.accentColor ?? preset.accentColor,
    backgroundColor: watched.backgroundColor ?? preset.backgroundColor,
    backgroundColorDark:
      watched.backgroundColorDark ?? preset.backgroundColorDark,
    neutralTone: watched.neutralTone ?? preset.neutralTone,
    fontBody: watched.fontBody ?? preset.fontBody,
    fontHeading: watched.fontHeading ?? preset.fontHeading,
    radius: watched.radius ?? preset.radius,
  };

  const save = useMutation(
    mutationOptions(saveDesignSettingsAction, {
      onSuccess: (_data, input) => {
        form.reset(input);
        toast.success(t("saved", { defaultValue: "Saved" }));
        router.refresh();
      },
    }),
  );

  // A token that equals its preset value is stored as null, so later preset
  // updates reach it
  const normalize = (data: DesignSettings): DesignSettings => {
    const base = THEME_PRESETS[
      data.themePreset === "custom" ? "gruene" : data.themePreset
    ] as ThemeTokens;
    const next = { ...data };
    for (const field of TOKEN_FIELDS) {
      const value = next[field];
      if (value !== null && value === base[field]) {
        (next as Record<TokenField, unknown>)[field] = null;
      }
    }
    return next;
  };

  const choosePreset = (id: PresetId) => {
    form.setValue("themePreset", id, { shouldDirty: true });
    for (const field of TOKEN_FIELDS) {
      form.setValue(field, null, { shouldDirty: true });
    }
  };

  const overrides = TOKEN_FIELDS.filter(
    (field) => watched[field] !== null && watched[field] !== undefined,
  ).length;

  return (
    <form onSubmit={form.handleSubmit((data) => save.mutate(normalize(data)))}>
      <PageSectionGroup>
        <PageSection variant="card">
          <PageSectionHeader>
            <PageSectionTitle>
              <Trans i18nKey="designPreview" defaults="Preview" />
            </PageSectionTitle>
            <PageSectionDescription>
              <Trans
                i18nKey="designPreviewDescriptionText"
                defaults="How the theme looks in light and dark mode. Save to apply it everywhere."
              />
            </PageSectionDescription>
          </PageSectionHeader>
          <PageSectionContent>
            <DesignPreview
              tokens={effective}
              appName={watched.appName || "Termine"}
              logoUrl={logos.light}
              logoUrlDark={logos.dark}
              fonts={fonts}
            />
          </PageSectionContent>
        </PageSection>

        <PageSection variant="card">
          <PageSectionHeader>
            <PageSectionTitle>
              <Trans i18nKey="designTemplate" defaults="Template" />
            </PageSectionTitle>
            <PageSectionDescription>
              {overrides > 0 ? (
                <Trans
                  i18nKey="designTemplateCustomized"
                  defaults="The template is the starting point. {count, plural, one {# setting differs} other {# settings differ}} from it."
                  values={{ count: overrides }}
                />
              ) : (
                <Trans
                  i18nKey="designTemplateDescription"
                  defaults="The starting point for colors, fonts and shapes. Every setting below can change it further."
                />
              )}
            </PageSectionDescription>
          </PageSectionHeader>
          <PageSectionContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {PRESET_ORDER.map((id) => (
                <PresetCard
                  key={id}
                  id={id}
                  selected={presetId === id}
                  onSelect={() => choosePreset(id)}
                />
              ))}
            </div>
          </PageSectionContent>
        </PageSection>

        <PageSection variant="card">
          <PageSectionHeader>
            <PageSectionTitle>
              <Trans i18nKey="colors" defaults="Colors" />
            </PageSectionTitle>
          </PageSectionHeader>
          <PageSectionContent>
            <FieldGroup variant="divided">
              <ColorRow
                id="design-primary"
                label={
                  <Trans i18nKey="primaryColor" defaults="Primary color" />
                }
                description={
                  <Trans
                    i18nKey="designPrimaryDescription"
                    defaults="Buttons, links and highlights"
                  />
                }
                value={effective.primaryColor}
                overridden={watched.primaryColor !== null}
                onChange={(hex) =>
                  form.setValue("primaryColor", hex, { shouldDirty: true })
                }
                onReset={() =>
                  form.setValue("primaryColor", null, { shouldDirty: true })
                }
              />
              <ColorRow
                id="design-primary-dark"
                label={
                  <Trans
                    i18nKey="primaryColorDark"
                    defaults="Primary color (dark mode)"
                  />
                }
                value={effective.primaryColorDark}
                overridden={watched.primaryColorDark !== null}
                onChange={(hex) =>
                  form.setValue("primaryColorDark", hex, { shouldDirty: true })
                }
                onReset={() =>
                  form.setValue("primaryColorDark", null, {
                    shouldDirty: true,
                  })
                }
              />
              <ColorRow
                id="design-accent"
                label={<Trans i18nKey="designAccent" defaults="Accent color" />}
                description={
                  <Trans
                    i18nKey="designAccentDescription"
                    defaults="Color stripe on poll cards and the logo mark"
                  />
                }
                value={effective.accentColor}
                overridden={watched.accentColor !== null}
                onChange={(hex) =>
                  form.setValue("accentColor", hex, { shouldDirty: true })
                }
                onReset={() =>
                  form.setValue("accentColor", null, { shouldDirty: true })
                }
              />
              <ColorRow
                id="design-background"
                label={
                  <Trans
                    i18nKey="designBackground"
                    defaults="Surface color (light mode)"
                  />
                }
                description={
                  <Trans
                    i18nKey="designBackgroundDescription"
                    defaults="Cards and pages. Automatic follows the gray tone."
                  />
                }
                value={effective.backgroundColor}
                overridden={watched.backgroundColor !== null}
                onChange={(hex) =>
                  form.setValue("backgroundColor", hex, { shouldDirty: true })
                }
                onReset={() =>
                  form.setValue("backgroundColor", null, { shouldDirty: true })
                }
              />
              <ColorRow
                id="design-background-dark"
                label={
                  <Trans
                    i18nKey="designBackgroundDark"
                    defaults="Surface color (dark mode)"
                  />
                }
                value={effective.backgroundColorDark}
                overridden={watched.backgroundColorDark !== null}
                onChange={(hex) =>
                  form.setValue("backgroundColorDark", hex, {
                    shouldDirty: true,
                  })
                }
                onReset={() =>
                  form.setValue("backgroundColorDark", null, {
                    shouldDirty: true,
                  })
                }
              />
              <Field orientation="responsive">
                <FieldContent>
                  <FieldTitle id="design-tone-label">
                    <Trans i18nKey="designNeutralTone" defaults="Gray tone" />
                  </FieldTitle>
                  <FieldDescription>
                    <Trans
                      i18nKey="designNeutralToneDescription"
                      defaults="Tint of text, borders and backgrounds"
                    />
                  </FieldDescription>
                </FieldContent>
                <SegmentedControl
                  aria-labelledby="design-tone-label"
                  value={effective.neutralTone}
                  onValueChange={(value) =>
                    form.setValue("neutralTone", value as NeutralTone, {
                      shouldDirty: true,
                    })
                  }
                >
                  {(
                    [
                      [
                        "neutral",
                        t("designToneNeutral", { defaultValue: "Neutral" }),
                      ],
                      [
                        "green",
                        t("designToneGreen", { defaultValue: "Green" }),
                      ],
                      ["warm", t("designToneWarm", { defaultValue: "Sand" })],
                    ] as const
                  ).map(([tone, label]) => (
                    <SegmentedControlItem
                      key={tone}
                      value={tone}
                      className="gap-1.5 px-3 text-sm"
                    >
                      <span
                        aria-hidden="true"
                        className="size-3 rounded-full border border-black/10"
                        style={{ background: getNeutralColor(tone, 300) }}
                      />
                      {label}
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>
              </Field>
            </FieldGroup>
          </PageSectionContent>
        </PageSection>

        <PageSection variant="card">
          <PageSectionHeader>
            <PageSectionTitle>
              <Trans i18nKey="designTypography" defaults="Typography" />
            </PageSectionTitle>
            <PageSectionDescription>
              <Trans
                i18nKey="designTypographyDescription"
                defaults="Uploaded fonts are used when you pick “Uploaded font”. Upload them in the fonts section below."
              />
            </PageSectionDescription>
          </PageSectionHeader>
          <PageSectionContent>
            <FieldGroup variant="divided">
              <FontSelectRow
                id="design-font-body"
                label={<Trans i18nKey="designFontBody" defaults="Body text" />}
                value={effective.fontBody}
                options={[
                  ["pt-sans", "PT Sans"],
                  ["inter", "Inter"],
                  [
                    "system",
                    t("designFontSystem", { defaultValue: "System font" }),
                  ],
                  [
                    "custom",
                    fonts.fontBody
                      ? t("designFontUploaded", {
                          defaultValue: "Uploaded font",
                        })
                      : t("designFontUploadedMissing", {
                          defaultValue: "Uploaded font (not uploaded yet)",
                        }),
                  ],
                ]}
                onChange={(value) =>
                  form.setValue("fontBody", value as BodyFont, {
                    shouldDirty: true,
                  })
                }
              />
              <FontSelectRow
                id="design-font-heading"
                label={
                  <Trans i18nKey="designFontHeading" defaults="Headings" />
                }
                value={effective.fontHeading}
                options={[
                  [
                    "body",
                    t("designFontSameAsBody", {
                      defaultValue: "Same as body text",
                    }),
                  ],
                  ["pt-sans", "PT Sans"],
                  ["inter", "Inter"],
                  [
                    "custom",
                    fonts.fontHeading
                      ? t("designFontUploaded", {
                          defaultValue: "Uploaded font",
                        })
                      : t("designFontUploadedMissing", {
                          defaultValue: "Uploaded font (not uploaded yet)",
                        }),
                  ],
                ]}
                onChange={(value) =>
                  form.setValue("fontHeading", value as HeadingFont, {
                    shouldDirty: true,
                  })
                }
              />
            </FieldGroup>
          </PageSectionContent>
        </PageSection>

        <PageSection variant="card">
          <PageSectionHeader>
            <PageSectionTitle>
              <Trans i18nKey="designShape" defaults="Shape" />
            </PageSectionTitle>
          </PageSectionHeader>
          <PageSectionContent>
            <FieldGroup>
              <Field orientation="responsive">
                <FieldContent>
                  <FieldTitle id="design-radius-label">
                    <Trans i18nKey="designRadius" defaults="Corners" />
                  </FieldTitle>
                </FieldContent>
                <SegmentedControl
                  aria-labelledby="design-radius-label"
                  value={effective.radius}
                  onValueChange={(value) =>
                    form.setValue("radius", value as Radius, {
                      shouldDirty: true,
                    })
                  }
                >
                  {(
                    [
                      [
                        "none",
                        t("designRadiusNone", { defaultValue: "Square" }),
                      ],
                      [
                        "small",
                        t("designRadiusSmall", { defaultValue: "Subtle" }),
                      ],
                      [
                        "medium",
                        t("designRadiusMedium", { defaultValue: "Medium" }),
                      ],
                      [
                        "large",
                        t("designRadiusLarge", { defaultValue: "Round" }),
                      ],
                    ] as const
                  ).map(([radius, label]) => (
                    <SegmentedControlItem
                      key={radius}
                      value={radius}
                      className="px-3 text-sm"
                    >
                      {label}
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>
              </Field>
            </FieldGroup>
          </PageSectionContent>
        </PageSection>

        <PageSection variant="card">
          <PageSectionHeader>
            <PageSectionTitle>
              <Trans i18nKey="general" defaults="General" />
            </PageSectionTitle>
          </PageSectionHeader>
          <PageSectionContent>
            <FieldGroup variant="divided">
              <Field orientation="responsive">
                <FieldContent>
                  <FieldLabel htmlFor="design-app-name">
                    <Trans i18nKey="appName" defaults="App name" />
                  </FieldLabel>
                  <FieldDescription>
                    <Trans
                      i18nKey="designAppNameDescription"
                      defaults="Shown in the default logo, page titles and emails"
                    />
                  </FieldDescription>
                </FieldContent>
                <Input
                  id="design-app-name"
                  className="sm:max-w-64"
                  {...form.register("appName")}
                />
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="design-hide-attribution">
                    <Trans
                      i18nKey="hideAttribution"
                      defaults="Hide attribution"
                    />
                  </FieldLabel>
                  <FieldDescription>
                    <Trans
                      i18nKey="designAttributionDescription"
                      defaults="The “Powered by Rallly” note on poll pages and in emails"
                    />
                  </FieldDescription>
                </FieldContent>
                <Controller
                  control={form.control}
                  name="hideAttribution"
                  render={({ field }) => (
                    <Switch
                      id="design-hide-attribution"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </Field>
            </FieldGroup>
          </PageSectionContent>
        </PageSection>

        <PageSection variant="card">
          <PageSectionHeader>
            <PageSectionTitle>
              <Trans i18nKey="designCustomCss" defaults="Custom CSS" />
            </PageSectionTitle>
            <PageSectionDescription>
              <Trans
                i18nKey="designCustomCssDescription"
                defaults="Added after the theme on every page, for adjustments the settings above do not cover."
              />
            </PageSectionDescription>
          </PageSectionHeader>
          <PageSectionContent>
            <Textarea
              rows={6}
              spellCheck={false}
              maxLength={MAX_CUSTOM_CSS_LENGTH}
              placeholder="h1 { letter-spacing: 0.01em; }"
              className="font-mono text-sm"
              aria-label={t("designCustomCss", { defaultValue: "Custom CSS" })}
              value={watched.customCss ?? ""}
              onChange={(event) =>
                form.setValue("customCss", event.target.value || null, {
                  shouldDirty: true,
                })
              }
            />
          </PageSectionContent>
        </PageSection>
      </PageSectionGroup>

      <div
        className={cn(
          "sticky bottom-4 z-40 mt-6 rounded-2xl border bg-background/90 shadow-huge backdrop-blur transition-opacity",
          form.formState.isDirty
            ? "opacity-100"
            : "pointer-events-none opacity-0",
        )}
      >
        <div className="flex items-center justify-end gap-2 px-4 py-3">
          <span className="mr-auto text-muted-foreground text-sm">
            <Trans
              i18nKey="designUnsavedChanges"
              defaults="You have unsaved changes"
            />
          </span>
          <Button type="button" variant="ghost" onClick={() => form.reset()}>
            <Trans i18nKey="discard" defaults="Discard" />
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            <Trans i18nKey="save" defaults="Save" />
          </Button>
        </div>
      </div>
    </form>
  );
}

function PresetCard({
  id,
  selected,
  onSelect,
}: {
  id: PresetId;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const preset = THEME_PRESETS[id];
  const names: Record<PresetId, string> = {
    gruene: t("designPresetGruene", { defaultValue: "Green · Tanne" }),
    "gruene-klee": t("designPresetGrueneKlee", {
      defaultValue: "Green · Klee",
    }),
    "gruene-sand": t("designPresetGrueneSand", {
      defaultValue: "Green · Sand",
    }),
    rallly: t("designPresetRallly", { defaultValue: "Rallly classic" }),
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-card-accent",
        selected && "border-primary ring-1 ring-primary",
      )}
    >
      <span className="flex -space-x-1.5">
        {(
          [
            ["primary", preset.primaryColor],
            ["accent", preset.accentColor],
            ["neutral", getNeutralColor(preset.neutralTone, 100)],
          ] as const
        ).map(([role, color]) => (
          <span
            key={role}
            className="size-6 rounded-full border-2 border-card"
            style={{ background: color }}
          />
        ))}
      </span>
      <span className="flex-1 font-medium text-sm">{names[id]}</span>
      {selected ? <CheckIcon className="size-4 text-primary" /> : null}
    </button>
  );
}

function ColorRow({
  id,
  label,
  description,
  value,
  overridden,
  onChange,
  onReset,
}: {
  id: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  value: string | null;
  overridden: boolean;
  onChange: (hex: string) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const color = React.useMemo<Color>(
    () => parseColor(value ?? "#ffffff"),
    [value],
  );

  return (
    <Field orientation="responsive">
      <FieldContent>
        <FieldTitle id={`${id}-label`}>{label}</FieldTitle>
        {description ? (
          <FieldDescription>{description}</FieldDescription>
        ) : null}
      </FieldContent>
      <div className="flex items-center gap-2">
        <span className="font-mono text-muted-foreground text-xs uppercase">
          {value ?? t("designColorAutomatic", { defaultValue: "Automatic" })}
        </span>
        {overridden ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t("designResetToTemplate", {
              defaultValue: "Reset to template",
            })}
            onClick={onReset}
          >
            <RotateCcwIcon />
          </Button>
        ) : null}
        <div>
          <ColorPicker
            value={color}
            onChange={(next) => onChange(next.toString("hex").toLowerCase())}
            aria-labelledby={`${id}-label`}
            aria-label={t("chooseColor", { defaultValue: "Choose color" })}
            hexInputLabel={t("hexColor", { defaultValue: "Hex color" })}
          />
        </div>
      </div>
    </Field>
  );
}

function FontSelectRow({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: React.ReactNode;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <Field orientation="responsive">
      <FieldContent>
        <FieldTitle id={`${id}-label`}>{label}</FieldTitle>
      </FieldContent>
      <Select
        items={Object.fromEntries(options)}
        value={value}
        onValueChange={(next) => {
          if (next) onChange(String(next));
        }}
      >
        <SelectTrigger aria-labelledby={`${id}-label`} className="sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
