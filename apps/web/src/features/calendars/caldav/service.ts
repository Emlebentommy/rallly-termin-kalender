import "server-only";

import { isIP } from "node:net";
import type { Dispatcher } from "undici";
import { getGlobalDispatcher } from "undici";
import type {
  CalendarEvent,
  CalendarInfo,
  CalendarService,
  ProviderCalendarRef,
  WrittenEvent,
} from "@/features/calendars/types";
import {
  buildICalendar,
  parseICalendarEvents,
} from "@/features/calendars/utils";
import type { CalDavCredentials } from "@/features/credentials/schema";
import { caldavCredentialsSchema } from "@/features/credentials/schema";
import { guardedLookup } from "@/features/webhook/service";
import { isPrivateAddress } from "@/features/webhook/utils";
import { createOutboundDispatcher } from "@/lib/outbound-proxy";
import {
  asCollectionUrl,
  calendarQueryBody,
  canWrite,
  colorProp,
  hrefProp,
  isCalendarCollection,
  normalizeServerUrl,
  PROPFIND_CALENDARS,
  PROPFIND_HOME,
  PROPFIND_PRINCIPAL,
  parseMultistatus,
  resolveHref,
  supportsEvents,
  textProp,
} from "./utils";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 4;

export type CalDavErrorReason =
  | "unauthorized"
  | "not_found"
  | "no_calendars"
  | "invalid_url"
  | "private_address"
  | "network"
  | "server";

export class CalDavError extends Error {
  constructor(
    readonly reason: CalDavErrorReason,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CalDavError";
  }
}

/**
 * Private targets are refused unless the operator opts in, as webhooks are:
 * the server URL is typed by a user, and the server makes the request.
 */
export const allowPrivateCalDavTargets = () =>
  process.env.CALDAV_ALLOW_PRIVATE_URLS === "true";

let guardedDispatcher: Dispatcher | null = null;

function getDispatcher() {
  if (allowPrivateCalDavTargets()) {
    return getGlobalDispatcher();
  }
  guardedDispatcher ??= createOutboundDispatcher({
    connect: { lookup: guardedLookup },
  });
  return guardedDispatcher;
}

type DavRequest = {
  method: "PROPFIND" | "REPORT" | "PUT" | "DELETE" | "GET";
  url: string;
  depth?: "0" | "1";
  body?: string;
  contentType?: string;
  headers?: Record<string, string>;
};

export type CalDavAccount = {
  /** The URL that answered discovery, kept to skip it next time */
  principalUrl: string;
  homeUrl: string;
  displayName?: string;
  email?: string;
  calendars: CalendarInfo[];
};

export class CalDavCalendarService implements CalendarService {
  static credentialsSchema = caldavCredentialsSchema;
  private readonly authorization: string;

  constructor(private readonly params: { credentials: CalDavCredentials }) {
    const { username, password } = params.credentials;
    this.authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  }

