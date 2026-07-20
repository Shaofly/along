"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { DissolveTextarea } from "@/app/components/DissolveField";
import {
  ComposerPhotoBoard,
  createComposerPhoto,
  type ComposerPhoto,
} from "@/app/components/ComposerPhotoBoard";
import { ModalSurface } from "@/app/components/ModalSurface";
import { uploadMediaFiles, type UploadProgress } from "@/app/components/media-upload";
import { AnimatedReveal, SegmentedControl } from "@/app/components/SegmentedControl";
import { TextStateSwap } from "@/app/components/TextStateSwap";
import { useTaskRouteTransition } from "@/app/components/TaskRouteTransition";
import type {
  DraftDetail,
  DraftMedia,
  DraftParticipant,
  FriendSummary,
  PostVisibility,
} from "@/lib/content-types";
import {
  createPhotoLayoutOptions,
  type PhotoLayoutSpec,
  normalizePhotoLayout,
} from "@/lib/photo-layout";

const visibilityOptions = [
  { value: "friends", label: "朋友" },
  { value: "selected", label: "指定朋友" },
  { value: "private", label: "仅自己" },
] as const;

const managementOptions = [
  { value: "creator", label: "仅我管理" },
  { value: "circle", label: "共同管理" },
] as const;

export type ComposerTarget =
  | { kind: "personal" }
  | { kind: "circle"; id: string; name: string };

type PersistResult = {
  id: string | null;
  media: DraftMedia[];
  photoLayout: PhotoLayoutSpec | null;
  updatedAt: string | null;
};

function draftMediaToPhoto(media: DraftMedia): ComposerPhoto {
  return {
    key: `media:${media.id}`,
    id: media.id,
    originalName: media.originalName,
    mimeType: media.mimeType,
    src: `/api/media/${media.id}/thumbnail`,
    width: media.width,
    height: media.height,
  };
}

function layoutOptions(photos: ComposerPhoto[], preferred?: PhotoLayoutSpec | null) {
  return createPhotoLayoutOptions(
    photos.map((photo) => photo.width / photo.height),
    preferred,
  );
}

function contentSignature(input: {
  body: string;
  files: File[];
  managementMode: "creator" | "circle";
  media: DraftMedia[];
  participantIds: string[];
  photoLayout?: PhotoLayoutSpec | null;
  photoOrder?: string[];
  viewerIds: string[];
  visibility: PostVisibility;
}) {
  return JSON.stringify({
    body: input.body,
    files: input.files.map((file) => [
      file.name,
      file.size,
      file.lastModified,
    ]),
    managementMode: input.managementMode,
    mediaIds: input.media.map((media) => media.id),
    participantIds: [...input.participantIds].sort(),
    photoLayout: input.photoLayout ?? null,
    photoOrder: input.photoOrder ?? [],
    viewerIds: [...input.viewerIds].sort(),
    visibility: input.visibility,
  });
}

