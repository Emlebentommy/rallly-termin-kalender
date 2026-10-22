import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { prisma } from "@rallly/database";
import { deleteAllMessages } from "@rallly/test-helpers";
import { createUserInDb, loginWithEmail } from "./test-utils";

/**
 * The calendar flow end to end against a real CalDAV server: connect,
 * see clashes, answer with pre-filled votes, find tentative entries in the
 * calendar, and only the booked date once the organizer finalizes.
 *
 * Needs a Radicale (or any CalDAV server) at CALDAV_TEST_URL with user
 * CALDAV_TEST_USER / CALDAV_TEST_PASSWORD; skipped without one.
 */
const serverUrl = process.env.CALDAV_TEST_URL;
const caldavUser = process.env.CALDAV_TEST_USER ?? "ben";
const caldavPassword = process.env.CALDAV_TEST_PASSWORD ?? "geheim";

const PARTICIPANT_EMAIL = "calendar-participant@rallly.co";
const ORGANIZER_EMAIL = "calendar-organizer@rallly.co";
const POLL_ID = "calendar-holds-e2e";

const auth = `Basic ${Buffer.from(`${caldavUser}:${caldavPassword}`).toString("base64")}`;
const collection = () => `${serverUrl}/${caldavUser}/termine-e2e/`;

async function dav(method: string, url: string, body?: string) {
  return fetch(url, {
    method,
    headers: {
      Authorization: auth,
      ...(body
        ? {
            "Content-Type":
              method === "PUT" ? "text/calendar" : "application/xml",
          }
        : {}),
      ...(method === "REPORT" ? { Depth: "1" } : {}),
    },
    body,
  });
}

const utc = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** The entries this app wrote into the test calendar, as raw iCalendar. */
async function appEntries() {
  const response = await dav(
    "REPORT",
    collection(),
    `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:prop-filter name="X-TERMINE-HOLD"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`,
  );
  const xml = await response.text();
  return Array.from(xml.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)).map(
    (match) => match[1] ?? "",
  );
}

// Option starts, a week out so they are upcoming wherever the run is
const day = (offset: number, hour: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
};
const optionA = day(7, 15);
const optionB = day(8, 15);

