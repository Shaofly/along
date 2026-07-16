"use client";

/* eslint-disable @next/next/no-img-element -- Private media URLs require the viewer's session cookie. */

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { AnimatedReveal, SegmentedControl } from "@/app/components/SegmentedControl";
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
  const [lightbox, setLightbox] = useState<{ src: string; alt: string; body: string } | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function beginEdit(post: FeedPost) {
    setEditing(post);
    setEditBody(post.body);
    setEditVisibility(post.visibility);
    setEditViewerIds(post.viewerIds);
    setEditManagementMode(post.managementMode);
    setError("");
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setPending(true);
    setError("");
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
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "保存失败。");
      return;
    }
    setEditing(null);
    router.refresh();
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
                  {post.media.map((media) => (
                    <button
                      key={media.id}
                      onClick={() => setLightbox({
                        src: `/api/media/${media.id}`,
                        alt: media.originalName,
                        body: post.body,
                      })}
                      type="button"
                    >
                      <img alt={media.originalName} src={`/api/media/${media.id}`} />
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
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditing(null)}>
          <form className="edit-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={saveEdit}>
            <header><h2>编辑动态</h2><button onClick={() => setEditing(null)} type="button" aria-label="关闭">×</button></header>
            <textarea maxLength={5000} onChange={(event) => setEditBody(event.target.value)} value={editBody} />
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
            <button className="publish-button" disabled={pending} type="submit">
              {pending ? "正在保存" : "保存修改"}
            </button>
          </form>
        </div>
      ) : null}

      {lightbox ? (
        <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label="照片预览">
          <button className="lightbox-close" onClick={() => setLightbox(null)} type="button" aria-label="关闭">×</button>
          <img alt={lightbox.alt} src={lightbox.src} />
          {lightbox.body ? <p>{lightbox.body}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
