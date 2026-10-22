import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CalDavCalendarService, CalDavError } from "./service";

/**
 * Runs against a real CalDAV server (Radicale in CI) when CALDAV_TEST_URL
 * points at one, with user CALDAV_TEST_USER / CALDAV_TEST_PASSWORD owning a
 * calendar named "personal".
 */
const serverUrl = process.env.CALDAV_TEST_URL;
const username = process.env.CALDAV_TEST_USER ?? "anna";
const password = process.env.CALDAV_TEST_PASSWORD ?? "geheim";

describe.runIf(serverUrl)("CalDavCalendarService against a server", () => {
  const previous = process.env.CALDAV_ALLOW_PRIVATE_URLS;
  beforeAll(() => {
    process.env.CALDAV_ALLOW_PRIVATE_URLS = "true";
  });
  afterAll(() => {
    process.env.CALDAV_ALLOW_PRIVATE_URLS = previous;
  });

  const service = () =>
    new CalDavCalendarService({
      credentials: { serverUrl: serverUrl ?? "", username, password },
    });

  it("discovers the account's calendars from the bare server address", async () => {
    const account = await service().discover();

    expect(account.homeUrl).toContain(`/${username}/`);
    expect(account.calendars.map((calendar) => calendar.id)).toContainEqual(
      expect.stringMatching(/\/personal\/$/),
    );
    expect(account.calendars.every((calendar) => calendar.isWritable)).toBe(
      true,
    );
  });

  it("refuses wrong credentials", async () => {
    const wrong = new CalDavCalendarService({
      credentials: { serverUrl: serverUrl ?? "", username, password: "nope" },
    });

    await expect(wrong.discover()).rejects.toMatchObject({
      reason: "unauthorized",
    } satisfies Partial<CalDavError>);
  });

  it("writes, reads back, updates and deletes an entry", async () => {
    const client = service();
    const account = await client.discover();
    const calendar = {
      providerCalendarId:
        account.calendars.find((c) => c.id.endsWith("/personal/"))?.id ?? "",
    };
    const start = new Date(Date.UTC(2031, 4, 6, 17, 0));
    const end = new Date(Date.UTC(2031, 4, 6, 18, 30));
    const uid = `vitest-${Date.now()}@termine`;

    const written = await client.createEvent({
      calendar,
      event: {
        uid,
        title: "Vorläufig: Test",
        description: "Aus der Terminumfrage",
        start,
        end,
        allDay: false,
        status: "tentative",
      },
    });
    expect(written.externalId).toMatch(/\.ics$/);

    const range = {
      start: new Date(Date.UTC(2031, 4, 6)),
      end: new Date(Date.UTC(2031, 4, 7)),
    };
    const events = await client.listEvents({ calendar, ...range });
    expect(events).toContainEqual(
      expect.objectContaining({ uid, title: "Vorläufig: Test", start, end }),
    );

    await client.updateEvent({
      calendar,
      externalId: written.externalId,
      etag: written.etag,
      event: {
        uid,
        title: "Test",
        description: "Bestätigt",
        start,
        end,
        allDay: false,
        status: "confirmed",
      },
    });
    const updated = await client.listEvents({ calendar, ...range });
    expect(updated.find((event) => event.uid === uid)?.title).toBe("Test");

    await client.deleteEvent({ calendar, externalId: written.externalId });
    const after = await client.listEvents({ calendar, ...range });
    expect(after.find((event) => event.uid === uid)).toBeUndefined();

    // Deleting what is already gone succeeds
    await expect(
      client.deleteEvent({ calendar, externalId: written.externalId }),
    ).resolves.toBeUndefined();
  });
});

describe("CalDavCalendarService guards", () => {
  it("rejects plain http unless private targets are allowed", async () => {
    const previous = process.env.CALDAV_ALLOW_PRIVATE_URLS;
    process.env.CALDAV_ALLOW_PRIVATE_URLS = "false";
    try {
      const client = new CalDavCalendarService({
        credentials: {
          serverUrl: "http://calendar.example.org",
          username: "a",
          password: "b",
        },
      });
      await expect(client.discover()).rejects.toBeInstanceOf(CalDavError);
      await expect(client.discover()).rejects.toMatchObject({
        reason: "invalid_url",
      });
    } finally {
      process.env.CALDAV_ALLOW_PRIVATE_URLS = previous;
    }
  });

  it("refuses a server that resolves to a private address", async () => {
    const previous = process.env.CALDAV_ALLOW_PRIVATE_URLS;
    process.env.CALDAV_ALLOW_PRIVATE_URLS = "false";
    try {
      const client = new CalDavCalendarService({
        credentials: {
          serverUrl: "https://127.0.0.1",
          username: "a",
          password: "b",
        },
      });
      await expect(client.discover()).rejects.toMatchObject({
        reason: "private_address",
      });
    } finally {
      process.env.CALDAV_ALLOW_PRIVATE_URLS = previous;
    }
  });
});
