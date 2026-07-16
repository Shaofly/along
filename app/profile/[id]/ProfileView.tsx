"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { PostStream } from "@/app/components/PostStream";
import { AppShell, type ShellUser } from "@/app/components/AppShell";
import type { FeedPost, FriendSummary } from "@/lib/content-types";

type Profile = {
  id: string;
  name: string;
  realName: string;
  nickname: string | null;
  image: string | null;
  bio: string;
  createdAt: string;
  isSelf: boolean;
  isLimitedByCircle?: boolean;
  posts: FeedPost[];
};

export function ProfileView({
  profile,
  friends,
  currentUser,
}: {
  profile: Profile;
  friends: FriendSummary[];
  currentUser: ShellUser;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [realName, setRealName] = useState(profile.realName);
  const [nickname, setNickname] = useState(profile.nickname ?? "");
  const [bio, setBio] = useState(profile.bio);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ realName, nickname, bio }),
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "保存失败。");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <AppShell pageClassName="profile-page" user={currentUser}>
      <section className="profile-hero">
        <div className="profile-avatar">{profile.name.slice(0, 1)}</div>
        <div>
          <p className="eyebrow">
            {profile.isSelf ? "我的个人空间" : profile.isLimitedByCircle ? "共同圈子成员" : "朋友的个人空间"}
          </p>
          <h1>{profile.name}</h1>
          {profile.nickname ? <p className="profile-real-name">{profile.realName}</p> : null}
          <p>{profile.bio || (profile.isSelf ? "可以写一句简单的自我介绍。" : "这个人还没有写简介。")}</p>
          <small>从 {new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(new Date(profile.createdAt))} 开始在这里记录</small>
        </div>
        {profile.isSelf ? (
          <button className="secondary-action" onClick={() => setEditing(true)} type="button">编辑资料</button>
        ) : null}
      </section>

      <section className="profile-stream">
        <div className="section-line-heading">
          <div>
            <p className="eyebrow">个人动态</p>
            <h2>{profile.isSelf ? "我留下的片段" : `${profile.name} 留下的片段`}</h2>
          </div>
          <span>{profile.posts.length} 条可见</span>
        </div>
        <PostStream friends={friends} posts={profile.posts} />
      </section>

      {editing ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditing(false)}>
          <form className="edit-modal profile-editor" onMouseDown={(event) => event.stopPropagation()} onSubmit={saveProfile}>
            <header><h2>编辑个人资料</h2><button onClick={() => setEditing(false)} type="button" aria-label="关闭">×</button></header>
            <label>真实姓名<input maxLength={40} onChange={(event) => setRealName(event.target.value)} required value={realName} /></label>
            <label>昵称 <small>选填</small><input maxLength={40} onChange={(event) => setNickname(event.target.value)} value={nickname} /></label>
            <label>简介<textarea maxLength={160} onChange={(event) => setBio(event.target.value)} value={bio} /></label>
            <small>{bio.length} / 160</small>
            {error ? <p className="composer-error">{error}</p> : null}
            <button className="publish-button" disabled={pending} type="submit">{pending ? "正在保存" : "保存资料"}</button>
          </form>
        </div>
      ) : null}
    </AppShell>
  );
}
