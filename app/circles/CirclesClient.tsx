"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Minus, Plus } from "lucide-react";

import { CircleCreateForm } from "@/app/circles/CircleCreateForm";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { AnimatedReveal } from "@/app/components/SegmentedControl";
import { TextStateSwap } from "@/app/components/TextStateSwap";
import { UserAvatar } from "@/app/components/UserAvatar";
import { circleThemeClass, type CircleTheme } from "@/lib/circle-theme";
import type { CircleSummary, FriendSummary } from "@/lib/content-types";

type CircleAction = {
  actionId: string;
  actionType: "creation" | "proposal";
  circleId?: string;
  circleName: string;
  theme: CircleTheme;
  candidateName: string;
  displayName: string;
  image: string | null;
  kind: "creation" | "add" | "rejoin";
  allowHistory: boolean;
  expiresAt: string;
  role: "candidate" | "approver";
};

type CircleCreationRequest = {
  id: string;
  name: string;
  description: string;
  theme: CircleTheme;
  status: "pending" | "failed";
  expiresAt: string;
  resolvedAt: string | null;
  invitees: Array<{
    id: string;
    name: string;
    status: "pending" | "accepted" | "declined" | "expired";
  }>;
};

function deadlineLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function activityLabel(value: string) {
  const target = new Date(value);
  const today = new Date();
  const sameDay = target.toDateString() === today.toDateString();
  if (sameDay) return "今天更新";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (target.toDateString() === yesterday.toDateString()) return "昨天更新";
  return `${target.getMonth() + 1} 月 ${target.getDate()} 日更新`;
}

function CircleCover({
  className,
  image,
  name,
  theme,
}: {
  className?: string;
  image: string | null;
  name: string;
  theme: CircleTheme;
}) {
  const classes = `${className ?? ""} ${circleThemeClass(theme)}${image ? "" : " circle-cover-fallback"}`.trim();
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element -- authenticated media routes are not compatible with next/image.
    return <img alt="" className={classes} decoding="async" src={image} />;
  }
  return (
    <span aria-hidden="true" className={classes}>
      {Array.from(name.trim())[0] ?? "圈"}
    </span>
  );
}

