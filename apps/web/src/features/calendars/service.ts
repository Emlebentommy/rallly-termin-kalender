import "server-only";

import { CalDavCalendarService } from "@/features/calendars/caldav/service";
import { GoogleCalendarService } from "@/features/calendars/google/service";
import type { CalendarService } from "@/features/calendars/types";
import {
  loadCalDavCredential,
  loadCredential,
} from "@/features/credentials/data";
import { updateOAuthCredentialTokens } from "@/features/credentials/mutations";
import { normalizeTimeZone } from "@/lib/datetime/utils";
import { AVAILABILITY_MAX_RANGE_DAYS } from "./constants";
import {
  getCalendarPreferences,
  getConflictCalendars,
  getPollOptionsForCalendar,
  getUserCalendarHolds,
  getUserTimeZone,
} from "./data";
import { clearConnectionError, recordConnectionError } from "./mutations";
import type { AvailabilityEvent, OptionAvailability } from "./utils";
import {
  computeOptionAvailability,
  getAvailabilityRange,
  getOptionTimes,
  tagHolds,
} from "./utils";

type CalendarServiceProvider = {
  provider: string;
  /** Decrypted secret of the connection's credential */
  credentials: unknown;
  /** The credential row, so refreshed OAuth tokens can be stored */
  credentialId?: string;
};

export const createCalendarService = async (
  service: CalendarServiceProvider,
): Promise<CalendarService> => {
  switch (service.provider) {
    case "google": {
      const { credentialId } = service;
      return new GoogleCalendarService({
        credentials: GoogleCalendarService.credentialsSchema.parse(
          service.credentials,
        ),
        onTokens: credentialId
          ? (tokens) =>
              updateOAuthCredentialTokens({ id: credentialId, tokens })
          : undefined,
      });
    }
    case "caldav":
      return new CalDavCalendarService({
        credentials: CalDavCalendarService.credentialsSchema.parse(
          service.credentials,
        ),
      });
    default:
      throw new Error(`Unsupported provider: ${service.provider}`);
  }
};

/** The service for a stored connection, or null when its credential is gone. */
export async function createConnectionService(connection: {
  provider: string;
  credentialId: string;
}) {
  if (connection.provider === "caldav") {
    const credential = await loadCalDavCredential(connection.credentialId);
    return credential
      ? createCalendarService({
          provider: "caldav",
          credentials: credential.secret,
        })
      : null;
  }

  const credential = await loadCredential(connection.credentialId);
  return credential
    ? createCalendarService({
        provider: connection.provider,
        credentials: credential.secret,
        credentialId: credential.id,
      })
    : null;
}

/**
 * The events in a user's selected calendars over a range, read from every
 * connection in parallel. A connection that fails is recorded and left out,
 * so one expired password does not hide the other calendars.
 */
export async function readCalendarEvents({
  userId,
  start,
  end,
}: {
  userId: string;
  start: Date;
  end: Date;
}) {
  const connections = await getConflictCalendars(userId);
  const failed: { connectionId: string; displayName: string | null }[] = [];

  const perConnection = await Promise.all(
    connections.map(async (connection) => {
      if (connection.providerCalendars.length === 0) return [];
      try {
        const service = await createConnectionService(connection);
        if (!service) throw new Error("Credential not found");
        const results = await Promise.all(
          connection.providerCalendars.map(async (calendar) =>
            (
              await service.listEvents({
                calendar: {
                  providerCalendarId: calendar.providerCalendarId,
                  providerData: calendar.providerData,
                },
                start,
                end,
              })
            ).map((event) => ({ ...event, calendarName: calendar.name })),
          ),
        );
        await clearConnectionError(connection.id);
        return results.flat();
      } catch (error) {
        failed.push({
          connectionId: connection.id,
          displayName: connection.displayName,
        });
        await recordConnectionError(connection.id, error);
        return [];
      }
    }),
  );

  return {
    connected: connections.length > 0,
    events: perConnection.flat(),
    failed,
  };
}

export type PollAvailability = {
  connected: boolean;
  failed: { connectionId: string; displayName: string | null }[];
  timeZone: string;
  preferences: Awaited<ReturnType<typeof getCalendarPreferences>>;
  options: OptionAvailability[];
  /** Everything in the calendars over the poll's dates, for the agenda */
  events: AvailabilityEvent[];
};

/** What a user's calendars say about the options of a poll. */
export async function getPollAvailability({
  userId,
  pollId,
  timeZone,
}: {
  userId: string;
  pollId: string;
  timeZone?: string;
}): Promise<PollAvailability | null> {
  const [poll, preferences, storedTimeZone] = await Promise.all([
    getPollOptionsForCalendar(pollId),
    getCalendarPreferences(userId),
    getUserTimeZone(userId),
  ]);
  if (!poll) return null;

  const userTimeZone =
    normalizeTimeZone(timeZone) ?? normalizeTimeZone(storedTimeZone) ?? "UTC";

  const range = getAvailabilityRange(
    poll.options.map((option) =>
      getOptionTimes({
        startTime: option.startTime,
        duration: option.duration,
        pollTimeZone: poll.timeZone,
        userTimeZone,
      }),
    ),
    AVAILABILITY_MAX_RANGE_DAYS,
  );

  const empty = {
    timeZone: userTimeZone,
    preferences,
    options: [],
    events: [],
  };
  if (!range) {
    return { ...empty, connected: false, failed: [] };
  }

  const [read, holds] = await Promise.all([
    readCalendarEvents({ userId, ...range }),
    getUserCalendarHolds(userId),
  ]);
  if (!read.connected) {
    return { ...empty, connected: false, failed: [] };
  }

  const events = tagHolds(read.events, holds, poll.id)
    .map(({ uid: _uid, externalId: _externalId, ...event }) => event)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  return {
    connected: true,
    failed: read.failed,
    timeZone: userTimeZone,
    preferences,
    events,
    options: computeOptionAvailability({
      options: poll.options,
      events,
      pollTimeZone: poll.timeZone,
      userTimeZone,
      busyVote: preferences.busyVote,
      allowTentativeVotes: poll.allowTentativeVotes,
    }),
  };
}
