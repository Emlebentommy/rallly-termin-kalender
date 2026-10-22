"use server";

import { AppError } from "@/lib/errors/app-error";
import {
  authActionClient,
  createRateLimitMiddleware,
} from "@/lib/safe-action/server";
import { connectCalDavCalendar, updateCalendarPreferences } from "./mutations";
import { calendarPreferencesSchema, connectCalDavSchema } from "./schema";

/** Calendars belong to accounts; a guest session has none to connect. */
const accountActionClient = authActionClient.use(async ({ ctx, next }) => {
  if (ctx.user.isGuest) {
    throw new AppError({
      code: "UNAUTHORIZED",
      message: "Sign in to connect a calendar.",
    });
  }
  return next();
});

export const connectCalDavAction = accountActionClient
  .metadata({ actionName: "connect_caldav_calendar" })
  // Each attempt makes the server contact the address the user typed
  .use(
    createRateLimitMiddleware({ requests: 10, duration: "10 m", by: "user" }),
  )
  .inputSchema(connectCalDavSchema)
  .action(async ({ ctx, parsedInput }) => {
    return await connectCalDavCalendar({
      userId: ctx.user.id,
      ...parsedInput,
    });
  });

export const updateCalendarPreferencesAction = accountActionClient
  .metadata({ actionName: "update_calendar_preferences" })
  .inputSchema(calendarPreferencesSchema)
  .action(async ({ ctx, parsedInput }) => {
    await updateCalendarPreferences({ userId: ctx.user.id, ...parsedInput });
  });
