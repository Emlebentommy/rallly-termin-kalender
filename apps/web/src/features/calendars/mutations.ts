import "server-only";

import { prisma } from "@rallly/database";
import { createLogger } from "@rallly/logger";
import {
  CalDavCalendarService,
  CalDavError,
} from "@/features/calendars/caldav/service";
import { saveCalDavCredentials } from "@/features/credentials/mutations";
import type { UserInfo } from "@/lib/oauth/types";
import { createConnectionService } from "./service";
import type { CalendarInfo } from "./types";

const logger = createLogger("calendars");

export const createCalendarConnection = async (params: {
  userId: string;
  provider: string;
  providerAccountId: string;
  integrationId: string;
  credentialId: string;
  displayName: string;
  userInfo: UserInfo;
}) => {
  const {
    userId,
    provider,
    credentialId,
    integrationId,
    providerAccountId,
    userInfo,
  } = params;

  const connection = await prisma.calendarConnection.upsert({
    where: {
      user_provider_account_unique: {
        userId,
        provider,
        providerAccountId,
      },
    },
    create: {
      userId,
      provider,
      integrationId,
      credentialId,
      providerAccountId,
      email: userInfo.email,
      displayName: params.displayName,
    },
    update: {
      credentialId,
      email: userInfo.email,
    },
  });

  return connection;
};

export const disconnectCalendarConnection = async (
  userId: string,
  id: string,
) => {
  const connection = await prisma.calendarConnection.findFirst({
    where: { id, userId },
    select: { id: true, credentialId: true },
  });

  if (!connection) {
    return {
      success: false,
      error: "Calendar connection not found" as const,
    };
  }

  // A Google credential can also back a Google Meet connection on the same
  // account, so the credential goes only once nothing references it.
  const [deleted] = await prisma.$transaction([
    prisma.calendarConnection.delete({ where: { id: connection.id } }),
    prisma.credential.deleteMany({
      where: {
        id: connection.credentialId,
        calendarConnections: { none: {} },
        conferencingConnections: { none: {} },
      },
    }),
  ]);

  return deleted;
};

/**
 * Syncs calendars from the provider, including detection of deleted calendars.
 * When a calendar is deleted on Google, it will be marked as deleted in our database.
 */
export const syncCalendars = async ({
  userId,
  connectionId,
}: {
  userId: string;
  connectionId: string;
}) => {
  const connection = await prisma.calendarConnection.findFirst({
    where: { id: connectionId, userId },
  });

  if (!connection) {
    return {
      success: false,
      error: "Calendar connection not found" as const,
    };
  }

  const calendarService = await createConnectionService(connection);

  if (!calendarService) {
    return {
      success: false,
      error: "Credential not found" as const,
    };
  }

  let calendars: CalendarInfo[];
  try {
    calendars = await calendarService.listCalendars();
  } catch (error) {
    await recordConnectionError(connection.id, error);
    return { success: false, error: "Provider request failed" as const };
  }
  await clearConnectionError(connection.id);

  await prisma.$transaction(async (tx) => {
    // Get current calendar IDs from the provider response
    const providerCalendarIds = calendars.map((cal) => cal.id);

    // Mark any calendars not in the response as deleted
    // (This handles calendars deleted from Google that aren't returned even with showDeleted=true)
    const deletedCalendars = await tx.providerCalendar.findMany({
      where: {
        calendarConnectionId: connection.id,
        providerCalendarId: {
          notIn: providerCalendarIds,
        },
        isDeleted: false,
      },
      select: { id: true },
    });

    if (deletedCalendars.length > 0) {
      const deletedCalendarIds = deletedCalendars.map((cal) => cal.id);

      // Clear any users who have a deleted calendar as their default destination
      await tx.user.updateMany({
        where: {
          defaultDestinationCalendarId: {
            in: deletedCalendarIds,
          },
        },
        data: {
          defaultDestinationCalendarId: null,
        },
      });

      await tx.providerCalendar.updateMany({
        where: { id: { in: deletedCalendarIds } },
        data: { isDeleted: true, lastSyncedAt: new Date() },
      });
    }

    // Upsert calendars from the provider response
    for (const calendar of calendars) {
      await tx.providerCalendar.upsert({
        where: {
          connection_calendar_unique: {
            calendarConnectionId: connection.id,
            providerCalendarId: calendar.id,
          },
        },
        create: {
          calendarConnectionId: connection.id,
          providerCalendarId: calendar.id,
          name: calendar.name,
          timeZone: calendar.timeZone,
          isPrimary: calendar.isPrimary,
          isSelected: calendar.isSelected,
          isDeleted: calendar.isDeleted ?? false,
          isWritable: calendar.isWritable,
          providerData: calendar._rawData,
        },
        update: {
          // Only update provider-controlled fields, preserve user customizations
          name: calendar.name,
          timeZone: calendar.timeZone,
          isPrimary: calendar.isPrimary,
          isDeleted: calendar.isDeleted ?? false,
          isWritable: calendar.isWritable,
          lastSyncedAt: new Date(),
          providerData: calendar._rawData,
        },
      });
    }
  });

  return { success: true };
};

