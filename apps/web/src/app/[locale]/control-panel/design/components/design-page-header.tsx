"use client";

import {
  SettingsPageDescription,
  SettingsPageHeader,
  SettingsPageTitle,
} from "@/components/settings-layout";
import { Trans } from "@/i18n/client";

export function DesignPageHeader() {
  return (
    <SettingsPageHeader>
      <SettingsPageTitle>
        <Trans i18nKey="design" defaults="Design" />
      </SettingsPageTitle>
      <SettingsPageDescription>
        <Trans
          i18nKey="designDescription"
          defaults="Colors, fonts, logos and shapes of this instance"
        />
      </SettingsPageDescription>
    </SettingsPageHeader>
  );
}
