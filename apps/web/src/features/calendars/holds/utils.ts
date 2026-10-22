import { instantToWallTime, wallTimeToInstant } from "@/lib/datetime/wall-time";
import type { CalendarEventInput } from "../types";
import { getOptionTimes } from "../utils";

/** The hold key of the booked date's entry, in place of an option id. */
export const CONFIRMED_HOLD_KEY = "scheduled";

type VoteType = "yes" | "ifNeedBe" | "no";

export type HoldPoll = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  timeZone: string | null;
  status: "open" | "closed" | "scheduled" | "canceled";
  deleted: boolean;
  organizerName: string | null;
  /** What the poll says about the call before a link is minted */
  conferencing: { label: string; uri?: string } | null;
  options: { id: string; startTime: Date; duration: number }[];
  /** The option the organizer booked, when known */
  chosenOptionId: string | null;
  scheduledEvent: {
    uid: string;
    title: string;
    description: string | null;
    location: string | null;
    conferencingUri: string | null;
    start: Date;
    end: Date;
    allDay: boolean;
    timeZone: string | null;
    canceled: boolean;
  } | null;
};

export type HoldTexts = {
  tentativeTitle: (title: string) => string;
  /** Opening line of a placeholder, saying why it is there */
  tentativeNote: string;
  pollLink: (url: string) => string;
  organizer: (name: string) => string;
};

export type DesiredHold = {
  /** An option id, or CONFIRMED_HOLD_KEY for the booked date */
  key: string;
  kind: "tentative" | "confirmed";
  event: CalendarEventInput;
};

/**
 * A user's answer per option across their responses to a poll: someone who
 * answered twice is taken at their most committal answer.
 */
export function mergeVotes(votes: { optionId: string; type: VoteType }[]) {
  const rank = { yes: 0, ifNeedBe: 1, no: 2 } as const;
  const merged = new Map<string, VoteType>();
  for (const vote of votes) {
    const current = merged.get(vote.optionId);
    if (!current || rank[vote.type] < rank[current]) {
      merged.set(vote.optionId, vote.type);
    }
  }
  return merged;
}

export function getHoldUid({
  optionId,
  userId,
  host,
}: {
  optionId: string;
  userId: string;
  host: string;
}) {
  return `hold-${optionId}-${userId}@${host}`;
}

const joinBlocks = (blocks: Array<string | null | undefined | false>) =>
  blocks
    .map((block) => (block || "").trim())
    .filter(Boolean)
    .join("\n\n");

/**
 * The entries a user should have in their calendar for a poll: a
 * placeholder for every upcoming option they said yes to (and "if need be",
 * when they want those too) while the poll is undecided; once a date is
 * booked, only that date, if they can make it.
 */
export function getDesiredHolds({
  poll,
  votes,
  preferences,
  userId,
  userTimeZone,
  pollUrl,
  host,
  texts,
  now = new Date(),
}: {
  poll: HoldPoll;
  votes: Map<string, VoteType>;
  preferences: { holdsEnabled: boolean; holdIfNeedBe: boolean };
  userId: string;
  userTimeZone: string;
  pollUrl: string;
  host: string;
  texts: HoldTexts;
  now?: Date;
}): DesiredHold[] {
  if (!preferences.holdsEnabled || poll.deleted || poll.status === "canceled") {
    return [];
  }

  const footer = [
    texts.pollLink(pollUrl),
    poll.organizerName ? texts.organizer(poll.organizerName) : null,
  ]
    .filter(Boolean)
    .join("\n");

  if (poll.status === "scheduled") {
    const event = poll.scheduledEvent;
    if (!event || event.canceled) return [];

    const answer = poll.chosenOptionId
      ? votes.get(poll.chosenOptionId)
      : undefined;
    if (answer !== "yes" && answer !== "ifNeedBe") return [];

    // A time without a zone is a wall time, read in the user's zone as the
    // poll page shows it
    const floating = !event.allDay && !event.timeZone;
    const start = floating
      ? wallTimeToInstant(instantToWallTime(event.start, "UTC"), userTimeZone)
      : event.start;
    const end = floating
      ? new Date(
          start.getTime() + (event.end.getTime() - event.start.getTime()),
        )
      : event.end;

    return [
      {
        key: CONFIRMED_HOLD_KEY,
        kind: "confirmed",
        event: {
          uid: event.uid,
          title: event.title,
          description: joinBlocks([
            event.description,
            event.conferencingUri,
            footer,
          ]),
          location: event.location || event.conferencingUri || undefined,
          url: pollUrl,
          start,
          end,
          allDay: event.allDay,
          timeZone: event.timeZone ?? undefined,
          status: "confirmed",
        },
      },
    ];
  }

  const call = poll.conferencing
    ? [poll.conferencing.label, poll.conferencing.uri]
        .filter(Boolean)
        .join(": ")
    : null;

  return poll.options.flatMap((option): DesiredHold[] => {
    const answer = votes.get(option.id);
    const wanted =
      answer === "yes" || (answer === "ifNeedBe" && preferences.holdIfNeedBe);
    if (!wanted) return [];

    const times = getOptionTimes({
      startTime: option.startTime,
      duration: option.duration,
      pollTimeZone: poll.timeZone,
      userTimeZone,
    });
    // Past dates need no placeholder any more
    if (times.end <= now) return [];

    return [
      {
        key: option.id,
        kind: "tentative",
        event: {
          uid: getHoldUid({ optionId: option.id, userId, host }),
          title: texts.tentativeTitle(poll.title),
          description: joinBlocks([
            texts.tentativeNote,
            poll.description,
            call,
            footer,
          ]),
          location: poll.location || undefined,
          url: pollUrl,
          start: times.entryStart,
          end: times.entryEnd,
          allDay: times.allDay,
          timeZone: poll.timeZone ?? undefined,
          status: "tentative",
        },
      },
    ];
  });
}

export type ExistingHold = {
  id: string;
  key: string;
  kind: "tentative" | "confirmed";
  providerCalendarId: string;
  uid: string;
  contentHash: string;
};

export type HoldPlan = {
  create: DesiredHold[];
  update: { hold: ExistingHold; desired: DesiredHold }[];
  remove: ExistingHold[];
};

/**
 * What to write to bring a calendar in line. An entry in another calendar
 * than the current destination moves (removed there, created here); one
 * whose UID changes, a placeholder becoming the booked date, is replaced,
 * since calendars do not let an entry change its UID.
 */
export function planHoldChanges({
  existing,
  desired,
  calendarId,
  hashOf,
}: {
  existing: ExistingHold[];
  desired: DesiredHold[];
  /** The destination calendar, or null when there is none to write to */
  calendarId: string | null;
  hashOf: (hold: DesiredHold) => string;
}): HoldPlan {
  const plan: HoldPlan = { create: [], update: [], remove: [] };
  const wanted = calendarId ? desired : [];
  const byKey = new Map(existing.map((hold) => [hold.key, hold]));

  for (const hold of wanted) {
    const current = byKey.get(hold.key);
    byKey.delete(hold.key);
    if (
      !current ||
      current.providerCalendarId !== calendarId ||
      current.uid !== hold.event.uid
    ) {
      if (current) plan.remove.push(current);
      plan.create.push(hold);
      continue;
    }
    if (current.contentHash !== hashOf(hold) || current.kind !== hold.kind) {
      plan.update.push({ hold: current, desired: hold });
    }
  }

  plan.remove.push(...byKey.values());
  return plan;
}
