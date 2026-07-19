"use client";

/* eslint-disable @next/next/no-img-element -- Private media and local previews require browser-side URLs. */

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlignJustify, ChevronDown, Hourglass, MapPinned } from "lucide-react";
import Link from "next/link";
import {
  FormEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { AppShell, type ShellUser } from "@/app/components/AppShell";
import { DissolveTextarea } from "@/app/components/DissolveField";
import { ModalSurface } from "@/app/components/ModalSurface";
import {
  appendUniqueFiles,
  uploadMediaFiles,
  type UploadProgress,
} from "@/app/components/media-upload";
import { AnimatedReveal, SegmentedControl } from "@/app/components/SegmentedControl";
import { SoftReveal } from "@/app/components/SoftReveal";
import { TextStateSwap } from "@/app/components/TextStateSwap";
import type {
  CircleSummary,
  DraftMedia,
  FeedPost,
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

type SavedMedia = DraftMedia;

export function SocialHome({
  currentUser,
  friends,
  boardMedia,
  circles,
  circleList,
  friendList,
  latestContent,
}: {
  currentUser: ShellUser;
  friends: FriendSummary[];
  boardMedia: FeedPost["media"];
  circles: CircleSummary[];
  circleList: ReactNode;
  friendList: ReactNode;
  latestContent: ReactNode;
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [savedMedia, setSavedMedia] = useState<SavedMedia[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<PostVisibility>("friends");
  const [publishSpace, setPublishSpace] = useState<"personal" | "circle">("personal");
  const [selectedCircleId, setSelectedCircleId] = useState(circles[0]?.id ?? "");
  const [managementMode, setManagementMode] = useState<"creator" | "circle">(
    "creator",
  );
  const [viewerIds, setViewerIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [draftAction, setDraftAction] = useState<"save" | "discard" | null>(null);
  const [error, setError] = useState("");
  const [publisherOpen, setPublisherOpen] = useState(false);
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [rejectClosePulse, setRejectClosePulse] = useState(0);
  const [toggleContentWidths, setToggleContentWidths] = useState<{
    collapsed: number;
    expanded: number;
  } | null>(null);
  const closeTimer = useRef<number | null>(null);
  const composerSectionRef = useRef<HTMLDivElement>(null);
  const collapsedToggleMeasureRef = useRef<HTMLSpanElement>(null);
  const expandedToggleMeasureRef = useRef<HTMLSpanElement>(null);
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
  const toggleState = publisherOpen ? "expanded" : "collapsed";

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

  useLayoutEffect(() => {
    const collapsedMeasure = collapsedToggleMeasureRef.current;
    const expandedMeasure = expandedToggleMeasureRef.current;
    if (!collapsedMeasure || !expandedMeasure) return;

    const measure = () => {
      setToggleContentWidths({
        collapsed: collapsedMeasure.getBoundingClientRect().width,
        expanded: expandedMeasure.getBoundingClientRect().width,
      });
    };
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(collapsedMeasure);
    observer.observe(expandedMeasure);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!publisherOpen) return;
    const scrollTimer = window.setTimeout(() => {
      composerSectionRef.current?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "center",
      });
    }, reducedMotion ? 0 : 280);
    return () => window.clearTimeout(scrollTimer);
  }, [publisherOpen, reducedMotion]);

  function bringBoardItemForward(itemId: string) {
    setBoardOrder((current) => [...current.filter((currentId) => currentId !== itemId), itemId]);
  }

  function chooseVisibility(nextVisibility: PostVisibility) {
    setVisibility(nextVisibility);
    if (nextVisibility !== "selected") setViewerIds([]);
  }

  function chooseFiles(selected: FileList | null) {
    if (!selected) return;
    const result = appendUniqueFiles(files, selected, Math.max(0, 20 - savedMedia.length));
    setFiles(result.files);
    setError(result.omitted > 0 ? "已忽略重复图片，或已达到每条动态 20 张的上限。" : "");
  }

  function openPublisher() {
    if (publisherOpen) return;
    setPublisherOpen(true);
  }

  function finishClosingPublisher() {
    setRejectClosePulse(0);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setPublisherOpen(false);
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
    if (selectedFiles.length === 0) return [];
    setUploadProgress({ percent: 0, phase: "uploading" });
    return uploadMediaFiles(selectedFiles, setUploadProgress);
  }

  function draftPayload(mediaIds: string[], id = draftId) {
    return {
      id: id ?? undefined,
      body,
      visibility: publishSpace === "personal" ? visibility : "private",
      viewerIds: publishSpace === "personal" && visibility === "selected" ? viewerIds : [],
      circleId: publishSpace === "circle" ? selectedCircleId : null,
      managementMode,
      participantIds: publishSpace === "circle" ? [currentUser.id] : [],
      mediaIds,
      expectedUpdatedAt: id ? draftUpdatedAt ?? undefined : undefined,
    };
  }

  async function syncDraft(media: SavedMedia[]) {
    const response = await fetch("/api/drafts", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draftPayload(media.map((item) => item.id))),
    });
    const result = (await response.json()) as {
      id?: string | null;
      updatedAt?: string | null;
      error?: string;
    };
    if (!response.ok) throw new Error(result.error ?? "草稿保存失败。");
    setDraftId(result.id ?? null);
    setDraftUpdatedAt(result.updatedAt ?? null);
    return result.id ?? null;
  }

  async function saveAndCloseDraft() {
    setDraftAction("save");
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
      setUploadProgress(null);
      setPending(false);
      setDraftAction(null);
    }
  }

  function resetComposer() {
    setBody("");
    setFiles([]);
    setSavedMedia([]);
    setDraftId(null);
    setDraftUpdatedAt(null);
    setViewerIds([]);
    setVisibility("friends");
    setPublishSpace("personal");
    setSelectedCircleId(circles[0]?.id ?? "");
    setManagementMode("creator");
    setError("");
  }

  async function discardAndCloseDraft() {
    setDraftAction("discard");
    setPending(true);
    setError("");
    try {
      resetComposer();
      setDraftDialogOpen(false);
      finishClosingPublisher();
    } catch (discardError) {
      setError(discardError instanceof Error ? discardError.message : "内容放弃失败。");
      setDraftDialogOpen(false);
    } finally {
      setUploadProgress(null);
      setPending(false);
      setDraftAction(null);
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
      setUploadProgress(null);
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
      setUploadProgress(null);
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
                onClick={togglePublisher}
                type="button"
              >
                <motion.span
                  animate={toggleContentWidths
                    ? { width: toggleContentWidths[toggleState] }
                    : undefined}
                  className={`composer-toggle-content${toggleContentWidths ? " is-measured" : ""}`}
                  transition={{ duration: reducedMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span aria-hidden="true" className="composer-toggle-measure" ref={collapsedToggleMeasureRef}>
                    <span>写一条近况</span>
                    <AlignJustify size={17} strokeWidth={2.2} />
                  </span>
                  <span aria-hidden="true" className="composer-toggle-measure" ref={expandedToggleMeasureRef}>
                    <span>收起</span>
                    <ChevronDown size={18} strokeWidth={2.2} />
                  </span>
                  <AnimatePresence initial={false} mode="wait">
                    {toggleState === "expanded" ? (
                      <motion.span
                        animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
                        className="composer-toggle-state"
                        data-active="true"
                        exit={{ filter: "blur(2px)", opacity: 0, y: -4 }}
                        initial={{ filter: "blur(2px)", opacity: 0, y: 4 }}
                        key="expanded"
                        transition={{ duration: reducedMotion ? 0 : 0.15, ease: "easeInOut" }}
                      >
                        <span>收起</span>
                        <motion.span
                          animate={rejectClosePulse ? { rotate: [0, -84, 11, 0] } : { rotate: 0 }}
                          className="composer-toggle-glyph"
                          key={`composer-toggle-feedback-${rejectClosePulse}`}
                          transition={{ duration: reducedMotion ? 0 : 0.46, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <ChevronDown size={18} strokeWidth={2.2} />
                        </motion.span>
                      </motion.span>
                    ) : (
                      <motion.span
                        animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
                        className="composer-toggle-state"
                        data-active="true"
                        exit={{ filter: "blur(2px)", opacity: 0, y: -4 }}
                        initial={{ filter: "blur(2px)", opacity: 0, y: 4 }}
                        key="collapsed"
                        transition={{ duration: reducedMotion ? 0 : 0.15, ease: "easeInOut" }}
                      >
                        <span>写一条近况</span>
                        <AlignJustify className="composer-toggle-glyph" size={17} strokeWidth={2.2} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.span>
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
                {media ? <img alt={media.originalName} src={`/api/media/${media.id}/thumbnail`} /> : null}
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

        <div className="home-composer" ref={composerSectionRef}>
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
                  disabled:
                    (option.value === "circle" && circles.length === 0) ||
                    (Boolean(draftId) && option.value !== publishSpace),
                }))}
                value={publishSpace}
              />
              <AnimatedReveal show={publishSpace === "circle"}>
                <div className="circle-publish-options">
                  <label>
                    发布到
                    <select disabled={Boolean(draftId)} onChange={(event) => setSelectedCircleId(event.target.value)} value={selectedCircleId}>
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
              <DissolveTextarea
                id="post-body"
                maxLength={5000}
                onValueChange={setBody}
                placeholder="想说的话从这里写起吧……"
                value={body}
                wrapperClassName="composer-writing-surface"
              />

              {savedMedia.length || previews.length ? (
                <div className="upload-previews">
                  {savedMedia.map((media, index) => (
                    <figure key={media.id}>
                      <img alt={media.originalName} src={`/api/media/${media.id}/thumbnail`} />
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
                    onChange={(event) => {
                      chooseFiles(event.target.files);
                      event.currentTarget.value = "";
                    }}
                    type="file"
                  />
                </label>
                <span>{savedMedia.length + files.length > 0 ? `${savedMedia.length + files.length} / 20 张` : "JPG、PNG、WebP 或 HEIC"}</span>
                <div className="composer-submit-actions">
                  <button className="composer-close-action" disabled={pending} onClick={requestClosePublisher} type="button">收起</button>
                  <button className="publish-button" disabled={pending || !hasDraftContent} type="submit">
                    <TextStateSwap
                      labels={["发布", "正在上传 100%", "正在处理", "正在发布"]}
                      text={uploadProgress
                        ? uploadProgress.phase === "processing"
                          ? "正在处理"
                          : `正在上传 ${uploadProgress.percent}%`
                        : pending ? "正在发布" : "发布"}
                    />
                  </button>
                </div>
              </div>
            </form>
          </AnimatedReveal>
        </div>

        <div className="home-side-sections">
          <section className="home-circle-section home-summary-section">
            <div className="home-section-heading">
              <SoftReveal><h2>圈子</h2></SoftReveal>
              <Link href="/circles">查看全部</Link>
            </div>
            {circleList}
          </section>

          <section className="home-friend-section home-summary-section">
            <div className="home-section-heading">
              <SoftReveal><h2>朋友</h2></SoftReveal>
              <Link href="/friends">查看全部</Link>
            </div>
            {friendList}
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

        <section className="latest-section" ref={latestSectionRef}>
          <div className="section-line-heading">
            <SoftReveal><h2>最近动态</h2></SoftReveal>
            <Link href="/feed">查看全部</Link>
          </div>
          {latestContent}
        </section>
      </div>

      <ModalSurface
        labelledBy="draft-dialog-title"
        onRequestClose={() => {
          if (!pending) setDraftDialogOpen(false);
        }}
        open={draftDialogOpen}
        size="compact"
      >
        <div className="draft-dialog">
          <h2 id="draft-dialog-title">要保存这条未完成的记录吗？</h2>
          <p>保存后可以在其他设备上继续写，只有你自己能看到。</p>
          <div className="draft-dialog-actions">
            <button data-modal-initial-focus className="draft-save-action" disabled={pending} onClick={saveAndCloseDraft} type="button">
              <TextStateSwap
                labels={["保存并收起", "正在保存"]}
                text={draftAction === "save" ? "正在保存" : "保存并收起"}
              />
            </button>
            <button disabled={pending} onClick={discardAndCloseDraft} type="button">
              <TextStateSwap
                labels={[draftId ? "放弃本次修改" : "放弃内容", "正在放弃"]}
                text={draftAction === "discard" ? "正在放弃" : draftId ? "放弃本次修改" : "放弃内容"}
              />
            </button>
            <button disabled={pending} onClick={() => setDraftDialogOpen(false)} type="button">继续编辑</button>
          </div>
        </div>
      </ModalSurface>
    </AppShell>
  );
}
