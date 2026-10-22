import { XMLParser } from "fast-xml-parser";

export type DavResponse = {
  href: string;
  /** Properties from the propstat blocks that came back 200 */
  props: Record<string, unknown>;
};

const parser = new XMLParser({
  // CalDAV servers pick their own prefixes (d:, D:, cal:, C:...), so names
  // are compared without them
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
  isArray: (name) =>
    ["response", "propstat", "privilege", "comp", "href"].includes(name),
});

function textOf(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) {
    return textOf((value as { "#text": unknown })["#text"]);
  }
  return undefined;
}

function firstText(value: unknown): string | undefined {
  return Array.isArray(value) ? textOf(value[0]) : textOf(value);
}

/** The responses of a 207 Multi-Status body. */
export function parseMultistatus(xml: string): DavResponse[] {
  const parsed = parser.parse(xml) as {
    multistatus?: { response?: Array<Record<string, unknown>> };
  };
  const responses = parsed.multistatus?.response ?? [];
  return responses.flatMap((response) => {
    const href = firstText(response.href);
    if (!href) return [];
    const propstats =
      (response.propstat as Array<Record<string, unknown>>) ?? [];
    const props: Record<string, unknown> = {};
    for (const propstat of propstats) {
      const status = textOf(propstat.status) ?? "";
      if (!/\s2\d\d\s/.test(` ${status} `) && status !== "") continue;
      if (propstat.prop && typeof propstat.prop === "object") {
        Object.assign(props, propstat.prop);
      }
    }
    return [{ href: decodeHref(href), props }];
  });
}

function decodeHref(href: string) {
  try {
    return decodeURI(href);
  } catch {
    return href;
  }
}

/** The URL inside a property such as current-user-principal. */
export function hrefProp(props: Record<string, unknown>, name: string) {
  const value = props[name];
  if (!value || typeof value !== "object") return undefined;
  return firstText((value as Record<string, unknown>).href);
}

export function textProp(props: Record<string, unknown>, name: string) {
  return textOf(props[name]);
}

export function isCalendarCollection(props: Record<string, unknown>) {
  const resourcetype = props.resourcetype;
  return Boolean(
    resourcetype &&
      typeof resourcetype === "object" &&
      "calendar" in (resourcetype as object),
  );
}

/** True when the collection may hold events (no component set means any). */
export function supportsEvents(props: Record<string, unknown>) {
  const set = props["supported-calendar-component-set"];
  if (!set || typeof set !== "object") return true;
  const comps = (set as { comp?: Array<{ "@_name"?: string }> }).comp ?? [];
  return (
    comps.length === 0 ||
    comps.some((comp) => comp["@_name"]?.toUpperCase() === "VEVENT")
  );
}

/** Whether the current user may add events to the collection. */
export function canWrite(props: Record<string, unknown>) {
  const set = props["current-user-privilege-set"];
  // Servers that do not report privileges are assumed writable; a refused
  // write then surfaces as an error on the connection
  if (!set || typeof set !== "object") return true;
  const privileges = (set as { privilege?: Array<Record<string, unknown>> })
    .privilege;
  if (!privileges) return true;
  return privileges.some((privilege) =>
    ["all", "write", "write-content", "bind"].some((name) => name in privilege),
  );
}

/** The value of a calendar-color property as #rrggbb, if it is one. */
export function colorProp(props: Record<string, unknown>) {
  const color = textProp(props, "calendar-color");
  const match = color?.match(/^#([0-9a-fA-F]{6})/);
  return match ? `#${match[1]?.toLowerCase()}` : undefined;
}

/**
 * A server address as typed by a person: scheme optional, trailing slash
 * optional. Only https is accepted unless private targets are allowed (tests
 * and local servers), because the password travels with every request.
 */
export function normalizeServerUrl(
  input: string,
  { allowInsecure = false } = {},
) {
  const trimmed = input.trim();
  const withScheme = /^[a-z]+:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(withScheme);
  if (
    url.protocol !== "https:" &&
    !(allowInsecure && url.protocol === "http:")
  ) {
    throw new Error("insecure_url");
  }
  if (url.username || url.password) {
    throw new Error("credentials_in_url");
  }
  url.hash = "";
  return url;
}

/** An href from a response resolved against the URL it was requested from. */
export function resolveHref(href: string, base: URL | string) {
  return new URL(href, base).toString();
}

/**
 * The object a PUT collided with, from the error body of a refused write
 * whose UID is already in the calendar (the `no-uid-conflict` precondition).
 */
export function uidConflictHref(body: string) {
  if (!/no-uid-conflict/.test(body)) return undefined;
  const error = parser.parse(body) as Record<string, unknown>;
  const conflict = (error.error as Record<string, unknown> | undefined)?.[
    "no-uid-conflict"
  ] as { href?: unknown } | undefined;
  return firstText(conflict?.href);
}

/** A collection URL with exactly one trailing slash. */
export function asCollectionUrl(url: string) {
  return url.endsWith("/") ? url : `${url}/`;
}

function formatUtc(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (char) => `&#${char.charCodeAt(0)};`);

export const PROPFIND_PRINCIPAL = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:current-user-principal/>
    <c:calendar-home-set/>
    <d:resourcetype/>
    <d:displayname/>
  </d:prop>
</d:propfind>`;

export const PROPFIND_HOME = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <c:calendar-home-set/>
    <d:displayname/>
    <d:email/>
  </d:prop>
</d:propfind>`;

export const PROPFIND_CALENDARS = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ic="http://apple.com/ns/ical/">
  <d:prop>
    <d:resourcetype/>
    <d:displayname/>
    <d:current-user-privilege-set/>
    <c:supported-calendar-component-set/>
    <c:calendar-timezone/>
    <cs:getctag/>
    <ic:calendar-color/>
  </d:prop>
</d:propfind>`;

export function calendarQueryBody(range: { start: Date; end: Date }) {
  return `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${escapeXml(formatUtc(range.start))}" end="${escapeXml(formatUtc(range.end))}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
}

/** Finds the object carrying a UID, whatever its name. */
export function uidQueryBody(uid: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:prop-filter name="UID">
          <c:text-match collation="i;octet">${escapeXml(uid)}</c:text-match>
        </c:prop-filter>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
}
