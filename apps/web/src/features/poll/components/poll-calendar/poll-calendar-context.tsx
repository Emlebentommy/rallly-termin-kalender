"use client";

import React from "react";
import type { PollAvailability } from "@/features/calendars/service";
import type { OptionAvailability } from "@/features/calendars/utils";
import { usePoll } from "@/features/poll/client";
import { useVotingForm } from "@/features/poll/components/voting-form";
import { useUser } from "@/features/user/client";
import { useDateTimeConfig } from "@/lib/datetime/client";
import { useFeatureFlag } from "@/lib/feature-flags/client";
import { getBrowserTimeZone } from "@/lib/utils/date-time-utils";
import { trpc } from "@/trpc/client";

type PollCalendarStatus =
  | "disabled"
  | "signedOut"
  | "loading"
  | "notConnected"
  | "ready";

type PollCalendarValue = {
  status: PollCalendarStatus;
  availability: PollAvailability | null;
  getOption: (optionId: string) => OptionAvailability | undefined;
  /** Whether the voting form is open for answers */
  canApply: boolean;
  /** Sets every answer to what the calendar suggests */
  applySuggestions: () => void;
  /** Answers were filled in from the calendar and not yet submitted */
  prefilled: boolean;
};

const PollCalendarContext = React.createContext<PollCalendarValue>({
  status: "disabled",
  availability: null,
  getOption: () => undefined,
  canApply: false,
  applySuggestions: () => {},
  prefilled: false,
});

export const usePollCalendar = () => React.useContext(PollCalendarContext);

/**
 * What the viewer's own calendar says about the poll's options. Lives inside
 * the voting form so suggestions can be written into the answers: when the
 * viewer starts a new response and wants it, empty answers are pre-filled
 * from the calendar, and they can be changed freely before submitting.
 */
export function PollCalendarProvider({ children }: React.PropsWithChildren) {
  const poll = usePoll();
  const { user } = useUser();
  const enabled = useFeatureFlag("calendars");
  const { timeZone } = useDateTimeConfig();
  const signedIn = Boolean(user && !user.isGuest);

  const query = trpc.calendars.pollAvailability.useQuery(
    { pollId: poll.id, timeZone: timeZone ?? getBrowserTimeZone() },
    {
      enabled: enabled && signedIn,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  );
  const availability = query.data ?? null;

  const status: PollCalendarStatus = !enabled
    ? "disabled"
    : !signedIn
      ? "signedOut"
      : query.isPending
        ? "loading"
        : !availability
          ? "disabled"
          : availability.connected
            ? "ready"
            : "notConnected";

  const form = useVotingForm();
  const mode = form.watch("mode");
  const canApply = mode === "new" || mode === "edit";
  const [prefilled, setPrefilled] = React.useState(false);

  const byOption = React.useMemo(
    () =>
      new Map(
        (availability?.options ?? []).map((option) => [
          option.optionId,
          option,
        ]),
      ),
    [availability],
  );

  const fill = React.useCallback(
    (onlyEmpty: boolean) => {
      const votes = form.getValues("votes");
      let changed = false;
      poll.options.forEach((option, index) => {
        const suggestion = byOption.get(option.id)?.suggestion;
        if (!suggestion) return;
        if (onlyEmpty && votes[index]?.type) return;
        form.setValue(
          `votes.${index}`,
          { optionId: option.id, type: suggestion },
          { shouldDirty: true },
        );
        changed = true;
      });
      if (changed) setPrefilled(true);
    },
    [byOption, form, poll.options],
  );

  // Pre-fills once per new response, so answers the user clears stay clear
  const autoFilled = React.useRef(false);
  React.useEffect(() => {
    if (mode !== "new") {
      autoFilled.current = false;
      if (mode === "view") setPrefilled(false);
      return;
    }
    if (
      autoFilled.current ||
      !availability?.connected ||
      !availability.preferences.autoPrefill
    ) {
      return;
    }
    autoFilled.current = true;
    fill(true);
  }, [mode, availability, fill]);

  const value = React.useMemo<PollCalendarValue>(
    () => ({
      status,
      availability,
      getOption: (optionId) => byOption.get(optionId),
      canApply,
      applySuggestions: () => fill(false),
      prefilled,
    }),
    [status, availability, byOption, canApply, fill, prefilled],
  );

  return (
    <PollCalendarContext.Provider value={value}>
      {children}
    </PollCalendarContext.Provider>
  );
}
