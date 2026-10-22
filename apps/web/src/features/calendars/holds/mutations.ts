import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@rallly/database";
import { createLogger } from "@rallly/logger";
import { absoluteUrl } from "@rallly/utils/absolute-url";
import { after } from "next/server";
import { getTranslation } from "@/i18n/server";
import { normalizeTimeZone } from "@/lib/datetime/utils";
import { isCalendarsEnabled } from "../constants";
import { clearConnectionError, recordConnectionError } from "../mutations";
import { createConnectionService } from "../service";
import type { CalendarService } from "../types";
import type { StoredHold } from "./data";
import {
  getConnectionHolds,
  getEventPollIds,
  getHoldSyncState,
  getPollHoldUserIds,
  getUserHoldPollIds,
} from "./data";
import type { DesiredHold, ExistingHold, HoldTexts } from "./utils";
import { getDesiredHolds, mergeVotes, planHoldChanges } from "./utils";

const logger = createLogger("calendars/holds");

async function getHoldTexts(locale: string | null | undefined) {
  const { t } = await getTranslation(locale ?? "en");
  return {
    tentativeTitle: (title: string) =>
      t("calendarHoldTentativeTitle", {
        defaultValue: "Tentative: {title}",
        title,
      }),
    tentativeNote: t("calendarHoldTentativeNote", {
      defaultValue:
        "Held because you said you could make this date. It is removed once another date is chosen.",
    }),
    pollLink: (url: string) =>
      t("calendarHoldPollLink", { defaultValue: "Poll: {url}", url }),
    organizer: (name: string) =>
      t("organizedBy", { defaultValue: "Organized by {name}", name }),
  } satisfies HoldTexts;
}

const hashHold = (calendarId: string, hold: DesiredHold) =>
  createHash("sha256")
    .update(JSON.stringify({ calendarId, kind: hold.kind, event: hold.event }))
    .digest("hex");

const toCalendarRef = (calendar: {
  providerCalendarId: string;
  providerData: unknown;
}) => ({
  providerCalendarId: calendar.providerCalendarId,
  providerData: calendar.providerData,
});

/**
 * Services by connection, built once per sync, with failures recorded on the
 * connection so the settings page can say it needs attention.
 */
function createServiceCache() {
  const services = new Map<string, Promise<CalendarService | null>>();
  return {
    get(connection: { id: string; provider: string; credentialId: string }) {
      let service = services.get(connection.id);
      if (!service) {
        service = createConnectionService(connection);
        services.set(connection.id, service);
      }
      return service;
    },
  };
}

async function runOnConnection<T>(
  connectionId: string,
  task: () => Promise<T>,
): Promise<T | undefined> {
  try {
    const result = await task();
    await clearConnectionError(connectionId);
    return result;
  } catch (error) {
    await recordConnectionError(connectionId, error);
    return undefined;
  }
}

// Syncs of the same user and poll run one after another: two quick vote
// edits must not both create the same entry
const queues = new Map<string, Promise<unknown>>();

function serialize<T>(key: string, task: () => Promise<T>) {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  queues.set(key, next);
  void next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });
  return next;
}

async function removeStoredHold(
  hold: StoredHold,
  services: ReturnType<typeof createServiceCache>,
) {
  const connection = hold.providerCalendar.calendarConnection;
  const done = await runOnConnection(connection.id, async () => {
    const service = await services.get(connection);
    // Without a credential there is nothing left to reach; the row goes
    if (service) {
      await service.deleteEvent({
        calendar: toCalendarRef(hold.providerCalendar),
        externalId: hold.externalId,
        etag: hold.etag,
      });
    }
    return true;
  });
  if (done) {
    await prisma.calendarHold.deleteMany({ where: { id: hold.id } });
  }
}

/**
 * Brings the entries in one user's calendar for one poll in line with their
 * answers and the poll: placeholders for the dates they can make while the
 * poll is open, the booked date alone once it is scheduled, nothing once
 * the poll is gone. Provider failures leave the stored state as it was, so
 * the next sync tries again.
 */
