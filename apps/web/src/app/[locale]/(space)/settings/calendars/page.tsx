import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  PageSection,
  PageSectionContent,
  PageSectionDescription,
  PageSectionDivider,
  PageSectionHeader,
  PageSectionTitle,
} from "@/components/page-layout";
import {
  SettingsPage,
  SettingsPageAction,
  SettingsPageContent,
  SettingsPageDescription,
  SettingsPageHeader,
  SettingsPageTitle,
} from "@/components/settings-layout";
import { env } from "@/env";
import { Trans } from "@/i18n/client";
import { getTranslation } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/feature-flags/server";
import { createPrivateSSRHelper } from "@/trpc/server/create-ssr-helper";
import { CalendarConnectionFlash } from "./components/calendar-connection-flash";
import { CalendarConnectionList } from "./components/calendar-connection-list";
import { CalendarPreferences } from "./components/calendar-preferences";
import { ConnectCalendarDropdown } from "./components/connect-calendar-dropdown";
import { DefaultCalendarSelect } from "./components/default-calendar-select";

export default async function CalendarsPage() {
  const isCalendarsEnabled = isFeatureEnabled("calendars");

  if (!isCalendarsEnabled) {
    notFound();
  }

  const trpc = await createPrivateSSRHelper();

  await Promise.all([
    trpc.calendars.list.prefetch(),
    trpc.calendars.getDefault.prefetch(),
    trpc.calendars.preferences.prefetch(),
  ]);

  const googleEnabled = Boolean(
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET,
  );

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <SettingsPage>
        <CalendarConnectionFlash />
        <SettingsPageHeader>
          <SettingsPageTitle>
            <Trans i18nKey="calendars" defaults="Calendars" />
          </SettingsPageTitle>
          <SettingsPageDescription>
            <Trans
              i18nKey="calendarsDescription"
              defaults="Manage your calendar connections"
            />
          </SettingsPageDescription>
          <SettingsPageAction>
            <ConnectCalendarDropdown googleEnabled={googleEnabled} />
          </SettingsPageAction>
        </SettingsPageHeader>
        <SettingsPageContent>
          <PageSection variant="card">
            <PageSectionHeader>
              <PageSectionTitle>
                <Trans
                  i18nKey="calendarEntries"
                  defaults="Entries in your calendar"
                />
              </PageSectionTitle>
              <PageSectionDescription>
                <Trans
                  i18nKey="calendarEntriesDescription"
                  defaults="Where the dates you answer and the booked dates are written"
                />
              </PageSectionDescription>
            </PageSectionHeader>
            <PageSectionContent>
              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="font-medium text-sm">
                    <Trans
                      i18nKey="defaultCalendar"
                      defaults="Default calendar"
                    />
                  </p>
                  <DefaultCalendarSelect />
                </div>
                <CalendarPreferences />
              </div>
            </PageSectionContent>
          </PageSection>
          <PageSectionDivider />
          <CalendarConnectionList />
        </SettingsPageContent>
      </SettingsPage>
    </HydrationBoundary>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslation();
  return {
    title: t("calendars", "Calendars"),
    description: t("calendarsDescription", "Manage your calendar connections"),
  };
}
