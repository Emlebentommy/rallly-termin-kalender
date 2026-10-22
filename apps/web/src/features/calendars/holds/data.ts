import "server-only";

import { prisma } from "@rallly/database";
import {
  parseConferencing,
  parsePollConferencing,
} from "@/features/conferencing/data";
import { getConferencingUri } from "@/features/conferencing/utils";
import { getCalendarPreferences, getHoldCalendar } from "../data";
import type { HoldPoll } from "./utils";

const providerLabels = {
  meet: "Google Meet",
  zoom: "Zoom",
  teams: "Microsoft Teams",
  webex: "Webex",
} as const;

function locationText(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const address = (raw as { address?: unknown }).address;
  return typeof address === "string" && address ? address : null;
}

/** A poll as the calendar entries of its participants describe it. */
async function getHoldPoll(pollId: string): Promise<HoldPoll | null> {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    select: {
      id: true,
      title: true,
      description: true,
      location: true,
      timeZone: true,
      status: true,
      deleted: true,
      conferencing: true,
      user: { select: { name: true } },
      options: {
        select: { id: true, startTime: true, duration: true },
        orderBy: { startTime: "asc" },
      },
      scheduledEvent: {
        select: {
          id: true,
          uid: true,
          title: true,
          description: true,
          location: true,
          conferencing: true,
          start: true,
          end: true,
          allDay: true,
          timeZone: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });
  if (!poll) return null;

  // The booked option is only recorded with the activity that booked it
  const scheduled = poll.scheduledEvent
    ? await prisma.pollActivity.findFirst({
        where: { pollId, type: "poll_scheduled" },
        orderBy: { createdAt: "desc" },
        select: { optionId: true },
      })
    : null;

  const conferencing = parsePollConferencing(poll.conferencing, {
    pollId: poll.id,
  });
  const event = poll.scheduledEvent;
  const eventConferencing = event
    ? parseConferencing(event.conferencing, { scheduledEventId: event.id })
    : null;

  return {
    id: poll.id,
    title: poll.title,
    description: poll.description,
    location: poll.location,
    timeZone: poll.timeZone,
    status: poll.status,
    deleted: poll.deleted,
    organizerName: poll.user?.name ?? null,
    conferencing: conferencing
      ? conferencing.provider === "custom"
        ? { label: conferencing.label, uri: conferencing.uri }
        : { label: providerLabels[conferencing.provider] }
      : null,
    options: poll.options,
    chosenOptionId: scheduled?.optionId ?? null,
    scheduledEvent: event
      ? {
          uid: event.uid,
          title: event.title,
          description: event.description,
          location: locationText(event.location),
          conferencingUri: eventConferencing
            ? getConferencingUri(eventConferencing)
            : null,
          start: event.start,
          end: event.end,
          allDay: event.allDay,
          timeZone: event.timeZone,
          canceled: event.status === "canceled" || event.deletedAt !== null,
        }
      : null,
  };
}

/** Everything one sync of a user's entries for a poll works from. */
export async function getHoldSyncState({
  userId,
  pollId,
}: {
  userId: string;
  pollId: string;
}) {
  const [poll, user, votes, holds, preferences, calendar] = await Promise.all([
    getHoldPoll(pollId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { timeZone: true, locale: true },
    }),
    prisma.vote.findMany({
      where: { pollId, participant: { userId } },
      select: { optionId: true, type: true },
    }),
    prisma.calendarHold.findMany({
      where: { userId, pollId },
      select: {
        id: true,
        optionId: true,
        kind: true,
        uid: true,
        externalId: true,
        etag: true,
        contentHash: true,
        providerCalendarId: true,
        providerCalendar: {
          select: {
            providerCalendarId: true,
            providerData: true,
            calendarConnection: {
              select: { id: true, provider: true, credentialId: true },
            },
          },
        },
      },
    }),
    getCalendarPreferences(userId),
    getHoldCalendar(userId),
  ]);

  return { poll, user, votes, holds, preferences, calendar };
}

export type HoldSyncState = Awaited<ReturnType<typeof getHoldSyncState>>;
export type StoredHold = HoldSyncState["holds"][number];

/**
 * The users whose calendars a change to a poll can touch: those who
 * answered it signed in with a calendar connected, and those it already
 * has entries for.
 */
export async function getPollHoldUserIds(pollId: string) {
  const [participants, holds] = await Promise.all([
    prisma.participant.findMany({
      where: {
        pollId,
        userId: { not: null },
        user: { calendarConnections: { some: {} } },
      },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.calendarHold.findMany({
      where: { pollId },
      select: { userId: true },
      distinct: ["userId"],
    }),
  ]);
  return Array.from(
    new Set([
      ...participants.flatMap((p) => (p.userId ? [p.userId] : [])),
      ...holds.map((h) => h.userId),
    ]),
  );
}

/**
 * The polls a change to a user's calendar settings can touch: those with
 * entries, and those still undecided or upcoming that the user answered.
 */
export async function getUserHoldPollIds(userId: string, now = new Date()) {
  const [participants, holds] = await Promise.all([
    prisma.participant.findMany({
      where: {
        userId,
        poll: {
          deleted: false,
          status: { in: ["open", "closed", "scheduled"] },
          options: {
            some: { startTime: { gte: new Date(now.getTime() - 86_400_000) } },
          },
        },
      },
      select: { pollId: true },
      distinct: ["pollId"],
    }),
    prisma.calendarHold.findMany({
      where: { userId },
      select: { pollId: true },
      distinct: ["pollId"],
    }),
  ]);
  return Array.from(
    new Set([
      ...participants.map((p) => p.pollId),
      ...holds.map((h) => h.pollId),
    ]),
  );
}

/** The polls booked as an event, whose entries follow the event. */
export async function getEventPollIds(scheduledEventId: string) {
  const polls = await prisma.poll.findMany({
    where: { scheduledEventId },
    select: { id: true },
  });
  return polls.map((poll) => poll.id);
}

/** The entries kept in the calendars of one connection. */
export async function getConnectionHolds(connectionId: string) {
  return await prisma.calendarHold.findMany({
    where: { providerCalendar: { calendarConnectionId: connectionId } },
    select: {
      id: true,
      externalId: true,
      etag: true,
      providerCalendar: {
        select: { providerCalendarId: true, providerData: true },
      },
    },
  });
}
