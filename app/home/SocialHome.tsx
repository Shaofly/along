"use client";

/* eslint-disable @next/next/no-img-element -- Private media and local previews require browser-side URLs. */

import Link from "next/link";
import Image from "next/image";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { PostStream } from "@/app/components/PostStream";
import { AppShell, type ShellUser } from "@/app/components/AppShell";
import { AnimatedReveal, SegmentedControl } from "@/app/components/SegmentedControl";
import type {
  FeedPost,
  CircleSummary,
  FriendSummary,
  PostVisibility,
} from "@/lib/content-types";

const warmNotes = [
  "不用把今天写得完整，留下一点就很好。",
  "普通的一天，也值得被朋友记得。",
  "有些照片现在平常，以后会很珍贵。",
  "慢一点，这里没有需要追赶的更新。",
];

const visibilityOptions = [
  { value: "friends", label: "朋友" },
  { value: "selected", label: "指定朋友" },
  { value: "private", label: "仅自己" },
] as const;

const publishSpaceOptions = [
  { value: "personal", label: "我的空间" },
  { value: "circle", label: "小圈子" },
] as const;

const managementOptions = [
  { value: "creator", label: "仅我管理" },
  { value: "circle", label: "共同管理" },
] as const;

export function SocialHome({
  currentUser,
  friends,
  posts,
  boardMedia,
  circles,
}: {
  currentUser: ShellUser;
  friends: FriendSummary[];
  posts: FeedPost[];
  boardMedia: FeedPost["media"];
  circles: CircleSummary[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [visibility, setVisibility] = useState<PostVisibility>("friends");
  const [publishSpace, setPublishSpace] = useState<"personal" | "circle">("personal");
  const [selectedCircleId, setSelectedCircleId] = useState(circles[0]?.id ?? "");
  const [managementMode, setManagementMode] = useState<"creator" | "circle">("creator");
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
  const [publisherOpen, setPublisherOpen] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!publisherOpen || body.trim() || files.length) return;
    function closeEmptyPublisher(event: PointerEvent) {
      if (!composerRef.current?.contains(event.target as Node)) setPublisherOpen(false);
    }
    document.addEventListener("pointerdown", closeEmptyPublisher);
    return () => document.removeEventListener("pointerdown", closeEmptyPublisher);
  }, [body, files.length, publisherOpen]);

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

  function chooseFiles(selected: FileList | null) {
    if (!selected) return;
    const next = Array.from(selected).slice(0, 20);
    setFiles(next);
    setError(selected.length > 20 ? "每条动态最多选择 20 张图片。" : "");
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() && files.length === 0) return;
    if (publishSpace === "personal" && visibility === "selected" && viewerIds.length === 0) {
      setError("请至少选择一位朋友。条目只会给你选中的人看见。");
      return;
    }
    if (publishSpace === "circle" && !selectedCircleId) {
      setError("请先选择一个小圈子。");
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
          visibility: publishSpace === "personal" ? visibility : "private",
          viewerIds: publishSpace === "personal" && visibility === "selected" ? viewerIds : [],
          circleId: publishSpace === "circle" ? selectedCircleId : null,
          managementMode,
          mediaIds: uploadedIds,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "发布失败。");

      setBody("");
      setFiles([]);
      setViewerIds([]);
      setVisibility("friends");
      setManagementMode("creator");
      setPublisherOpen(false);
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
    <AppShell pageClassName="home-page" user={currentUser}>
      <div className="home-dashboard">
        <section className="home-welcome">
          <p className="eyebrow">欢迎回来，{currentUser.name}</p>
          <h1>最近有什么，想留给朋友看看？</h1>
          <p>{note}</p>
        </section>

        <div className="home-composer" ref={composerRef}>
          {!publisherOpen ? (
            <button className="composer-launcher" onClick={() => setPublisherOpen(true)} type="button">
              <span>{currentUser.name.slice(0, 1)}</span>
              <strong>写点什么……</strong>
              <small>留下一点今天发生的事</small>
            </button>
          ) : null}
          <AnimatedReveal show={publisherOpen}>
            <form className="real-composer" onSubmit={publish}>
            <div className="composer-context">
              <span>{publishSpace === "personal" ? "个人动态" : circles.find((circle) => circle.id === selectedCircleId)?.name ?? "小圈子"}</span>
              <small>{publishSpace === "personal" ? "发布后显示在你的个人空间" : "只留给圈内有权访问的成员"}</small>
            </div>
            <SegmentedControl
              ariaLabel="发布空间"
              className="publish-space-control"
              onValueChange={setPublishSpace}
              options={publishSpaceOptions.map((option) => ({
                ...option,
                disabled: option.value === "circle" && circles.length === 0,
              }))}
              value={publishSpace}
            />
            <AnimatedReveal show={publishSpace === "circle"}>
              <div className="circle-publish-options">
                <label>
                  发布到
                  <select onChange={(event) => setSelectedCircleId(event.target.value)} value={selectedCircleId}>
                    {circles.map((circle) => <option key={circle.id} value={circle.id}>{circle.name}</option>)}
                  </select>
                </label>
                <div role="group" aria-label="管理方式">
                  <span>管理方式</span>
                  <SegmentedControl
                    ariaLabel="圈子动态管理方式"
                    className="segmented-control--compact"
                    onValueChange={setManagementMode}
                    options={managementOptions}
                    value={managementMode}
                  />
                </div>
              </div>
            </AnimatedReveal>
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

            <AnimatedReveal show={publishSpace === "personal"}>
              <SegmentedControl
                ariaLabel="可见范围"
                className="visibility-control"
                onValueChange={chooseVisibility}
                options={visibilityOptions}
                value={visibility}
              />
            </AnimatedReveal>

            <AnimatedReveal show={publishSpace === "personal" && visibility === "selected"}>
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
            </AnimatedReveal>

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
          </AnimatedReveal>
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
                {media ? <img alt={media.originalName} src={`/api/media/${media.id}`} /> : null}
                <span className="photo-glass-label">{["晚风", "一起", "最近"][index]}</span>
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

        <section className="home-circle-section home-summary-section">
          <div className="home-section-heading">
            <div><p className="eyebrow">圈子</p><h2>一起留下的地方</h2></div>
            <Link href="/circles">查看全部</Link>
          </div>
          <div className="home-circle-list">
            {circles.length ? circles.slice(0, 3).map((circle, index) => (
              <Link className={`home-circle-item circle-tone-${(index % 3) + 1}`} href={`/circles/${circle.id}`} key={circle.id}>
                <span className="home-circle-cover">{circle.name.slice(0, 1)}</span>
                <span><strong>{circle.name}</strong><small>{circle.description || `${circle.members.length} 位成员在这里记录`}</small></span>
                <span className="mini-avatar-stack" aria-label={`${circle.members.length} 位成员`}>
                  {circle.members.slice(0, 3).map((member) => <i key={member.id}>{member.name.slice(0, 1)}</i>)}
                </span>
              </Link>
            )) : <p className="summary-empty">还没有小圈子，等一群熟悉的人慢慢聚到这里。</p>}
          </div>
        </section>

        <section className="home-friend-section home-summary-section">
          <div className="home-section-heading">
            <div><p className="eyebrow">朋友</p><h2>熟悉的人</h2></div>
            <Link href="/friends">查看全部</Link>
          </div>
          <div className="home-friend-list">
            {friends.length ? friends.slice(0, 5).map((friend) => (
              <Link href={`/profile/${friend.id}`} key={friend.id}>
                <span className="friend-avatar">{friend.image ? <img alt="" src={friend.image} /> : friend.displayName.slice(0, 1)}</span>
                <span><strong>{friend.displayName}</strong>{friend.displayName !== friend.identityName ? <small>{friend.identityName}</small> : friend.nickname ? <small>{friend.realName}</small> : null}</span>
              </Link>
            )) : <p className="summary-empty">完成共同邀请后，朋友会自然出现在这里。</p>}
          </div>
        </section>

        <section className="latest-section">
          <div className="section-line-heading">
            <div>
              <p className="eyebrow">最近动态</p>
              <h2>朋友们新留下的片段</h2>
            </div>
            <Link href="/feed">查看全部</Link>
          </div>
          <PostStream friends={friends} posts={posts} />
        </section>
      </div>

      <footer className="mobile-home-signature">
        <Image alt="圆个圈 Along" height={80} src="/branding/along-logo.png" width={200} />
      </footer>
    </AppShell>
  );
}
