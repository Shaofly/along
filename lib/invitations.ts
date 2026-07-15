import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { and, eq, gt, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import {
  friendships,
  invitations,
  invitationSponsors,
  user,
} from "@/db/schema";

const invitationAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function inviteEncryptionKey() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required.");
  }
  return createHash("sha256").update(secret).digest();
}

export function createInvitationCode() {
  const bytes = randomBytes(12);
  return Array.from(bytes, (byte) => invitationAlphabet[byte % invitationAlphabet.length])
    .join("")
    .replace(/(.{4})(?=.)/g, "$1-");
}

export function encryptInvitationCode(code: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", inviteEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(code, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function decryptInvitationCode(payload: string) {
  const [ivValue, tagValue, ciphertextValue] = payload.split(".");
  if (!ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Invalid invitation payload.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    inviteEncryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function hashInvitationCode(code: string) {
  return createHash("sha256")
    .update(code.trim().toUpperCase())
    .digest("hex");
}

export async function validateInvitation(code: string, email: string) {
  const [invitation] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.codeHash, hashInvitationCode(code)),
        eq(invitations.invitedEmail, email.trim().toLowerCase()),
        eq(invitations.status, "ready"),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!invitation) {
    return null;
  }

  const confirmedSponsors = await db
    .select({ userId: invitationSponsors.userId })
    .from(invitationSponsors)
    .where(
      and(
        eq(invitationSponsors.invitationId, invitation.id),
        eq(invitationSponsors.status, "confirmed"),
      ),
    );

  if (
    confirmedSponsors.length < invitation.requiredSponsorCount ||
    confirmedSponsors.length < 2 ||
    confirmedSponsors.length > 5
  ) {
    return null;
  }

  return {
    invitation,
    sponsorIds: confirmedSponsors.map((sponsor) => sponsor.userId),
  };
}

export async function completeInvitationRegistration(
  invitationId: string,
  newUserId: string,
  sponsorIds: string[],
) {
  await db.transaction(async (transaction) => {
    const [claimed] = await transaction
      .update(invitations)
      .set({
        status: "used",
        usedAt: new Date(),
        usedById: newUserId,
      })
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.status, "ready"),
        ),
      )
      .returning({ id: invitations.id });

    if (!claimed) {
      throw new Error("Invitation was already used.");
    }

    if (sponsorIds.length > 0) {
      await transaction
        .insert(friendships)
        .values(
          sponsorIds.map((sponsorId) => {
            const [userOneId, userTwoId] = [sponsorId, newUserId].sort();
            return {
              id: randomUUID(),
              userOneId,
              userTwoId,
              sourceInvitationId: invitationId,
            };
          }),
        )
        .onConflictDoNothing();
    }
  });
}

export async function getFriends(userId: string) {
  const links = await db
    .select({
      userOneId: friendships.userOneId,
      userTwoId: friendships.userTwoId,
    })
    .from(friendships)
    .where(
      or(
        eq(friendships.userOneId, userId),
        eq(friendships.userTwoId, userId),
      ),
    );

  const friendIds = links.map((link) =>
    link.userOneId === userId ? link.userTwoId : link.userOneId,
  );

  if (friendIds.length === 0) {
    return [];
  }

  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(inArray(user.id, friendIds));
}