  private async request({
    method,
    url,
    depth,
    body,
    contentType,
    headers,
  }: DavRequest) {
    let target = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // IP literals never go through the guarded lookup, so they are judged
      // here, on every hop
      const hostname = new URL(target).hostname.replace(/^\[|\]$/g, "");
      if (
        !allowPrivateCalDavTargets() &&
        isIP(hostname) &&
        isPrivateAddress(hostname)
      ) {
        throw new CalDavError(
          "private_address",
          "The server is a private address",
        );
      }
      let response: Response;
      try {
        response = await fetch(target, {
          method,
          redirect: "manual",
          cache: "no-store",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: {
            Authorization: this.authorization,
            ...(depth ? { Depth: depth } : {}),
            ...(body
              ? {
                  "Content-Type":
                    contentType ?? "application/xml; charset=utf-8",
                }
              : {}),
            ...headers,
          },
          body,
          ...({ dispatcher: getDispatcher() } as object),
        });
      } catch (error) {
        const cause = error instanceof Error ? error.cause : undefined;
        if (cause instanceof Error && cause.name === "PrivateAddressError") {
          throw new CalDavError(
            "private_address",
            "The server resolves to a private address",
          );
        }
        throw new CalDavError(
          "network",
          cause instanceof Error
            ? cause.message
            : "The server could not be reached",
        );
      }

      // Redirects are followed by hand so the method and body survive and
      // every hop goes through the same guarded connection
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) break;
        target = new URL(location, target).toString();
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        throw new CalDavError(
          "unauthorized",
          "The server refused the credentials",
          response.status,
        );
      }
      return { response, url: target };
    }
    throw new CalDavError("server", "Too many redirects");
  }

  private async propfind(url: string, depth: "0" | "1", body: string) {
    const { response, url: finalUrl } = await this.request({
      method: "PROPFIND",
      url,
      depth,
      body,
    });
    if (response.status !== 207) {
      throw new CalDavError(
        response.status === 404 ? "not_found" : "server",
        `PROPFIND answered ${response.status}`,
        response.status,
      );
    }
    return {
      responses: parseMultistatus(await response.text()),
      url: finalUrl,
    };
  }

  /**
   * Finds the user's calendars from a server address: the address itself
   * may be the principal, the calendar home, a calendar, or just the host,
   * in which case the well-known URL (RFC 6764) points the way.
   */
  async discover(): Promise<CalDavAccount> {
    let base: URL;
    try {
      base = normalizeServerUrl(this.params.credentials.serverUrl, {
        allowInsecure: allowPrivateCalDavTargets(),
      });
    } catch {
      throw new CalDavError("invalid_url", "The server address is not valid");
    }

    const candidates = [
      base.toString(),
      new URL("/.well-known/caldav", base).toString(),
    ];
    let principalUrl: string | undefined;
    let homeUrl: string | undefined;
    let displayName: string | undefined;

    for (const candidate of candidates) {
      try {
        const { responses, url } = await this.propfind(
          candidate,
          "0",
          PROPFIND_PRINCIPAL,
        );
        const props = responses[0]?.props ?? {};
        const home = hrefProp(props, "calendar-home-set");
        const principal = hrefProp(props, "current-user-principal");
        if (home) {
          homeUrl = resolveHref(home, url);
          principalUrl = principal ? resolveHref(principal, url) : url;
          break;
        }
        if (principal) {
          principalUrl = resolveHref(principal, url);
          break;
        }
        if (isCalendarCollection(props)) {
          // A calendar URL: its parent is the home
          homeUrl = new URL("..", asCollectionUrl(url)).toString();
          principalUrl = url;
          break;
        }
      } catch (error) {
        if (error instanceof CalDavError && error.reason === "unauthorized")
          throw error;
        if (error instanceof CalDavError && error.reason === "private_address")
          throw error;
      }
    }

    if (!principalUrl) {
      throw new CalDavError(
        "not_found",
        "No CalDAV service was found at this address",
      );
    }

    if (!homeUrl) {
      const { responses, url } = await this.propfind(
        principalUrl,
        "0",
        PROPFIND_HOME,
      );
      const props = responses[0]?.props ?? {};
      const home = hrefProp(props, "calendar-home-set");
      displayName = textProp(props, "displayname");
      if (!home) {
        throw new CalDavError("not_found", "The account has no calendar home");
      }
      homeUrl = resolveHref(home, url);
    }

    const calendars = await this.listCalendarsAt(homeUrl);
    if (calendars.length === 0) {
      throw new CalDavError(
        "no_calendars",
        "The account has no calendars for events",
      );
    }

    return { principalUrl, homeUrl, displayName, calendars };
  }

  private async listCalendarsAt(homeUrl: string): Promise<CalendarInfo[]> {
    const { responses, url } = await this.propfind(
      asCollectionUrl(homeUrl),
      "1",
      PROPFIND_CALENDARS,
    );
    return responses
      .filter(
        (entry) =>
          isCalendarCollection(entry.props) && supportsEvents(entry.props),
      )
      .map((entry, index) => {
        const calendarUrl = asCollectionUrl(resolveHref(entry.href, url));
        const name =
          textProp(entry.props, "displayname") ||
          decodeURIComponent(
            calendarUrl.split("/").filter(Boolean).pop() ?? "Calendar",
          );
        return {
          id: calendarUrl,
          name,
          isPrimary: index === 0,
          isSelected: true,
          isDeleted: false,
          isWritable: canWrite(entry.props),
          _rawData: {
            url: calendarUrl,
            ctag: textProp(entry.props, "getctag") ?? null,
            color: colorProp(entry.props) ?? null,
          },
        };
      });
  }

  async listCalendars() {
    return (await this.discover()).calendars;
  }

  async listEvents({
    calendar,
    start,
    end,
  }: {
    calendar: ProviderCalendarRef;
    start: Date;
    end: Date;
  }): Promise<CalendarEvent[]> {
    const { response, url } = await this.request({
      method: "REPORT",
      url: asCollectionUrl(calendar.providerCalendarId),
      depth: "1",
      body: calendarQueryBody({ start, end }),
    });
    if (response.status !== 207) {
      throw new CalDavError(
        "server",
        `REPORT answered ${response.status}`,
        response.status,
      );
    }
    const responses = parseMultistatus(await response.text());
    return responses.flatMap((entry) => {
      const data = textProp(entry.props, "calendar-data");
      return data
        ? parseICalendarEvents(
            data,
            { start, end },
            resolveHref(entry.href, url),
          )
        : [];
    });
  }

  private objectUrl(calendar: ProviderCalendarRef, uid: string) {
    // UIDs carry characters such as "@"; the file name only has to be stable
    const name = uid.replace(/[^a-zA-Z0-9._-]/g, "-");
    return `${asCollectionUrl(calendar.providerCalendarId)}${name}.ics`;
  }

  private async put(
    url: string,
    body: string,
    headers: Record<string, string>,
  ) {
    const { response } = await this.request({
      method: "PUT",
      url,
      body,
      contentType: "text/calendar; charset=utf-8",
      headers,
    });
    return response;
  }

  async createEvent({
    calendar,
    event,
  }: Parameters<CalendarService["createEvent"]>[0]): Promise<WrittenEvent> {
    const url = this.objectUrl(calendar, event.uid);
    let response = await this.put(url, buildICalendar(event), {
      "If-None-Match": "*",
    });
    // An object of that name exists already (a write that failed half way):
    // it carries our UID, so it is ours to replace
    if (response.status === 412) {
      response = await this.put(url, buildICalendar(event), {});
    }
    if (!response.ok) {
      throw new CalDavError(
        "server",
        `PUT answered ${response.status}`,
        response.status,
      );
    }
    return { externalId: url, etag: response.headers.get("etag") };
  }

  async updateEvent({
    externalId,
    etag,
    event,
  }: Parameters<CalendarService["updateEvent"]>[0]): Promise<WrittenEvent> {
    let response = await this.put(
      externalId,
      buildICalendar(event),
      etag ? { "If-Match": etag } : {},
    );
    // Edited in the calendar meanwhile: the entry is the app's to keep in
    // line with the poll, so the newer copy is overwritten
    if (response.status === 412) {
      response = await this.put(externalId, buildICalendar(event), {});
    }
    if (response.status === 404) {
      throw new CalDavError("not_found", "The entry no longer exists", 404);
    }
    if (!response.ok) {
      throw new CalDavError(
        "server",
        `PUT answered ${response.status}`,
        response.status,
      );
    }
    return { externalId, etag: response.headers.get("etag") };
  }

  async deleteEvent({
    externalId,
  }: Parameters<CalendarService["deleteEvent"]>[0]) {
    const { response } = await this.request({
      method: "DELETE",
      url: externalId,
    });
    if (response.ok || response.status === 404 || response.status === 410) {
      return;
    }
    throw new CalDavError(
      "server",
      `DELETE answered ${response.status}`,
      response.status,
    );
  }
}
