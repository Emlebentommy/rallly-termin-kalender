import "server-only";

import { prisma } from "@rallly/database";
import { decrypt } from "@rallly/utils/encryption";
import { env } from "@/env";
import type {
  CalDavCredentials,
  OAuthCredentials,
} from "@/features/credentials/schema";
import {
  caldavCredentialsSchema,
  oauthCredentialsSchema,
} from "@/features/credentials/schema";

interface BaseCredentialsInfo {
  id: string;
  provider: string;
}

interface OAuthCredentialsInfo extends BaseCredentialsInfo {
  type: "oauth";
  secret: OAuthCredentials;
  scopes: string[];
  expiresAt: Date | undefined;
}

type CredentialsInfo = OAuthCredentialsInfo;

export const loadCredential = async (
  credentialId: string,
): Promise<CredentialsInfo | null> => {
  const credential = await prisma.credential.findUnique({
    where: {
      id: credentialId,
    },
  });

  if (!credential) {
    return null;
  }

  switch (credential.type) {
    case "OAUTH":
      return {
        id: credential.id,
        type: "oauth",
        provider: credential.provider,
        secret: oauthCredentialsSchema.parse(
          JSON.parse(decrypt(credential.secret, env.SECRET_PASSWORD)),
        ),
        scopes: credential.scopes,
        expiresAt: credential.expiresAt ?? undefined,
      };
    default:
      return null;
  }
};

/** A CalDAV credential, decrypted; null for any other type. */
export const loadCalDavCredential = async (
  credentialId: string,
): Promise<{ id: string; secret: CalDavCredentials } | null> => {
  const credential = await prisma.credential.findUnique({
    where: { id: credentialId },
  });

  if (!credential || credential.type !== "CALDAV") {
    return null;
  }

  return {
    id: credential.id,
    secret: caldavCredentialsSchema.parse(
      JSON.parse(decrypt(credential.secret, env.SECRET_PASSWORD)),
    ),
  };
};
