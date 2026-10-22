import * as z from "zod";

export const connectCalDavSchema = z.object({
  serverUrl: z.string().trim().min(1).max(500),
  username: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(500),
  displayName: z.string().trim().max(100).optional(),
});

export type ConnectCalDavInput = z.infer<typeof connectCalDavSchema>;

export const calendarPreferencesSchema = z.object({
  holdsEnabled: z.boolean().optional(),
  holdIfNeedBe: z.boolean().optional(),
  autoPrefill: z.boolean().optional(),
  busyVote: z.enum(["no", "ifNeedBe"]).optional(),
});

export const pollAvailabilitySchema = z.object({
  pollId: z.string(),
  /** The viewer's zone, for floating poll times */
  timeZone: z.string().max(100).optional(),
});
