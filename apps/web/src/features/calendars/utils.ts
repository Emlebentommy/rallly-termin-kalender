import ICAL from "ical.js";
import {
  calendarDateToUTCMidnight,
  getCalendarDate,
  normalizeTimeZone,
  toISODate,
} from "@/lib/datetime/utils";
import { instantToWallTime, wallTimeToInstant } from "@/lib/datetime/wall-time";
import type { CalendarEvent, CalendarEventInput } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Marks entries the app wrote, so they can be told apart when read back. */
export const HOLD_MARKER_PROPERTY = "X-TERMINE-HOLD";

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

function formatUtcDateTime(date: Date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function formatDate(date: Date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

/** RFC 5545 TEXT escaping. */
export function escapeICalText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Folds a content line at 75 octets, as RFC 5545 requires. */
export function foldICalLine(line: string) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) {
    return line;
  }
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // Continuation lines start with a space, which counts toward the limit
    const limit = parts.length === 0 ? 75 : 74;
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/**
 * The iCalendar object written to a CalDAV calendar. Timed events are stored
 * in UTC, which every client converts to its own zone, so no VTIMEZONE is
 * needed; all-day events are DATE values. A tentative entry is busy time
 * marked TENTATIVE, so calendars show it as held but not settled.
 */
export function buildICalendar(
  event: CalendarEventInput,
  { now = new Date(), productId = "-//Termine//Rallly fork//DE" } = {},
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${productId}`,
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${formatUtcDateTime(now)}`,
    `LAST-MODIFIED:${formatUtcDateTime(now)}`,
    ...(event.allDay
      ? [
          `DTSTART;VALUE=DATE:${formatDate(event.start)}`,
          `DTEND;VALUE=DATE:${formatDate(event.end)}`,
        ]
      : [
          `DTSTART:${formatUtcDateTime(event.start)}`,
          `DTEND:${formatUtcDateTime(event.end)}`,
        ]),
    `SUMMARY:${escapeICalText(event.title)}`,
    ...(event.description
      ? [`DESCRIPTION:${escapeICalText(event.description)}`]
      : []),
    ...(event.location ? [`LOCATION:${escapeICalText(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    `STATUS:${event.status === "tentative" ? "TENTATIVE" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    ...(event.status === "tentative"
      ? ["X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE"]
      : []),
    `${HOLD_MARKER_PROPERTY}:${event.status}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldICalLine).join("\r\n")}\r\n`;
}

/**
 * An ICAL.Time as an instant. Zones defined in the object (VTIMEZONE) and
 * UTC convert through ical.js; a TZID naming an IANA zone without a
 * definition, which some servers send, is converted with the platform's zone
 * data; a floating time is read as UTC.
 */
function toInstant(time: ICAL.Time, tzid: string | undefined) {
  if (time.isDate) {
    return new Date(Date.UTC(time.year, time.month - 1, time.day));
  }
  const zone = time.zone;
  const known =
    zone === ICAL.Timezone.utcTimezone ||
    (zone && zone !== ICAL.Timezone.localTimezone && zone.tzid !== "floating");
  if (known) {
    return time.toJSDate();
  }
  const wall = `${time.year}-${pad(time.month)}-${pad(time.day)}T${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)}`;
  if (tzid && normalizeTimeZone(tzid)) {
    return wallTimeToInstant(wall, tzid);
  }
  return new Date(`${wall}Z`);
}

function registerTimezones(calendar: ICAL.Component) {
  for (const vtimezone of calendar.getAllSubcomponents("vtimezone")) {
    const tzid = vtimezone.getFirstPropertyValue("tzid");
    if (typeof tzid === "string" && !ICAL.TimezoneService.has(tzid)) {
      ICAL.TimezoneService.register(vtimezone);
    }
  }
}

function tzidOf(component: ICAL.Component, property: string) {
  const value = component.getFirstProperty(property)?.getParameter("tzid");
  return typeof value === "string" ? value : undefined;
}

const MAX_OCCURRENCES = 500;

/**
 * Every occurrence of the events in one iCalendar object that overlaps the
 * range. Recurring events are expanded with their exceptions (EXDATE and
 * RECURRENCE-ID overrides); cancelled events are dropped and transparent
 * ones kept as free time.
 */
export function parseICalendarEvents(
  data: string,
  range: { start: Date; end: Date },
  externalId?: string,
): CalendarEvent[] {
  let calendar: ICAL.Component;
  try {
    calendar = new ICAL.Component(ICAL.parse(data));
  } catch {
    return [];
  }
  registerTimezones(calendar);

  const vevents = calendar.getAllSubcomponents("vevent");
  const masters = vevents.filter((v) => !v.hasProperty("recurrence-id"));
  const overrides = vevents.filter((v) => v.hasProperty("recurrence-id"));
  const results: CalendarEvent[] = [];

  const push = (
    component: ICAL.Component,
    start: Date,
    end: Date,
    allDay: boolean,
  ) => {
    if (end <= range.start || start >= range.end) return;
    const status = String(component.getFirstPropertyValue("status") ?? "");
    if (status.toUpperCase() === "CANCELLED") return;
    const transp = String(component.getFirstPropertyValue("transp") ?? "");
    const uid = component.getFirstPropertyValue("uid");
    results.push({
      uid: typeof uid === "string" ? uid : undefined,
      externalId,
      title: String(component.getFirstPropertyValue("summary") ?? ""),
      start,
      end,
      allDay,
      busy: transp.toUpperCase() !== "TRANSPARENT",
    });
  };

  for (const master of masters) {
    const event = new ICAL.Event(master);
    const startTzid = tzidOf(master, "dtstart");
    const endTzid = tzidOf(master, "dtend") ?? startTzid;
    const allDay = event.startDate.isDate;

    if (!event.isRecurring()) {
      const start = toInstant(event.startDate, startTzid);
      const end = event.endDate
        ? toInstant(event.endDate, endTzid)
        : new Date(start.getTime() + (allDay ? DAY_MS : 0));
      push(
        master,
        start,
        end.getTime() > start.getTime()
          ? end
          : new Date(start.getTime() + (allDay ? DAY_MS : 0)),
        allDay,
      );
      continue;
    }

    for (const override of overrides) {
      if (override.getFirstPropertyValue("uid") === event.uid) {
        event.relateException(override);
      }
    }

    const iterator = event.iterator();
    for (
      let count = 0, next = iterator.next();
      next && count < MAX_OCCURRENCES;
      next = iterator.next(), count++
    ) {
      const details = event.getOccurrenceDetails(next);
      const component = details.item.component;
      const itemStartTzid = tzidOf(component, "dtstart") ?? startTzid;
      const itemEndTzid = tzidOf(component, "dtend") ?? itemStartTzid;
      const start = toInstant(details.startDate, itemStartTzid);
      if (start >= range.end) break;
      const end = toInstant(details.endDate, itemEndTzid);
      push(
        component,
        start,
        end > start ? end : new Date(start.getTime() + (allDay ? DAY_MS : 0)),
        details.startDate.isDate,
      );
    }
  }

  // Overrides whose master is not in this object stand on their own
  for (const override of overrides) {
    const uid = override.getFirstPropertyValue("uid");
    if (masters.some((m) => m.getFirstPropertyValue("uid") === uid)) continue;
    const event = new ICAL.Event(override);
    const start = toInstant(event.startDate, tzidOf(override, "dtstart"));
    const end = event.endDate
      ? toInstant(
          event.endDate,
          tzidOf(override, "dtend") ?? tzidOf(override, "dtstart"),
        )
      : start;
    push(override, start, end, event.startDate.isDate);
  }

  return results;
}

/** Whether two half-open time ranges share at least one instant. */
export function rangesOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
) {
  return a.start < b.end && b.start < a.end;
}

export type OptionTimes = {
  allDay: boolean;
  /** The instants the option covers for this user (a whole local day for an all-day option) */
  start: Date;
  end: Date;
  /** Times of the calendar entry written for it: UTC midnights for all-day options */
  entryStart: Date;
  entryEnd: Date;
};

/**
 * The span of a poll option for one user. Options with a time are instants
 * when the poll has a zone and floating wall times when it does not (read in
 * the user's zone, as the poll page shows them). Date options are floating
 * dates; older mixed polls stored them at midnight in the poll's zone, which
 * is snapped to that zone's date as the booking does.
 */
export function getOptionTimes({
  startTime,
  duration,
  pollTimeZone,
  userTimeZone,
}: {
  startTime: Date;
  duration: number;
  pollTimeZone: string | null;
  userTimeZone: string;
}): OptionTimes {
  if (duration > 0) {
    const start = pollTimeZone
      ? startTime
      : wallTimeToInstant(instantToWallTime(startTime, "UTC"), userTimeZone);
    const end = new Date(start.getTime() + duration * 60_000);
    return { allDay: false, start, end, entryStart: start, entryEnd: end };
  }

  const isUtcMidnight = startTime.getTime() % DAY_MS === 0;
  const date =
    pollTimeZone && !isUtcMidnight
      ? getCalendarDate(startTime, pollTimeZone)
      : toISODate(startTime);
  const entryStart = calendarDateToUTCMidnight(date);
  const entryEnd = new Date(entryStart.getTime() + DAY_MS);
  return {
    allDay: true,
    start: wallTimeToInstant(date, userTimeZone),
    end: wallTimeToInstant(toISODate(entryEnd), userTimeZone),
    entryStart,
    entryEnd,
  };
}

/**
 * The instants an event blocks for a user: all-day events are floating
 * dates, so they cover the user's local days.
 */
export function getEventSpan(
  event: Pick<CalendarEvent, "start" | "end" | "allDay">,
  userTimeZone: string,
) {
  if (!event.allDay) {
    return { start: event.start, end: event.end };
  }
  return {
    start: wallTimeToInstant(toISODate(event.start), userTimeZone),
    end: wallTimeToInstant(toISODate(event.end), userTimeZone),
  };
}

export type HoldRef = {
  pollId: string;
  kind: "tentative" | "confirmed";
  uid: string;
  externalId: string;
};

/** An event as the poll page shows it, with its link to this app's entries. */
export type AvailabilityEvent = {
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  busy: boolean;
  calendarName: string;
  /** Set when the app wrote this entry for a poll */
  hold: { kind: "tentative" | "confirmed"; samePoll: boolean } | null;
};

export type SuggestedVote = "yes" | "ifNeedBe" | "no";

export type OptionAvailability = {
  optionId: string;
  /**
   * busy: a real event overlaps. held: only placeholders of other polls
   * overlap, which go away if those polls settle elsewhere. free: nothing.
   */
  status: "free" | "busy" | "held";
  conflicts: AvailabilityEvent[];
  suggestion: SuggestedVote;
};

/** Labels events the app wrote, matched by UID or provider id. */
export function tagHolds<T extends { uid?: string; externalId?: string }>(
  events: T[],
  holds: HoldRef[],
  pollId: string,
) {
  return events.map((event) => {
    const hold = holds.find(
      (h) =>
        (event.uid !== undefined && h.uid === event.uid) ||
        (event.externalId !== undefined && h.externalId === event.externalId),
    );
    return {
      ...event,
      hold: hold ? { kind: hold.kind, samePoll: hold.pollId === pollId } : null,
    };
  });
}

/**
 * What the user's calendar says about each option, and the answer to
 * suggest. The entries written for this poll are the user's own answers, so
 * they never count against it.
 */
export function computeOptionAvailability({
  options,
  events,
  pollTimeZone,
  userTimeZone,
  busyVote,
  allowTentativeVotes,
}: {
  options: { id: string; startTime: Date; duration: number }[];
  events: AvailabilityEvent[];
  pollTimeZone: string | null;
  userTimeZone: string;
  busyVote: "no" | "ifNeedBe";
  allowTentativeVotes: boolean;
}): OptionAvailability[] {
  const spans = events.map((event) => ({
    event,
    span: getEventSpan(event, userTimeZone),
  }));

  return options.map((option) => {
    const times = getOptionTimes({
      startTime: option.startTime,
      duration: option.duration,
      pollTimeZone,
      userTimeZone,
    });
    const conflicts = spans
      .filter(
        ({ event, span }) =>
          !event.hold?.samePoll && rangesOverlap(span, times),
      )
      .map(({ event }) => event);

    // A booked date of another poll is as real as any other event
    const busy = conflicts.some(
      (event) => event.busy && event.hold?.kind !== "tentative",
    );
    const held = conflicts.some(
      (event) => event.busy && event.hold?.kind === "tentative",
    );
    const status = busy ? "busy" : held ? "held" : "free";
    const tentative: SuggestedVote = allowTentativeVotes ? "ifNeedBe" : "no";

    return {
      optionId: option.id,
      status,
      conflicts,
      suggestion:
        status === "busy"
          ? busyVote === "ifNeedBe"
            ? tentative
            : "no"
          : status === "held"
            ? allowTentativeVotes
              ? "ifNeedBe"
              : "yes"
            : "yes",
    };
  });
}

/**
 * The range to read calendars for: every option's span with a day of margin
 * either side, capped so a long poll does not read years of events.
 */
export function getAvailabilityRange(
  spans: { start: Date; end: Date }[],
  maxDays: number,
) {
  if (spans.length === 0) return null;
  const start = new Date(
    Math.min(...spans.map((span) => span.start.getTime())) - DAY_MS,
  );
  const end = new Date(
    Math.min(
      Math.max(...spans.map((span) => span.end.getTime())) + DAY_MS,
      start.getTime() + maxDays * DAY_MS,
    ),
  );
  return { start, end };
}

export type AvailabilityDay = {
  /** The day in the user's zone, YYYY-MM-DD */
  date: string;
  events: AvailabilityEvent[];
};

/**
 * The user's events on each day the poll has an option, for an agenda
 * beside the options. Days are the user's local days.
 */
export function getAvailabilityDays({
  options,
  events,
  pollTimeZone,
  userTimeZone,
  maxDays = 62,
}: {
  options: { startTime: Date; duration: number }[];
  events: AvailabilityEvent[];
  pollTimeZone: string | null;
  userTimeZone: string;
  maxDays?: number;
}): AvailabilityDay[] {
  const dates = new Set<string>();
  for (const option of options) {
    const times = getOptionTimes({
      startTime: option.startTime,
      duration: option.duration,
      pollTimeZone,
      userTimeZone,
    });
    dates.add(
      times.allDay
        ? toISODate(times.entryStart)
        : getCalendarDate(times.start, userTimeZone),
    );
  }

  const spans = events.map((event) => ({
    event,
    span: getEventSpan(event, userTimeZone),
  }));

  return Array.from(dates)
    .sort()
    .slice(0, maxDays)
    .map((date) => {
      const next = toISODate(
        new Date(calendarDateToUTCMidnight(date).getTime() + DAY_MS),
      );
      const day = {
        start: wallTimeToInstant(date, userTimeZone),
        end: wallTimeToInstant(next, userTimeZone),
      };
      return {
        date,
        events: spans
          .filter(({ span }) => rangesOverlap(span, day))
          .map(({ event }) => event),
      };
    });
}