export const setCalendarSelection = async (params: {
  userId: string;
  calendarId: string;
  isSelected: boolean;
}) => {
  const { userId, calendarId, isSelected } = params;

  const calendar = await prisma.providerCalendar.findFirst({
    where: { id: calendarId, calendarConnection: { userId } },
  });

  if (!calendar) {
    return { success: false, error: "Calendar not found" as const };
  }

  await prisma.providerCalendar.update({
    where: { id: calendarId },
    data: {
      isSelected,
    },
  });

  return { success: true };
};

export const setDefaultCalendar = async ({
  userId,
  calendarId,
}: {
  userId: string;
  calendarId: string | null;
}) => {
  if (calendarId) {
    const calendar = await prisma.providerCalendar.findFirst({
      where: { id: calendarId },
      select: {
        calendarConnectionId: true,
        calendarConnection: {
          select: { userId: true },
        },
      },
    });

    if (!calendar) {
      return { success: false, error: "Calendar not found" as const };
    }

    if (calendar.calendarConnection.userId !== userId) {
      return {
        success: false,
        error: "Calendar does not belong to user" as const,
      };
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { defaultDestinationCalendarId: calendarId },
  });

  return { success: true };
};

/**
 * Remembers that a provider call failed, so the settings page can say the
 * connection needs attention (an expired app password, a revoked grant)
 * instead of conflicts and entries silently going missing.
 */
export async function recordConnectionError(
  connectionId: string,
  error: unknown,
) {
  const reason = (error as { reason?: unknown })?.reason;
  const message =
    reason === "unauthorized"
      ? "unauthorized"
      : error instanceof Error
        ? error.message.slice(0, 300)
        : "error";
  logger.warn(
    { connectionId, reason, message },
    "Calendar provider request failed",
  );
  await prisma.calendarConnection.updateMany({
    where: { id: connectionId },
    data: { errorMessage: message, errorAt: new Date() },
  });
}

export async function clearConnectionError(connectionId: string) {
  await prisma.calendarConnection.updateMany({
    where: { id: connectionId, errorMessage: { not: null } },
    data: { errorMessage: null, errorAt: null },
  });
}

export type ConnectCalDavResult =
  | { ok: true; connectionId: string }
  | { ok: false; reason: CalDavError["reason"] };

/**
 * Connects a CalDAV account: discovers its calendars with the given
 * credentials first, so nothing is stored for an account that does not work.
 * Calendars that can hold events are checked for conflicts by default.
 */
export async function connectCalDavCalendar({
  userId,
  serverUrl,
  username,
  password,
  displayName,
}: {
  userId: string;
  serverUrl: string;
  username: string;
  password: string;
  displayName?: string;
}): Promise<ConnectCalDavResult> {
  const credentials = { serverUrl, username, password };
  let account: Awaited<ReturnType<CalDavCalendarService["discover"]>>;
  try {
    account = await new CalDavCalendarService({ credentials }).discover();
  } catch (error) {
    if (error instanceof CalDavError) {
      return { ok: false, reason: error.reason };
    }
    throw error;
  }

  // The home URL names the account on its server; it stays stable when
  // the user types the server address differently next time
  const providerAccountId = account.homeUrl;
  const host = new URL(account.homeUrl).host;

  const credential = await saveCalDavCredentials({
    userId,
    providerAccountId,
    credentials: { ...credentials, serverUrl: account.principalUrl },
  });

  const connection = await prisma.calendarConnection.upsert({
    where: {
      user_provider_account_unique: {
        userId,
        provider: "caldav",
        providerAccountId,
      },
    },
    create: {
      userId,
      provider: "caldav",
      integrationId: "caldav",
      providerAccountId,
      credentialId: credential.id,
      email: username,
      displayName: displayName || account.displayName || host,
    },
    update: {
      credentialId: credential.id,
      email: username,
      errorMessage: null,
      errorAt: null,
      ...(displayName ? { displayName } : {}),
    },
  });

  await syncCalendars({ userId, connectionId: connection.id });
  await ensureDefaultDestinationCalendar({
    userId,
    connectionId: connection.id,
  });

  return { ok: true, connectionId: connection.id };
}

/**
 * Picks a calendar for new entries when the user has none yet: the
 * account's primary calendar if it can be written to, else the first one
 * that can.
 */
export async function ensureDefaultDestinationCalendar({
  userId,
  connectionId,
}: {
  userId: string;
  connectionId: string;
}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultDestinationCalendarId: true },
  });
  if (!user || user.defaultDestinationCalendarId) return;

  const calendar = await prisma.providerCalendar.findFirst({
    where: {
      calendarConnectionId: connectionId,
      calendarConnection: { userId },
      isWritable: true,
      isDeleted: false,
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (!calendar) return;

  await prisma.user.updateMany({
    where: { id: userId, defaultDestinationCalendarId: null },
    data: { defaultDestinationCalendarId: calendar.id },
  });
}

export async function updateCalendarPreferences({
  userId,
  ...data
}: {
  userId: string;
  holdsEnabled?: boolean;
  holdIfNeedBe?: boolean;
  autoPrefill?: boolean;
  busyVote?: "no" | "ifNeedBe";
}) {
  return await prisma.calendarPreferences.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}
