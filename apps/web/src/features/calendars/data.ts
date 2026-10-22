import "server-only";

import { prisma } from "@rallly/database";
import { DEFAULT_CALENDAR_PREFERENCES } from "./constants";

export const getCalendars = async (userId: string) => {
  return await prisma.calendarConnection.findMany({
    where: {
      userId,
    },
    select: {
      id: true,
      displayName: true,
      email: true,
      provider: true,
      integrationId: true,
      errorMessage: true,
      errorAt: true,
      providerCalendars: {
        where: {
          isDeleted: false,
        },
        select: {
          id: true,
          name: true,
          isSelected: true,
          isWritable: true,
        },
        orderBy: {
          name: "asc",
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
};

export const getDefaultCalendar = async (userId: string) => {
  return await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultDestinationCalendarId: true },
  });
};

export const getCalendarPreferences = async (userId: string) => {
  const preferences = await prisma.calendarPreferences.findUnique({
    where: { userId },
    select: {
      holdsEnabled: true,
      holdIfNeedBe: true,
      autoPrefill: true,
      busyVote: true,
    },
  });
  return {
    ...DEFAULT_CALENDAR_PREFERENCES,
    ...preferences,
    busyVote:
      preferences?.busyVote === "ifNeedBe"
        ? ("ifNeedBe" as const)
        : ("no" as const),
  };
};

/**
 * Everything needed to read a user's calendars: the selected calendars of
 * every connection, with the credential reference to build the service.
 */
export const getConflictCalendars = async (userId: string) => {
  return await prisma.calendarConnection.findMany({
    where: { userId },
    select: {
      id: true,
      provider: true,
      credentialId: true,
      displayName: true,
      providerCalendars: {
        where: { isDeleted: false, isSelected: true },
        select: {
          id: true,
          name: true,
          providerCalendarId: true,
          providerData: true,
        },
      },
    },
  });
};

/** The calendar new entries go into, with what is needed to write there. */
export const getHoldCalendar = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      defaultDestinationCalendar: {
        select: {
          id: true,
          name: true,
          providerCalendarId: true,
          providerData: true,
          isWritable: true,
          isDeleted: true,
          calendarConnection: {
            select: { id: true, provider: true, credentialId: true },
          },
        },
      },
    },
  });
  const calendar = user?.defaultDestinationCalendar;
  return calendar?.isWritable && !calendar.isDeleted ? calendar : null;
};

export const isOwnConnection = async (userId: string, connectionId: string) => {
  const count = await prisma.calendarConnection.count({
    where: { id: connectionId, userId },
  });
  return count > 0;
};

export const hasCalendarConnection = async (userId: string) => {
  const count = await prisma.calendarConnection.count({ where: { userId } });
  return count > 0;
};

/** The options of a poll, for reading calendars around them. */
export const getPollOptionsForCalendar = async (pollId: string) => {
  return await prisma.poll.findFirst({
    where: { id: pollId, deleted: false },
    select: {
      id: true,
      timeZone: true,
      allowTentativeVotes: true,
      options: {
        select: { id: true, startTime: true, duration: true },
        orderBy: { startTime: "asc" },
      },
    },
  });
};

/** Every entry the app keeps in the user's calendars, across polls. */
export const getUserCalendarHolds = async (userId: string) => {
  return await prisma.calendarHold.findMany({
    where: { userId },
    select: {
      pollId: true,
      optionId: true,
      kind: true,
      uid: true,
      externalId: true,
    },
  });
};

export const getUserTimeZone = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timeZone: true },
  });
  return user?.timeZone ?? null;
};
