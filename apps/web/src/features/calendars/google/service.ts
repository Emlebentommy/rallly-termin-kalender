import "server-only";

import type { calendar_v3 } from "@googleapis/calendar";
import { auth, calendar } from "@googleapis/calendar";
import * as z from "zod";
import { env } from "@/env";
import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarInfo,
  CalendarService,
  ProviderCalendarRef,
  WrittenEvent,
} from "@/features/calendars/types";
import type { OAuthTokens } from "@/lib/oauth/types";

export class GoogleCalendarError extends Error {
  constructor(
    readonly reason: "unauthorized" | "not_found" | "server",
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

function statusOf(error: unknown) {
  const value =
    (error as { code?: unknown; status?: unknown })?.code ??
    (error as { status?: unknown })?.status;
  return typeof value === "number" ? value : Number(value) || undefined;
}

function toError(error: unknown): GoogleCalendarError {
  const status = statusOf(error);
  const message =
    error instanceof Error ? error.message : "Google Calendar request failed";
  if (status === 401 || /invalid_grant/.test(message)) {
    return new GoogleCalendarError("unauthorized", message, status);
  }
  if (status === 404 || status === 410) {
    return new GoogleCalendarError("not_found", message, status);
  }
  return new GoogleCalendarError("server", message, status);
}

const toDateString = (date: Date) => date.toISOString().slice(0, 10);

function toEventTime(date: Date, allDay: boolean, timeZone?: string) {
  return allDay
    ? { date: toDateString(date) }
    : { dateTime: date.toISOString(), ...(timeZone ? { timeZone } : {}) };
}

function fromEventTime(time: calendar_v3.Schema$EventDateTime | undefined) {
  if (time?.date) {
    return { date: new Date(`${time.date}T00:00:00Z`), allDay: true };
  }
  return {
    date: time?.dateTime ? new Date(time.dateTime) : null,
    allDay: false,
  };
}

function toRequestBody(event: CalendarEventInput): calendar_v3.Schema$Event {
  const tentative = event.status === "tentative";
  return {
    summary: event.title,
    description: event.description || undefined,
    location: event.location || undefined,
    start: toEventTime(event.start, event.allDay, event.timeZone),
    end: toEventTime(event.end, event.allDay, event.timeZone),
    status: tentative ? "tentative" : "confirmed",
    transparency: "opaque",
    // A placeholder should not ring; a booked date keeps the user's defaults
    reminders: tentative
      ? { useDefault: false, overrides: [] }
      : { useDefault: true },
    ...(event.url ? { source: { title: event.title, url: event.url } } : {}),
    extendedProperties: { private: { termineHold: event.status } },
  };
}

export class GoogleCalendarService implements CalendarService {
  private readonly client: calendar_v3.Calendar;
  static credentialsSchema = z.object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
    expiresAt: z.string().optional(),
    scopes: z.array(z.string()).optional(),
  });
  constructor(params: {
    credentials: z.infer<typeof GoogleCalendarService.credentialsSchema>;
    /** Persists tokens the client refreshed on its own. */
    onTokens?: (tokens: OAuthTokens) => Promise<unknown>;
  }) {
    const oauth2Client = new auth.OAuth2({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    });

    const { credentials, onTokens } = params;
    oauth2Client.setCredentials({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
      expiry_date: credentials.expiresAt
        ? Date.parse(credentials.expiresAt)
        : undefined,
    });

    if (onTokens) {
      oauth2Client.on("tokens", (tokens) => {
        if (!tokens.access_token) return;
        void onTokens({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? credentials.refreshToken,
          expiresAt: tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : undefined,
          scopes: tokens.scope?.split(" ") ?? credentials.scopes ?? [],
        });
      });
    }

    this.client = calendar({
      version: "v3",
      auth: oauth2Client,
    });
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    let items: calendar_v3.Schema$CalendarListEntry[];
    try {
      items = (await this.client.calendarList.list()).data.items ?? [];
    } catch (error) {
      throw toError(error);
    }

    return items.map((item) => ({
      id: item.id as string,
      timeZone: item.timeZone ?? undefined,
      name: item.summary ?? "No name",
      isPrimary: Boolean(item.primary),
      isSelected: Boolean(item.selected),
      isDeleted: Boolean(item.deleted),
      isWritable: item.accessRole === "owner" || item.accessRole === "writer",
      _rawData: item,
    }));
  }

