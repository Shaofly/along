"use client";

/* eslint-disable @next/next/no-img-element -- Private media URLs require the viewer's session cookie. */

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

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
  currentUserId,
  friends,
}: {
  posts: FeedPost[];
  currentUserId: string;
  friends: FriendSummary[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<FeedPost | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editVisibility, setEditVisibility] = useState<PostVisibility>("friends");
  const [editViewerIds, setEditViewerIds] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string; body: string } | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function beginEdit(post: FeedPost) {
    setEditing(post);
    setEditBody(post.body);
    setEditVisibility(post.visibility);
    setEditViewerIds(post.viewerIds);
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
    if (!window.confirm("确定删除这条个人动态吗？其中的照片也会一并删除。")) return;
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
        <p>第一条真实动态发布后，会从这里开始慢慢积累。</p>
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
                  <span>{displayTime(post.createdAt)} · {visibilityLabels[post.visibility]}</span>
                </div>
                {post.author.id === currentUserId ? (
                  <div className="entry-manage">
                    <button onClick={() => beginEdit(post)} type="button">编辑</button>
                    <button disabled={pending} onClick={() => removePost(post)} type="button">删除</button>
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
              {edited ? <small className="edited-label">编辑于 {displayTime(post.updatedAt)}</small> : null}
            </div>
          </article>
        );
      })}

      {editing ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditing(null)}>
          <form className="edit-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={saveEdit}>
            <header><h2>编辑动态</h2><button onClick={() => setEditing(null)} type="button" aria-label="关闭">×</button></header>
            <textarea maxLength={5000} onChange={(event) => setEditBody(event.target.value)} value={editBody} />
            <div className="visibility-control">
              {(Object.entries(visibilityLabels) as Array<[PostVisibility, string]>).map(([value, label]) => (
                <button
                  aria-pressed={editVisibility === value}
                  className={editVisibility === value ? "active" : ""}
                  key={value}
                  onClick={() => setEditVisibility(value)}
                  type="button"
                >{label.replace("可见", "")}</button>
              ))}
            </div>
            {editVisibility === "selected" ? (
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
            ) : null}
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
