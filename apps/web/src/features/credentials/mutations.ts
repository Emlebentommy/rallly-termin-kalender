import "server-only";

import { prisma } from "@rallly/database";
import { encrypt } from "@rallly/utils/encryption";
import { env } from "@/env";
import type { CalDavCredentials } from "@/features/credentials/schema";
import type { OAuthTokens } from "@/lib/oauth/types";

export async function saveOAuthCredentials({
  userId,
  provider,
  providerAccountId,
  tokens,
}: {
  userId: string;
  provider: string;
  providerAccountId: string;
  tokens: OAuthTokens;
}) {
  // check if we already have credentials for this provider/account
  const credential = await prisma.credential.findUnique({
    where: {
      user_provider_account_unique: {
        userId,
        provider,
        providerAccountId,
      },
    },
  });

  if (credential) {
    const updatedCredential = await prisma.credential.update({
      where: { id: credential.id },
      data: {
        secret: encrypt(JSON.stringify(tokens), env.SECRET_PASSWORD),
        scopes: tokens.scopes,
        expiresAt: tokens.expiresAt,
      },
    });

    return updatedCredential;
  } else {
    const credential = await prisma.credential.create({
      data: {
        type: "OAUTH",
        userId,
        provider,
        providerAccountId,
        secret: encrypt(JSON.stringify(tokens), env.SECRET_PASSWORD),
        scopes: tokens.scopes,
        expiresAt: tokens.expiresAt,
      },
    });

    return credential;
  }
}

// A refresh replaces the tokens on a credential the caller already holds.
// Persisting by id keeps the write free of any further provider call, which
// matters for providers that revoke the old refresh token on rotation.
export async function updateOAuthCredentialTokens({
  id,
  tokens,
}: {
  id: string;
  tokens: OAuthTokens;
}) {
  return await prisma.credential.update({
    where: { id },
    data: {
      secret: encrypt(JSON.stringify(tokens), env.SECRET_PASSWORD),
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
    },
  });
}

/**
 * Stores a CalDAV account's credentials, encrypted like OAuth tokens. One row
 * per account; connecting the same account again replaces the password.
 */
export async function saveCalDavCredentials({
  userId,
  providerAccountId,
  credentials,
}: {
  userId: string;
  providerAccountId: string;
  credentials: CalDavCredentials;
}) {
  const secret = encrypt(JSON.stringify(credentials), env.SECRET_PASSWORD);
  return await prisma.credential.upsert({
    where: {
      user_provider_account_unique: {
        userId,
        provider: "caldav",
        providerAccountId,
      },
    },
    create: {
      type: "CALDAV",
      userId,
      provider: "caldav",
      providerAccountId,
      secret,
      scopes: [],
    },
    update: { secret },
  });
}
