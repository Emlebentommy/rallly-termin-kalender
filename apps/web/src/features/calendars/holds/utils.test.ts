import { describe, expect, it } from "vitest";
import type { DesiredHold, ExistingHold, HoldPoll } from "./utils";
import {
  CONFIRMED_HOLD_KEY,
  getDesiredHolds,
  mergeVotes,
  planHoldChanges,
} from "./utils";

const texts = {
  tentativeTitle: (title: string) => `Vorläufig: ${title}`,
  tentativeNote: "Vorläufig eingetragen.",
  pollLink: (url: string) => `Umfrage: ${url}`,
  organizer: (name: string) => `Organisiert von ${name}`,
};

const now = new Date("2030-01-01T00:00:00Z");

const basePoll: HoldPoll = {
  id: "poll1",
  title: "Kreisvorstand",
  description: "Haushalt besprechen",
  location: "Geschäftsstelle",
  timeZone: "Europe/Berlin",
  status: "open",
  deleted: false,
  organizerName: "Tom",
  conferencing: null,
  options: [
    // 18:00 in Berlin
    { id: "a", startTime: new Date("2030-03-03T17:00:00Z"), duration: 90 },
    { id: "b", startTime: new Date("2030-03-04T17:00:00Z"), duration: 90 },
    { id: "c", startTime: new Date("2030-03-05T17:00:00Z"), duration: 90 },
    // already over
    { id: "old", startTime: new Date("2029-12-01T17:00:00Z"), duration: 60 },
  ],
  chosenOptionId: null,
  scheduledEvent: null,
};

const desired = (
  poll: HoldPoll,
  votes: Record<string, "yes" | "ifNeedBe" | "no">,
  preferences = { holdsEnabled: true, holdIfNeedBe: true },
) =>
  getDesiredHolds({
    poll,
    votes: new Map(Object.entries(votes)),
    preferences,
    userId: "user1",
    userTimeZone: "Europe/Berlin",
    pollUrl: "https://termine.example.org/invite/poll1",
    host: "termine.example.org",
    texts,
    now,
  });

describe("getDesiredHolds", () => {
  it("holds every upcoming date the user can make", () => {
    const holds = desired(basePoll, {
      a: "yes",
      b: "ifNeedBe",
      c: "no",
      old: "yes",
    });

    expect(holds.map((hold) => hold.key)).toEqual(["a", "b"]);
    expect(holds[0]).toMatchObject({
      kind: "tentative",
      event: {
        uid: "hold-a-user1@termine.example.org",
        title: "Vorläufig: Kreisvorstand",
        location: "Geschäftsstelle",
        url: "https://termine.example.org/invite/poll1",
        start: new Date("2030-03-03T17:00:00Z"),
        end: new Date("2030-03-03T18:30:00Z"),
        allDay: false,
        status: "tentative",
      },
    });
    expect(holds[0]?.event.description).toBe(
      [
        "Vorläufig eingetragen.",
        "Haushalt besprechen",
        "Umfrage: https://termine.example.org/invite/poll1\nOrganisiert von Tom",
      ].join("\n\n"),
    );
  });

  it("leaves out if-need-be dates when the user does not want them held", () => {
    const holds = desired(
      basePoll,
      { a: "yes", b: "ifNeedBe" },
      { holdsEnabled: true, holdIfNeedBe: false },
    );
    expect(holds.map((hold) => hold.key)).toEqual(["a"]);
  });

  it("holds nothing when entries are turned off, or the poll is gone", () => {
    expect(
      desired(
        basePoll,
        { a: "yes" },
        { holdsEnabled: false, holdIfNeedBe: true },
      ),
    ).toEqual([]);
    expect(desired({ ...basePoll, deleted: true }, { a: "yes" })).toEqual([]);
    expect(desired({ ...basePoll, status: "canceled" }, { a: "yes" })).toEqual(
      [],
    );
  });

  it("writes date options as all-day entries", () => {
    const poll: HoldPoll = {
      ...basePoll,
      timeZone: null,
      options: [
        { id: "d", startTime: new Date("2030-04-10T00:00:00Z"), duration: 0 },
      ],
    };
    const [hold] = desired(poll, { d: "yes" });
    expect(hold?.event).toMatchObject({
      allDay: true,
      start: new Date("2030-04-10T00:00:00Z"),
      end: new Date("2030-04-11T00:00:00Z"),
    });
  });

  it("reads floating times in the user's zone", () => {
    const poll: HoldPoll = {
      ...basePoll,
      timeZone: null,
      // 18:00 wall time, stored as UTC
      options: [
        { id: "f", startTime: new Date("2030-07-01T18:00:00Z"), duration: 60 },
      ],
    };
    const [hold] = desired(poll, { f: "yes" });
    expect(hold?.event.start).toEqual(new Date("2030-07-01T16:00:00Z"));
  });

  describe("once a date is booked", () => {
    const scheduled: HoldPoll = {
      ...basePoll,
      status: "scheduled",
      chosenOptionId: "b",
      scheduledEvent: {
        uid: "evt1@rallly.co",
        title: "Kreisvorstand",
        description: "Haushalt besprechen",
        location: "Geschäftsstelle",
        conferencingUri: "https://meet.example.org/abc",
        start: new Date("2030-03-04T17:00:00Z"),
        end: new Date("2030-03-04T18:30:00Z"),
        allDay: false,
        timeZone: "Europe/Berlin",
        canceled: false,
      },
    };

    it("keeps only the booked date, under the invitation's UID", () => {
      const holds = desired(scheduled, { a: "yes", b: "ifNeedBe" });
      expect(holds).toHaveLength(1);
      expect(holds[0]).toMatchObject({
        key: CONFIRMED_HOLD_KEY,
        kind: "confirmed",
        event: {
          uid: "evt1@rallly.co",
          title: "Kreisvorstand",
          location: "Geschäftsstelle",
          status: "confirmed",
          start: new Date("2030-03-04T17:00:00Z"),
        },
      });
      expect(holds[0]?.event.description).toContain(
        "https://meet.example.org/abc",
      );
    });

    it("books the date even when if-need-be dates were not held", () => {
      const holds = desired(
        scheduled,
        { b: "ifNeedBe" },
        { holdsEnabled: true, holdIfNeedBe: false },
      );
      expect(holds.map((hold) => hold.kind)).toEqual(["confirmed"]);
    });

    it("writes nothing for a user who cannot make it", () => {
      expect(desired(scheduled, { a: "yes", b: "no" })).toEqual([]);
      expect(desired(scheduled, { a: "yes" })).toEqual([]);
    });

    it("removes the entry when the event is canceled", () => {
      expect(
        desired(
          {
            ...scheduled,
            scheduledEvent: scheduled.scheduledEvent && {
              ...scheduled.scheduledEvent,
              canceled: true,
            },
          },
          { b: "yes" },
        ),
      ).toEqual([]);
    });
  });
});

