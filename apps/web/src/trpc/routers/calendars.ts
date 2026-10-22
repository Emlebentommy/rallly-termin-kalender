import * as z from "zod";
import {
  getCalendarPreferences,
  getCalendars,
  getDefaultCalendar,
  isOwnConnection,
} from "@/features/calendars/data";
import {
  removeConnectionHolds,
  scheduleCalendarHoldSync,
} from "@/features/calendars/holds/mutations";
import {
  disconnectCalendarConnection,
  setCalendarSelection,
  setDefaultCalendar,
  syncCalendars,
} from "@/features/calendars/mutations";
import { pollAvailabilitySchema } from "@/features/calendars/schema";
import { getPollAvailability } from "@/features/calendars/service";
import { privateProcedure, router } from "../trpc";

export const calendars = router({
  list: privateProcedure.query(async ({ ctx }) => {
    return getCalendars(ctx.user.id);
  }),
  preferences: privateProcedure.query(async ({ ctx }) => {
    return getCalendarPreferences(ctx.user.id);
  }),
  /**
   * The signed-in user's calendar around a poll's dates. Only ever the
   * caller's own calendar, so no poll permission is involved beyond knowing
   * its id.
   */
  pollAvailability: privateProcedure
    .input(pollAvailabilitySchema)
    .query(async ({ ctx, input }) => {
      return getPollAvailability({ userId: ctx.user.id, ...input });
    }),
  disconnect: privateProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // The entries go first, while the connection can still reach them
      if (await isOwnConnection(ctx.user.id, input.id)) {
        await removeConnectionHolds(input.id);
      }
      const result = await disconnectCalendarConnection(ctx.user.id, input.id);
      scheduleCalendarHoldSync({ userId: ctx.user.id });
      return result;
    }),
  sync: privateProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return syncCalendars({ userId: ctx.user.id, connectionId: input.id });
    }),
  getDefault: privateProcedure.query(async ({ ctx }) => {
    return getDefaultCalendar(ctx.user.id);
  }),
  setDefault: privateProcedure
    .input(z.object({ calendarId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const result = await setDefaultCalendar({
        userId: ctx.user.id,
        calendarId: input.calendarId,
      });
      // Entries move to the new calendar
      scheduleCalendarHoldSync({ userId: ctx.user.id });
      return result;
    }),
  setSelection: privateProcedure
    .input(
      z.object({
        calendarId: z.string(),
        isSelected: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return setCalendarSelection({
        userId: ctx.user.id,
        calendarId: input.calendarId,
        isSelected: input.isSelected,
      });
    }),
});
