"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { AnimatedCheckbox } from "@/app/components/AnimatedCheckbox";

type Friend = { id: string; name: string; email: string };
type PendingInvitation = {
  id: string;
  invitedName: string | null;
  invitedEmail: string;
  creatorName: string;
  expiresAt: string;
};
type CreatedInvitation = {
  id: string;
  invitedName: string | null;
  invitedEmail: string;
  status: string;
  confirmedCount: number;
  sponsorCount: number;
  code: string | null;
  expiresAt: string;
};

export function InviteManager({
  friends,
  pendingInvitations,
  createdInvitations,
}: {
  friends: Friend[];
  pendingInvitations: PendingInvitation[];
  createdInvitations: CreatedInvitation[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    const sponsorIds = form.getAll("sponsorIds").map(String);
    const response = await fetch("/api/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        invitedName: form.get("invitedName"),
        invitedEmail: form.get("invitedEmail"),
        sponsorIds,
      }),
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);

    if (!response.ok) {
      setError(result.error ?? "邀请发起失败。");
      return;
    }

    formElement.reset();
    router.refresh();
  }

  async function approveInvitation(id: string) {
    setError("");
    setPending(true);
    const response = await fetch(`/api/invitations/${id}/approve`, {
      method: "POST",
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "确认失败。");
      return;
    }
    router.refresh();
  }

  return (
    <div className="invite-layout">
      {error ? <p className="form-notice error">{error}</p> : null}

      <section className="invite-section">
        <div className="section-heading compact-heading">
          <p>共同邀请</p>
          <h2>邀请一位大家认识的朋友</h2>
        </div>
        <form className="invite-form" onSubmit={createInvitation}>
          <label>
            对方昵称（可选）
            <input name="invitedName" maxLength={40} />
          </label>
          <label>
            对方注册邮箱
            <input name="invitedEmail" type="email" required />
          </label>
          <fieldset>
            <legend>选择共同邀请人（至少 1 位，最多 4 位）</legend>
            <div className="sponsor-list">
              {friends.map((friend) => (
                <label className="sponsor-option" key={friend.id}>
                  <AnimatedCheckbox
                    aria-label={`选择 ${friend.name} 作为共同邀请人`}
                    name="sponsorIds"
                    value={friend.id}
                  />
                  <span>
                    <strong>{friend.name}</strong>
                    <small>{friend.email}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <button className="auth-submit" type="submit" disabled={pending}>
            发起共同邀请
          </button>
        </form>
      </section>

      <section className="invite-section">
        <div className="section-heading compact-heading">
          <p>等你确认</p>
          <h2>朋友请你共同担保</h2>
        </div>
        <div className="invite-list">
          {pendingInvitations.length === 0 ? (
            <p className="empty-state">暂时没有需要你确认的邀请。</p>
          ) : (
            pendingInvitations.map((invitation) => (
              <article className="invite-item" key={invitation.id}>
                <div>
                  <span>{invitation.creatorName} 发起</span>
                  <h3>{invitation.invitedName || invitation.invitedEmail}</h3>
                  <p>{invitation.invitedEmail}</p>
                </div>
                <button
                  type="button"
                  onClick={() => approveInvitation(invitation.id)}
                  disabled={pending}
                >
                  我也认识，确认邀请
                </button>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="invite-section">
        <div className="section-heading compact-heading">
          <p>我发起的</p>
          <h2>邀请码进度</h2>
        </div>
        <div className="invite-list">
          {createdInvitations.length === 0 ? (
            <p className="empty-state">还没有发起过邀请。</p>
          ) : (
            createdInvitations.map((invitation) => (
              <article className="invite-item invite-result" key={invitation.id}>
                <div>
                  <span>
                    {invitation.confirmedCount} / {invitation.sponsorCount} 位已确认
                  </span>
                  <h3>{invitation.invitedName || invitation.invitedEmail}</h3>
                  <p>{invitation.invitedEmail}</p>
                </div>
                {invitation.code ? (
                  <div className="invite-code" aria-label="可使用的邀请码">
                    <small>邀请码</small>
                    <strong>{invitation.code}</strong>
                  </div>
                ) : (
                  <span className="waiting-label">等待朋友确认</span>
                )}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
