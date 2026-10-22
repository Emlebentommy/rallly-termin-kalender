"use client";

import { Button } from "@rallly/ui/button";
import { useDialog } from "@rallly/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@rallly/ui/dropdown-menu";

import { CalendarSyncIcon, ChevronDownIcon, PlusIcon } from "lucide-react";
import Image from "next/image";
import { connectToCalendar } from "@/features/calendars/client";
import { CalDavConnectDialog } from "@/features/calendars/components/caldav-connect-dialog";
import { Trans } from "@/i18n/client";

export function ConnectCalendarDropdown({
  googleEnabled,
}: {
  /** Whether the instance has Google OAuth credentials */
  googleEnabled: boolean;
}) {
  const caldavDialog = useDialog();

  return (
    <>
      {googleEnabled ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button />}>
            <PlusIcon data-icon="inline-start" />
            <Trans i18nKey="connectCalendar" defaults="Connect calendar" />
            <ChevronDownIcon data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                connectToCalendar("google-calendar");
              }}
            >
              <Image
                src="/static/google-calendar.svg"
                width={16}
                height={16}
                alt="Google Calendar"
                unoptimized
              />
              <Trans
                i18nKey="connectGoogleCalendar"
                defaults="Google Calendar"
              />
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => caldavDialog.trigger()}>
              <CalendarSyncIcon />
              <Trans
                i18nKey="connectCalDavCalendar"
                defaults="CalDAV (Nextcloud, iCloud, …)"
              />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button onClick={() => caldavDialog.trigger()}>
          <PlusIcon data-icon="inline-start" />
          <Trans i18nKey="connectCalendar" defaults="Connect calendar" />
        </Button>
      )}
      <CalDavConnectDialog {...caldavDialog.dialogProps} />
    </>
  );
}
