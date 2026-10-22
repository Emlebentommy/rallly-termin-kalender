import * as z from "zod";

export const credentialTypeSchema = z.enum(["oauth", "caldav"]);
export type CredentialType = z.infer<typeof credentialTypeSchema>;

export const oauthCredentialsSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.string().optional(),
  scopes: z.array(z.string()),
});

export type OAuthCredentials = z.infer<typeof oauthCredentialsSchema>;
export type Credentials = OAuthCredentials;

/** A CalDAV account: server address, user name and app password. */
export const caldavCredentialsSchema = z.object({
  serverUrl: z.string(),
  username: z.string(),
  password: z.string(),
});

export type CalDavCredentials = z.infer<typeof caldavCredentialsSchema>;
