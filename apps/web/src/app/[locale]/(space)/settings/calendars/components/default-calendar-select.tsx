"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@rallly/ui/select";
import { toast } from "@rallly/ui/sonner";
import { Trans, useTranslation } from "@/i18n/client";
import { trpc } from "@/trpc/client";

const NONE_VALUE = "none";

export function DefaultCalendarSelect() {
  const { data: defaultCalendar } = trpc.calendars.getDefault.useQuery();
  const { data: connections } = trpc.calendars.list.useQuery();

  const setDefaultCalendar = trpc.calendars.setDefault.useMutation();
  const { t } = useTranslation();
  const onValueChange = (value: string) => {
    toast.promise(
      setDefaultCalendar.mutateAsync({
        calendarId: value === NONE_VALUE ? null : value,
      }),
      {
        loading: t("settingDefaultCalendar", {
          defaultValue: "Setting default calendar...",
        }),
        success: t("defaultCalendarSetSuccess", {
          defaultValue: "Default calendar set successfully",
        }),
        error: t("defaultCalendarSetError", {
          defaultValue: "Failed to set default calendar",
        }),
      },
    );
  };

  // Entries can only go where the account may write
  const writable = (connections ?? [])
    .map((connection) => ({
      ...connection,
      providerCalendars: connection.providerCalendars.filter(
        (calendar) => calendar.isWritable,
      ),
    }))
    .filter((connection) => connection.providerCalendars.length > 0);

  return (
    <Select
      items={{
        [NONE_VALUE]: (
          <Trans
            i18nKey="defaultCalendarNone"
            defaults="No calendar selected"
          />
        ),
        ...Object.fromEntries(
          writable.flatMap((connection) =>
            connection.providerCalendars.map((calendar) => [
              calendar.id,
              calendar.name,
            ]),
          ),
        ),
      }}
      value={defaultCalendar?.defaultDestinationCalendarId ?? NONE_VALUE}
      onValueChange={(value) => {
        if (value) {
          onValueChange(value);
        }
      }}
      disabled={setDefaultCalendar.isPending}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_VALUE}>
          <Trans
            i18nKey="defaultCalendarNone"
            defaults="No calendar selected"
          />
        </SelectItem>
        {writable.map((connection) => (
          <SelectGroup key={connection.id}>
            <SelectLabel>
              {connection.displayName ?? connection.email}
            </SelectLabel>
            {connection.providerCalendars.map((calendar) => (
              <SelectItem key={calendar.id} value={calendar.id}>
                {calendar.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
