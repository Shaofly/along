"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { PostStream } from "@/app/components/PostStream";
import { AppShell, type ShellUser } from "@/app/components/AppShell";
import { ComposerLauncher } from "@/app/components/ComposerLauncher";
import { DissolveTextarea } from "@/app/components/DissolveField";
import { ModalSurface } from "@/app/components/ModalSurface";
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
  const [editorMounted, setEditorMounted] = useState(false);
  const [realName, setRealName] = useState(profile.realName);
  const [nickname, setNickname] = useState(profile.nickname ?? "");
  const [bio, setBio] = useState(profile.bio);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const recordStart = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  }).format(new Date(profile.createdAt));

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
      <section className={`profile-hero${profile.isSelf ? " profile-hero--self" : ""}`}>
        <div className="profile-identity">
          <div className="profile-avatar">
            {profile.image ? (
              <Image alt="" height={108} src={profile.image} unoptimized width={108} />
            ) : profile.name.slice(0, 1)}
          </div>
          <div className="profile-hero-copy">
            <p className="eyebrow">
              {profile.isSelf ? "我的个人空间" : profile.isLimitedByCircle ? "共同圈子成员" : "朋友的个人空间"}
            </p>
            <h1>{profile.name}</h1>
            {profile.nickname ? <p className="profile-real-name">{profile.realName}</p> : null}
            <p className="profile-bio">
              {profile.bio || (profile.isSelf ? "可以写一句简单的自我介绍。" : "这个人还没有写简介。")}
            </p>
          </div>
        </div>

        <div className="profile-hero-aside">
          <p className="profile-record-since">
            <span>开始记录</span>
            <time dateTime={profile.createdAt}>{recordStart}</time>
          </p>
          {profile.isSelf ? (
            <div className="profile-hero-actions">
              <ComposerLauncher
                currentUserId={currentUser.id}
                friends={friends}
                mobileHref={`/compose/personal?returnTo=${encodeURIComponent(`/profile/${profile.id}`)}`}
                returnHref={`/profile/${profile.id}`}
                target={{ kind: "personal" }}
              />
              <button className="secondary-action" onClick={() => {
                setEditorMounted(true);
                setEditing(true);
              }} type="button">编辑资料</button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="profile-stream">
        <div className="section-line-heading profile-stream-heading">
          <div>
            <p className="eyebrow">个人动态</p>
            <h2>{profile.isSelf ? "我留下的片段" : `${profile.name} 留下的片段`}</h2>
          </div>
          <span className="profile-stream-count">
            <strong>{profile.posts.length}</strong>
            <small>条可见</small>
          </span>
        </div>
        <PostStream friends={friends} posts={profile.posts} />
      </section>

      {editorMounted ? (
        <ModalSurface
          labelledBy="profile-editor-title"
          onAfterClose={() => setEditorMounted(false)}
          onRequestClose={() => {
            if (!pending) setEditing(false);
          }}
          open={editing}
          size="standard"
        >
          <form className="edit-modal profile-editor" onSubmit={saveProfile}>
            <header><h2 id="profile-editor-title">编辑个人资料</h2><button onClick={() => setEditing(false)} type="button" aria-label="关闭">×</button></header>
            <label>真实姓名<input data-modal-initial-focus maxLength={40} onChange={(event) => setRealName(event.target.value)} required value={realName} /></label>
            <label>昵称 <small>选填</small><input maxLength={40} onChange={(event) => setNickname(event.target.value)} value={nickname} /></label>
            <label>
              简介
              <DissolveTextarea
                maxLength={160}
                onValueChange={setBio}
                placeholder="写一句简单的自我介绍"
                value={bio}
                wrapperClassName="profile-writing-surface"
              />
            </label>
            <small>{bio.length} / 160</small>
            {error ? <p className="composer-error">{error}</p> : null}
            <button className="publish-button" disabled={pending} type="submit">{pending ? "正在保存" : "保存资料"}</button>
          </form>
        </ModalSurface>
      ) : null}
    </AppShell>
  );
}
