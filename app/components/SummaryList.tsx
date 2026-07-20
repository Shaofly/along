"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useRef } from "react";

import type { CircleSummary, FriendSummary } from "@/lib/content-types";
import { UserAvatar } from "@/app/components/UserAvatar";

export function SummaryListItem({
  className = "",
  detail,
  href,
  leading,
  title,
  trailing,
}: {
  className?: string;
  detail: string;
  href: string;
  leading: ReactNode;
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <Link className={`summary-list-item${className ? ` ${className}` : ""}`} href={href}>
      <span className="summary-list-leading">{leading}</span>
      <span className="summary-list-copy">
        <strong>{title}</strong>
        <small title={detail}>{detail}</small>
      </span>
      {trailing ? <span className="summary-list-trailing">{trailing}</span> : null}
    </Link>
  );
}

export function FriendSummaryItem({ friend }: { friend: FriendSummary }) {
  const title = friend.displayName === friend.realName
    ? friend.realName
    : `${friend.displayName}（${friend.realName}）`;
  return (
    <SummaryListItem
      className="summary-list-item--friend"
      detail={friend.bio || "签名是空空如也～"}
      href={`/profile/${friend.id}`}
      leading={
        <span className="summary-friend-avatar">
          <UserAvatar image={friend.image} name={friend.displayName} />
        </span>
      }
      title={title}
    />
  );
}

export function FriendSummaryList({ friends }: { friends: FriendSummary[] }) {
  if (!friends.length) return <p className="summary-empty">还没有可以显示的朋友。</p>;
  return (
    <div className="summary-list friend-summary-list">
      {friends.slice(0, 5).map((friend) => <FriendSummaryItem friend={friend} key={friend.id} />)}
    </div>
  );
}

function circleActivityText(circle: CircleSummary) {
  const { posts, comments, replies, changes, total } = circle.unread;
  const activeKinds = [posts, comments, replies, changes].filter((count) => count > 0).length;
  if (!total) return "最近无新动态";
  if (activeKinds > 1) return `有 ${total} 条新消息`;
  if (posts) return `有 ${posts} 条新动态`;
  if (comments) return `有 ${comments} 条新评论`;
  if (replies) return `有 ${replies} 条新回复`;
  return `圈子有 ${changes} 项新变化`;
}

export function AvatarGroup({ members }: { members: CircleSummary["members"] }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const visible = members.slice(0, 3);
  const remaining = Math.max(0, members.length - visible.length);

  function setShifts(activeIndex: number | null, leaving = false) {
    const avatars = rootRef.current?.querySelectorAll<HTMLElement>(".summary-member-avatar");
    if (!avatars) return;
    avatars.forEach((avatar, index) => {
      const distance = activeIndex === null ? 0 : Math.abs(index - activeIndex);
      const shift = activeIndex === null ? 0 : -4 * Math.pow(0.45, distance);
      avatar.style.setProperty("--avatar-shift", `${shift.toFixed(3)}px`);
      avatar.style.setProperty("--avatar-scale", activeIndex === index ? "1.05" : "1");
      avatar.style.setProperty(
        "--avatar-ease",
        leaving ? "cubic-bezier(0.34, 3.85, 0.64, 1)" : "cubic-bezier(0.22, 1, 0.36, 1)",
      );
    });
  }

  return (
    <span
      aria-label={`${members.length} 位当前成员`}
      className="summary-avatar-group"
      onMouseLeave={() => setShifts(null, true)}
      ref={rootRef}
    >
      {visible.map((member, index) => (
        <span
          aria-hidden="true"
          className="summary-member-avatar"
          key={member.id}
          onMouseEnter={() => setShifts(index)}
        >
          <UserAvatar image={member.image} name={member.name} />
        </span>
      ))}
      {remaining ? <span aria-hidden="true" className="summary-member-avatar summary-member-more">+{remaining}</span> : null}
    </span>
  );
}

export function CircleSummaryItem({ circle, index }: { circle: CircleSummary; index: number }) {
  return (
    <SummaryListItem
      className="summary-list-item--circle"
      detail={circleActivityText(circle)}
      href={`/circles/${circle.id}`}
      leading={<span className={`summary-circle-cover circle-tone-${(index % 3) + 1}`}>{circle.name.slice(0, 1)}</span>}
      title={circle.name}
      trailing={<AvatarGroup members={circle.members} />}
    />
  );
}

export function CircleSummaryList({ circles }: { circles: CircleSummary[] }) {
  if (!circles.length) return <p className="summary-empty">还没有小圈子。</p>;
  return (
    <div className="summary-list circle-summary-list">
      {circles.slice(0, 3).map((circle, index) => (
        <CircleSummaryItem circle={circle} index={index} key={circle.id} />
      ))}
    </div>
  );
}
