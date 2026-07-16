"use client";

/* eslint-disable @next/next/no-img-element -- Private media and local previews require browser-side URLs. */

import Link from "next/link";
import {
  type CSSProperties,
  FormEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { PostStream } from "@/app/components/PostStream";
import { authClient } from "@/lib/auth-client";
import type {
  FeedPost,
  FriendSummary,
  PostVisibility,
} from "@/lib/content-types";

type CurrentUser = { id: string; name: string };

const warmNotes = [
  "不用把今天写得完整，留下一点就很好。",
  "普通的一天，也值得被朋友记得。",
  "有些照片现在平常，以后会很珍贵。",
  "慢一点，这里没有需要追赶的更新。",
];

const visibilityOptions = [
  ["friends", "朋友"],
  ["selected", "指定朋友"],
  ["private", "仅自己"],
] as const;

export function SocialHome({
  currentUser,
  friends,
  posts,
  boardMedia,
}: {
  currentUser: CurrentUser;
  friends: FriendSummary[];
  posts: FeedPost[];
  boardMedia: FeedPost["media"];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [visibility, setVisibility] = useState<PostVisibility>("friends");
  const [visibilitySliderPosition, setVisibilitySliderPosition] = useState<number | null>(null);
  const [viewerIds, setViewerIds] = useState<string[]>([]);
  const boardItemIds = useMemo(
    () => [0, 1, 2].map((index) => boardMedia[index]?.id ?? `empty-${index}`),
    [boardMedia],
  );
  const defaultBoardOrder = useMemo(
    () => [boardItemIds[0], boardItemIds[2], "note", boardItemIds[1]],
    [boardItemIds],
  );
  const [boardOrder, setBoardOrder] = useState(defaultBoardOrder);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );
  const note = warmNotes[new Date().getDate() % warmNotes.length];

  useEffect(
    () => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)),
    [previews],
  );

  useEffect(() => {
    if (boardOrder.every((item, index) => item === defaultBoardOrder[index])) {
      return;
    }

    const resetTimer = window.setTimeout(
      () => setBoardOrder([...defaultBoardOrder]),
      8000,
    );
    return () => window.clearTimeout(resetTimer);
  }, [boardOrder, defaultBoardOrder]);

  function bringBoardItemForward(itemId: string) {
    setBoardOrder((current) => [
      ...current.filter((currentId) => currentId !== itemId),
      itemId,
    ]);
  }

  function chooseVisibility(nextVisibility: PostVisibility) {
    setVisibility(nextVisibility);
    if (nextVisibility !== "selected") setViewerIds([]);
  }

  function getVisibilityPosition(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(2, ((event.clientX - bounds.left) / bounds.width) * 3 - 0.5),
    );
  }

  function beginVisibilityDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setVisibilitySliderPosition(getVisibilityPosition(event));
  }

  function moveVisibilityDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setVisibilitySliderPosition(getVisibilityPosition(event));
  }

  function finishVisibilityDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const nextIndex = Math.round(getVisibilityPosition(event));
    event.currentTarget.releasePointerCapture(event.pointerId);
    setVisibilitySliderPosition(null);
    chooseVisibility(visibilityOptions[nextIndex][0]);
  }

  function chooseFiles(selected: FileList | null) {
    if (!selected) return;
    const next = Array.from(selected).slice(0, 20);
    setFiles(next);
    setError(selected.length > 20 ? "每条动态最多选择 20 张图片。" : "");
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() && files.length === 0) return;
    if (visibility === "selected" && viewerIds.length === 0) {
      setError("请至少选择一位朋友。条目只会给你选中的人看见。");
      return;
    }

    setPending(true);
    setError("");
    const uploadedIds: string[] = [];
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.set("file", file);
        const uploadResponse = await fetch("/api/media", {
          method: "POST",
          body: formData,
        });
        const uploadResult = (await uploadResponse.json()) as {
          id?: string;
          error?: string;
        };
        if (!uploadResponse.ok || !uploadResult.id) {
          throw new Error(uploadResult.error ?? "图片上传失败。");
        }
        uploadedIds.push(uploadResult.id);
      }

      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body,
          visibility,
          viewerIds: visibility === "selected" ? viewerIds : [],
          mediaIds: uploadedIds,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "发布失败。");

      setBody("");
      setFiles([]);
      setViewerIds([]);
      setVisibility("friends");
      router.refresh();
    } catch (publishError) {
      await Promise.all(
        uploadedIds.map((id) => fetch(`/api/media/${id}`, { method: "DELETE" })),
      );
      setError(publishError instanceof Error ? publishError.message : "发布失败。");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="app-page">
      <header className="app-header">
        <Link className="brand" href="/home">
          <span className="brand-mark" aria-hidden="true">圆</span>
          <span>圆个圈 <small>Along</small></span>
        </Link>
        <nav className="app-nav" aria-label="主要导航">
          <Link className="active" href="/home">首页</Link>
          <Link href="/invites">朋友</Link>
          <details className="account-menu">
            <summary aria-label="打开个人菜单">{currentUser.name.slice(0, 1)}</summary>
            <div>
              <Link href={`/profile/${currentUser.id}`}>我的空间</Link>
              <Link href="/invites">共同邀请</Link>
              <button
                type="button"
                onClick={async () => {
                  await authClient.signOut();
                  window.location.href = "/";
                }}
              >
                退出登录
              </button>
            </div>
          </details>
        </nav>
      </header>

      <section className="home-intro">
        <div>
          <p className="eyebrow">欢迎回来，{currentUser.name}</p>
          <h1>最近有什么，想留给朋友看看？</h1>
          <p>{note}</p>
        </div>
        <aside className="memory-board" aria-label="最近留下的照片">
          {[0, 1, 2].map((index) => {
            const media = boardMedia[index];
            const itemId = media?.id ?? `empty-${index}`;
            return (
              <button
                aria-label={media ? `把照片 ${media.originalName} 放到最上面` : `把${["晚风", "一起", "最近"][index]}卡片放到最上面`}
                aria-pressed={boardOrder.at(-1) === itemId}
                className={`board-photo board-photo-${index + 1}${boardOrder.at(-1) === itemId ? " is-active" : ""}`}
                key={itemId}
                onClick={() => bringBoardItemForward(itemId)}
                style={{ zIndex: boardOrder.indexOf(itemId) + 1 }}
                type="button"
              >
                {media ? (
                  <img alt={media.originalName} src={`/api/media/${media.id}`} />
                ) : (
                  <span>{["晚风", "一起", "最近"][index]}</span>
                )}
              </button>
            );
          })}
          <button
            aria-label="把暖心便签放到最上面"
            aria-pressed={boardOrder.at(-1) === "note"}
            className={`board-note${boardOrder.at(-1) === "note" ? " is-active" : ""}`}
            onClick={() => bringBoardItemForward("note")}
            style={{ zIndex: boardOrder.indexOf("note") + 1 }}
            type="button"
          >
            {note}
          </button>
        </aside>
      </section>

      <div className="home-layout">
        <div className="home-main">
          <form className="real-composer" onSubmit={publish}>
            <div className="composer-context">
              <span>个人动态</span>
              <small>发布后显示在你的个人空间</small>
            </div>
            <label className="sr-only" htmlFor="post-body">动态正文</label>
            <textarea
              id="post-body"
              maxLength={5000}
              onChange={(event) => setBody(event.target.value)}
              placeholder="想起什么，就从这里轻轻写下吧……"
              value={body}
            />

            {previews.length > 0 ? (
              <div className="upload-previews">
                {previews.map((preview, index) => (
                  <figure key={`${preview.file.name}-${preview.file.lastModified}-${index}`}>
                    <img alt="待发布预览" src={preview.url} />
                    <button
                      aria-label={`移除图片 ${preview.file.name}`}
                      className="remove-preview"
                      onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                      type="button"
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </figure>
                ))}
              </div>
            ) : null}

            <div
              aria-label="可见范围"
              className={`visibility-control${visibilitySliderPosition === null ? "" : " dragging"}`}
              onPointerCancel={() => setVisibilitySliderPosition(null)}
              onPointerDown={beginVisibilityDrag}
              onPointerMove={moveVisibilityDrag}
              onPointerUp={finishVisibilityDrag}
              role="group"
              style={{
                "--visibility-position":
                  visibilitySliderPosition ??
                  visibilityOptions.findIndex(([value]) => value === visibility),
              } as CSSProperties}
            >
              {visibilityOptions.map(([value, label]) => (
                <button
                  aria-pressed={visibility === value}
                  className={visibility === value ? "active" : ""}
                  key={value}
                  onClick={(event) => {
                    if (event.detail === 0) chooseVisibility(value);
                  }}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>

            {visibility === "selected" ? (
              <fieldset className="friend-picker">
                <legend>选择能看到这条动态的朋友</legend>
                {friends.map((friend) => (
                  <label key={friend.id}>
                    <input
                      checked={viewerIds.includes(friend.id)}
                      onChange={(event) =>
                        setViewerIds((current) =>
                          event.target.checked
                            ? [...current, friend.id]
                            : current.filter((id) => id !== friend.id),
                        )
                      }
                      type="checkbox"
                    />
                    {friend.name}
                  </label>
                ))}
              </fieldset>
            ) : null}

            {error ? <p className="composer-error">{error}</p> : null}
            <div className="composer-tools">
              <label className="photo-input">
                添加照片
                <input
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  multiple
                  onChange={(event) => chooseFiles(event.target.files)}
                  type="file"
                />
              </label>
              <span>{files.length > 0 ? `${files.length} / 20 张` : "JPG、PNG、WebP 或 HEIC"}</span>
              <button
                className="publish-button"
                disabled={pending || (!body.trim() && files.length === 0)}
                type="submit"
              >
                {pending ? "正在发布" : "发布"}
              </button>
            </div>
          </form>

          <section className="latest-section">
            <div className="section-line-heading">
              <div>
                <p className="eyebrow">最近动态</p>
                <h2>朋友们新留下的片段</h2>
              </div>
              <Link href="/feed">查看全部</Link>
            </div>
            <PostStream
              currentUserId={currentUser.id}
              friends={friends}
              posts={posts}
            />
          </section>
        </div>

        <aside className="home-aside">
          <section>
            <div className="aside-heading">
              <h2>朋友</h2>
              <Link href="/invites">邀请</Link>
            </div>
            <div className="friend-list">
              {friends.length > 0 ? friends.map((friend) => (
                <Link href={`/profile/${friend.id}`} key={friend.id}>
                  <span>{friend.name.slice(0, 1)}</span>
                  <strong>{friend.name}</strong>
                </Link>
              )) : <p>还没有朋友，先完成一次共同邀请。</p>}
            </div>
          </section>
          <section className="future-links">
            <span>慢慢长出来的地方</span>
            <p>圈子、足迹和胶囊会在后续版本依次来到这里。</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