  async listEvents({
    calendar: target,
    start,
    end,
  }: {
    calendar: ProviderCalendarRef;
    start: Date;
    end: Date;
  }): Promise<CalendarEvent[]> {
    const items: calendar_v3.Schema$Event[] = [];
    let pageToken: string | undefined;
    try {
      do {
        const response = await this.client.events.list({
          calendarId: target.providerCalendarId,
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          singleEvents: true,
          maxResults: 2500,
          pageToken,
          fields:
            "nextPageToken,items(id,iCalUID,summary,start,end,status,transparency,eventType,attendees(self,responseStatus))",
        });
        items.push(...(response.data.items ?? []));
        pageToken = response.data.nextPageToken ?? undefined;
      } while (pageToken && items.length < 5000);
    } catch (error) {
      throw toError(error);
    }

    return items.flatMap((item) => {
      if (item.status === "cancelled" || item.eventType === "workingLocation") {
        return [];
      }
      if (
        item.attendees?.some((a) => a.self && a.responseStatus === "declined")
      ) {
        return [];
      }
      const startTime = fromEventTime(item.start);
      const endTime = fromEventTime(item.end);
      if (!startTime.date || !endTime.date) {
        return [];
      }
      return [
        {
          uid: item.iCalUID ?? undefined,
          externalId: item.id ?? undefined,
          title: item.summary ?? "",
          start: startTime.date,
          end: endTime.date,
          allDay: startTime.allDay,
          busy: item.transparency !== "transparent",
        },
      ];
    });
  }

  async createEvent({
    calendar: target,
    event,
  }: {
    calendar: ProviderCalendarRef;
    event: CalendarEventInput;
  }): Promise<WrittenEvent> {
    const requestBody = toRequestBody(event);
    try {
      const response = await this.client.events.insert({
        calendarId: target.providerCalendarId,
        sendUpdates: "none",
        requestBody: { ...requestBody, iCalUID: event.uid },
      });
      return {
        externalId: response.data.id as string,
        etag: response.data.etag,
      };
    } catch (error) {
      // The UID is taken: the booked date's invitation email was already
      // added to this calendar under the same UID. That entry is the one to
      // keep, so it is adopted and brought in line.
      if (statusOf(error) !== 409) {
        throw toError(error);
      }
    }

    try {
      const existing = await this.client.events.list({
        calendarId: target.providerCalendarId,
        iCalUID: event.uid,
        showDeleted: false,
      });
      const id = existing.data.items?.[0]?.id;
      if (!id) {
        throw new GoogleCalendarError(
          "server",
          "Duplicate event could not be found",
        );
      }
      return await this.updateEvent({
        calendar: target,
        externalId: id,
        event,
      });
    } catch (error) {
      throw error instanceof GoogleCalendarError ? error : toError(error);
    }
  }

  async updateEvent({
    calendar: target,
    externalId,
    event,
  }: {
    calendar: ProviderCalendarRef;
    externalId: string;
    etag?: string | null;
    event: CalendarEventInput;
  }): Promise<WrittenEvent> {
    try {
      const response = await this.client.events.patch({
        calendarId: target.providerCalendarId,
        eventId: externalId,
        sendUpdates: "none",
        requestBody: toRequestBody(event),
      });
      return { externalId, etag: response.data.etag };
    } catch (error) {
      throw toError(error);
    }
  }

  async deleteEvent({
    calendar: target,
    externalId,
  }: {
    calendar: ProviderCalendarRef;
    externalId: string;
    etag?: string | null;
  }) {
    try {
      await this.client.events.delete({
        calendarId: target.providerCalendarId,
        eventId: externalId,
        sendUpdates: "none",
      });
    } catch (error) {
      const failure = toError(error);
      if (failure.reason !== "not_found") {
        throw failure;
      }
    }
  }
}