function CircleMemberAvatars({
  members,
}: {
  members: CircleSummary["members"];
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  function setShifts(activeIndex: number | null, phase: "in" | "out") {
    if (!rootRef.current) return;
    const computed = getComputedStyle(document.documentElement);
    const numberValue = (name: string, fallback: number) => {
      const value = Number.parseFloat(computed.getPropertyValue(name));
      return Number.isFinite(value) ? value : fallback;
    };
    const easing = (name: string, fallback: string) =>
      computed.getPropertyValue(name).trim() || fallback;
    const lift = numberValue("--avatar-lift", -4);
    const falloff = numberValue("--avatar-falloff", 0.45);
    const scale = numberValue("--avatar-scale", 1.05);
    const timingFunction = phase === "out"
      ? easing("--avatar-ease-out", "cubic-bezier(0.34, 3.85, 0.64, 1)")
      : easing("--avatar-ease-in", "cubic-bezier(0.22, 1, 0.36, 1)");

    rootRef.current.querySelectorAll<HTMLElement>(".t-avatar").forEach((element, index) => {
      element.style.transitionTimingFunction = timingFunction;
      if (activeIndex === null) {
        element.style.setProperty("--shift", "0px");
        element.style.setProperty("--scale-active", "1");
        return;
      }
      const distance = Math.abs(index - activeIndex);
      element.style.setProperty(
        "--shift",
        `${(lift * Math.pow(falloff, distance)).toFixed(3)}px`,
      );
      element.style.setProperty(
        "--scale-active",
        index === activeIndex ? String(scale) : "1",
      );
    });
  }

  return (
    <div
      aria-hidden="true"
      className="circle-member-stack t-avatar-group"
      onMouseLeave={() => setShifts(null, "out")}
      ref={rootRef}
    >
      {members.slice(0, 5).map((member, index) => (
        <span
          className="t-avatar"
          key={member.id}
          onMouseEnter={() => setShifts(index, "in")}
        >
          <UserAvatar image={member.image} name={member.name} />
        </span>
      ))}
    </div>
  );
}

function actionCopy(action: CircleAction) {
  if (action.role === "approver") {
    return `是否同意 ${action.candidateName} 加入「${action.circleName}」？`;
  }
  if (action.kind === "creation") {
    return `${action.displayName} 邀请你共同建立「${action.circleName}」`;
  }
  if (action.kind === "rejoin") {
    return `「${action.circleName}」邀请你确认重新加入`;
  }
  return `「${action.circleName}」邀请你加入`;
}

export function CirclesClient({
  circles,
  actions,
  creationRequests,
  friends,
}: {
  circles: CircleSummary[];
  actions: CircleAction[];
  creationRequests: CircleCreationRequest[];
  friends: FriendSummary[];
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [archiveToDelete, setArchiveToDelete] = useState<CircleSummary | null>(null);

  const active = circles.filter((circle) => circle.isActive);
  const historical = circles.filter((circle) => !circle.isActive);
  const circleById = new Map(active.map((circle) => [circle.id, circle]));
  const circleMessages = active.filter((circle) => circle.unread.total > 0);

  async function respond(action: CircleAction, decision: "accept" | "decline") {
    setPending(true);
    setError("");
    const endpoint =
      action.actionType === "creation"
        ? `/api/circles/creation-requests/${action.actionId}/respond`
        : `/api/circles/proposals/${action.actionId}/respond`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "处理失败。");
      return;
    }
    router.refresh();
  }

  async function acknowledgeCreationResult(requestId: string) {
    setPending(true);
    setError("");
    const response = await fetch(
      `/api/circles/creation-requests/${requestId}/acknowledge`,
      { method: "POST" },
    );
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "确认结果失败。");
      return;
    }
    router.refresh();
  }

  async function restoreCircle(circle: CircleSummary) {
    setPending(true);
    setError("");
    const response = await fetch(`/api/circles/${circle.id}/restore`, {
      method: "POST",
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "恢复圈子失败。");
      return;
    }
    router.refresh();
  }

  async function deleteArchive() {
    if (!archiveToDelete) return;
    setPending(true);
    setError("");
    const response = await fetch(`/api/circles/${archiveToDelete.id}/archive`, {
      method: "DELETE",
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "档案删除失败。");
      return;
    }
    setArchiveToDelete(null);
    router.refresh();
  }

  return (
    <>
      <section className="circle-page-intro" aria-labelledby="circle-page-title">
        <div>
          <h1 id="circle-page-title">圈子</h1>
          <p className="circle-intro-copy">查看你参与的圈子、邀请和共同记录</p>
          <p className="circle-intro-meta">
            <span>{active.length} 个圈子</span>
            {actions.length ? <span className="has-attention">{actions.length} 项待回应</span> : null}
          </p>
        </div>
        <button
          aria-expanded={showCreate}
          className="circle-create-command circle-create-command--desktop"
          onClick={() => setShowCreate((value) => !value)}
          type="button"
        >
          <span className="t-icon-swap" data-state={showCreate ? "b" : "a"}>
            <Plus aria-hidden="true" className="t-icon" data-icon="a" size={18} strokeWidth={1.8} />
            <Minus aria-hidden="true" className="t-icon" data-icon="b" size={18} strokeWidth={1.8} />
          </span>
          <TextStateSwap
            labels={["建立圈子", "收起"]}
            text={showCreate ? "收起" : "建立圈子"}
          />
        </button>
      </section>

      <AnimatedReveal className="inline-panel-reveal circle-create-reveal" show={showCreate}>
        <div className="t-panel-slide inline-form-panel" data-open={showCreate}>
          <CircleCreateForm
            friends={friends}
            onCreated={() => setShowCreate(false)}
          />
        </div>
      </AnimatedReveal>

      {error && !showCreate ? <p className="composer-error circle-page-error">{error}</p> : null}

      <div className="circle-dashboard-layout">
        <main className="circle-dashboard-main">
          <section className="circle-primary-section" aria-labelledby="active-circles-title">
            <header className="circle-subsection-heading">
              <h2 id="active-circles-title">我的圈子</h2>
              <span aria-label={`${active.length} 个圈子`} className="circle-section-count">
                {active.length}
              </span>
            </header>
            <div className="circle-index-list">
              {active.length ? active.map((circle) => (
                <article className={`circle-index-row ${circleThemeClass(circle.theme)}`} key={circle.id}>
                  <Link className="t-learn" href={`/circles/${circle.id}`}>
                    <CircleCover className="circle-index-cover" image={circle.coverImage} name={circle.name} theme={circle.theme} />
                    <div className="circle-index-copy">
                      <div className="circle-member-line">
                        <CircleMemberAvatars members={circle.members} />
                        <span>{circle.members.length} 位成员</span>
                      </div>
                      <div className="circle-index-title">
                        <h3>{circle.name}</h3>
                        <span aria-hidden="true" className="circle-index-arrow">
                          <span className="t-learn-chevron">
                            <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" viewBox="0 0 16 16">
                              <path className="t-learn-arm t-learn-arm-top" d="M6 4L10 8" />
                              <path className="t-learn-arm t-learn-arm-bot" d="M10 8L6 12" />
                            </svg>
                          </span>
                        </span>
                      </div>
                      <p>{circle.description || "这个圈子还没有简介。"}</p>
                      <span className="circle-index-update">{activityLabel(circle.updatedAt)}</span>
                      {circle.unread.total ? (
                        <span className="circle-unread-note">{circle.unread.total} 条新消息</span>
                      ) : null}
                    </div>
                  </Link>
                </article>
              )) : (
                <div className="circle-empty">
                  <strong>还没有圈子</strong>
                  <p>建立一个圈子，邀请朋友加入。</p>
                </div>
              )}
            </div>
          </section>

          {creationRequests.length ? (
            <section className="circle-progress-section" aria-labelledby="circle-creation-title">
              <header className="circle-subsection-heading">
                <div>
                  <p className="eyebrow">建立进度</p>
                  <h2 id="circle-creation-title">建立中的圈子</h2>
                </div>
              </header>
              <div className="circle-progress-list">
                {creationRequests.map((request) => {
                  const groups = [
                    { key: "accepted", label: "已接受" },
                    { key: "pending", label: "未处理" },
                    { key: "declined", label: "已拒绝" },
                    { key: "expired", label: "已到期" },
                  ] as const;
                  return (
                    <article className={`circle-progress-row ${circleThemeClass(request.theme)}`} key={request.id}>
                      <div className="circle-progress-intro">
                        <CircleCover className="circle-progress-cover" image={null} name={request.name} theme={request.theme} />
                        <div>
                          <h3>{request.name}</h3>
                          <p>
                            {request.status === "pending"
                              ? `截止 ${deadlineLabel(request.expiresAt)}`
                              : "本次没有建立"}
                          </p>
                        </div>
                      </div>
                      <div className="circle-progress-groups">
                        {groups.map((group) => {
                          const invitees = request.invitees.filter((invitee) => invitee.status === group.key);
                          if (group.key === "expired" && !invitees.length) return null;
                          return (
                            <div className={`circle-progress-group is-${group.key}`} key={group.key}>
                              <span>{group.label} · {invitees.length}</span>
                              <div>
                                {invitees.length ? invitees.map((invitee) => (
                                  <span key={invitee.id} title={invitee.name}>
                                    <UserAvatar image={null} name={invitee.name} />
                                  </span>
                                )) : <small>暂无</small>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {request.status === "failed" ? (
                        <button
                          className="soft-command"
                          disabled={pending}
                          onClick={() => acknowledgeCreationResult(request.id)}
                          type="button"
                        >
                          知道了
                        </button>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {historical.length ? (
            <section className="circle-archive-section" aria-labelledby="circle-archive-title">
              <header className="circle-subsection-heading">
                <div>
                  <p className="eyebrow">共同档案</p>
                  <h2 id="circle-archive-title">已经离开的圈子关系</h2>
                </div>
              </header>
              <div className="circle-archive-list">
                {historical.map((circle) => (
                  <article className={`circle-archive-row ${circleThemeClass(circle.theme)}`} key={circle.id}>
                    <Link href={`/circles/${circle.id}`}>
                      <CircleCover className="circle-archive-cover" image={circle.coverImage} name={circle.name} theme={circle.theme} />
                      <div>
                        <strong>{circle.name}</strong>
                        <span>
                          {circle.status === "frozen" && circle.deleteAt
                            ? `圈子已冻结，将于 ${deadlineLabel(circle.deleteAt)} 彻底删除`
                            : "过去的记录仍可只读查看"}
                        </span>
                      </div>
                    </Link>
                    <div className="circle-archive-actions">
                      {circle.canRestore ? (
                        <button className="circle-text-action" disabled={pending} onClick={() => restoreCircle(circle)} type="button">
                          恢复圈子
                        </button>
                      ) : null}
                      <button className="circle-text-action danger" disabled={pending} onClick={() => setArchiveToDelete(circle)} type="button">
                        删除档案
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </main>

        <aside
          className={`circle-sidebar${actions.length ? " has-actions" : ""}${!actions.length && !circleMessages.length ? " is-empty" : ""}`}
          aria-label="圈子提醒"
        >
          {!actions.length && !circleMessages.length ? (
            <section className="circle-rail-quiet">
              <strong>暂无新消息</strong>
              <p>邀请、审批和圈子更新会显示在这里。</p>
            </section>
          ) : null}

          {actions.length ? (
            <section className="circle-rail-section" aria-labelledby="circle-actions-title">
            <header>
              <h2 id="circle-actions-title">待回应邀请</h2>
              <span>{actions.length}</span>
            </header>
            <div className="circle-rail-list">
              {actions.map((action) => {
                  const relatedCircle = action.circleId ? circleById.get(action.circleId) : null;
                  const visualImage = action.image ?? relatedCircle?.coverImage ?? null;
                  const usePersonAvatar = action.kind === "creation" || action.role === "approver";
                  return (
                    <article className="circle-action-item" key={`${action.actionType}-${action.actionId}`}>
                      {usePersonAvatar ? (
                        <UserAvatar className="circle-action-avatar" image={visualImage} name={action.displayName} />
                      ) : (
                        <CircleCover className="circle-action-avatar circle-action-circle" image={visualImage} name={action.circleName} theme={action.theme} />
                      )}
                      <div>
                        <strong>{actionCopy(action)}</strong>
                        <p>
                          {action.kind === "creation"
                            ? "所有人回应后，只要有人接受就会正式建立。"
                            : action.kind === "rejoin"
                              ? "确认后会恢复原本获准的历史范围。"
                              : action.allowHistory
                                ? "加入后可以查看加入前的记录。"
                                : "加入前的记录不会开放。"}
                        </p>
                        <small>截止 {deadlineLabel(action.expiresAt)}</small>
                        <div className="circle-action-buttons">
                          <button disabled={pending} onClick={() => respond(action, "decline")} type="button">暂不</button>
                          <button className="primary" disabled={pending} onClick={() => respond(action, "accept")} type="button">同意</button>
                        </div>
                      </div>
                    </article>
                  );
              })}
            </div>
            </section>
          ) : null}

          {circleMessages.length ? (
            <section className="circle-rail-section circle-message-section" aria-labelledby="circle-messages-title">
            <header>
              <h2 id="circle-messages-title">圈子消息</h2>
              <span>{circleMessages.length}</span>
            </header>
            <div className="circle-message-list">
              {circleMessages.map((circle) => (
                  <Link className={circleThemeClass(circle.theme)} href={`/circles/${circle.id}`} key={circle.id}>
                    <CircleCover className="circle-message-cover" image={circle.coverImage} name={circle.name} theme={circle.theme} />
                    <div>
                      <strong>{circle.name}</strong>
                      <p>
                        {[
                          circle.unread.posts ? `${circle.unread.posts} 条新动态` : null,
                          circle.unread.changes ? `${circle.unread.changes} 项圈子变化` : null,
                        ].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <ChevronRight aria-hidden="true" size={17} strokeWidth={1.5} />
                  </Link>
              ))}
            </div>
            </section>
          ) : null}
        </aside>
      </div>

      <ConfirmDialog
        busy={pending}
        confirmLabel="删除退出档案"
        description={archiveToDelete ? `删除“${archiveToDelete.name}”的退出档案后，你将无法再查看其中的文字和图片；这不会删除圈子或其他成员保存的内容。` : ""}
        onCancel={() => setArchiveToDelete(null)}
        onConfirm={() => void deleteArchive()}
        open={archiveToDelete !== null}
        title="确定删除退出档案吗？"
        tone="danger"
      />
    </>
  );
}
