"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { AnimatedReveal } from "@/app/components/SegmentedControl";
import { TextStateSwap } from "@/app/components/TextStateSwap";
import type { CircleSummary, FriendSummary } from "@/lib/content-types";

type CircleAction = {
  actionId: string;
  actionType: "creation" | "proposal";
  circleId?: string;
  circleName: string;
  candidateName: string;
  kind: "creation" | "add" | "rejoin";
  allowHistory: boolean;
  expiresAt: string;
  role: "candidate" | "approver";
};

type CircleCreationRequest = {
  id: string;
  name: string;
  description: string;
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
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function createCircle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/circles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        description: form.get("description"),
        invitedUserIds: selectedFriends,
      }),
    });
    const result = (await response.json()) as { requestId?: string; error?: string };
    setPending(false);
    if (!response.ok || !result.requestId) {
      setError(result.error ?? "创建圈子失败。");
      return;
    }
    formElement.reset();
    setShowCreate(false);
    setSelectedFriends([]);
    router.refresh();
  }

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

  const active = circles.filter((circle) => circle.isActive);
  const historical = circles.filter((circle) => !circle.isActive);

  return (
    <>
      {creationRequests.length ? (
        <section className="circle-actions" aria-labelledby="circle-creation-title">
          <p className="eyebrow">建立进度</p>
          <h2 id="circle-creation-title">等待大家分别回应</h2>
          <div>
            {creationRequests.map((request) => (
              <article key={request.id}>
                <div>
                  <strong>{request.name}</strong>
                  {request.status === "pending" ? (
                    <>
                      <p>
                        所有人接受、拒绝或到期后统一结算；至少一人接受才会建立圈子。
                        截止时间：{deadlineLabel(request.expiresAt)}。
                      </p>
                      <p>
                        {request.invitees
                          .map((invitee) => {
                            const status =
                              invitee.status === "accepted"
                                ? "已接受"
                                : invitee.status === "declined"
                                  ? "未接受"
                                  : invitee.status === "expired"
                                    ? "已到期"
                                    : "等待中";
                            return `${invitee.name}：${status}`;
                          })
                          .join(" · ")}
                      </p>
                    </>
                  ) : (
                    <p>24 小时内没有朋友接受，本次圈子没有建立。</p>
                  )}
                </div>
                {request.status === "failed" ? (
                  <div className="circle-action-buttons">
                    <button
                      disabled={pending}
                      onClick={() => acknowledgeCreationResult(request.id)}
                      type="button"
                    >
                      知道了
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {actions.length > 0 ? (
        <section className="circle-actions" aria-labelledby="circle-actions-title">
          <p className="eyebrow">等你回应</p>
          <h2 id="circle-actions-title">有些关系，需要每个人点头</h2>
          <div>
            {actions.map((action) => (
              <article key={`${action.actionType}-${action.actionId}`}>
                <div>
                  <strong>{action.circleName}</strong>
                  <p>
                    {action.role === "candidate"
                      ? action.kind === "creation"
                        ? "朋友邀请你共同建立一个小圈子；所有人回应后，只要有人接受就会正式建立。"
                        : action.kind === "rejoin" ? "成员们已经同意，确认后重新加入。" : "朋友邀请你加入这个小圈子。"
                      : `是否同意 ${action.candidateName} 加入？`}
                    {action.kind === "creation"
                      ? " 邀请在 24 小时内有效。"
                      : action.kind === "rejoin"
                      ? " 重新加入后会恢复原本获准的历史范围。"
                      : action.allowHistory
                        ? " 同意后可以查看加入前的记录。"
                        : " 加入前的记录不会开放。"}
                  </p>
                </div>
                <div className="circle-action-buttons">
                  <button disabled={pending} onClick={() => respond(action, "decline")} type="button">暂不加入</button>
                  <button className="primary" disabled={pending} onClick={() => respond(action, "accept")} type="button">同意</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="circle-list-section">
        <div className="circle-section-heading">
          <div>
            <p className="eyebrow">小圈子</p>
            <h1>一起留下来的地方</h1>
          </div>
          <button className="soft-command" onClick={() => setShowCreate((value) => !value)} type="button">
            <TextStateSwap
              labels={["建立圈子", "收起"]}
              text={showCreate ? "收起" : "建立圈子"}
            />
          </button>
        </div>

        <AnimatedReveal className="inline-panel-reveal" show={showCreate}>
          <div className="t-panel-slide inline-form-panel" data-open={showCreate}>
            <form className="circle-create-form" onSubmit={createCircle}>
            <label>
              圈子名称
              <input maxLength={40} name="name" placeholder="比如：晚饭后散步小队" required />
            </label>
            <label>
              一句简介 <small>可不填</small>
              <textarea maxLength={160} name="description" placeholder="写下这个圈子为什么聚在一起。" />
            </label>
            <fieldset>
              <legend>邀请 1 至 4 位朋友</legend>
              {friends.length ? friends.map((friend) => (
                <label key={friend.id}>
                  <input
                    checked={selectedFriends.includes(friend.id)}
                    disabled={!selectedFriends.includes(friend.id) && selectedFriends.length >= 4}
                    onChange={(event) => setSelectedFriends((current) =>
                      event.target.checked
                        ? [...current, friend.id]
                        : current.filter((id) => id !== friend.id),
                    )}
                    type="checkbox"
                  />
                  <span>{friend.name.slice(0, 1)}</span>
                  {friend.name}
                </label>
              )) : <p>先邀请朋友加入平台，再一起建立圈子。</p>}
            </fieldset>
            {error ? <p className="composer-error">{error}</p> : null}
            <button className="publish-button" disabled={pending || selectedFriends.length === 0} type="submit">
              {pending ? "正在发出" : "发出 24 小时内有效的邀请"}
            </button>
            </form>
          </div>
        </AnimatedReveal>

        {error && !showCreate ? <p className="composer-error">{error}</p> : null}
        <div className="circle-list">
          {active.length ? active.map((circle) => (
            <Link href={`/circles/${circle.id}`} key={circle.id}>
              <div className="circle-color-block" aria-hidden="true">{circle.name.slice(0, 1)}</div>
              <div className="circle-list-copy">
                <span>{`${circle.members.length} 位成员`}</span>
                <h2>{circle.name}</h2>
                <p>{circle.description || "一些普通日子，慢慢在这里有了共同的形状。"}</p>
              </div>
              <div className="circle-member-stack" aria-label={`${circle.members.length} 位当前成员`}>
                {circle.members.slice(0, 4).map((member) => <span key={member.id}>{member.name.slice(0, 1)}</span>)}
              </div>
            </Link>
          )) : (
            <div className="circle-empty">
              <strong>还没有活跃的小圈子</strong>
              <p>从一两位真正熟悉的朋友开始就很好。</p>
            </div>
          )}
        </div>
      </section>

      {historical.length ? (
        <section className="historical-circles">
          <p className="eyebrow">共同档案</p>
          <h2>已经离开的圈子关系</h2>
          {historical.map((circle) => (
            <Link href={`/circles/${circle.id}`} key={circle.id}>
              <strong>{circle.name}</strong>
              <span>
                {circle.status === "frozen" && circle.deleteAt
                  ? `圈子已冻结，将于 ${deadlineLabel(circle.deleteAt)} 彻底删除`
                  : "过去的记录仍可只读查看"}
              </span>
            </Link>
          ))}
        </section>
      ) : null}
    </>
  );
}
