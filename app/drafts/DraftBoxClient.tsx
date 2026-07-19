"use client";

/* eslint-disable @next/next/no-img-element -- Draft thumbnails use authenticated media routes. */

import { ArrowRight, FilePenLine, Image as ImageIcon, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { FullComposer } from "@/app/components/FullComposer";
import type {
  DraftDetail,
  DraftSummary,
  FriendSummary,
} from "@/lib/content-types";

function displayTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function listHref(input: {
  circleId?: string;
  page?: number;
  target?: "all" | "personal" | "circle";
}) {
  const params = new URLSearchParams();
  if (input.target && input.target !== "all") params.set("target", input.target);
  if (input.circleId) params.set("circleId", input.circleId);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  const query = params.toString();
  return query ? `/drafts?${query}` : "/drafts";
}

export function DraftBoxClient({
  circleId,
  drafts,
  friends,
  page,
  pageCount,
  selectedDraft,
  target,
  total,
  currentUserId,
}: {
  circleId?: string;
  currentUserId: string;
  drafts: DraftSummary[];
  friends: FriendSummary[];
  page: number;
  pageCount: number;
  selectedDraft: DraftDetail | null;
  target: "all" | "personal" | "circle";
  total: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [draftToDelete, setDraftToDelete] = useState<DraftSummary | null>(null);
  const [error, setError] = useState("");
  const [renderedDraft, setRenderedDraft] = useState(selectedDraft);
  const [draftModalOpen, setDraftModalOpen] = useState(Boolean(selectedDraft));
  const filterHref = listHref({ circleId, page, target });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (selectedDraft) {
        setRenderedDraft(selectedDraft);
        setDraftModalOpen(true);
      } else {
        setDraftModalOpen(false);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedDraft]);

  function openDraft(id: string) {
    if (window.matchMedia("(max-width: 700px)").matches) {
      router.push(
        `/drafts/${id}/edit?returnTo=${encodeURIComponent(filterHref)}`,
      );
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set("draftId", id);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function closeDraft() {
    setDraftModalOpen(false);
    const params = new URLSearchParams(window.location.search);
    params.delete("draftId");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  async function removeDraft(draft: DraftSummary) {
    setError("");
    setDeletingId(draft.id);
    const response = await fetch(`/api/drafts/${draft.id}`, {
      method: "DELETE",
    });
    setDeletingId(null);
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      setDraftToDelete(null);
      setError(result.error ?? "草稿删除失败。");
      return;
    }
    setDraftToDelete(null);
    if (selectedDraft?.id === draft.id) closeDraft();
    router.refresh();
  }

  const filteredCircleName =
    circleId && drafts[0]?.circle?.id === circleId
      ? drafts[0].circle.name
      : null;

  return (
    <>
      <section className="draft-box-heading">
        <div>
          <p className="eyebrow">
            <FilePenLine aria-hidden="true" size={15} />
            草稿箱
          </p>
          <h1>
            {filteredCircleName
              ? `${filteredCircleName} 的未完成记录`
              : "慢慢写完也没关系"}
          </h1>
          <p>这里保存尚未发布的内容，只有你自己能看到。</p>
        </div>
        <div className="draft-box-total" aria-label={`共有 ${total} 条未完成草稿`}>
          <strong>{total}</strong>
          <span>条未完成</span>
        </div>
      </section>

      <nav className="draft-filter-tabs" aria-label="草稿筛选">
        <span className="draft-filter-label">按发布位置查看</span>
        <span className="draft-filter-options">
          <Link
            className={target === "all" && !circleId ? "active" : ""}
            href={listHref({ target: "all" })}
          >
            全部
          </Link>
          <Link
            className={target === "personal" && !circleId ? "active" : ""}
            href={listHref({ target: "personal" })}
          >
            个人动态
          </Link>
          <Link
            className={target === "circle" && !circleId ? "active" : ""}
            href={listHref({ target: "circle" })}
          >
            圈子动态
          </Link>
          {circleId ? (
            <Link className="active" href={listHref({ circleId })}>
              当前圈子
            </Link>
          ) : null}
        </span>
      </nav>
      {error ? <p className="composer-error draft-box-error">{error}</p> : null}

      {drafts.length ? (
        <section className="draft-grid" aria-live="polite">
          {drafts.map((draft) => (
            <article
              className={`draft-card${draft.media[0] ? " has-media" : ""}${draft.canPublish ? "" : " is-unavailable"}`}
              key={draft.id}
            >
              <button
                className="draft-card-main"
                onClick={() => openDraft(draft.id)}
                type="button"
              >
                {!draft.media[0] ? (
                  <span className="draft-card-text-mark">
                    <FilePenLine aria-hidden="true" size={20} />
                  </span>
                ) : null}
                <span className="draft-card-copy">
                  <span className="draft-card-meta">
                    <span>{draft.circle?.name ?? "个人动态"}</span>
                    <small>更新于 {displayTime(draft.updatedAt)}</small>
                  </span>
                  <strong>
                    {draft.body.trim() || "一份只有照片的草稿"}
                  </strong>
                  {draft.unavailableReason ? (
                    <em>{draft.unavailableReason}</em>
                  ) : null}
                  <span className="draft-card-continue">
                    继续编辑
                    <ArrowRight aria-hidden="true" size={14} />
                  </span>
                </span>
                {draft.media[0] ? (
                  <span className="draft-card-preview">
                    <img
                      alt=""
                      src={`/api/media/${draft.media[0].id}/thumbnail`}
                    />
                    <small>
                      <ImageIcon aria-hidden="true" size={13} />
                      {draft.mediaCount}
                    </small>
                  </span>
                ) : null}
              </button>
              <button
                aria-label="删除草稿"
                className="draft-delete-action"
                disabled={deletingId === draft.id}
                onClick={() => setDraftToDelete(draft)}
                type="button"
              >
                <Trash2 size={16} />
              </button>
            </article>
          ))}
        </section>
      ) : (
        <section className="quiet-empty draft-empty">
          <FilePenLine aria-hidden="true" size={28} />
          <strong>这里还没有草稿</strong>
          <p>从个人主页、圈子或首页保存未完成的内容后，会出现在这里。</p>
        </section>
      )}

      {pageCount > 1 ? (
        <nav className="draft-pagination" aria-label="草稿分页">
          {page > 1 ? (
            <Link href={listHref({ circleId, page: page - 1, target })}>
              上一页
            </Link>
          ) : (
            <span />
          )}
          <small>
            第 {page} / {pageCount} 页
          </small>
          {page < pageCount ? (
            <Link href={listHref({ circleId, page: page + 1, target })}>
              下一页
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}

      {renderedDraft ? (
        <FullComposer
          circleMembers={renderedDraft.circleMembers}
          currentUserId={currentUserId}
          friends={friends}
          initialDraft={renderedDraft}
          modalOpen={draftModalOpen}
          onClose={closeDraft}
          onModalAfterClose={() => setRenderedDraft(null)}
          onPublished={() => {
            closeDraft();
            router.refresh();
          }}
          presentation="modal"
          returnHref={filterHref}
          target={
            renderedDraft.circle
              ? {
                  kind: "circle",
                  id: renderedDraft.circle.id,
                  name: renderedDraft.circle.name,
                }
              : { kind: "personal" }
          }
        />
      ) : null}

      <ConfirmDialog
        busy={Boolean(deletingId)}
        confirmLabel="删除草稿"
        description={`这条${draftToDelete?.circle ? "圈子" : "个人"}草稿和尚未发布的照片会一并清理。`}
        onCancel={() => setDraftToDelete(null)}
        onConfirm={() => {
          if (draftToDelete) void removeDraft(draftToDelete);
        }}
        open={Boolean(draftToDelete)}
        title="确定删除这条草稿吗？"
        tone="danger"
      />
    </>
  );
}
