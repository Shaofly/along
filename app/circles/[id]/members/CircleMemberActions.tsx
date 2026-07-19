"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { FriendSummary } from "@/lib/content-types";

export function CircleMemberActions({
  circleId,
  circleName,
  viewerIsActive,
  circleStatus,
  friends,
  activeMemberIds,
  currentNickname,
  viewerHasArchive,
  canRestore,
}: {
  circleId: string;
  circleName: string;
  viewerIsActive: boolean;
  circleStatus: "active" | "frozen" | "dissolved";
  friends: FriendSummary[];
  activeMemberIds: string[];
  currentNickname: string;
  viewerHasArchive: boolean;
  canRestore: boolean;
}) {
  const router = useRouter();
  const [showInvite, setShowInvite] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [nickname, setNickname] = useState(currentNickname);

  async function saveNickname(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch(`/api/circles/${circleId}/nickname`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname }),
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "圈子昵称保存失败。");
      return;
    }
    router.refresh();
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    const response = await fetch(`/api/circles/${circleId}/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        candidateId: form.get("candidateId"),
        allowHistory: form.get("allowHistory") === "on",
      }),
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "发起邀请失败。");
      return;
    }
    setShowInvite(false);
    router.refresh();
  }

  async function leave() {
    if (!window.confirm(`确定退出“${circleName}”的活跃关系吗？系统会冻结一份你此刻有权查看的只读档案；圈子未来的新内容不会继续写入。`)) return;
    setPending(true);
    const response = await fetch(`/api/circles/${circleId}/leave`, { method: "POST" });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "退出失败。");
      return;
    }
    router.push(`/circles/${circleId}`);
    router.refresh();
  }

  async function rejoin() {
    setPending(true);
    setError("");
    const response = await fetch(`/api/circles/${circleId}/rejoin`, { method: "POST" });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "申请失败。");
      return;
    }
    router.push("/circles");
    router.refresh();
  }

  async function restore() {
    setPending(true);
    setError("");
    const response = await fetch(`/api/circles/${circleId}/restore`, {
      method: "POST",
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "恢复圈子失败。");
      return;
    }
    router.push(`/circles/${circleId}`);
    router.refresh();
  }

  async function deleteArchive() {
    if (
      !window.confirm(
        `确定删除“${circleName}”的退出档案吗？删除后，你将无法再查看这份退出档案，包括你曾上传但仍由圈子保存的图片。此操作不会删除圈子或其他成员保存的内容。`,
      )
    ) {
      return;
    }
    setPending(true);
    setError("");
    const response = await fetch(`/api/circles/${circleId}/archive`, {
      method: "DELETE",
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "档案删除失败。");
      return;
    }
    router.push("/circles");
    router.refresh();
  }

  const inviteableFriends = friends.filter((friend) => !activeMemberIds.includes(friend.id));

  return (
    <section className="member-actions-panel">
      {viewerIsActive && circleStatus === "active" ? (
        <>
          <form className="circle-nickname-form" onSubmit={saveNickname}>
            <label>我的圈子昵称 <small>选填，只在这个圈子里使用</small><input maxLength={40} onChange={(event) => setNickname(event.target.value)} placeholder="例如：负责订餐的小林" value={nickname} /></label>
            <button className="secondary-action" disabled={pending || nickname === currentNickname} type="submit">保存昵称</button>
          </form>
          <button className="soft-command" onClick={() => setShowInvite((value) => !value)} type="button">
            {showInvite ? "收起邀请" : "邀请新成员"}
          </button>
          {showInvite ? (
            <form onSubmit={invite}>
              <label>
                准备邀请
                <select name="candidateId" required defaultValue="">
                  <option disabled value="">选择一位直接朋友</option>
                  {inviteableFriends.map((friend) => <option key={friend.id} value={friend.id}>{friend.displayName}</option>)}
                </select>
              </label>
              <label className="history-permission-choice">
                <input defaultChecked name="allowHistory" type="checkbox" />
                <span><strong>允许查看加入前的圈子记录</strong><small>其他成员审批时会同时看到这个选择。</small></span>
              </label>
              <button className="publish-button" disabled={pending || inviteableFriends.length === 0} type="submit">发起全员确认</button>
            </form>
          ) : null}
          <button className="quiet-danger" disabled={pending} onClick={leave} type="button">退出活跃关系</button>
        </>
      ) : !viewerIsActive && circleStatus === "active" ? (
        <>
          <button className="soft-command" disabled={pending} onClick={rejoin} type="button">申请重新加入</button>
          {viewerHasArchive ? (
            <button className="quiet-danger" disabled={pending} onClick={deleteArchive} type="button">删除我的退出档案</button>
          ) : null}
        </>
      ) : circleStatus === "frozen" ? (
        <>
          <p className="member-action-note">
            圈子已经冻结；删除倒计时结束后，所有人的历史记录都会被彻底删除。
          </p>
          {canRestore ? (
            <button className="soft-command" disabled={pending} onClick={restore} type="button">
              恢复圈子
            </button>
          ) : null}
          {viewerHasArchive ? (
            <button className="quiet-danger" disabled={pending} onClick={deleteArchive} type="button">删除我的退出档案</button>
          ) : null}
        </>
      ) : (
        <>
          <p className="member-action-note">
            这个圈子已经成为只读档案。
          </p>
          {viewerHasArchive ? (
            <button className="quiet-danger" disabled={pending} onClick={deleteArchive} type="button">删除我的退出档案</button>
          ) : null}
        </>
      )}
      {error ? <p className="composer-error">{error}</p> : null}
    </section>
  );
}