export function FullComposer({
  circleMembers = [],
  currentUserId,
  friends,
  initialDraft = null,
  modalOpen = true,
  onClose,
  onModalAfterClose,
  onPublished,
  presentation,
  returnHref,
  target,
}: {
  circleMembers?: DraftParticipant[];
  currentUserId: string;
  friends: FriendSummary[];
  initialDraft?: DraftDetail | null;
  modalOpen?: boolean;
  onClose?: () => void;
  onModalAfterClose?: () => void;
  onPublished?: () => void;
  presentation: "modal" | "page";
  returnHref: string;
  target: ComposerTarget;
}) {
  const router = useRouter();
  const leaveTaskRoute = useTaskRouteTransition();
  const [body, setBody] = useState(initialDraft?.body ?? "");
  const [photos, setPhotos] = useState<ComposerPhoto[]>(() =>
    (initialDraft?.media ?? []).map(draftMediaToPhoto),
  );
  const [layoutCandidates, setLayoutCandidates] = useState<PhotoLayoutSpec[]>(() =>
    layoutOptions(
      (initialDraft?.media ?? []).map(draftMediaToPhoto),
      initialDraft?.photoLayout,
    ),
  );
  const [photoLayout, setPhotoLayout] = useState<PhotoLayoutSpec | null>(
    () => layoutCandidates[0] ?? null,
  );
  const [draftId, setDraftId] = useState<string | null>(
    initialDraft?.id ?? null,
  );
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(
    initialDraft?.updatedAt ?? null,
  );
  const [visibility, setVisibility] = useState<PostVisibility>(
    initialDraft?.visibility ?? "friends",
  );
  const [viewerIds, setViewerIds] = useState<string[]>(
    initialDraft?.viewerIds ?? [],
  );
  const [managementMode, setManagementMode] = useState<
    "creator" | "circle"
  >(initialDraft?.managementMode ?? "creator");
  const [participantIds, setParticipantIds] = useState<string[]>(
    target.kind === "circle"
      ? [
          ...new Set([
            currentUserId,
            ...(initialDraft?.participants.map((participant) => participant.id) ??
              []),
          ]),
        ]
      : [],
  );
  const [pending, setPending] = useState(false);
  const [uploadProgress, setUploadProgress] =
    useState<UploadProgress | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [baseline, setBaseline] = useState(() =>
    contentSignature({
      body: initialDraft?.body ?? "",
      files: [],
      managementMode: initialDraft?.managementMode ?? "creator",
      media: initialDraft?.media ?? [],
      photoLayout: initialDraft?.photoLayout,
      photoOrder: (initialDraft?.media ?? []).map((media) => `media:${media.id}`),
      participantIds:
        target.kind === "circle"
          ? [
              ...new Set([
                currentUserId,
                ...(initialDraft?.participants.map(
                  (participant) => participant.id,
                ) ?? []),
              ]),
            ]
          : [],
      viewerIds: initialDraft?.viewerIds ?? [],
      visibility: initialDraft?.visibility ?? "friends",
    }),
  );
  const files = photos.flatMap((photo) => (photo.file ? [photo.file] : []));
  const savedMedia: DraftMedia[] = photos.flatMap((photo) =>
    photo.id
      ? [{
          id: photo.id,
          originalName: photo.originalName,
          mimeType: photo.mimeType,
          width: photo.width,
          height: photo.height,
        }]
      : [],
  );
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => {
    return () => {
      photosRef.current.forEach((photo) => {
        if (photo.file) URL.revokeObjectURL(photo.src);
      });
    };
  }, []);

  const selectableParticipants = useMemo(() => {
    const people = new Map<string, DraftParticipant>();
    for (const participant of initialDraft?.participants ?? []) {
      people.set(participant.id, participant);
    }
    for (const member of circleMembers) people.set(member.id, member);
    return [...people.values()].toSorted((left, right) => {
      if (left.id === currentUserId) return -1;
      if (right.id === currentUserId) return 1;
      if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
      return left.name.localeCompare(right.name, "zh-CN");
    });
  }, [circleMembers, currentUserId, initialDraft?.participants]);
  const selectedInactiveParticipant = selectableParticipants.some(
    (participant) =>
      participantIds.includes(participant.id) && !participant.isActive,
  );
  const targetCanPublish = initialDraft?.canPublish ?? true;
  const hasContent = Boolean(body.trim() || files.length || savedMedia.length);
  const currentSignature = contentSignature({
    body,
    files,
    managementMode,
    media: savedMedia,
    photoLayout,
    photoOrder: photos.map((photo) =>
      photo.id
        ? `media:${photo.id}`
        : `file:${photo.file!.name}:${photo.file!.size}:${photo.file!.lastModified}`,
    ),
    participantIds,
    viewerIds,
    visibility,
  });
  const dirty = currentSignature !== baseline;

  function closeNow() {
    setCloseDialogOpen(false);
    if (onClose) {
      onClose();
      return;
    }
    if (presentation === "page" && leaveTaskRoute) {
      leaveTaskRoute(returnHref);
      return;
    }
    router.push(returnHref);
  }

  function requestClose() {
    if (pending) return;
    if (dirty) {
      setCloseDialogOpen(true);
      return;
    }
    closeNow();
  }

  async function chooseFiles(selected: FileList | null) {
    if (!selected) return;
    const existing = new Set(
      photos.flatMap((photo) =>
        photo.file
          ? [`${photo.file.name}:${photo.file.size}:${photo.file.lastModified}`]
          : [],
      ),
    );
    const accepted: File[] = [];
    let omitted = 0;
    for (const file of Array.from(selected)) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (existing.has(key) || photos.length + accepted.length >= 20) {
        omitted += 1;
      } else {
        existing.add(key);
        accepted.push(file);
      }
    }
    const created = await Promise.all(accepted.map(createComposerPhoto));
    const nextPhotos = [...photos, ...created];
    const candidates = layoutOptions(nextPhotos);
    setPhotos(nextPhotos);
    setLayoutCandidates(candidates);
    setPhotoLayout(candidates[0] ?? null);
    setError(
      omitted
        ? "已忽略重复图片，或已达到每条动态 20 张的上限。"
        : "",
    );
    setNotice("");
  }

  function removePhoto(index: number) {
    const removed = photos[index];
    if (removed?.file) URL.revokeObjectURL(removed.src);
    const nextPhotos = photos.filter((_, photoIndex) => photoIndex !== index);
    const candidates = layoutOptions(nextPhotos);
    setPhotos(nextPhotos);
    setLayoutCandidates(candidates);
    setPhotoLayout(candidates[0] ?? null);
  }

  function movePhoto(from: number, to: number) {
    setPhotos((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function cycleLayout() {
    if (layoutCandidates.length < 2) return;
    const currentIndex = layoutCandidates.findIndex(
      (candidate) => JSON.stringify(candidate) === JSON.stringify(photoLayout),
    );
    setPhotoLayout(layoutCandidates[(currentIndex + 1) % layoutCandidates.length]);
  }

  function chooseVisibility(nextVisibility: PostVisibility) {
    setVisibility(nextVisibility);
    if (nextVisibility !== "selected") setViewerIds([]);
  }

  async function uploadPendingFiles() {
    if (!files.length) return { media: savedMedia, layout: photoLayout };
    setUploadProgress({ percent: 0, phase: "uploading" });
    const uploaded = await uploadMediaFiles(files, setUploadProgress);
    let uploadedIndex = 0;
    const nextPhotos = photos.map((photo) => {
      if (!photo.file) return photo;
      const media = uploaded[uploadedIndex++];
      URL.revokeObjectURL(photo.src);
      return draftMediaToPhoto(media);
    });
    const nextLayout = normalizePhotoLayout(
      photoLayout,
      nextPhotos.map((photo) => photo.width / photo.height),
    );
    setPhotos(nextPhotos);
    setPhotoLayout(nextLayout);
    setLayoutCandidates(layoutOptions(nextPhotos, nextLayout));
    setUploadProgress(null);
    return {
      media: nextPhotos.map((photo) => ({
        id: photo.id!,
        originalName: photo.originalName,
        mimeType: photo.mimeType,
        width: photo.width,
        height: photo.height,
      })),
      layout: nextLayout,
    };
  }

  async function persistDraft(): Promise<PersistResult> {
    const uploadedState = await uploadPendingFiles();
    const nextMedia = uploadedState.media;
    const response = await fetch(
      draftId ? `/api/drafts/${draftId}` : "/api/drafts",
      {
        method: draftId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body,
          visibility: target.kind === "personal" ? visibility : "private",
          circleId: target.kind === "circle" ? target.id : null,
          managementMode,
          viewerIds:
            target.kind === "personal" && visibility === "selected"
              ? viewerIds
              : [],
          participantIds:
            target.kind === "circle" ? participantIds : [],
          mediaIds: nextMedia.map((media) => media.id),
          photoLayout: uploadedState.layout,
          expectedUpdatedAt: draftId ? draftUpdatedAt ?? undefined : undefined,
        }),
      },
    );
    const result = (await response.json()) as {
      code?: string;
      error?: string;
      id?: string | null;
      updatedAt?: string | null;
      photoLayout?: PhotoLayoutSpec | null;
    };
    if (!response.ok) {
      if (result.code === "draft_conflict") setConflictDialogOpen(true);
      throw new Error(result.error ?? "草稿保存失败。");
    }
    const nextId = result.id ?? null;
    const nextUpdatedAt = result.updatedAt ?? null;
    const nextLayout = result.photoLayout ?? uploadedState.layout;
    setDraftId(nextId);
    setDraftUpdatedAt(nextUpdatedAt);
    setPhotoLayout(nextLayout);
    setBaseline(
      contentSignature({
        body,
        files: [],
        managementMode,
        media: nextMedia,
        photoLayout: nextLayout,
        photoOrder: nextMedia.map((media) => `media:${media.id}`),
        participantIds,
        viewerIds,
        visibility,
      }),
    );
    return {
      id: nextId,
      media: nextMedia,
      photoLayout: nextLayout,
      updatedAt: nextUpdatedAt,
    };
  }

  async function saveOnly() {
    if (!hasContent) {
      setError("写点什么，或者选择一张图片后再保存。");
      return;
    }
    setPending(true);
    setError("");
    setNotice("");
    try {
      await persistDraft();
      setNotice("草稿已经保存。");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "草稿保存失败。");
    } finally {
      setUploadProgress(null);
      setPending(false);
    }
  }

  async function saveAndClose() {
    setPending(true);
    setError("");
    setNotice("");
    try {
      await persistDraft();
      if (presentation === "modal") router.refresh();
      closeNow();
    } catch (saveError) {
      setCloseDialogOpen(false);
      setError(saveError instanceof Error ? saveError.message : "草稿保存失败。");
    } finally {
      setUploadProgress(null);
      setPending(false);
    }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasContent) return;
    if (
      target.kind === "personal" &&
      visibility === "selected" &&
      viewerIds.length === 0
    ) {
      setError("请至少选择一位朋友。");
      return;
    }
    if (!targetCanPublish) {
      setError(
        initialDraft?.unavailableReason ?? "当前发布目标已经不能继续发布。",
      );
      return;
    }
    if (selectedInactiveParticipant) {
      setError("请先移除已经不在圈子中的参与者。");
      return;
    }

    setPending(true);
    setError("");
    setNotice("");
    try {
      const persisted = await persistDraft();
      if (!persisted.id) throw new Error("草稿同步失败。");
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body,
          visibility: target.kind === "personal" ? visibility : "private",
          circleId: target.kind === "circle" ? target.id : null,
          managementMode,
          viewerIds:
            target.kind === "personal" && visibility === "selected"
              ? viewerIds
              : [],
          participantIds:
            target.kind === "circle" ? participantIds : [],
          mediaIds: persisted.media.map((media) => media.id),
          photoLayout: persisted.photoLayout,
          draftId: persisted.id,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "发布失败。");
      if (onPublished) {
        onPublished();
        router.refresh();
      } else if (presentation === "page" && leaveTaskRoute) {
        leaveTaskRoute(returnHref);
      } else {
        router.push(returnHref);
        router.refresh();
      }
    } catch (publishError) {
      setError(
        publishError instanceof Error ? publishError.message : "发布失败。",
      );
    } finally {
      setUploadProgress(null);
      setPending(false);
    }
  }

  async function reloadDraft() {
    if (!draftId) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/drafts/${draftId}`);
      const result = (await response.json()) as {
        draft?: DraftDetail;
        error?: string;
      };
      if (!response.ok || !result.draft) {
        throw new Error(result.error ?? "草稿重新载入失败。");
      }
      const draft = result.draft;
      setBody(draft.body);
      const nextPhotos = draft.media.map(draftMediaToPhoto);
      const nextLayouts = layoutOptions(nextPhotos, draft.photoLayout);
      setPhotos(nextPhotos);
      setLayoutCandidates(nextLayouts);
      setPhotoLayout(nextLayouts[0] ?? null);
      setVisibility(draft.visibility);
      setViewerIds(draft.viewerIds);
      setManagementMode(draft.managementMode);
      setParticipantIds(
        target.kind === "circle"
          ? [
              ...new Set([
                currentUserId,
                ...draft.participants.map((participant) => participant.id),
              ]),
            ]
          : [],
      );
      setDraftUpdatedAt(draft.updatedAt);
      setBaseline(
        contentSignature({
          body: draft.body,
          files: [],
          managementMode: draft.managementMode,
          media: draft.media,
          photoLayout: draft.photoLayout,
          photoOrder: draft.media.map((media) => `media:${media.id}`),
          participantIds:
            target.kind === "circle"
              ? [
                  ...new Set([
                    currentUserId,
                    ...draft.participants.map((participant) => participant.id),
                  ]),
                ]
              : [],
          viewerIds: draft.viewerIds,
          visibility: draft.visibility,
        }),
      );
      setConflictDialogOpen(false);
      setNotice("已载入另一处保存的版本。");
    } catch (reloadError) {
      setError(
        reloadError instanceof Error
          ? reloadError.message
          : "草稿重新载入失败。",
      );
    } finally {
      setPending(false);
    }
  }

  async function forkCurrentDraft() {
    if (!draftId) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/drafts/${draftId}/fork`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body,
          visibility: target.kind === "personal" ? visibility : "private",
          circleId: target.kind === "circle" ? target.id : null,
          managementMode,
          viewerIds:
            target.kind === "personal" && visibility === "selected"
              ? viewerIds
              : [],
          participantIds:
            target.kind === "circle" ? participantIds : [],
          mediaIds: savedMedia.map((media) => media.id),
          photoLayout,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        id?: string | null;
        media?: DraftMedia[];
        photoLayout?: PhotoLayoutSpec | null;
        updatedAt?: string | null;
      };
      if (!response.ok || !result.id || !result.updatedAt) {
        throw new Error(result.error ?? "另存草稿失败。");
      }
      const nextMedia = result.media ?? [];
      const nextPhotos = nextMedia.map(draftMediaToPhoto);
      const nextLayouts = layoutOptions(nextPhotos, result.photoLayout ?? photoLayout);
      setDraftId(result.id);
      setDraftUpdatedAt(result.updatedAt);
      setPhotos(nextPhotos);
      setLayoutCandidates(nextLayouts);
      setPhotoLayout(nextLayouts[0] ?? null);
      setBaseline(
        contentSignature({
          body,
          files: [],
          managementMode,
          media: nextMedia,
          photoLayout: nextLayouts[0] ?? null,
          photoOrder: nextMedia.map((media) => `media:${media.id}`),
          participantIds,
          viewerIds,
          visibility,
        }),
      );
      setConflictDialogOpen(false);
      setNotice("本地内容已经另存为一条新草稿。");
      router.refresh();
    } catch (forkError) {
      setError(
        forkError instanceof Error ? forkError.message : "另存草稿失败。",
      );
      setConflictDialogOpen(false);
    } finally {
      setPending(false);
    }
  }

  const form = (
    <form
      className={`full-composer full-composer--${presentation}`}
      onSubmit={publish}
    >
      <header>
        <div>
          <small>{initialDraft ? "继续草稿" : "新建动态"}</small>
          <h2 id="full-composer-title">
            {target.kind === "circle" ? target.name : "我的个人动态"}
          </h2>
        </div>
        <button
          aria-label={presentation === "page" ? "返回上一页" : "关闭发布器"}
          onClick={requestClose}
          type="button"
        >
          {presentation === "page" ? (
            <ArrowLeft aria-hidden="true" size={22} strokeWidth={1.9} />
          ) : (
            <X aria-hidden="true" size={22} strokeWidth={1.9} />
          )}
        </button>
      </header>

      <div className="full-composer-scroll" data-modal-scroll-root>
      {initialDraft?.unavailableReason ? (
        <div className="composer-availability-note">
          {initialDraft.unavailableReason}
        </div>
      ) : null}

      <DissolveTextarea
        aria-label="动态正文"
        data-modal-initial-focus
        maxLength={5000}
        onValueChange={(value) => {
          setBody(value);
          setNotice("");
        }}
        placeholder={
          target.kind === "circle"
            ? "把一起经历的一点小事，留在这里……"
            : "想说的话从这里写起吧……"
        }
        value={body}
        wrapperClassName="composer-writing-surface"
      />

      {photos.length ? (
        <ComposerPhotoBoard
          layout={photoLayout}
          onCycleLayout={cycleLayout}
          onMove={movePhoto}
          onRemove={removePhoto}
          photos={photos}
        />
      ) : null}

      {target.kind === "personal" ? (
        <>
          <SegmentedControl
            ariaLabel="可见范围"
            className="visibility-control"
            onValueChange={chooseVisibility}
            options={visibilityOptions}
            value={visibility}
          />
          <AnimatedReveal show={visibility === "selected"}>
            <fieldset className="friend-picker">
              <legend>选择能看到这条动态的朋友</legend>
              {friends.map((friend) => (
                <label key={friend.id}>
                  <input
                    checked={viewerIds.includes(friend.id)}
                    onChange={(event) =>
                      setViewerIds((current) =>
                        event.target.checked
                          ? [...new Set([...current, friend.id])]
                          : current.filter((id) => id !== friend.id),
                      )
                    }
                    type="checkbox"
                  />
                  {friend.name}
                </label>
              ))}
            </fieldset>
          </AnimatedReveal>
        </>
      ) : (
        <>
          <div className="full-composer-setting">
            <span>管理方式</span>
            <SegmentedControl
              ariaLabel="圈子动态管理方式"
              className="segmented-control--compact"
              onValueChange={setManagementMode}
              options={managementOptions}
              value={managementMode}
            />
          </div>
          <fieldset className="friend-picker circle-participant-picker">
            <legend>这次一起参与的人</legend>
            {selectableParticipants.map((participant) => {
              const isAuthor = participant.id === currentUserId;
              return (
                <label
                  className={!participant.isActive ? "is-unavailable" : ""}
                  key={participant.id}
                >
                  <input
                    checked={
                      isAuthor || participantIds.includes(participant.id)
                    }
                    disabled={isAuthor}
                    onChange={(event) =>
                      setParticipantIds((current) =>
                        event.target.checked
                          ? [...new Set([...current, participant.id])]
                          : current.filter((id) => id !== participant.id),
                      )
                    }
                    type="checkbox"
                  />
                  {participant.name}
                  {participant.realName !== participant.name
                    ? `（${participant.realName}）`
                    : ""}
                  {!participant.isActive ? " · 已退出" : ""}
                </label>
              );
            })}
          </fieldset>
        </>
      )}

      {error ? <p className="composer-error">{error}</p> : null}
      {notice ? <p className="composer-notice">{notice}</p> : null}
      </div>

      <div className="full-composer-actions">
        <label className="photo-input">
          添加照片
          <input
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            onChange={(event) => {
              chooseFiles(event.target.files);
              event.currentTarget.value = "";
            }}
            type="file"
          />
        </label>
        <span>
          {savedMedia.length + files.length
            ? `${savedMedia.length + files.length} / 20 张`
            : "JPG、PNG、WebP 或 HEIC"}
        </span>
        <button
          className="composer-close-action"
          disabled={pending || !hasContent}
          onClick={saveOnly}
          type="button"
        >
          保存草稿
        </button>
        <button
          className="publish-button"
          disabled={
            pending ||
            !hasContent ||
            !targetCanPublish ||
            selectedInactiveParticipant
          }
          type="submit"
        >
          <TextStateSwap
            labels={["发布", "正在上传 100%", "正在处理", "正在发布"]}
            text={
              uploadProgress
                ? uploadProgress.phase === "processing"
                  ? "正在处理"
                  : `正在上传 ${uploadProgress.percent}%`
                : pending
                  ? "正在发布"
                  : "发布"
            }
          />
        </button>
      </div>
    </form>
  );

  return (
    <>
      {presentation === "modal" ? (
        <ModalSurface
          labelledBy="full-composer-title"
          onAfterClose={onModalAfterClose}
          onRequestClose={requestClose}
          open={modalOpen}
          size="wide"
        >
          {form}
        </ModalSurface>
      ) : (
        form
      )}

      <ModalSurface
        labelledBy="full-composer-close-title"
        onRequestClose={() => {
          if (!pending) setCloseDialogOpen(false);
        }}
        open={closeDialogOpen}
        size="compact"
      >
          <div className="draft-dialog">
            <h2 id="full-composer-close-title">
              {draftId ? "要保存这次修改吗？" : "要保存这条未完成的记录吗？"}
            </h2>
            <p>
              {draftId
                ? "放弃本次修改不会删除原草稿。"
                : "保存后可以在草稿箱或其他设备上继续写。"}
            </p>
            <div className="draft-dialog-actions">
              <button
                autoFocus
                className="draft-save-action"
                disabled={pending}
                onClick={saveAndClose}
                type="button"
              >
                保存并关闭
              </button>
              <button disabled={pending} onClick={closeNow} type="button">
                {draftId ? "放弃本次修改" : "放弃内容"}
              </button>
              <button
                disabled={pending}
                onClick={() => setCloseDialogOpen(false)}
                type="button"
              >
                继续编辑
              </button>
            </div>
          </div>
      </ModalSurface>

      <ModalSurface
        labelledBy="draft-conflict-title"
        onRequestClose={() => {
          if (!pending) setConflictDialogOpen(false);
        }}
        open={conflictDialogOpen}
        role="alertdialog"
        size="compact"
      >
          <div className="draft-dialog">
            <h2 id="draft-conflict-title">这份草稿在另一处更新了</h2>
            <p>
              当前文字和图片仍保留在编辑器中。你可以连同图片另存一份，或者重新载入服务器上的新版本。
            </p>
            <div className="draft-dialog-actions">
              <button
                className="draft-save-action"
                disabled={pending}
                onClick={forkCurrentDraft}
                type="button"
              >
                另存为新草稿
              </button>
              <button
                disabled={pending}
                onClick={reloadDraft}
                type="button"
              >
                重新载入
              </button>
              <button
                disabled={pending}
                onClick={() => setConflictDialogOpen(false)}
                type="button"
              >
                保留本地内容
              </button>
            </div>
          </div>
      </ModalSurface>
    </>
  );
}
