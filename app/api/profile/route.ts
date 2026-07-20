import { and, eq, or } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import {
  circleExitSnapshotMedia,
  draftMedia,
  friendships,
  mediaAssets,
  postMedia,
  user,
  userProfileAppearance,
  userProfileDetails,
  userProfileDetailViewers,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { deleteMediaAsset } from "@/lib/media/service";
import { normalizeProfileResidence } from "@/lib/profile-residence";
import {
  PROFILE_AVATAR_SCALE_MAX,
  PROFILE_COVER_SCALE_MAX,
  PROFILE_MEDIA_SCALE_BASE,
} from "@/lib/profile-media";

const optionalProfileText = (max: number, message: string) =>
  z.string().trim().max(max, message).transform((value) => value || null);

const profileSchema = z.object({
  realName: z.string().trim().min(1, "请输入真实姓名").max(40),
  nickname: z.string().trim().max(40, "昵称不能超过 40 个字").optional().transform((value) => value || null),
  bio: z.string().trim().max(160, "简介不能超过 160 个字"),
  theme: z.enum(["sage", "rose", "mist", "apricot", "ink"]).optional(),
  avatar: z.object({
    mediaId: z.string().uuid().nullable(),
    focusX: z.number().int().min(0).max(10000),
    focusY: z.number().int().min(0).max(10000),
    scale: z.number().int().min(PROFILE_MEDIA_SCALE_BASE).max(PROFILE_AVATAR_SCALE_MAX),
  }).optional(),
  cover: z.object({
    mediaId: z.string().uuid().nullable(),
    focusX: z.number().int().min(0).max(10000),
    focusY: z.number().int().min(0).max(10000),
    scale: z.number().int().min(PROFILE_MEDIA_SCALE_BASE).max(PROFILE_COVER_SCALE_MAX),
  }).optional(),
  personalInfo: z.object({
    gender: optionalProfileText(32, "性别信息不能超过 32 个字"),
    residence: z.string()
      .transform(normalizeProfileResidence)
      .refine(
        (value) => !value || value.length <= 80,
        "现居地不能超过 80 个字",
      ),
    phone: optionalProfileText(40, "手机号不能超过 40 个字"),
    contactEmail: z.string()
      .trim()
      .max(254, "联系邮箱不能超过 254 个字符")
      .refine(
        (value) =>
          !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        "请输入有效的联系邮箱",
      )
      .transform((value) => value ? value.toLowerCase() : null),
    school: optionalProfileText(100, "学校名称不能超过 100 个字"),
    visibility: z.enum(["all", "selected", "private"]),
    selectedFriendIds: z.array(z.string().min(1).max(128)).max(500),
  }).optional(),
});

async function profileMediaIsAvailable(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  mediaId: string,
  ownerId: string,
  currentMediaIds: Set<string>,
) {
  const [asset] = await transaction
    .select({
      id: mediaAssets.id,
      ownerId: mediaAssets.ownerId,
      status: mediaAssets.status,
      contentCommittedAt: mediaAssets.contentCommittedAt,
    })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.id, mediaId),
        eq(mediaAssets.ownerId, ownerId),
      ),
    )
    .limit(1);
  if (!asset || asset.status !== "ready") return false;
  if (currentMediaIds.has(mediaId)) return true;
  if (asset.contentCommittedAt !== null) return false;

  const [draftLink, postLink, archiveLink, profileLink] = await Promise.all([
    transaction
      .select({ id: draftMedia.draftId })
      .from(draftMedia)
      .where(eq(draftMedia.mediaId, mediaId))
      .limit(1),
    transaction
      .select({ id: postMedia.postId })
      .from(postMedia)
      .where(eq(postMedia.mediaId, mediaId))
      .limit(1),
    transaction
      .select({ id: circleExitSnapshotMedia.snapshotPostId })
      .from(circleExitSnapshotMedia)
      .where(eq(circleExitSnapshotMedia.mediaId, mediaId))
      .limit(1),
    transaction
      .select({ id: userProfileAppearance.userId })
      .from(userProfileAppearance)
      .where(
        or(
          eq(userProfileAppearance.avatarMediaId, mediaId),
          eq(userProfileAppearance.coverMediaId, mediaId),
        ),
      )
      .limit(1),
  ]);
  return !draftLink.length &&
    !postLink.length &&
    !archiveLink.length &&
    !profileLink.length;
}