describe("mergeVotes", () => {
  it("takes a user at their most committal answer", () => {
    const merged = mergeVotes([
      { optionId: "a", type: "no" },
      { optionId: "a", type: "yes" },
      { optionId: "b", type: "ifNeedBe" },
      { optionId: "b", type: "no" },
    ]);
    expect(Object.fromEntries(merged)).toEqual({ a: "yes", b: "ifNeedBe" });
  });
});

describe("planHoldChanges", () => {
  const hold = (key: string, uid = `hold-${key}`): DesiredHold => ({
    key,
    kind: "tentative",
    event: {
      uid,
      title: key,
      description: "",
      start: new Date(0),
      end: new Date(1),
      allDay: false,
      status: "tentative",
    },
  });
  const hashOf = (h: DesiredHold) => `${h.key}:${h.event.title}`;
  const stored = (
    key: string,
    overrides: Partial<ExistingHold> = {},
  ): ExistingHold => ({
    id: `row-${key}`,
    key,
    kind: "tentative",
    providerCalendarId: "cal1",
    uid: `hold-${key}`,
    contentHash: `${key}:${key}`,
    ...overrides,
  });

  it("creates what is missing, updates what changed, removes the rest", () => {
    const changed = { ...hold("b"), event: { ...hold("b").event, title: "x" } };
    const plan = planHoldChanges({
      existing: [stored("a"), stored("b"), stored("c")],
      desired: [hold("a"), changed, hold("d")],
      calendarId: "cal1",
      hashOf,
    });
    expect(plan.create.map((h) => h.key)).toEqual(["d"]);
    expect(plan.update.map((u) => u.hold.key)).toEqual(["b"]);
    expect(plan.remove.map((h) => h.key)).toEqual(["c"]);
  });

  it("moves entries to a new destination calendar", () => {
    const plan = planHoldChanges({
      existing: [stored("a")],
      desired: [hold("a")],
      calendarId: "cal2",
      hashOf,
    });
    expect(plan.remove.map((h) => h.key)).toEqual(["a"]);
    expect(plan.create.map((h) => h.key)).toEqual(["a"]);
  });

  it("replaces an entry whose UID changes", () => {
    const plan = planHoldChanges({
      existing: [stored(CONFIRMED_HOLD_KEY, { uid: "old@rallly.co" })],
      desired: [hold(CONFIRMED_HOLD_KEY, "new@rallly.co")],
      calendarId: "cal1",
      hashOf,
    });
    expect(plan.remove).toHaveLength(1);
    expect(plan.create).toHaveLength(1);
  });

  it("removes everything when there is no calendar to write to", () => {
    const plan = planHoldChanges({
      existing: [stored("a")],
      desired: [hold("a")],
      calendarId: null,
      hashOf,
    });
    expect(plan.create).toEqual([]);
    expect(plan.remove.map((h) => h.key)).toEqual(["a"]);
  });
});