export async function syncCalendarHolds({
  userId,
  pollId,
}: {
  userId: string;
  pollId: string;
}) {
  return serialize(`${userId}:${pollId}`, async () => {
    const state = await getHoldSyncState({ userId, pollId });
    const { poll, holds, calendar } = state;
    // Nothing kept and nowhere to write: the common case of a user without
    // a calendar
    if (!state.user || (holds.length === 0 && !calendar)) return;

    const userTimeZone =
      normalizeTimeZone(state.user.timeZone) ?? poll?.timeZone ?? "UTC";
    const pollUrl = absoluteUrl(`/invite/${pollId}`);
    const desired = poll
      ? getDesiredHolds({
          poll,
          votes: mergeVotes(state.votes),
          preferences: state.preferences,
          userId,
          userTimeZone,
          pollUrl,
          host: new URL(pollUrl).host,
          texts: await getHoldTexts(state.user.locale),
        })
      : [];

    const existing: ExistingHold[] = holds.map((hold) => ({
      id: hold.id,
      key: hold.optionId,
      kind: hold.kind,
      providerCalendarId: hold.providerCalendarId,
      uid: hold.uid,
      contentHash: hold.contentHash,
    }));
    const plan = planHoldChanges({
      existing,
      desired,
      calendarId: calendar?.id ?? null,
      hashOf: (hold) => hashHold(calendar?.id ?? "", hold),
    });

    if (
      plan.create.length === 0 &&
      plan.update.length === 0 &&
      plan.remove.length === 0
    ) {
      return;
    }

    const services = createServiceCache();
    const storedById = new Map(holds.map((hold) => [hold.id, hold]));

    // Removals first: a placeholder that becomes the booked date shares its
    // time with the entry about to be written
    for (const hold of plan.remove) {
      const stored = storedById.get(hold.id);
      if (stored) await removeStoredHold(stored, services);
    }

    if (!calendar) return;
    const connection = calendar.calendarConnection;
    const target = toCalendarRef(calendar);

    for (const { hold, desired: next } of plan.update) {
      const stored = storedById.get(hold.id);
      if (!stored) continue;
      await runOnConnection(connection.id, async () => {
        const service = await services.get(connection);
        if (!service) throw new Error("Credential not found");
        let written: Awaited<ReturnType<CalendarService["updateEvent"]>>;
        try {
          written = await service.updateEvent({
            calendar: target,
            externalId: stored.externalId,
            etag: stored.etag,
            event: next.event,
          });
        } catch (error) {
          // Deleted in the calendar by hand: it comes back, since the
          // answer it stands for still holds
          if ((error as { reason?: unknown })?.reason !== "not_found") {
            throw error;
          }
          written = await service.createEvent({
            calendar: target,
            event: next.event,
          });
        }
        await prisma.calendarHold.update({
          where: { id: hold.id },
          data: {
            kind: next.kind,
            externalId: written.externalId,
            etag: written.etag ?? null,
            contentHash: hashHold(calendar.id, next),
          },
        });
      });
    }

    for (const next of plan.create) {
      await runOnConnection(connection.id, async () => {
        const service = await services.get(connection);
        if (!service) throw new Error("Credential not found");
        const written = await service.createEvent({
          calendar: target,
          event: next.event,
        });
        const data = {
          kind: next.kind,
          providerCalendarId: calendar.id,
          externalId: written.externalId,
          etag: written.etag ?? null,
          uid: next.event.uid,
          contentHash: hashHold(calendar.id, next),
        };
        await prisma.calendarHold.upsert({
          where: {
            user_poll_option_unique: { userId, pollId, optionId: next.key },
          },
          create: { userId, pollId, optionId: next.key, ...data },
          update: data,
        });
      });
    }
  });
}

/** Syncs every user a change to a poll can touch. */
export async function syncPollCalendarHolds(pollId: string) {
  const userIds = await getPollHoldUserIds(pollId);
  for (const userId of userIds) {
    await syncCalendarHolds({ userId, pollId });
  }
}

/** Syncs every poll a change to a user's calendar settings can touch. */
export async function syncUserCalendarHolds(userId: string) {
  const pollIds = await getUserHoldPollIds(userId);
  for (const pollId of pollIds) {
    await syncCalendarHolds({ userId, pollId });
  }
}

/**
 * Deletes the entries kept in a connection's calendars, before the
 * connection goes and with it the means to reach them.
 */
export async function removeConnectionHolds(connectionId: string) {
  const holds = await getConnectionHolds(connectionId);
  if (holds.length === 0) return;

  const connection = await prisma.calendarConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, provider: true, credentialId: true },
  });
  if (!connection) return;

  const service = await createConnectionService(connection).catch(() => null);
  await Promise.all(
    holds.map(async (hold) => {
      try {
        await service?.deleteEvent({
          calendar: toCalendarRef(hold.providerCalendar),
          externalId: hold.externalId,
          etag: hold.etag,
        });
      } catch (error) {
        logger.warn(
          { connectionId, holdId: hold.id, error },
          "Could not delete a calendar entry before disconnecting",
        );
      }
    }),
  );
  await prisma.calendarHold.deleteMany({
    where: { id: { in: holds.map((hold) => hold.id) } },
  });
}

type HoldSyncScope =
  | { pollId: string; userId?: string }
  | { userId: string; pollId?: undefined }
  | { scheduledEventId: string };

async function runHoldSync(scope: HoldSyncScope) {
  if ("scheduledEventId" in scope) {
    for (const pollId of await getEventPollIds(scope.scheduledEventId)) {
      await syncPollCalendarHolds(pollId);
    }
    return;
  }
  if (scope.pollId && scope.userId) {
    await syncCalendarHolds({ userId: scope.userId, pollId: scope.pollId });
    return;
  }
  if (scope.pollId) {
    await syncPollCalendarHolds(scope.pollId);
    return;
  }
  if (scope.userId) {
    await syncUserCalendarHolds(scope.userId);
  }
}

/**
 * Syncs calendar entries after the response is sent, so answering a poll
 * never waits on a calendar server. Called by the mutation that changed the
 * poll, after it commits. Outside a request scope the sync runs detached.
 */
export function scheduleCalendarHoldSync(scope: HoldSyncScope) {
  if (!isCalendarsEnabled) {
    return;
  }

  const run = async () => {
    try {
      await runHoldSync(scope);
    } catch (error) {
      logger.error({ scope, error }, "Calendar entry sync failed");
    }
  };

  try {
    after(run);
  } catch {
    void run();
  }
}
