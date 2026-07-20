import { z } from "zod";

export const photoLayoutSchema = z.discriminatedUnion("mode", [
  z.object({
    version: z.literal(1),
    mode: z.literal("recursive"),
    visibleCount: z.number().int().min(1).max(9),
    topology: z.string().min(1).max(160),
  }),
  z.object({
    version: z.literal(1),
    mode: z.literal("rows"),
    visibleCount: z.number().int().min(1).max(9),
    breaks: z.array(z.number().int().min(1).max(9)).min(1).max(9),
  }),
]);

export const saveDraftSchema = z.object({
  id: z.string().optional(),
  body: z.string().max(5000, "正文不能超过 5000 个字"),
  visibility: z.enum(["friends", "selected", "private"]),
  circleId: z.string().nullable().optional(),
  managementMode: z.enum(["creator", "circle"]).default("creator"),
  viewerIds: z.array(z.string()).max(100).default([]),
  participantIds: z.array(z.string()).max(10).default([]),
  mediaIds: z.array(z.string()).max(20, "每条草稿最多 20 张图片").default([]),
  photoLayout: photoLayoutSchema.nullable().optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
});
