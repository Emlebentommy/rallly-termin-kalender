/** A calendar of a connected account, as stored in `provider_calendars`. */
export type ProviderCalendarRef = {
  /** The provider's id: a Google calendar id or a CalDAV collection URL */
  providerCalendarId: string;
  providerData?: unknown;
};

export interface CalendarService {
  listCalendars: () => Promise<CalendarInfo[]>;
  /** Events overlapping the range, recurring ones expanded to occurrences. */
  listEvents: (params: {
    calendar: ProviderCalendarRef;
    start: Date;
    end: Date;
  }) => Promise<CalendarEvent[]>;
  createEvent: (params: {
    calendar: ProviderCalendarRef;
    event: CalendarEventInput;
  }) => Promise<WrittenEvent>;
  /** Overwrites the event; the app owns the entries it wrote. */
  updateEvent: (params: {
    calendar: ProviderCalendarRef;
    externalId: string;
    etag?: string | null;
    event: CalendarEventInput;
  }) => Promise<WrittenEvent>;
  /** Succeeds when the event is already gone. */
  deleteEvent: (params: {
    calendar: ProviderCalendarRef;
    externalId: string;
    etag?: string | null;
  }) => Promise<void>;
}

export type CalendarInfo = {
  id: string;
  name: string;
  timeZone?: string;
  isPrimary: boolean;
  isSelected: boolean;
  isDeleted: boolean;
  isWritable: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: any is used to store the raw data from the provider
  _rawData: any;
};

/**
 * One occurrence in a user's calendar. All-day events are floating dates:
 * start and end sit at UTC midnight, end exclusive (RFC 5545).
 */
export type CalendarEvent = {
  /** The event's iCalendar UID, when the provider exposes it */
  uid?: string;
  /** The provider's id of the event or object */
  externalId?: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  /** False for events marked free (transparent) */
  busy: boolean;
};

export type CalendarEventStatus = "tentative" | "confirmed";

/** What the app writes into a calendar for a poll. */
export type CalendarEventInput = {
  uid: string;
  title: string;
  description: string;
  location?: string;
  url?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  /** Zone of the times; UTC when unset */
  timeZone?: string;
  status: CalendarEventStatus;
};

export type WrittenEvent = {
  externalId: string;
  etag?: string | null;
};
