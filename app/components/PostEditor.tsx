"use client";

import { FormEvent, useMemo, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  ComposerPhotoBoard,
  type ComposerPhoto,
} from "@/app/components/ComposerPhotoBoard";
import { DissolveTextarea } from "@/app/components/DissolveField";
import { ModalSurface } from "@/app/components/ModalSurface";
import { AnimatedReveal, SegmentedControl } from "@/app/components/SegmentedControl";
import { useTaskRouteTransition } from "@/app/components/TaskRouteTransition";
import type {
  DraftParticipant,
  FeedPost,
  FriendSummary,
  PostVisibility,
} from "@/lib/content-types";
import {
  createPhotoLayoutOptions,
  normalizePhotoLayout,
  type PhotoLayoutSpec,
} from "@/lib/photo-layout";

const visibilityOptions = [
  { value: "friends", label: "朋友" },
  { value: "selected", label: "指定朋友" },
  { value: "private", label: "仅自己" },
] as const;

function postMediaToPhoto(media: FeedPost["media"][number]): ComposerPhoto {
  return {
    key: media.id,
    id: media.id,
    originalName: media.originalName,
    mimeType: media.mimeType,
    src: `/api/media/${media.id}/thumbnail`,
    width: media.width,
    height: media.height,
  };
}

export function PostEditor({
  friends,
  modalOpen = true,
  onClose,
  onModalAfterClose,
  post,
  presentation,
  returnHref,
}: {
  friends: FriendSummary[];
  modalOpen?: boolean;
  onClose?: () => void;
  onModalAfterClose?: () => void;
  post: FeedPost;
  presentation: "modal" | "page";
  returnHref: string;
}) {
  const router = useRouter();
  const leaveTaskRoute = useTaskRouteTransition();
  const [body, setBody] = useState(post.body);
  const [visibility, setVisibility] = useState<PostVisibility>(post.visibility);
  const [viewerIds, setViewerIds] = useState(post.viewerIds);
  const [managementMode, setManagementMode] = useState(post.managementMode);
  const [participantIds, setParticipantIds] = useState(post.participantIds);
  const [photos, setPhotos] = useState<ComposerPhoto[]>(() =>
    post.media.map(postMediaToPhoto),
  );
  const [layoutCandidates, setLayoutCandidates] = useState<PhotoLayoutSpec[]>(
    () =>
      createPhotoLayoutOptions(
        post.media.map((media) => media.width / media.height),
        post.photoLayout,
      ),
  );
  const [photoLayout, setPhotoLayout] = useState<PhotoLayoutSpec | null>(
    () =>
      createPhotoLayoutOptions(
        post.media.map((media) => media.width / media.height),
        post.photoLayout,
      )[0] ?? null,
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [terminalConflict, setTerminalConflict] = useState("");
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const initialPhotoLayout = useMemo(
    () =>
      normalizePhotoLayout(
        post.photoLayout,
        post.media.map((media) => media.width / media.height),
      ),
    [post.media, post.photoLayout],
  );
  const participants = (() => {
    const people = new Map<string, DraftParticipant>();
    for (const participant of post.participants) {
      people.set(participant.id, participant);
    }
    for (const member of post.circleMembers) people.set(member.id, member);
    return [...people.values()].toSorted((left, right) => {
      if (left.id === post.author.id) return -1;
      if (right.id === post.author.id) return 1;
      if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
      return left.name.localeCompare(right.name, "zh-CN");
    });
  })();

  const dirty = useMemo(
    () =>
      JSON.stringify({
        body,
        managementMode,
        mediaIds: photos.map((photo) => photo.id!),
        participantIds: [...participantIds].sort(),
        photoLayout,
        viewerIds: [...viewerIds].sort(),
        visibility,
      }) !==
      JSON.stringify({
        body: post.body,
        managementMode: post.managementMode,
        mediaIds: post.media.map((media) => media.id),
        participantIds: [...post.participantIds].sort(),
        photoLayout: initialPhotoLayout,
        viewerIds: [...post.viewerIds].sort(),
        visibility: post.visibility,
      }),
    [
      body,
      initialPhotoLayout,
      managementMode,
      participantIds,
      photoLayout,
      post.body,
      post.managementMode,
      post.media,
      post.participantIds,
      post.viewerIds,
      post.visibility,
      photos,
      viewerIds,
      visibility,
    ],
  );

  function movePhoto(from: number, to: number) {
    setPhotos((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      const nextLayouts = createPhotoLayoutOptions(
        next.map((photo) => photo.width / photo.height),
        photoLayout,
      );
      setLayoutCandidates(nextLayouts);
      setPhotoLayout(nextLayouts[0] ?? null);
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

  function closeNow() {
    setCloseDialogOpen(false);
    if (onClose) onClose();
    else if (presentation === "page" && leaveTaskRoute) {
      leaveTaskRoute(returnHref);
    } else {
      router.push(returnHref);
    }
  }

  function requestClose() {
    if (pending) return;
    if (dirty) {
      setCloseDialogOpen(true);
      return;
    }
    closeNow();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (terminalConflict) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body,
          visibility,
          viewerIds: visibility === "selected" ? viewerIds : [],
          managementMode: post.circle ? managementMode : undefined,
          participantIds: post.circle ? participantIds : undefined,
          mediaIds: photos.map((photo) => photo.id!),
          photoLayout,
          expectedUpdatedAt: post.updatedAt,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        terminal?: boolean;
      };
      if (!response.ok) {
        if (result.terminal) {
          const message =
            result.error ??
            "这次修改已经无法保存。请先复制需要保留的内容，再取消修改并重新打开。";
          setTerminalConflict(message);
          setConflictDialogOpen(true);
          return;
        }
        setError(result.error ?? "保存失败。");
        return;
      }
      closeNow();
      if (presentation === "modal") router.refresh();
    } catch {
      setError("网络连接中断了，内容仍然保留，可以稍后重新保存。");
    } finally {
      setPending(false);
    }
  }

  const form = (
    <form
      className={`full-composer post-editor full-composer--${presentation}`}
      onSubmit={save}
    >
      <header>
        <div>
          <small>{post.circle ? post.circle.name : "个人动态"}</small>
          <h2 id="post-editor-title">编辑动态</h2>
        </div>
        <button
          aria-label={presentation === "page" ? "返回上一页" : "取消修改"}
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
      <DissolveTextarea
        aria-label="动态正文"
        data-modal-initial-focus
        maxLength={5000}
        onValueChange={setBody}
        placeholder="写下这条动态……"
        value={body}
        wrapperClassName="composer-writing-surface"
      />
      {photos.length ? (
        <div className="post-editor-photo-group">
          <ComposerPhotoBoard
            layout={photoLayout}
            onCycleLayout={cycleLayout}
            onMove={movePhoto}
            orderHint="拖动或使用方向键调整先后"
            photos={photos}
          />
          <small className="post-editor-photo-note">
            可以调整照片顺序和排法；已发布照片暂不支持增删。
          </small>
        </div>
      ) : null}
      {!post.circle ? (
        <>
          <SegmentedControl
            ariaLabel="可见范围"
            className="visibility-control"
            onValueChange={(nextVisibility) => {
              setVisibility(nextVisibility);
              if (nextVisibility !== "selected") setViewerIds([]);
            }}
            options={visibilityOptions}
            value={visibility}
          />
          <AnimatedReveal show={visibility === "selected"}>
            <fieldset className="friend-picker">
              <legend>指定朋友</legend>
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
              options={[
                {
                  value: "creator",
                  label: "仅创建者管理",
                  disabled: post.managementMode === "circle",
                },
                { value: "circle", label: "圈内共同管理" },
              ]}
              value={managementMode}
            />
          </div>
          <fieldset className="friend-picker circle-participant-picker">
            <legend>这条动态的参与者</legend>
            {participants.map((participant) => {
              const isCreator = participant.id === post.author.id;
              return (
                <label
                  className={!participant.isActive ? "is-unavailable" : ""}
                  key={participant.id}
                >
                  <input
                    checked={
                      isCreator || participantIds.includes(participant.id)
                    }
                    disabled={isCreator}
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
      {terminalConflict ? (
        <p className="composer-error">
          当前修改已不能保存。你仍可以继续输入或复制内容，完成后请取消修改。
        </p>
      ) : null}
      </div>
      <div className="full-composer-actions">
        <span>保存时会重新检查动态和圈子状态。</span>
        <button
          className="composer-close-action"
          disabled={pending}
          onClick={requestClose}
          type="button"
        >
          取消修改
        </button>
        <button
          className="publish-button"
          disabled={pending || Boolean(terminalConflict)}
          type="submit"
        >
          {pending ? "正在保存" : "保存修改"}
        </button>
      </div>
    </form>
  );

  return (
    <>
      {presentation === "modal" ? (
        <ModalSurface
          labelledBy="post-editor-title"
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
        labelledBy="post-editor-close-title"
        onRequestClose={() => {
          if (!pending) setCloseDialogOpen(false);
        }}
        open={closeDialogOpen}
        size="compact"
      >
        <div className="draft-dialog">
          <h2 id="post-editor-close-title">要放弃这次修改吗？</h2>
          <p>尚未保存的正文、照片排布和发布设置会丢失。</p>
          <div className="draft-dialog-actions">
            <button
              className="draft-danger-action"
              disabled={pending}
              onClick={closeNow}
              type="button"
            >
              放弃修改
            </button>
            <button
              autoFocus
              data-modal-initial-focus
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
        labelledBy="edit-conflict-title"
        onRequestClose={() => setConflictDialogOpen(false)}
        open={conflictDialogOpen}
        role="alertdialog"
        size="compact"
      >
          <div className="draft-dialog">
            <h2 id="edit-conflict-title">这次修改无法保存</h2>
            <p>{terminalConflict}</p>
            <div className="draft-dialog-actions">
              <button
                className="draft-save-action"
                onClick={() => setConflictDialogOpen(false)}
                type="button"
              >
                我知道了
              </button>
            </div>
          </div>
      </ModalSurface>
    </>
  );
}
