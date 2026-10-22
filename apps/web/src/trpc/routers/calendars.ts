import * as z from "zod";
import {
  getCalendarPreferences,
  getCalendars,
  getDefaultCalendar,
} from "@/features/calendars/data";
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
      return disconnectCalendarConnection(ctx.user.id, input.id);
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
      return setDefaultCalendar({
        userId: ctx.user.id,
        calendarId: input.calendarId,
      });
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
