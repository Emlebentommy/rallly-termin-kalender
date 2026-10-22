import { describe, expect, it } from "vitest";
import type { AvailabilityEvent } from "./utils";
import {
  buildICalendar,
  computeOptionAvailability,
  escapeICalText,
  foldICalLine,
  getAvailabilityDays,
  getAvailabilityRange,
  getEventSpan,
  getOptionTimes,
  parseICalendarEvents,
  rangesOverlap,
  tagHolds,
} from "./utils";

const BERLIN_VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Berlin",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const calendar = (...lines: string[]) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Test//EN",
    ...lines,
    "END:VCALENDAR",
  ].join("\r\n");

const NOVEMBER = {
  start: new Date("2026-11-01T00:00:00Z"),
  end: new Date("2026-12-01T00:00:00Z"),
};

describe("buildICalendar", () => {
  it("writes a timed tentative entry in UTC", () => {
    const ics = buildICalendar(
      {
        uid: "hold-1@termine",
        title: "Vorläufig: Kreisvorstand",
        description: "Zeile 1\nZeile 2; mit Komma, ok",
        location: "Grünes Büro, Erfurt",
        url: "https://termine.example/invite/abc",
        start: new Date("2026-11-04T17:00:00Z"),
        end: new Date("2026-11-04T18:30:00Z"),
        allDay: false,
        status: "tentative",
      },
      { now: new Date("2026-10-22T10:00:00Z") },
    );

    expect(ics).toContain("UID:hold-1@termine\r\n");
    expect(ics).toContain("DTSTART:20261104T170000Z\r\n");
    expect(ics).toContain("DTEND:20261104T183000Z\r\n");
    expect(ics).toContain("STATUS:TENTATIVE\r\n");
    expect(ics).toContain("TRANSP:OPAQUE\r\n");
    expect(ics).toContain(
      "DESCRIPTION:Zeile 1\\nZeile 2\\; mit Komma\\, ok\r\n",
    );
    expect(ics).toContain("LOCATION:Grünes Büro\\, Erfurt\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("writes all-day entries as dates", () => {
    const ics = buildICalendar({
      uid: "hold-2@termine",
      title: "Klausur",
      description: "",
      start: new Date("2026-11-07T00:00:00Z"),
      end: new Date("2026-11-08T00:00:00Z"),
      allDay: true,
      status: "confirmed",
    });

    expect(ics).toContain("DTSTART;VALUE=DATE:20261107\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261108\r\n");
    expect(ics).toContain("STATUS:CONFIRMED\r\n");
    expect(ics).not.toContain("DESCRIPTION:");
  });

  it("round-trips through the parser", () => {
    const ics = buildICalendar({
      uid: "hold-3@termine",
      title: "Treffen",
      description: "",
      start: new Date("2026-11-04T17:00:00Z"),
      end: new Date("2026-11-04T18:00:00Z"),
      allDay: false,
      status: "tentative",
    });

    expect(parseICalendarEvents(ics, NOVEMBER)).toEqual([
      expect.objectContaining({
        uid: "hold-3@termine",
        title: "Treffen",
        start: new Date("2026-11-04T17:00:00Z"),
        end: new Date("2026-11-04T18:00:00Z"),
        busy: true,
      }),
    ]);
  });
});

describe("text helpers", () => {
  it("escapes iCalendar text", () => {
    expect(escapeICalText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("folds long lines without splitting characters", () => {
    const folded = foldICalLine(`SUMMARY:${"ä".repeat(60)}`);
    const lines = folded.split("\r\n");

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(lines.map((line, i) => (i ? line.slice(1) : line)).join("")).toBe(
      `SUMMARY:${"ä".repeat(60)}`,
    );
  });
});

describe("parseICalendarEvents", () => {
  it("converts a zoned time with its VTIMEZONE", () => {
    const events = parseICalendarEvents(
      calendar(
        ...BERLIN_VTIMEZONE,
        "BEGIN:VEVENT",
        "UID:a",
        "DTSTAMP:20261001T000000Z",
        "DTSTART;TZID=Europe/Berlin:20261104T180000",
        "DTEND;TZID=Europe/Berlin:20261104T190000",
        "SUMMARY:Fraktion",
        "END:VEVENT",
      ),
      NOVEMBER,
    );

    expect(events).toEqual([
      expect.objectContaining({
        title: "Fraktion",
        start: new Date("2026-11-04T17:00:00Z"),
        end: new Date("2026-11-04T18:00:00Z"),
        allDay: false,
        busy: true,
      }),
    ]);
  });

  it("converts an IANA TZID that comes without a VTIMEZONE", () => {
    const events = parseICalendarEvents(
      calendar(
        "BEGIN:VEVENT",
        "UID:b",
        "DTSTAMP:20261001T000000Z",
        "DTSTART;TZID=Europe/Berlin:20261104T180000",
        "DTEND;TZID=Europe/Berlin:20261104T190000",
        "SUMMARY:Ohne VTIMEZONE",
        "END:VEVENT",
      ),
      NOVEMBER,
    );

    expect(events[0]?.start).toEqual(new Date("2026-11-04T17:00:00Z"));
  });

  it("reads all-day events as floating dates", () => {
    const events = parseICalendarEvents(
      calendar(
        "BEGIN:VEVENT",
        "UID:c",
        "DTSTAMP:20261001T000000Z",
        "DTSTART;VALUE=DATE:20261107",
        "DTEND;VALUE=DATE:20261109",
        "SUMMARY:Urlaub",
        "END:VEVENT",
      ),
      NOVEMBER,
    );

    expect(events).toEqual([
      expect.objectContaining({
        start: new Date("2026-11-07T00:00:00Z"),
        end: new Date("2026-11-09T00:00:00Z"),
        allDay: true,
      }),
    ]);
  });

  it("expands recurrences with excluded and moved occurrences", () => {
    const events = parseICalendarEvents(
      calendar(
        ...BERLIN_VTIMEZONE,
        "BEGIN:VEVENT",
        "UID:weekly",
        "DTSTAMP:20261001T000000Z",
        "DTSTART;TZID=Europe/Berlin:20261005T190000",
        "DTEND;TZID=Europe/Berlin:20261005T200000",
        "RRULE:FREQ=WEEKLY;COUNT=10",
        "EXDATE;TZID=Europe/Berlin:20261109T190000",
        "SUMMARY:Ortsverband",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:weekly",
        "DTSTAMP:20261001T000000Z",
        "RECURRENCE-ID;TZID=Europe/Berlin:20261116T190000",
        "DTSTART;TZID=Europe/Berlin:20261117T200000",
        "DTEND;TZID=Europe/Berlin:20261117T210000",
        "SUMMARY:Ortsverband (verschoben)",
        "END:VEVENT",
      ),
      NOVEMBER,
    );

    expect(events.map((e) => [e.title, e.start.toISOString()])).toEqual([
      ["Ortsverband", "2026-11-02T18:00:00.000Z"],
      // 9 Nov is excluded
      ["Ortsverband (verschoben)", "2026-11-17T19:00:00.000Z"],
      ["Ortsverband", "2026-11-23T18:00:00.000Z"],
      ["Ortsverband", "2026-11-30T18:00:00.000Z"],
    ]);
  });

  it("keeps free time and drops cancelled events", () => {
    const events = parseICalendarEvents(
      calendar(
        "BEGIN:VEVENT",
        "UID:free",
        "DTSTAMP:20261001T000000Z",
        "DTSTART:20261104T170000Z",
        "DTEND:20261104T180000Z",
        "TRANSP:TRANSPARENT",
        "SUMMARY:Erinnerung",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:gone",
        "DTSTAMP:20261001T000000Z",
        "DTSTART:20261105T170000Z",
        "DTEND:20261105T180000Z",
        "STATUS:CANCELLED",
        "SUMMARY:Abgesagt",
        "END:VEVENT",
      ),
      NOVEMBER,
    );

    expect(events).toEqual([
      expect.objectContaining({ title: "Erinnerung", busy: false }),
    ]);
  });

  it("only returns occurrences that overlap the range", () => {
    const events = parseICalendarEvents(
      calendar(
        "BEGIN:VEVENT",
        "UID:outside",
        "DTSTAMP:20261001T000000Z",
        "DTSTART:20261231T170000Z",
        "DTEND:20261231T180000Z",
        "SUMMARY:Silvester",
        "END:VEVENT",
      ),
      NOVEMBER,
    );

    expect(events).toEqual([]);
  });

  it("ignores data that is not iCalendar", () => {
    expect(parseICalendarEvents("<html>", NOVEMBER)).toEqual([]);
  });
});

describe("rangesOverlap", () => {
  const range = (start: string, end: string) => ({
    start: new Date(start),
    end: new Date(end),
  });

  it("treats ranges as half-open", () => {
    expect(
      rangesOverlap(
        range("2026-11-04T17:00:00Z", "2026-11-04T18:00:00Z"),
        range("2026-11-04T18:00:00Z", "2026-11-04T19:00:00Z"),
      ),
    ).toBe(false);
    expect(
      rangesOverlap(
        range("2026-11-04T17:00:00Z", "2026-11-04T18:00:00Z"),
        range("2026-11-04T17:59:00Z", "2026-11-04T19:00:00Z"),
      ),
    ).toBe(true);
  });
});

describe("getOptionTimes", () => {
  it("keeps a zoned time option as the instant it is", () => {
    const times = getOptionTimes({
      startTime: new Date("2026-11-04T17:00:00Z"),
      duration: 90,
      pollTimeZone: "Europe/Berlin",
      userTimeZone: "America/New_York",
    });

    expect(times).toEqual({
      allDay: false,
      start: new Date("2026-11-04T17:00:00Z"),
      end: new Date("2026-11-04T18:30:00Z"),
      entryStart: new Date("2026-11-04T17:00:00Z"),
      entryEnd: new Date("2026-11-04T18:30:00Z"),
    });
  });

  it("reads a floating time in the user's zone", () => {
    // Floating times are stored as UTC wall times: 18:00 means 18:00 anywhere
    const times = getOptionTimes({
      startTime: new Date("2026-11-04T18:00:00Z"),
      duration: 60,
      pollTimeZone: null,
      userTimeZone: "Europe/Berlin",
    });

    expect(times.start).toEqual(new Date("2026-11-04T17:00:00Z"));
    expect(times.end).toEqual(new Date("2026-11-04T18:00:00Z"));
  });

  it("spans the user's local day for a date option", () => {
    const times = getOptionTimes({
      startTime: new Date("2026-11-07T00:00:00Z"),
      duration: 0,
      pollTimeZone: null,
      userTimeZone: "Europe/Berlin",
    });

    expect(times).toEqual({
      allDay: true,
      start: new Date("2026-11-06T23:00:00Z"),
      end: new Date("2026-11-07T23:00:00Z"),
      entryStart: new Date("2026-11-07T00:00:00Z"),
      entryEnd: new Date("2026-11-08T00:00:00Z"),
    });
  });

  it("snaps a legacy date option stored at the poll zone's midnight", () => {
    const times = getOptionTimes({
      startTime: new Date("2026-11-06T23:00:00Z"),
      duration: 0,
      pollTimeZone: "Europe/Berlin",
      userTimeZone: "Europe/Berlin",
    });

    expect(times.entryStart).toEqual(new Date("2026-11-07T00:00:00Z"));
  });
});

describe("getEventSpan", () => {
  it("maps an all-day event onto the user's local days", () => {
    expect(
      getEventSpan(
        {
          start: new Date("2026-11-07T00:00:00Z"),
          end: new Date("2026-11-09T00:00:00Z"),
          allDay: true,
        },
        "Europe/Berlin",
      ),
    ).toEqual({
      start: new Date("2026-11-06T23:00:00Z"),
      end: new Date("2026-11-08T23:00:00Z"),
    });
  });
});

describe("computeOptionAvailability", () => {
  const options = [
    // 18:00–19:30 Berlin
    {
      id: "evening",
      startTime: new Date("2026-11-04T17:00:00Z"),
      duration: 90,
    },
    {
      id: "morning",
      startTime: new Date("2026-11-05T08:00:00Z"),
      duration: 60,
    },
    {
      id: "saturday",
      startTime: new Date("2026-11-07T00:00:00Z"),
      duration: 0,
    },
  ];
  const event = (
    title: string,
    start: string,
    end: string,
    extra: Partial<AvailabilityEvent> = {},
  ): AvailabilityEvent => ({
    title,
    start: new Date(start),
    end: new Date(end),
    allDay: false,
    busy: true,
    calendarName: "Persönlich",
    hold: null,
    ...extra,
  });
  const run = (
    events: AvailabilityEvent[],
    overrides: Partial<Parameters<typeof computeOptionAvailability>[0]> = {},
  ) =>
    Object.fromEntries(
      computeOptionAvailability({
        options,
        events,
        pollTimeZone: "Europe/Berlin",
        userTimeZone: "Europe/Berlin",
        busyVote: "no",
        allowTentativeVotes: true,
        ...overrides,
      }).map((option) => [option.optionId, option]),
    );

  it("suggests yes where the calendar is free", () => {
    const result = run([]);
    expect(result.evening).toMatchObject({
      status: "free",
      suggestion: "yes",
      conflicts: [],
    });
  });

  it("suggests the configured answer for a busy date", () => {
    const events = [
      event("Zahnarzt", "2026-11-04T16:30:00Z", "2026-11-04T17:30:00Z"),
    ];

    expect(run(events).evening).toMatchObject({
      status: "busy",
      suggestion: "no",
    });
    expect(run(events, { busyVote: "ifNeedBe" }).evening.suggestion).toBe(
      "ifNeedBe",
    );
    // If need be is not offered by this poll, the answer falls back to no
    expect(
      run(events, { busyVote: "ifNeedBe", allowTentativeVotes: false }).evening
        .suggestion,
    ).toBe("no");
  });

  it("ignores free events and the entries written for this poll", () => {
    const result = run([
      event("Erinnerung", "2026-11-04T17:00:00Z", "2026-11-04T18:00:00Z", {
        busy: false,
      }),
      event(
        "Vorläufig: diese Umfrage",
        "2026-11-05T08:00:00Z",
        "2026-11-05T09:00:00Z",
        {
          hold: { kind: "tentative", samePoll: true },
        },
      ),
    ]);

    expect(result.evening).toMatchObject({ status: "free", suggestion: "yes" });
    expect(result.evening.conflicts).toHaveLength(1);
    expect(result.morning).toMatchObject({ status: "free", conflicts: [] });
  });

  it("treats another poll's placeholder as a tentative conflict", () => {
    const result = run([
      event(
        "Vorläufig: andere Umfrage",
        "2026-11-05T08:30:00Z",
        "2026-11-05T09:30:00Z",
        {
          hold: { kind: "tentative", samePoll: false },
        },
      ),
    ]);

    expect(result.morning).toMatchObject({
      status: "held",
      suggestion: "ifNeedBe",
    });
  });

  it("matches all-day events and date options on the user's local day", () => {
    const allDay = event(
      "Urlaub",
      "2026-11-07T00:00:00Z",
      "2026-11-08T00:00:00Z",
      {
        allDay: true,
      },
    );
    const late = event(
      "Spätschicht",
      "2026-11-06T22:30:00Z",
      "2026-11-06T23:30:00Z",
    );

    expect(run([allDay]).saturday.status).toBe("busy");
    // 23:30–00:30 Berlin overlaps the start of Saturday
    expect(run([late]).saturday.status).toBe("busy");
    // In New York the same event ends on Friday
    expect(
      run([late], { userTimeZone: "America/New_York" }).saturday.status,
    ).toBe("free");
  });
});

describe("tagHolds", () => {
  it("marks the app's entries by UID or provider id", () => {
    const holds = [
      { pollId: "p1", kind: "tentative" as const, uid: "u1", externalId: "x1" },
      { pollId: "p2", kind: "confirmed" as const, uid: "u2", externalId: "x2" },
    ];
    const tagged = tagHolds(
      [{ uid: "u1" }, { externalId: "x2" }, { uid: "other" }],
      holds,
      "p1",
    );

    expect(tagged.map((event) => event.hold)).toEqual([
      { kind: "tentative", samePoll: true },
      { kind: "confirmed", samePoll: false },
      null,
    ]);
  });
});

describe("getAvailabilityRange", () => {
  it("pads the option spans by a day and caps the length", () => {
    const range = getAvailabilityRange(
      [
        {
          start: new Date("2026-11-04T17:00:00Z"),
          end: new Date("2026-11-04T18:00:00Z"),
        },
        {
          start: new Date("2028-11-04T17:00:00Z"),
          end: new Date("2028-11-04T18:00:00Z"),
        },
      ],
      30,
    );

    expect(range?.start).toEqual(new Date("2026-11-03T17:00:00Z"));
    expect(range?.end).toEqual(new Date("2026-12-03T17:00:00Z"));
    expect(getAvailabilityRange([], 30)).toBeNull();
  });
});

describe("getAvailabilityDays", () => {
  const event = (
    title: string,
    start: string,
    end: string,
    allDay = false,
  ): AvailabilityEvent => ({
    title,
    start: new Date(start),
    end: new Date(end),
    allDay,
    busy: true,
    calendarName: "Privat",
    hold: null,
  });

  it("lists the user's events on each local day the poll has an option", () => {
    const days = getAvailabilityDays({
      options: [
        // 23:30 in Berlin on 3 March, which is 4 March in UTC terms the next hour
        { startTime: new Date("2030-03-03T22:30:00Z"), duration: 60 },
        { startTime: new Date("2030-03-05T09:00:00Z"), duration: 60 },
        { startTime: new Date("2030-03-05T15:00:00Z"), duration: 60 },
      ],
      events: [
        event("Abendtermin", "2030-03-03T18:00:00Z", "2030-03-03T19:00:00Z"),
        event("Urlaub", "2030-03-05T00:00:00Z", "2030-03-06T00:00:00Z", true),
        event("Anderer Tag", "2030-03-04T10:00:00Z", "2030-03-04T11:00:00Z"),
      ],
      pollTimeZone: "Europe/Berlin",
      userTimeZone: "Europe/Berlin",
    });

    expect(days.map((day) => day.date)).toEqual(["2030-03-03", "2030-03-05"]);
    expect(days[0]?.events.map((e) => e.title)).toEqual(["Abendtermin"]);
    expect(days[1]?.events.map((e) => e.title)).toEqual(["Urlaub"]);
  });

  it("uses the option's own date for all-day options", () => {
    const days = getAvailabilityDays({
      options: [{ startTime: new Date("2030-04-10T00:00:00Z"), duration: 0 }],
      events: [],
      pollTimeZone: null,
      userTimeZone: "America/New_York",
    });
    expect(days).toEqual([{ date: "2030-04-10", events: [] }]);
  });
});
