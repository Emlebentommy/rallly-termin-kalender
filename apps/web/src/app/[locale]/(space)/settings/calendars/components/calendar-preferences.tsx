"use client";

import { mutationOptions } from "@next-safe-action/adapter-tanstack-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@rallly/ui/select";
import { Switch } from "@rallly/ui/switch";
import { useMutation } from "@tanstack/react-query";
import type React from "react";
import { updateCalendarPreferencesAction } from "@/features/calendars/actions";
import { Trans, useTranslation } from "@/i18n/client";
import { trpc } from "@/trpc/client";

function PreferenceRow({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: React.ReactNode;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-x-6">
      <div className="space-y-1">
        <label htmlFor={id} className="font-medium text-sm">
          {title}
        </label>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

/** How the user's calendar takes part in the polls they answer. */
export function CalendarPreferences() {
  const { t } = useTranslation();
  const { data: preferences } = trpc.calendars.preferences.useQuery();
  const update = useMutation(mutationOptions(updateCalendarPreferencesAction));
  const utils = trpc.useUtils();

  if (!preferences) return null;

  const set = (patch: Partial<typeof preferences>) => {
    // Shown at once; the blanket invalidation after the write confirms it
    utils.calendars.preferences.setData(undefined, {
      ...preferences,
      ...patch,
    });
    update.mutate(patch);
  };

  return (
    <div className="space-y-5">
      <PreferenceRow
        id="holds-enabled"
        title={
          <Trans
            i18nKey="calendarHoldsEnabled"
            defaults="Add tentative entries when I answer"
          />
        }
        description={
          <Trans
            i18nKey="calendarHoldsEnabledDescription"
            defaults="Every date you say yes to is held in your calendar. Once the organizer picks a date, only that entry stays and becomes confirmed; the others are removed."
          />
        }
      >
        <Switch
          id="holds-enabled"
          checked={preferences.holdsEnabled}
          onCheckedChange={(checked) => set({ holdsEnabled: checked })}
        />
      </PreferenceRow>
      <PreferenceRow
        id="hold-if-need-be"
        title={
          <Trans
            i18nKey="calendarHoldIfNeedBe"
            defaults="Also hold “if need be” dates"
          />
        }
        description={
          <Trans
            i18nKey="calendarHoldIfNeedBeDescription"
            defaults="Keeps those dates free for you as well."
          />
        }
      >
        <Switch
          id="hold-if-need-be"
          checked={preferences.holdIfNeedBe}
          disabled={!preferences.holdsEnabled}
          onCheckedChange={(checked) => set({ holdIfNeedBe: checked })}
        />
      </PreferenceRow>
      <PreferenceRow
        id="auto-prefill"
        title={
          <Trans
            i18nKey="calendarAutoPrefill"
            defaults="Pre-fill my answers from my calendar"
          />
        }
        description={
          <Trans
            i18nKey="calendarAutoPrefillDescription"
            defaults="When you answer a poll, your answers start from your calendar: yes where you are free, the answer below where you are busy. You can change every answer before you submit."
          />
        }
      >
        <Switch
          id="auto-prefill"
          checked={preferences.autoPrefill}
          onCheckedChange={(checked) => set({ autoPrefill: checked })}
        />
      </PreferenceRow>
      <PreferenceRow
        id="busy-vote"
        title={
          <Trans
            i18nKey="calendarBusyVote"
            defaults="Suggested answer when I'm busy"
          />
        }
        description={
          <Trans
            i18nKey="calendarBusyVoteDescription"
            defaults="Used for dates that clash with an event in your calendar."
          />
        }
      >
        <Select
          items={{
            no: t("no", { defaultValue: "No" }),
            ifNeedBe: t("ifNeedBe", { defaultValue: "If need be" }),
          }}
          value={preferences.busyVote}
          onValueChange={(value) => {
            if (value === "no" || value === "ifNeedBe") {
              set({ busyVote: value });
            }
          }}
        >
          <SelectTrigger id="busy-vote" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="no">
              <Trans i18nKey="no" defaults="No" />
            </SelectItem>
            <SelectItem value="ifNeedBe">
              <Trans i18nKey="ifNeedBe" defaults="If need be" />
            </SelectItem>
          </SelectContent>
        </Select>
      </PreferenceRow>
    </div>
  );
}
