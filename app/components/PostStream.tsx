"use client";

/* eslint-disable @next/next/no-img-element -- Private media URLs require the viewer's session cookie. */

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { PhotoViewer } from "@/app/components/PhotoViewer";
import { PostEditor } from "@/app/components/PostEditor";
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
  friends,
}: {
  posts: FeedPost[];
  friends: FriendSummary[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [editing, setEditing] = useState<FeedPost | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [postToDelete, setPostToDelete] = useState<FeedPost | null>(null);
  const [viewer, setViewer] = useState<{
    post: FeedPost;
    index: number;
    originRect: DOMRect;
    originRadius: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!posts.some((post) => post.publicationStatus === "publishing")) return;
    const timer = window.setInterval(() => router.refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [posts, router]);

  function beginEdit(post: FeedPost) {
    if (window.matchMedia("(max-width: 700px)").matches) {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      router.push(
        `/posts/${post.id}/edit?returnTo=${encodeURIComponent(returnTo)}`,
      );
      return;
    }
    setEditing(post);
    setEditorOpen(true);
    setError("");
  }

  function cancelEdit() {
    setEditorOpen(false);
    setError("");
  }

  async function removePost(post: FeedPost) {
    setPending(true);
    const response = await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
    setPending(false);
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      setError(result.error ?? "删除失败。");
      return;
    }
    setPostToDelete(null);
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
                    {post.canDelete ? <button disabled={pending} onClick={() => setPostToDelete(post)} type="button">删除</button> : null}
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
                      onClick={(event) => {
                        const originImage = event.currentTarget.querySelector("img");
                        const originElement = originImage ?? event.currentTarget;
                        const originRadius = Number.parseFloat(
                          window.getComputedStyle(originElement).borderTopLeftRadius,
                        );
                        setViewer({
                          post,
                          index: mediaIndex,
                          originRect: originElement.getBoundingClientRect(),
                          originRadius: Number.isFinite(originRadius) ? originRadius : 0,
                        });
                      }}
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
        <PostEditor
          friends={friends}
          modalOpen={editorOpen}
          onClose={cancelEdit}
          onModalAfterClose={() => setEditing(null)}
          post={editing}
          presentation="modal"
          returnHref={pathname}
        />
      ) : null}

      <ConfirmDialog
        busy={pending}
        confirmLabel="删除动态"
        description={
          postToDelete?.circle
            ? "圈内成员将无法再看到正文和其中的照片。"
            : "这条个人动态及其中的照片会一并删除。"
        }
        onCancel={() => setPostToDelete(null)}
        onConfirm={() => {
          if (postToDelete) void removePost(postToDelete);
        }}
        open={Boolean(postToDelete)}
        title="确定删除这条动态吗？"
        tone="danger"
      />

      {viewer ? (
        <PhotoViewer
          author={viewer.post.author}
          body={viewer.post.body}
          initialIndex={viewer.index}
          onClose={() => setViewer(null)}
          originRect={viewer.originRect}
          originRadius={viewer.originRadius}
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
