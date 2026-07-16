"use client";

/* eslint-disable @next/next/no-img-element -- Private media and local previews require browser-side URLs. */

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Hourglass, MapPinned } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AppShell, type ShellUser } from "@/app/components/AppShell";
import { PostStream } from "@/app/components/PostStream";
import { AnimatedReveal, SegmentedControl } from "@/app/components/SegmentedControl";
import { SoftReveal } from "@/app/components/SoftReveal";
import type {
  CircleSummary,
  FeedPost,
  FriendSummary,
  HomeDraft,
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

type SavedMedia = HomeDraft["media"][number];

export function SocialHome({
  currentUser,
  friends,
  posts,
  boardMedia,
  circles,
  initialDraft,
}: {
  currentUser: ShellUser;
  friends: FriendSummary[];
  posts: FeedPost[];
  boardMedia: FeedPost["media"];
  circles: CircleSummary[];
  initialDraft: HomeDraft | null;
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const initialPublishSpace = initialDraft?.circleId ? "circle" : "personal";
  const [body, setBody] = useState(initialDraft?.body ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [savedMedia, setSavedMedia] = useState<SavedMedia[]>(initialDraft?.media ?? []);
  const [draftId, setDraftId] = useState(initialDraft?.id ?? null);
  const [visibility, setVisibility] = useState<PostVisibility>(initialDraft?.visibility ?? "friends");
  const [publishSpace, setPublishSpace] = useState<"personal" | "circle">(initialPublishSpace);
  const [selectedCircleId, setSelectedCircleId] = useState(initialDraft?.circleId ?? circles[0]?.id ?? "");
  const [managementMode, setManagementMode] = useState<"creator" | "circle">(
    initialDraft?.managementMode ?? "creator",
  );
  const [viewerIds, setViewerIds] = useState<string[]>(initialDraft?.viewerIds ?? []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [publisherOpen, setPublisherOpen] = useState(false);
  const [closingPublisher, setClosingPublisher] = useState(false);
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [rejectClosePulse, setRejectClosePulse] = useState(0);
  const closeTimer = useRef<number | null>(null);
  const latestSectionRef = useRef<HTMLElement>(null);
  const boardItemIds = useMemo(
    () => [0, 1, 2].map((index) => boardMedia[index]?.id ?? `empty-${index}`),
    [boardMedia],
  );
  const defaultBoardOrder = useMemo(
    () => [boardItemIds[0], boardItemIds[1], "note", boardItemIds[2]],
    [boardItemIds],
  );
  const [boardOrder, setBoardOrder] = useState(defaultBoardOrder);
  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );
  const note = warmNotes[new Date().getDate() % warmNotes.length];
  const hasDraftContent = Boolean(body.trim() || files.length || savedMedia.length);

  useEffect(
    () => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)),
    [previews],
  );

  useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    if (!draftDialogOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) setDraftDialogOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [draftDialogOpen, pending]);

  useEffect(() => {
    if (boardOrder.every((item, index) => item === defaultBoardOrder[index])) return;
    const resetTimer = window.setTimeout(() => setBoardOrder([...defaultBoardOrder]), 8000);
    return () => window.clearTimeout(resetTimer);
  }, [boardOrder, defaultBoardOrder]);

  function bringBoardItemForward(itemId: string) {
    setBoardOrder((current) => [...current.filter((currentId) => currentId !== itemId), itemId]);
  }

  function chooseVisibility(nextVisibility: PostVisibility) {
    setVisibility(nextVisibility);
    if (nextVisibility !== "selected") setViewerIds([]);
  }

  function chooseFiles(selected: FileList | null) {
    if (!selected) return;
    const available = Math.max(0, 20 - savedMedia.length);
    const next = Array.from(selected).slice(0, available);
    setFiles(next);
    setError(selected.length > available ? "每条动态最多选择 20 张图片。" : "");
  }

  function openPublisher() {
    if (publisherOpen) return;
    setClosingPublisher(false);
    setPublisherOpen(true);
  }

  function finishClosingPublisher() {
    setRejectClosePulse(0);
    setClosingPublisher(true);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setPublisherOpen(false);
      setClosingPublisher(false);
    }, reducedMotion ? 0 : 180);
  }

  function requestClosePublisher() {
    if (!publisherOpen || pending) return;
    if (hasDraftContent) {
      setRejectClosePulse((current) => current + 1);
      setDraftDialogOpen(true);
      return;
    }
    finishClosingPublisher();
  }

  function togglePublisher() {
    if (publisherOpen) requestClosePublisher();
    else openPublisher();
  }

  function scrollToLatest() {
    latestSectionRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  async function uploadFiles(selectedFiles: File[]) {
    const uploaded: SavedMedia[] = [];
    try {
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.set("file", file);
        const response = await fetch("/api/media", { method: "POST", body: formData });
        const result = (await response.json()) as {
          id?: string;
          name?: string;
          mimeType?: string;
          error?: string;
        };
        if (!response.ok || !result.id) throw new Error(result.error ?? "图片上传失败。");
        uploaded.push({
          id: result.id,
          originalName: result.name ?? file.name,
          mimeType: result.mimeType ?? file.type,
        });
      }
      return uploaded;
    } catch (uploadError) {
      await Promise.all(uploaded.map((media) => fetch(`/api/media/${media.id}`, { method: "DELETE" })));
      throw uploadError;
    }
  }

  function draftPayload(mediaIds: string[], id = draftId) {
    return {
      id: id ?? undefined,
      body,
      visibility: publishSpace === "personal" ? visibility : "private",
      viewerIds: publishSpace === "personal" && visibility === "selected" ? viewerIds : [],
      circleId: publishSpace === "circle" ? selectedCircleId : null,
      managementMode,
      mediaIds,
    };
  }

  async function syncDraft(media: SavedMedia[]) {
    const response = await fetch("/api/drafts", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draftPayload(media.map((item) => item.id))),
    });
    const result = (await response.json()) as { id?: string | null; error?: string };
    if (!response.ok) throw new Error(result.error ?? "草稿保存失败。");
    setDraftId(result.id ?? null);
    return result.id ?? null;
  }

  async function saveAndCloseDraft() {
    setPending(true);
    setError("");
    let uploaded: SavedMedia[] = [];
    try {
      uploaded = await uploadFiles(files);
      const nextMedia = [...savedMedia, ...uploaded];
      await syncDraft(nextMedia);
      setSavedMedia(nextMedia);
      setFiles([]);
      setDraftDialogOpen(false);
      finishClosingPublisher();
    } catch (saveError) {
      await Promise.all(uploaded.map((media) => fetch(`/api/media/${media.id}`, { method: "DELETE" })));
      setError(saveError instanceof Error ? saveError.message : "草稿保存失败。");
      setDraftDialogOpen(false);
    } finally {
      setPending(false);
    }
  }

  function resetComposer() {
    setBody("");
    setFiles([]);
    setSavedMedia([]);
    setDraftId(null);
    setViewerIds([]);
    setVisibility("friends");
    setPublishSpace("personal");
    setSelectedCircleId(circles[0]?.id ?? "");
    setManagementMode("creator");
    setError("");
  }

  async function discardAndCloseDraft() {
    setPending(true);
    setError("");
    try {
      if (draftId) {
        const response = await fetch(`/api/drafts/${draftId}`, { method: "DELETE" });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "草稿删除失败。");
      }
      resetComposer();
      setDraftDialogOpen(false);
      finishClosingPublisher();
    } catch (discardError) {
      setError(discardError instanceof Error ? discardError.message : "草稿删除失败。");
      setDraftDialogOpen(false);
    } finally {
      setPending(false);
    }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasDraftContent) return;
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
    let uploaded: SavedMedia[] = [];
    let syncedDraftId = draftId;
    let uploadsAttachedToDraft = false;
    try {
      uploaded = await uploadFiles(files);
      const nextMedia = [...savedMedia, ...uploaded];
      if (draftId) {
        syncedDraftId = await syncDraft(nextMedia);
        uploadsAttachedToDraft = true;
        setSavedMedia(nextMedia);
        setFiles([]);
      }
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...draftPayload(nextMedia.map((media) => media.id), syncedDraftId),
          draftId: syncedDraftId,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "发布失败。");

      resetComposer();
      setPublisherOpen(false);
      router.refresh();
    } catch (publishError) {
      if (!uploadsAttachedToDraft) {
        await Promise.all(uploaded.map((media) => fetch(`/api/media/${media.id}`, { method: "DELETE" })));
      }
      setError(publishError instanceof Error ? publishError.message : "发布失败。");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell pageClassName="home-page" user={currentUser}>
      <div className="home-dashboard">
        <section className="home-welcome">
          <SoftReveal><p className="eyebrow">欢迎回来，{currentUser.name}</p></SoftReveal>
          <SoftReveal delay={0.04}><h1>最近有什么，想留给朋友看看？</h1></SoftReveal>
          <SoftReveal delay={0.08}><p className="home-welcome-note">{note}</p></SoftReveal>
          <SoftReveal className="hero-actions-reveal" delay={0.12}>
            <div className="hero-actions" aria-label="首页快捷操作">
              <motion.button
                aria-expanded={publisherOpen}
                className={`primary-action composer-toggle${publisherOpen ? " is-open" : ""}`}
                layout
                onClick={togglePublisher}
                transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.8 }}
                type="button"
              >
                <AnimatePresence initial={false} mode="wait">
                  <motion.span
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    initial={{ opacity: 0, y: 3 }}
                    key={publisherOpen ? "close" : "open"}
                    transition={{ duration: reducedMotion ? 0 : 0.16 }}
                  >
                    {publisherOpen ? "收起" : "写一条近况"}
                  </motion.span>
                </AnimatePresence>
                <AnimatePresence>
                  {publisherOpen ? (
                    <motion.i
                      animate={
                        rejectClosePulse
                          ? { rotate: [90, 0, 104, 90] }
                          : { rotate: closingPublisher ? 0 : 90 }
                      }
                      aria-hidden="true"
                      className="composer-toggle-arrow"
                      exit={{ opacity: 0, scale: 0.8 }}
                      initial={{ opacity: 0, rotate: 0, scale: 0.8 }}
                      key="composer-toggle-arrow"
                      transition={
                        rejectClosePulse
                          ? { duration: reducedMotion ? 0 : 0.48, ease: [0.22, 1, 0.36, 1] }
                          : { duration: reducedMotion ? 0 : 0.18 }
                      }
                    />
                  ) : null}
                </AnimatePresence>
              </motion.button>
              <button className="secondary-action" onClick={scrollToLatest} type="button">看看朋友们</button>
            </div>
          </SoftReveal>
        </section>

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

        <div className="home-composer">
          <AnimatedReveal show={publisherOpen}>
            <form className="real-composer" onSubmit={publish}>
              <div className="composer-context">
                <span>{publishSpace === "personal" ? "个人动态" : circles.find((circle) => circle.id === selectedCircleId)?.name ?? "小圈子"}</span>
                <small>{draftId ? "正在继续一条未完成的记录" : "写好以后再决定留给谁看"}</small>
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
                placeholder="想说的话从这里写起吧……"
                value={body}
              />

              {savedMedia.length || previews.length ? (
                <div className="upload-previews">
                  {savedMedia.map((media, index) => (
                    <figure key={media.id}>
                      <img alt={media.originalName} src={`/api/media/${media.id}`} />
                      <button
                        aria-label={`移除图片 ${media.originalName}`}
                        className="remove-preview"
                        onClick={() => setSavedMedia((current) => current.filter((_, mediaIndex) => mediaIndex !== index))}
                        type="button"
                      ><span aria-hidden="true">×</span></button>
                    </figure>
                  ))}
                  {previews.map((preview, index) => (
                    <figure key={`${preview.file.name}-${preview.file.lastModified}-${index}`}>
                      <img alt="待发布预览" src={preview.url} />
                      <button
                        aria-label={`移除图片 ${preview.file.name}`}
                        className="remove-preview"
                        onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                        type="button"
                      ><span aria-hidden="true">×</span></button>
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
                        onChange={(event) => setViewerIds((current) =>
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
                <span>{savedMedia.length + files.length > 0 ? `${savedMedia.length + files.length} / 20 张` : "JPG、PNG、WebP 或 HEIC"}</span>
                <button className="publish-button" disabled={pending || !hasDraftContent} type="submit">
                  {pending ? "正在处理" : "发布"}
                </button>
              </div>
            </form>
          </AnimatedReveal>
        </div>

        <section className="home-circle-section home-summary-section">
          <div className="home-section-heading">
            <SoftReveal><h2>圈子</h2></SoftReveal>
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
            )) : <p className="summary-empty">还没有小圈子。</p>}
          </div>
        </section>

        <section className="home-friend-section home-summary-section">
          <div className="home-section-heading">
            <SoftReveal><h2>朋友</h2></SoftReveal>
            <Link href="/friends">查看全部</Link>
          </div>
          <div className="home-friend-list">
            {friends.length ? friends.slice(0, 5).map((friend) => (
              <Link href={`/profile/${friend.id}`} key={friend.id}>
                <span className="friend-avatar">{friend.image ? <img alt="" src={friend.image} /> : friend.displayName.slice(0, 1)}</span>
                <span><strong>{friend.displayName}</strong>{friend.displayName !== friend.identityName ? <small>{friend.identityName}</small> : friend.nickname ? <small>{friend.realName}</small> : null}</span>
              </Link>
            )) : <p className="summary-empty">还没有可以显示的朋友。</p>}
          </div>
        </section>

        <section className="latest-section" ref={latestSectionRef}>
          <div className="section-line-heading">
            <SoftReveal><h2>最近动态</h2></SoftReveal>
            <Link href="/feed">查看全部</Link>
          </div>
          <PostStream friends={friends} posts={posts} />
        </section>

        <section className="home-capsule-section home-summary-section home-feature-section">
          <div className="home-section-heading"><SoftReveal><h2>时光胶囊</h2></SoftReveal></div>
          <div className="home-feature-placeholder"><Hourglass aria-hidden="true" size={20} /><span>还没有封存的胶囊</span></div>
        </section>

        <section className="home-map-section home-summary-section home-feature-section">
          <div className="home-section-heading"><SoftReveal><h2>足迹地图</h2></SoftReveal></div>
          <div className="home-feature-placeholder"><MapPinned aria-hidden="true" size={20} /><span>还没有点亮的足迹</span></div>
        </section>
      </div>

      <AnimatePresence>
        {draftDialogOpen ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="draft-dialog-backdrop"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !pending) setDraftDialogOpen(false);
            }}
          >
            <motion.div
              animate={{ opacity: 1, scale: 1, y: 0 }}
              aria-labelledby="draft-dialog-title"
              aria-modal="true"
              className="draft-dialog"
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
              initial={{ opacity: 0, scale: 0.98, y: 8 }}
              role="dialog"
              transition={{ duration: reducedMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <h2 id="draft-dialog-title">要保存这条未完成的记录吗？</h2>
              <p>保存后可以在其他设备上继续写，只有你自己能看到。</p>
              <div className="draft-dialog-actions">
                <button autoFocus className="draft-save-action" disabled={pending} onClick={saveAndCloseDraft} type="button">保存并收起</button>
                <button disabled={pending} onClick={discardAndCloseDraft} type="button">放弃内容</button>
                <button disabled={pending} onClick={() => setDraftDialogOpen(false)} type="button">继续编辑</button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </AppShell>
  );
}
