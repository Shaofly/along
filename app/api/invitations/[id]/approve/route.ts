import { and, count, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { invitations, invitationSponsors } from "@/db/schema";
import { auth } from "@/lib/auth";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    await db.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(invitationSponsors)
        .set({ status: "confirmed", respondedAt: new Date() })
        .where(
          and(
            eq(invitationSponsors.invitationId, id),
            eq(invitationSponsors.userId, session.user.id),
            eq(invitationSponsors.status, "pending"),
          ),
        )
        .returning({ invitationId: invitationSponsors.invitationId });

      if (!updated) {
        throw new Error("No pending sponsorship.");
      }

      const [{ total }] = await transaction
        .select({ total: count() })
        .from(invitationSponsors)
        .where(
          and(
            eq(invitationSponsors.invitationId, id),
            eq(invitationSponsors.status, "confirmed"),
          ),
        );

      if (total >= 2 && total <= 5) {
        await transaction
          .update(invitations)
          .set({ status: "ready" })
          .where(
            and(
              eq(invitations.id, id),
              eq(invitations.status, "pending"),
              gt(invitations.expiresAt, new Date()),
            ),
          );
      }
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "这份共同邀请已经处理或失效。" },
      { status: 409 },
    );
  }
}
