"use client";

import { cn } from "@rallly/ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rallly/ui/tooltip";
import {
  CalendarCheckIcon,
  CalendarClockIcon,
  CalendarXIcon,
} from "lucide-react";
import type { AvailabilityEvent } from "@/features/calendars/utils";
import { Trans, useTranslation } from "@/i18n/client";
import { useDateTime } from "@/lib/datetime/client";
import { usePollCalendar } from "./poll-calendar-context";

export function useEventTimeLabel() {
  const { formatDateTimeRange } = useDateTime();
  const { t } = useTranslation();
  return (event: Pick<AvailabilityEvent, "start" | "end" | "allDay">) =>
    event.allDay
      ? t("allDay", { defaultValue: "All day" })
      : formatDateTimeRange(event.start, event.end, "time");
}

const statusStyles = {
  free: "text-green-600 dark:text-green-500",
  busy: "text-rose-600 dark:text-rose-500",
  held: "text-amber-600 dark:text-amber-500",
} as const;

/**
 * What the viewer's calendar says about one option: free, a clash, or only
 * a placeholder of another poll. The tooltip names what is in the way.
 */
export function OptionCalendarStatus({
  optionId,
  className,
}: {
  optionId: string;
  className?: string;
}) {
  const { status, getOption } = usePollCalendar();
  const { t } = useTranslation();
  const timeLabel = useEventTimeLabel();
  const option = status === "ready" ? getOption(optionId) : undefined;
  if (!option) return null;

  const Icon =
    option.status === "busy"
      ? CalendarXIcon
      : option.status === "held"
        ? CalendarClockIcon
        : CalendarCheckIcon;

  const label =
    option.status === "busy"
      ? t("calendarStatusBusy", { defaultValue: "Clashes with your calendar" })
      : option.status === "held"
        ? t("calendarStatusHeld", {
            defaultValue: "Held for another poll",
          })
        : t("calendarStatusFree", { defaultValue: "Free in your calendar" });

  return (
    <Tooltip>
      <TooltipTrigger
        delay={0}
        aria-label={label}
        data-testid="option-calendar-status"
        data-status={option.status}
        className={cn(
          "inline-flex items-center",
          statusStyles[option.status],
          className,
        )}
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-xs">
        <p className="font-medium">{label}</p>
        {option.conflicts.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {option.conflicts.slice(0, 5).map((event, index) => (
              <li
                // Events can share title and time
                // biome-ignore lint/suspicious/noArrayIndexKey: display only
                key={index}
                className="truncate"
              >
                {timeLabel(event)} ·{" "}
                {event.title || (
                  <Trans i18nKey="calendarBusyEvent" defaults="Busy" />
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
