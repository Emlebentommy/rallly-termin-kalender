"use client";

import { Alert, AlertDescription } from "@rallly/ui/alert";
import { Badge } from "@rallly/ui/badge";
import { Button } from "@rallly/ui/button";
import { Card, CardContent } from "@rallly/ui/card";
import { useDialog } from "@rallly/ui/dialog";
import {
  AlertTriangleIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  WandSparklesIcon,
} from "lucide-react";
import Image from "next/image";
import React from "react";
import { Link } from "@/components/link";
import { LoginLink } from "@/components/login-link";
import { connectToCalendar } from "@/features/calendars/client";
import { CalDavConnectDialog } from "@/features/calendars/components/caldav-connect-dialog";
import { Trans } from "@/i18n/client";
import { useDateTime } from "@/lib/datetime/client";
import { useEventTimeLabel } from "./option-calendar-status";
import { usePollCalendar } from "./poll-calendar-context";

function PanelFrame({ children }: React.PropsWithChildren) {
  return (
    <Card data-testid="poll-calendar-panel">
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function PanelHeading({
  title,
  description,
  action,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <CalendarDaysIcon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">{title}</p>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="flex flex-wrap items-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}

function ConnectPrompt() {
  const dialog = useDialog();
  const { availability } = usePollCalendar();
  return (
    <PanelFrame>
      <PanelHeading
        title={
          <Trans
            i18nKey="pollCalendarConnectTitle"
            defaults="Check these dates against your calendar"
          />
        }
        description={
          <Trans
            i18nKey="pollCalendarConnectDescription"
            defaults="See clashes for every date, pre-fill your answers and hold the dates you say yes to."
          />
        }
        action={
          <>
            <Link
              href="/settings/calendars"
              className="text-muted-foreground text-sm hover:underline"
            >
              <Trans i18nKey="pollCalendarMoreOptions" defaults="All options" />
            </Link>
            {availability?.googleAvailable ? (
              <Button onClick={() => connectToCalendar("google-calendar")}>
                <Image
                  src="/static/google-calendar.svg"
                  width={16}
                  height={16}
                  alt=""
                  unoptimized
                />
                <Trans
                  i18nKey="connectGoogleCalendar"
                  defaults="Google Calendar"
                />
              </Button>
            ) : null}
            <Button onClick={() => dialog.trigger()}>
              {availability?.googleAvailable ? (
                <Trans i18nKey="connectCalDavShort" defaults="CalDAV" />
              ) : (
                <Trans i18nKey="connectCalendar" defaults="Connect calendar" />
              )}
            </Button>
          </>
        }
      />
      <CalDavConnectDialog {...dialog.dialogProps} />
    </PanelFrame>
  );
}

function SignInPrompt() {
  return (
    <LoginLink className="flex items-center gap-x-2 px-1 text-muted-foreground text-sm hover:text-foreground hover:underline">
      <CalendarDaysIcon className="size-4 shrink-0" />
      <Trans
        i18nKey="pollCalendarSignIn"
        defaults="Sign in to check these dates against your calendar"
      />
    </LoginLink>
  );
}

function Agenda() {
  const { availability } = usePollCalendar();
  const { formatDateTime } = useDateTime();
  const timeLabel = useEventTimeLabel();
  if (!availability) return null;

  return (
    <ul
      className="divide-y rounded-xl border"
      data-testid="poll-calendar-agenda"
    >
      {availability.days.map((day) => (
        <li
          key={day.date}
          className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:gap-4"
        >
          <div className="shrink-0 font-medium text-sm sm:w-44">
            {formatDateTime(
              new Date(`${day.date}T00:00:00Z`),
              "weekdayMonthDay",
              {
                timeZone: "UTC",
              },
            )}
          </div>
          {day.events.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              <Trans
                i18nKey="pollCalendarDayFree"
                defaults="Nothing in your calendar"
              />
            </p>
          ) : (
            <ul className="min-w-0 flex-1 space-y-1">
              {day.events.map((event, index) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: events can repeat title and time
                  key={index}
                  className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm"
                >
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {timeLabel(event)}
                  </span>
                  <span className="min-w-0 truncate">
                    {event.title || (
                      <Trans i18nKey="calendarBusyEvent" defaults="Busy" />
                    )}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {event.calendarName}
                  </span>
                  {event.hold ? (
                    <Badge
                      size="sm"
                      variant={event.hold.samePoll ? "green" : "amber"}
                    >
                      {event.hold.samePoll ? (
                        <Trans
                          i18nKey="pollCalendarHoldThisPoll"
                          defaults="Your answer"
                        />
                      ) : event.hold.kind === "tentative" ? (
                        <Trans
                          i18nKey="pollCalendarHoldOtherPoll"
                          defaults="Held for another poll"
                        />
                      ) : (
                        <Trans
                          i18nKey="pollCalendarBookedOtherPoll"
                          defaults="Booked poll"
                        />
                      )}
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function ReadyPanel() {
  const { availability, canApply, applySuggestions, prefilled } =
    usePollCalendar();
  const [showAgenda, setShowAgenda] = React.useState(false);
  if (!availability) return null;

  const counts = { free: 0, busy: 0, held: 0 };
  for (const option of availability.options) counts[option.status]++;
  const { preferences, holdCalendarName } = availability;

  return (
    <PanelFrame>
      <PanelHeading
        title={<Trans i18nKey="pollCalendarTitle" defaults="Your calendar" />}
        description={
          <span className="flex flex-wrap gap-x-3">
            <span className="text-green-700 dark:text-green-500">
              <Trans
                i18nKey="pollCalendarFreeCount"
                defaults="{count} free"
                values={{ count: counts.free }}
              />
            </span>
            {counts.busy > 0 ? (
              <span className="text-rose-700 dark:text-rose-500">
                <Trans
                  i18nKey="pollCalendarBusyCount"
                  defaults="{count} clashing"
                  values={{ count: counts.busy }}
                />
              </span>
            ) : null}
            {counts.held > 0 ? (
              <span className="text-amber-700 dark:text-amber-500">
                <Trans
                  i18nKey="pollCalendarHeldCount"
                  defaults="{count} held for other polls"
                  values={{ count: counts.held }}
                />
              </span>
            ) : null}
          </span>
        }
        action={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowAgenda((value) => !value)}
              aria-expanded={showAgenda}
            >
              {showAgenda ? (
                <ChevronUpIcon data-icon="inline-start" />
              ) : (
                <ChevronDownIcon data-icon="inline-start" />
              )}
              <Trans i18nKey="pollCalendarShowDays" defaults="Days" />
            </Button>
            {canApply ? (
              <Button onClick={applySuggestions}>
                <WandSparklesIcon data-icon="inline-start" />
                <Trans
                  i18nKey="pollCalendarApply"
                  defaults="Answer from calendar"
                />
              </Button>
            ) : null}
          </>
        }
      />
      {prefilled && canApply ? (
        <p className="text-muted-foreground text-sm">
          <Trans
            i18nKey="pollCalendarPrefilled"
            defaults="Your answers were filled in from your calendar. Check them before you save."
          />
        </p>
      ) : null}
      {availability.failed.length > 0 ? (
        <Alert variant="warning">
          <AlertTriangleIcon />
          <AlertDescription>
            <Trans
              i18nKey="pollCalendarFailed"
              defaults="Some calendars could not be read: {names}. <a>Check the connection</a>"
              values={{
                names: availability.failed
                  .map((connection) => connection.displayName ?? "")
                  .filter(Boolean)
                  .join(", "),
              }}
              components={{
                a: (
                  <Link
                    href="/settings/calendars"
                    className="font-medium underline"
                  />
                ),
              }}
            />
          </AlertDescription>
        </Alert>
      ) : null}
      {showAgenda ? <Agenda /> : null}
      <p className="text-muted-foreground text-xs">
        {preferences.holdsEnabled && holdCalendarName ? (
          <Trans
            i18nKey="pollCalendarHoldNote"
            defaults="Dates you say yes to are held in “{calendar}” until the organizer picks one. <a>Settings</a>"
            values={{ calendar: holdCalendarName }}
            components={{
              a: <Link href="/settings/calendars" className="underline" />,
            }}
          />
        ) : preferences.holdsEnabled ? (
          <Trans
            i18nKey="pollCalendarNoHoldCalendar"
            defaults="Choose a calendar for new entries to hold the dates you say yes to. <a>Settings</a>"
            components={{
              a: <Link href="/settings/calendars" className="underline" />,
            }}
          />
        ) : (
          <Trans
            i18nKey="pollCalendarHoldsOff"
            defaults="Your answers are not added to your calendar. <a>Settings</a>"
            components={{
              a: <Link href="/settings/calendars" className="underline" />,
            }}
          />
        )}
      </p>
    </PanelFrame>
  );
}

/** The viewer's calendar next to the poll, in whatever state it is in. */
export function PollCalendarPanel() {
  const { status } = usePollCalendar();
  switch (status) {
    case "ready":
      return <ReadyPanel />;
    case "notConnected":
      return <ConnectPrompt />;
    case "signedOut":
      return <SignInPrompt />;
    default:
      return null;
  }
}
