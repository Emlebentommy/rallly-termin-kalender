"use client";

import { Alert, AlertDescription } from "@rallly/ui/alert";
import { Badge } from "@rallly/ui/badge";
import { Button } from "@rallly/ui/button";
import { useDialog } from "@rallly/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@rallly/ui/dropdown-menu";
import { toast } from "@rallly/ui/sonner";
import { Switch } from "@rallly/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rallly/ui/tooltip";
import {
  AlertTriangleIcon,
  CalendarIcon,
  MoreVerticalIcon,
  RefreshCcwIcon,
} from "lucide-react";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { connectToCalendar } from "@/features/calendars/client";
import { CalDavConnectDialog } from "@/features/calendars/components/caldav-connect-dialog";
import { CalendarProviderIcon } from "@/features/calendars/components/calendar-provider-icon";
import { Trans, useTranslation } from "@/i18n/client";
import { trpc } from "@/trpc/client";

export function CalendarConnectionList() {
  const { data: connections } = trpc.calendars.list.useQuery();
  const { data: defaultCalendar } = trpc.calendars.getDefault.useQuery();
  const reconnectDialog = useDialog();
  const disconnectCalendar = trpc.calendars.disconnect.useMutation();
  const syncCalendar = trpc.calendars.sync.useMutation();
  const { t } = useTranslation();
  const setCalendarSelection = trpc.calendars.setSelection.useMutation();

  if (connections === undefined) {
    return <Spinner />;
  }

  if (connections.length === 0) {
    return (
      <EmptyState>
        <EmptyStateIcon>
          <CalendarIcon />
        </EmptyStateIcon>
        <EmptyStateTitle>
          <Trans i18nKey="noCalendars" defaults="No calendars found" />
        </EmptyStateTitle>
        <EmptyStateDescription>
          <Trans
            i18nKey="calendarsEmptyDescription"
            defaults="Connect a calendar to see clashes while you answer polls and to hold the dates you say yes to."
          />
        </EmptyStateDescription>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <CalDavConnectDialog
        {...reconnectDialog.dialogProps}
        defaultPreset="other"
      />
      {connections.map((calendar) => (
        <div className="space-y-4 rounded-xl border p-4" key={calendar.id}>
          <div className="flex items-center gap-x-4">
            <div>
              <CalendarProviderIcon provider={calendar.provider} size={32} />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">{calendar.displayName}</p>
              <p className="text-muted-foreground text-sm">{calendar.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label={t("syncCalendar", {
                        defaultValue: "Sync calendar",
                      })}
                      loading={syncCalendar.isPending}
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        toast.promise(
                          syncCalendar.mutateAsync({ id: calendar.id }),
                          {
                            loading: t("syncCalendarLoading", {
                              defaultValue: "Syncing calendar…",
                            }),
                            success: t("syncCalendarSuccess", {
                              defaultValue: "Calendar synced",
                            }),
                            error: t("syncCalendarError", {
                              defaultValue:
                                "There was an issue syncing your calendar",
                            }),
                          },
                        );
                      }}
                    >
                      <RefreshCcwIcon className="text-muted-foreground" />
                    </Button>
                  }
                />
                <TooltipContent>
                  <Trans i18nKey="syncCalendar" defaults="Sync calendar" />
                </TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      aria-label={t("moreOptions", {
                        defaultValue: "More options",
                      })}
                      variant="ghost"
                      size="icon"
                    />
                  }
                >
                  <MoreVerticalIcon className="text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      toast.promise(
                        disconnectCalendar.mutateAsync({
                          id: calendar.id,
                        }),
                        {
                          loading: t("disconnectingCalendar", {
                            defaultValue: "Disconnecting calendar...",
                          }),
                          success: t("calendarDisconnectedSuccess", {
                            defaultValue: "Calendar disconnected successfully",
                          }),
                          error: t("calendarDisconnectedError", {
                            defaultValue: "Failed to disconnect calendar",
                          }),
                        },
                      );
                    }}
                  >
                    <Trans
                      i18nKey="disconnectCalendar"
                      defaults="Disconnect calendar"
                    />
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {calendar.errorMessage ? (
            <Alert variant="warning">
              <AlertTriangleIcon />
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {calendar.errorMessage === "unauthorized" ? (
                    <Trans
                      i18nKey="calendarConnectionUnauthorized"
                      defaults="The calendar no longer accepts the login. Connect it again to keep conflicts and entries up to date."
                    />
                  ) : (
                    <Trans
                      i18nKey="calendarConnectionFailing"
                      defaults="The calendar could not be reached the last time we tried."
                    />
                  )}
                </span>
                <Button
                  size="sm"
                  onClick={() => {
                    if (calendar.provider === "caldav") {
                      reconnectDialog.trigger();
                    } else {
                      connectToCalendar(calendar.integrationId);
                    }
                  }}
                >
                  <Trans i18nKey="reconnectCalendar" defaults="Reconnect" />
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          <hr />
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              <Trans
                i18nKey="checkForConflicts"
                defaults="Toggle which calendars to check for conflicts"
              />
            </p>
            <ul className="space-y-2">
              {calendar.providerCalendars.map((c) => {
                return (
                  <li key={c.id} className="flex items-center gap-x-4">
                    <Switch
                      defaultChecked={c.isSelected}
                      onCheckedChange={(checked) => {
                        toast.promise(
                          setCalendarSelection.mutateAsync({
                            calendarId: c.id,
                            isSelected: checked,
                          }),
                          {
                            loading: t("settingCalendarSelection", {
                              defaultValue: "Setting calendar selection...",
                            }),
                            success: t("calendarSelectionSetSuccess", {
                              defaultValue:
                                "Calendar selection set successfully",
                            }),
                            error: t("calendarSelectionSetError", {
                              defaultValue: "Failed to set calendar selection",
                            }),
                          },
                        );
                      }}
                    />
                    <span className="text-sm">{c.name}</span>
                    {defaultCalendar?.defaultDestinationCalendarId === c.id ? (
                      <Badge variant="secondary">
                        <Trans
                          i18nKey="calendarEntriesGoHere"
                          defaults="New entries"
                        />
                      </Badge>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}