export async function PATCH(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }
  const parsed = profileSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "请检查个人资料。" },
      { status: 400 },
    );
  }
  const primaryName = parsed.data.nickname ?? parsed.data.realName;
  const {
    avatar,
    bio,
    cover,
    nickname,
    personalInfo,
    realName,
    theme,
  } = parsed.data;
  let oldMediaIds: string[] = [];
  let nextMediaIds: string[] = [];

  try {
    await db.transaction(async (transaction) => {
      await transaction
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, session.user.id))
        .limit(1)
        .for("update");
      const [currentAppearance] = await transaction
        .select()
        .from(userProfileAppearance)
        .where(eq(userProfileAppearance.userId, session.user.id))
        .limit(1)
        .for("update");
      const [currentDetails] = await transaction
        .select()
        .from(userProfileDetails)
        .where(eq(userProfileDetails.userId, session.user.id))
        .limit(1)
        .for("update");
      const currentMediaIds = new Set(
        [
          currentAppearance?.avatarMediaId,
          currentAppearance?.coverMediaId,
        ].filter((value): value is string => Boolean(value)),
      );
      const nextAvatarMediaId = avatar
        ? avatar.mediaId
        : currentAppearance?.avatarMediaId ?? null;
      const nextCoverMediaId = cover
        ? cover.mediaId
        : currentAppearance?.coverMediaId ?? null;
      if (
        nextAvatarMediaId &&
        nextCoverMediaId &&
        nextAvatarMediaId === nextCoverMediaId
      ) {
        throw new Error("头像和封面需要选择不同的图片。");
      }
      const requestedMediaIds = [
        ...new Set(
          [nextAvatarMediaId, nextCoverMediaId].filter(
            (value): value is string => Boolean(value),
          ),
        ),
      ];
      for (const mediaId of requestedMediaIds) {
        if (
          !(await profileMediaIsAvailable(
            transaction,
            mediaId,
            session.user.id,
            currentMediaIds,
          ))
        ) {
          throw new Error("所选图片尚未处理完成，或已经用于其他内容。");
        }
      }

      await transaction
        .update(user)
        .set({
          realName,
          nickname,
          bio,
          name: primaryName,
          updatedAt: new Date(),
        })
        .where(eq(user.id, session.user.id));

      if (personalInfo) {
        const selectedFriendIds = [
          ...new Set(
            personalInfo.selectedFriendIds.filter(
              (friendId) => friendId !== session.user.id,
            ),
          ),
        ];
        const friendshipRows = selectedFriendIds.length
          ? await transaction
              .select({
                userOneId: friendships.userOneId,
                userTwoId: friendships.userTwoId,
              })
              .from(friendships)
              .where(
                or(
                  eq(friendships.userOneId, session.user.id),
                  eq(friendships.userTwoId, session.user.id),
                ),
              )
          : [];
        const currentFriendIds = new Set(
          friendshipRows.map((friendship) =>
            friendship.userOneId === session.user.id
              ? friendship.userTwoId
              : friendship.userOneId,
          ),
        );
        if (
          selectedFriendIds.some((friendId) => !currentFriendIds.has(friendId))
        ) {
          throw new Error("指定查看者中包含已不再是朋友的账号。");
        }

        const now = new Date();
        const effectiveVisibility =
          personalInfo.visibility === "selected" &&
          selectedFriendIds.length === 0
            ? "private"
            : personalInfo.visibility;
        const emptySelectionWasNormalized =
          personalInfo.visibility === "selected" &&
          selectedFriendIds.length === 0;
        const preservePrivateSharingConfig =
          emptySelectionWasNormalized &&
          currentDetails?.visibility === "private";
        const lastSharedVisibility =
          effectiveVisibility === "private"
            ? preservePrivateSharingConfig
              ? currentDetails.lastSharedVisibility
              : emptySelectionWasNormalized
              ? currentDetails?.visibility === "all" ||
                currentDetails?.lastSharedVisibility === "all"
                ? "all"
                : null
              : currentDetails?.lastSharedVisibility ?? null
            : effectiveVisibility;
        await transaction
          .insert(userProfileDetails)
          .values({
            userId: session.user.id,
            gender: personalInfo.gender,
            residence: personalInfo.residence,
            phone: personalInfo.phone,
            contactEmail: personalInfo.contactEmail,
            school: personalInfo.school,
            visibility: effectiveVisibility,
            lastSharedVisibility,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: userProfileDetails.userId,
            set: {
              gender: personalInfo.gender,
              residence: personalInfo.residence,
              phone: personalInfo.phone,
              contactEmail: personalInfo.contactEmail,
              school: personalInfo.school,
              visibility: effectiveVisibility,
              lastSharedVisibility,
              updatedAt: now,
            },
          });
        if (!preservePrivateSharingConfig) {
          await transaction
            .delete(userProfileDetailViewers)
            .where(
              eq(userProfileDetailViewers.ownerId, session.user.id),
            );
          if (selectedFriendIds.length) {
            await transaction
              .insert(userProfileDetailViewers)
              .values(
                selectedFriendIds.map((viewerId) => ({
                  ownerId: session.user.id,
                  viewerId,
                })),
              )
              .onConflictDoNothing();
          }
        }
      }

      if (avatar || cover || theme) {
        const now = new Date();
        await transaction
          .insert(userProfileAppearance)
          .values({
            userId: session.user.id,
            avatarMediaId: nextAvatarMediaId,
            coverMediaId: nextCoverMediaId,
            theme: theme ?? currentAppearance?.theme ?? "sage",
            avatarFocusX:
              avatar?.focusX ?? currentAppearance?.avatarFocusX ?? 5000,
            avatarFocusY:
              avatar?.focusY ?? currentAppearance?.avatarFocusY ?? 5000,
            avatarScale:
              avatar?.scale ?? currentAppearance?.avatarScale ?? 10000,
            coverFocusX:
              cover?.focusX ?? currentAppearance?.coverFocusX ?? 5000,
            coverFocusY:
              cover?.focusY ?? currentAppearance?.coverFocusY ?? 5000,
            coverScale:
              cover?.scale ?? currentAppearance?.coverScale ?? 10000,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: userProfileAppearance.userId,
            set: {
              avatarMediaId: nextAvatarMediaId,
              coverMediaId: nextCoverMediaId,
              theme: theme ?? currentAppearance?.theme ?? "sage",
              avatarFocusX:
                avatar?.focusX ?? currentAppearance?.avatarFocusX ?? 5000,
              avatarFocusY:
                avatar?.focusY ?? currentAppearance?.avatarFocusY ?? 5000,
              avatarScale:
                avatar?.scale ?? currentAppearance?.avatarScale ?? 10000,
              coverFocusX:
                cover?.focusX ?? currentAppearance?.coverFocusX ?? 5000,
              coverFocusY:
                cover?.focusY ?? currentAppearance?.coverFocusY ?? 5000,
              coverScale:
                cover?.scale ?? currentAppearance?.coverScale ?? 10000,
              updatedAt: now,
            },
          });
      }
      oldMediaIds = [...currentMediaIds];
      nextMediaIds = requestedMediaIds;
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "个人资料保存失败。",
      },
      { status: 409 },
    );
  }

  const nextMediaIdSet = new Set(nextMediaIds);
  const removedMediaIds = oldMediaIds.filter(
    (mediaId) => !nextMediaIdSet.has(mediaId),
  );
  if (removedMediaIds.length) {
    await Promise.all(
      removedMediaIds.map(async (mediaId) => {
        try {
          await deleteMediaAsset(mediaId);
        } catch {
          // The maintenance task can retry storage cleanup later.
        }
      }),
    );
  }
  return NextResponse.json({ ok: true });
}
