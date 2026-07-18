"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { CircleSummary, FriendSummary } from "@/lib/content-types";

type CircleAction = {
  proposalId: string;
  circleId: string;
  circleName: string;
  candidateName: string;
  kind: "initial" | "add" | "rejoin";
  allowHistory: boolean;
  expiresAt: string;
  role: "candidate" | "approver";
};

export function CirclesClient({
  circles,
  actions,
  friends,
}: {
  circles: CircleSummary[];
  actions: CircleAction[];
  friends: FriendSummary[];
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function createCircle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    const result = (await response.json()) as { circleId?: string; error?: string };
    setPending(false);
    if (!response.ok || !result.circleId) {
      setError(result.error ?? "创建圈子失败。");
      return;
    }
    router.push(`/circles/${result.circleId}`);
  }

  async function respond(proposalId: string, decision: "accept" | "decline") {
    setPending(true);
    setError("");
    const response = await fetch(`/api/circles/proposals/${proposalId}/respond`, {
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

  const active = circles.filter((circle) => circle.isActive);
  const historical = circles.filter((circle) => !circle.isActive);

  return (
    <>
      {actions.length > 0 ? (
        <section className="circle-actions" aria-labelledby="circle-actions-title">
          <p className="eyebrow">等你回应</p>
          <h2 id="circle-actions-title">有些关系，需要每个人点头</h2>
          <div>
            {actions.map((action) => (
              <article key={action.proposalId}>
                <div>
                  <strong>{action.circleName}</strong>
                  <p>
                    {action.role === "candidate"
                      ? action.kind === "rejoin" ? "成员们已经同意，确认后重新加入。" : "朋友邀请你加入这个小圈子。"
                      : `是否同意 ${action.candidateName} 加入？`}
                    {action.kind === "rejoin"
                      ? " 重新加入后会恢复原本获准的历史范围。"
                      : action.allowHistory
                        ? " 同意后可以查看加入前的记录。"
                        : " 加入前的记录不会开放。"}
                  </p>
                </div>
                <div className="circle-action-buttons">
                  <button disabled={pending} onClick={() => respond(action.proposalId, "decline")} type="button">暂不加入</button>
                  <button className="primary" disabled={pending} onClick={() => respond(action.proposalId, "accept")} type="button">同意</button>
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
            {showCreate ? "收起" : "建立圈子"}
          </button>
        </div>

        {showCreate ? (
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
              {pending ? "正在建立" : "发出三天内有效的邀请"}
            </button>
          </form>
        ) : null}

        {error && !showCreate ? <p className="composer-error">{error}</p> : null}
        <div className="circle-list">
          {active.length ? active.map((circle) => (
            <Link href={`/circles/${circle.id}`} key={circle.id}>
              <div className="circle-color-block" aria-hidden="true">{circle.name.slice(0, 1)}</div>
              <div className="circle-list-copy">
                <span>{circle.status === "forming" ? "等待朋友加入" : `${circle.members.length} 位成员`}</span>
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
              <span>过去的记录仍可只读查看</span>
            </Link>
          ))}
        </section>
      ) : null}
    </>
  );
}