async function connectCalendar(page: Page) {
  await page.goto("/settings/calendars");
  await page.getByRole("button", { name: "Connect calendar" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Other" }).click();
  await dialog.getByLabel("Server address").fill(serverUrl ?? "");
  await dialog.getByLabel("Username").fill(caldavUser);
  await dialog.getByLabel("Password or app password").fill(caldavPassword);
  await dialog.getByRole("button", { name: "Connect calendar" }).click();
  await expect(page.getByText("Calendar connected")).toBeVisible();
}

test.describe
  .serial("Calendar entries for poll answers", () => {
    test.skip(!serverUrl, "Needs a CalDAV server at CALDAV_TEST_URL");

    test.beforeAll(async () => {
      await deleteAllMessages();
      await prisma.poll.deleteMany({ where: { id: POLL_ID } });
      await prisma.user.deleteMany({
        where: { email: { in: [PARTICIPANT_EMAIL, ORGANIZER_EMAIL] } },
      });

      // A fresh calendar, holding one event that clashes with option B
      await dav("DELETE", collection());
      const created = await dav(
        "MKCALENDAR",
        collection(),
        `<?xml version="1.0"?><c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:set><d:prop><d:displayname>Termine E2E</d:displayname></d:prop></d:set></c:mkcalendar>`,
      );
      expect(created.status).toBe(201);
      await dav(
        "PUT",
        `${collection()}clash.ics`,
        [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//e2e//EN",
          "BEGIN:VEVENT",
          "UID:clash-e2e",
          `DTSTAMP:${utc(new Date())}`,
          `DTSTART:${utc(new Date(optionB.getTime() - 30 * 60_000))}`,
          `DTEND:${utc(new Date(optionB.getTime() + 30 * 60_000))}`,
          "SUMMARY:Dentist",
          "END:VEVENT",
          "END:VCALENDAR",
          "",
        ].join("\r\n"),
      );

      const organizer = await createUserInDb({
        email: ORGANIZER_EMAIL,
        name: "Olga Organizer",
      });
      await createUserInDb({
        email: PARTICIPANT_EMAIL,
        name: "Pia Participant",
      });
      const space = await prisma.space.findFirstOrThrow({
        where: { ownerId: organizer.id },
      });
      await prisma.poll.create({
        data: {
          id: POLL_ID,
          title: "Board meeting",
          location: "Town hall",
          userId: organizer.id,
          spaceId: space.id,
          timeZone: "Europe/Berlin",
          kind: "time",
          options: {
            create: [
              { startTime: optionA, duration: 60 },
              { startTime: optionB, duration: 60 },
            ],
          },
        },
      });
    });

    test.afterAll(async () => {
      await dav("DELETE", collection());
    });

    test("answers are pre-filled from the calendar and held there", async ({
      page,
    }) => {
      await loginWithEmail(page, { email: PARTICIPANT_EMAIL });
      await connectCalendar(page);
      // The test calendar is the only one that should be read and written
      await prisma.providerCalendar.updateMany({
        where: {
          calendarConnection: { user: { email: PARTICIPANT_EMAIL } },
          providerCalendarId: { not: collection() },
        },
        data: { isSelected: false },
      });
      const target = await prisma.providerCalendar.findFirstOrThrow({
        where: { providerCalendarId: collection() },
      });
      await prisma.user.update({
        where: { email: PARTICIPANT_EMAIL },
        data: { defaultDestinationCalendarId: target.id },
      });

      await page.goto(`/invite/${POLL_ID}`);
      const statuses = page.getByTestId("option-calendar-status");
      await expect(statuses).toHaveCount(2);
      await expect(statuses.nth(0)).toHaveAttribute("data-status", "free");
      await expect(statuses.nth(1)).toHaveAttribute("data-status", "busy");
      await expect(
        page.getByText("Your answers were filled in from your calendar"),
      ).toBeVisible();

      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button", { name: "Save availability" }).click();
      await expect(
        page.getByText("Your response has been saved"),
      ).toBeVisible();

      // Yes to the free date only: one tentative entry
      await expect
        .poll(async () => (await appEntries()).length, { timeout: 15_000 })
        .toBe(1);
      const [entry] = await appEntries();
      expect(entry).toContain("SUMMARY:Tentative: Board meeting");
      expect(entry).toContain("STATUS:TENTATIVE");
      expect(entry).toContain(`DTSTART:${utc(optionA)}`);
      expect(entry).toContain("LOCATION:Town hall");
    });

    test("finalizing keeps only the booked date", async ({ page }) => {
      const participant = await prisma.participant.findFirstOrThrow({
        where: { pollId: POLL_ID },
      });
      // Yes to both dates, so whichever is booked, the participant attends
      const optionBRow = await prisma.option.findFirstOrThrow({
        where: { pollId: POLL_ID, startTime: optionB },
      });
      await prisma.vote.updateMany({
        where: { participantId: participant.id, optionId: optionBRow.id },
        data: { type: "yes" },
      });

      // The organizer was emailed about the response; the login helper
      // reads the oldest unread message
      await deleteAllMessages();
      await loginWithEmail(page, { email: ORGANIZER_EMAIL });
      await page.goto(`/poll/${POLL_ID}`);
      await page.getByRole("button", { name: "Finalize" }).click();
      await page.getByRole("dialog").getByRole("button").first().click();
      await page.getByRole("button", { name: "Next" }).click();
      await page
        .getByRole("button", { name: /Finalize and notify|Finalize/ })
        .last()
        .click();
      await expect(page.getByText("Date scheduled")).toBeVisible();

      await expect
        .poll(
          async () => {
            const entries = await appEntries();
            return entries.map((entry) =>
              entry.includes("STATUS:CONFIRMED") ? "confirmed" : "tentative",
            );
          },
          { timeout: 15_000 },
        )
        .toEqual(["confirmed"]);

      const event = await prisma.scheduledEvent.findFirstOrThrow({
        where: { polls: { some: { id: POLL_ID } } },
      });
      const [entry] = await appEntries();
      // Same UID as the invitation email, so the two merge in calendars
      expect(entry).toContain(`UID:${event.uid}`);
      expect(entry).toContain("SUMMARY:Board meeting");
      expect(entry).toContain(`/invite/${POLL_ID}`);
    });

    test("disconnecting removes the entries from the calendar", async ({
      page,
    }) => {
      await deleteAllMessages();
      await loginWithEmail(page, { email: PARTICIPANT_EMAIL });
      await page.goto("/settings/calendars");
      await page.getByRole("button", { name: "More options" }).click();
      await page.getByRole("menuitem", { name: "Disconnect calendar" }).click();
      await expect(
        page.getByText("Calendar disconnected successfully"),
      ).toBeVisible();

      expect(await appEntries()).toEqual([]);
      expect(
        await prisma.calendarHold.count({
          where: { pollId: POLL_ID },
        }),
      ).toBe(0);
    });
  });
