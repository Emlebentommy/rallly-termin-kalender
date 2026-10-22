export const isCalendarsEnabled = process.env.CALENDARS_ENABLED === "true";

export const DEFAULT_CALENDAR_PREFERENCES = {
  holdsEnabled: true,
  holdIfNeedBe: true,
  autoPrefill: true,
  busyVote: "no" as "no" | "ifNeedBe",
};

/**
 * Common CalDAV services, to prefill the server address. Every one of them
 * answers /.well-known/caldav or the principal URL given here, so discovery
 * finds the calendars from just this address.
 */
export const CALDAV_PRESETS = [
  {
    id: "nextcloud",
    name: "Nextcloud",
    serverUrl: "",
    placeholder: "https://wolke.netzbegruenung.de",
  },
  {
    id: "icloud",
    name: "iCloud",
    serverUrl: "https://caldav.icloud.com",
    placeholder: "https://caldav.icloud.com",
  },
  {
    id: "mailbox",
    name: "mailbox.org",
    serverUrl: "https://dav.mailbox.org",
    placeholder: "https://dav.mailbox.org",
  },
  {
    id: "posteo",
    name: "Posteo",
    serverUrl: "https://posteo.de:8443",
    placeholder: "https://posteo.de:8443",
  },
  {
    id: "fastmail",
    name: "Fastmail",
    serverUrl: "https://caldav.fastmail.com",
    placeholder: "https://caldav.fastmail.com",
  },
  {
    id: "gmx",
    name: "GMX",
    serverUrl: "https://caldav.gmx.net",
    placeholder: "https://caldav.gmx.net",
  },
  {
    id: "webde",
    name: "WEB.DE",
    serverUrl: "https://caldav.web.de",
    placeholder: "https://caldav.web.de",
  },
  {
    id: "other",
    name: "",
    serverUrl: "",
    placeholder: "https://calendar.example.org/dav",
  },
] as const;

export type CalDavPresetId = (typeof CALDAV_PRESETS)[number]["id"];

/**
 * How far around a poll's dates calendars are read. Long polls are capped so
 * one page view cannot ask a provider for years of events.
 */
export const AVAILABILITY_MAX_RANGE_DAYS = 400;
