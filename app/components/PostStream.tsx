"use client";

/* eslint-disable @next/next/no-img-element -- Private media URLs require the viewer's session cookie. */

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AnimatedReveal, SegmentedControl } from "@/app/components/SegmentedControl";
import { DissolveTextarea } from "@/app/components/DissolveField";
import { PhotoViewer } from "@/app/components/PhotoViewer";
import type {
  FeedPost,
  FriendSummary,
  PostVisibility,
} from "@/lib/content-types";

const visibilityLabels: Record<PostVisibility, string> = {
  friends: "朋友可见",
  selected: "指定朋友可见",
  private: "仅自己可见",
};

const editVisibilityOptions = [
  { value: "friends", label: "朋友" },
  { value: "selected", label: "指定朋友" },
  { value: "private", label: "仅自己" },
] as const;

function displayTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function PostStream({
  posts,
  friends,
}: {
  posts: FeedPost[];
  friends: FriendSummary[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<FeedPost | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editVisibility, setEditVisibility] = useState<PostVisibility>("friends");
  const [editViewerIds, setEditViewerIds] = useState<string[]>([]);
  const [editManagementMode, setEditManagementMode] = useState<"creator" | "circle">("creator");
  const [viewer, setViewer] = useState<{
    post: FeedPost;
    index: number;
    originRect: DOMRect;
  } | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [terminalConflict, setTerminalConflict] = useState("");
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);

  useEffect(() => {
    if (!posts.some((post) => post.publicationStatus === "publishing")) return;
    const timer = window.setInterval(() => router.refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [posts, router]);

  function beginEdit(post: FeedPost) {
    setEditing(post);
    setEditBody(post.body);
    setEditVisibility(post.visibility);
    setEditViewerIds(post.viewerIds);
    setEditManagementMode(post.managementMode);
    setError("");
    setTerminalConflict("");
    setConflictDialogOpen(false);
  }

  function cancelEdit() {
    setEditing(null);
    setError("");
    setTerminalConflict("");
    setConflictDialogOpen(false);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || terminalConflict) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/posts/${editing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: editBody,
          visibility: editVisibility,
          viewerIds: editVisibility === "selected" ? editViewerIds : [],
          managementMode: editing.circle ? editManagementMode : undefined,
          expectedUpdatedAt: editing.updatedAt,
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
      cancelEdit();
      router.refresh();
    } catch {
      setError("网络连接中断了，内容仍然保留，可以稍后重新保存。");
    } finally {
      setPending(false);
    }
  }

  async function removePost(post: FeedPost) {
    const prompt = post.circle
      ? `确定删除这条圈子记录吗？圈内成员将无法再看到正文和其中的照片。`
      : "确定删除这条个人动态吗？其中的照片也会一并删除！";
    if (!window.confirm(prompt)) return;
    setPending(true);
    const response = await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
    setPending(false);
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      setError(result.error ?? "删除失败。");
      return;
    }
    router.refresh();
  }

  if (posts.length === 0) {
    return (
      <div className="feed-empty">
        <strong>这里还很安静</strong>
        <p>第一条动态发布后，会在这里显示。</p>
      </div>
    );
  }

  return (
    <div className="real-feed" aria-live="polite">
      {error ? <p className="composer-error">{error}</p> : null}
      {posts.map((post) => {
        const edited = new Date(post.updatedAt).getTime() - new Date(post.createdAt).getTime() > 1000;
        return (
          <article className="feed-entry" key={post.id}>
            <Link className="entry-avatar" href={`/profile/${post.author.id}`}>
              {post.author.name.slice(0, 1)}
            </Link>
            <div className="entry-content">
              <header>
                <div>
                  <Link href={`/profile/${post.author.id}`}>{post.author.name}</Link>
                  <span>
                    {displayTime(post.createdAt)} · {post.circle ? (
                      <Link href={`/circles/${post.circle.id}`}>{post.circle.name}</Link>
                    ) : visibilityLabels[post.visibility]}
                    {post.isHistorical ? " · 历史只读" : ""}
                  </span>
                  {post.publicationStatus !== "published" ? (
                    <span className={`publication-state is-${post.publicationStatus}`}>
                      {post.publicationStatus === "publishing"
                        ? "照片正在安全处理，完成后会自动公开"
                        : post.publicationError ?? "照片处理失败，动态尚未公开"}
                    </span>
                  ) : null}
                </div>
                {post.canEdit || post.canDelete ? (
                  <div className="entry-manage">
                    {post.canEdit ? <button onClick={() => beginEdit(post)} type="button">编辑</button> : null}
                    {post.canDelete ? <button disabled={pending} onClick={() => removePost(post)} type="button">删除</button> : null}
                  </div>
                ) : null}
              </header>

              {post.body ? <p className="entry-body">{post.body}</p> : null}
              {post.media.length > 0 ? (
                <div className={`post-gallery gallery-${Math.min(post.media.length, 4)}`}>
                  {post.media.map((media, mediaIndex) => (
                    <button
                      data-photo-origin={media.id}
                      key={media.id}
                      onClick={(event) => setViewer({
                        post,
                        index: mediaIndex,
                        originRect: event.currentTarget.getBoundingClientRect(),
                      })}
                      type="button"
                    >
                      <img alt={media.originalName} src={`/api/media/${media.id}/thumbnail`} />
                    </button>
                  ))}
                </div>
              ) : null}
              {edited ? (
                <small className="edited-label">
                  {post.lastEditor ? `由 ${post.lastEditor.name} 最后编辑于 ` : "编辑于 "}
                  {displayTime(post.updatedAt)}
                </small>
              ) : null}
            </div>
          </article>
        );
      })}

      {editing ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (!terminalConflict) cancelEdit();
          }}
        >
          <form className="edit-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={saveEdit}>
            <header><h2>编辑动态</h2><button onClick={cancelEdit} type="button" aria-label="取消修改">×</button></header>
            <DissolveTextarea
              aria-label="动态正文"
              maxLength={5000}
              onValueChange={setEditBody}
              placeholder="写下这条动态……"
              value={editBody}
              wrapperClassName="edit-writing-surface"
            />
            {!editing.circle ? (
              <SegmentedControl
                ariaLabel="可见范围"
                className="visibility-control"
                onValueChange={setEditVisibility}
                options={editVisibilityOptions}
                value={editVisibility}
              />
            ) : (
              <div className="circle-management-edit">
                <span>管理方式</span>
                <SegmentedControl
                  ariaLabel="圈子动态管理方式"
                  className="segmented-control--compact"
                  onValueChange={setEditManagementMode}
                  options={[
                    {
                      value: "creator",
                      label: "仅创建者管理",
                      disabled: editing.managementMode === "circle",
                    },
                    { value: "circle", label: "圈内共同管理" },
                  ]}
                  value={editManagementMode}
                />
              </div>
            )}
            <AnimatedReveal show={!editing.circle && editVisibility === "selected"}>
              <fieldset className="friend-picker">
                <legend>指定朋友</legend>
                {friends.map((friend) => (
                  <label key={friend.id}>
                    <input
                      checked={editViewerIds.includes(friend.id)}
                      onChange={(event) => setEditViewerIds((current) =>
                        event.target.checked
                          ? [...current, friend.id]
                          : current.filter((id) => id !== friend.id),
                      )}
                      type="checkbox"
                    />
                    {friend.name}
                  </label>
                ))}
              </fieldset>
            </AnimatedReveal>
            {error ? <p className="composer-error">{error}</p> : null}
            {terminalConflict ? (
              <p className="composer-error">
                当前修改已不能保存。你仍可以继续输入或复制内容，完成后请取消修改。
              </p>
            ) : null}
            <div className="composer-submit-actions">
              <button
                className="composer-close-action"
                disabled={pending}
                onClick={cancelEdit}
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
          {conflictDialogOpen ? (
            <div
              className="draft-dialog-backdrop"
              onMouseDown={(event) => event.stopPropagation()}
              role="presentation"
            >
              <div
                aria-labelledby="edit-conflict-title"
                aria-modal="true"
                className="draft-dialog"
                role="alertdialog"
              >
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
            </div>
          ) : null}
        </div>
      ) : null}

      {viewer ? (
        <PhotoViewer
          author={viewer.post.author}
          body={viewer.post.body}
          initialIndex={viewer.index}
          onClose={() => setViewer(null)}
          originRect={viewer.originRect}
          photos={viewer.post.media.map((media) => ({
            id: media.id,
            thumbnailSrc: `/api/media/${media.id}/thumbnail`,
            src: `/api/media/${media.id}/preview`,
            hdSrc: `/api/media/${media.id}/hd`,
            alt: media.originalName,
          }))}
        />
      ) : null}
    </div>
  );
}
