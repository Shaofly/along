"use client";

/* eslint-disable @next/next/no-img-element -- Cover images use authenticated media routes. */

import {
  Check,
  Copy,
  FilePenLine,
  LockKeyhole,
  LockKeyholeOpen,
  Pencil,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AppShell, type ShellUser } from "@/app/components/AppShell";
import { ComposerLauncher } from "@/app/components/ComposerLauncher";
import { PostStream } from "@/app/components/PostStream";
import { UserAvatar } from "@/app/components/UserAvatar";
import type {
  FeedPost,
  FriendSummary,
  ProfilePageData,
  ProfileViewMode,
} from "@/lib/content-types";
import { profileMediaImageStyle } from "@/lib/profile-media";

import { ProfileEditor } from "./ProfileEditor";

const tabs: Array<{ label: string; value: ProfileViewMode }> = [
  { value: "all", label: "全部" },
  { value: "personal", label: "个人动态" },
  { value: "shared", label: "共同经历" },
];

const privateTab: { label: string; value: ProfileViewMode } = {
  value: "private",
  label: "私密动态",
};

type ProfileInfoSettings = NonNullable<
  ProfilePageData["personalInfoSettings"]
>;

function resolvedProfileInfoSettings(
  settings: ProfilePageData["personalInfoSettings"],
): ProfileInfoSettings {
  return settings ?? {
    visibility: "private",
    lastSharedVisibility: null,
    selectedFriendIds: [],
  };
}

function profileHref(profileId: string, view: ProfileViewMode) {
  return view === "all"
    ? `/profile/${profileId}`
    : `/profile/${profileId}?view=${view}`;
}

function emptyCopy(profile: ProfilePageData) {
  if (profile.view === "private") {
    return {
      title: "还没有仅自己可见的记录",
      detail: "发布动态时选择“仅自己”，它会安静地留在这里。",
    };
  }
  if (profile.view === "personal") {
    return profile.isSelf
      ? {
          title: "从一条近况开始",
          detail: "写下今天的小事，之后回来看也会很有意思。",
        }
      : {
          title: "这里还没有可见的个人动态",
          detail: "对方之后分享给你时，会自然出现在这里。",
        };
  }
  if (profile.view === "shared" || profile.isLimitedByCircle) {
    return {
      title: "共同经历还没有出现在这里",
      detail: "只有双方都有原始权限的圈子记录才会显示。",
    };
  }
  return profile.isSelf
    ? {
        title: "从一条近况开始",
        detail: "第一条动态发布后，个人空间就会慢慢生长。",
      }
    : {
        title: "这里还没有留下可见的片段",
        detail: "有权与你分享的内容会显示在这里。",
      };
}

function ProfileAccountDetails({
  email,
  userId,
}: {
  email: string;
  userId: string;
}) {
  const [copied, setCopied] = useState<"email" | "id" | null>(null);
  const [open, setOpen] = useState(false);
  const panelId = useId();

  async function copy(value: string, kind: "email" | "id") {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <div className="profile-account-details">
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className="profile-account-summary"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <UserRound aria-hidden="true" size={17} />
        <span>账号信息</span>
      </button>
      {open ? (
        <div
          aria-label="账号信息"
          className="profile-account-panel"
          id={panelId}
          role="region"
        >
          <dl>
            <div>
              <dt>登录邮箱</dt>
              <dd>{email}</dd>
              <button
                aria-label="复制登录邮箱"
                onClick={() => void copy(email, "email")}
                type="button"
              >
                {copied === "email" ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <div>
              <dt>用户编号</dt>
              <dd>{userId}</dd>
              <button
                aria-label="复制用户编号"
                onClick={() => void copy(userId, "id")}
                type="button"
              >
                {copied === "id" ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </dl>
          <p>邮箱暂时不能在这里修改；用户编号用于需要准确确认账号时。</p>
        </div>
      ) : null}
    </div>
  );
}

function ProfilePersonalInfo({ profile }: { profile: ProfilePageData }) {
  const info = profile.personalInfo;
  if (!info) return null;
  const items = [
    info.gender
      ? { key: "gender", label: "性别", value: info.gender }
      : null,
    info.residence
      ? { key: "residence", label: "现居地", value: info.residence }
      : null,
    info.phone
      ? {
          key: "phone",
          label: "手机号",
          value: info.phone,
          href: `tel:${info.phone.replaceAll(" ", "")}`,
        }
      : null,
    info.contactEmail
      ? {
          key: "email",
          label: "联系邮箱",
          value: info.contactEmail,
          href: `mailto:${info.contactEmail}`,
        }
      : null,
    info.school
      ? { key: "school", label: "学校", value: info.school }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (!items.length) return null;

  return (
    <dl aria-label="个人信息" className="profile-personal-info">
      {items.map((item) => (
        <div key={item.key}>
          <dt>{item.label}</dt>
          <dd>
            {item.href ? <a href={item.href}>{item.value}</a> : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ProfilePrivacyToggle({
  onPendingChange,
  onPersisted,
  onSettingsChange,
  settings,
}: {
  onPendingChange: (pending: boolean) => void;
  onPersisted: () => void;
  onSettingsChange: (settings: ProfileInfoSettings) => void;
  settings: ProfileInfoSettings;
}) {
  const tooltipId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const { lastSharedVisibility, visibility } = settings;
  const protectedNow = visibility === "private";

  async function togglePrivacy() {
    if (pending) return;

    const previousSettings = settings;
    const sharedVisibility =
      visibility === "private"
        ? lastSharedVisibility ?? "all"
        : visibility;
    const nextVisibility = protectedNow ? sharedVisibility : "private";
    const optimisticSettings: ProfileInfoSettings = {
      ...settings,
      visibility: nextVisibility,
      lastSharedVisibility: sharedVisibility,
    };
    onSettingsChange(optimisticSettings);
    setPending(true);
    onPendingChange(true);
    setError("");
    try {
      const response = await fetch("/api/profile/privacy", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ protected: !protectedNow }),
      });
      const result = (await response.json()) as {
        error?: string;
        visibility?: "all" | "selected" | "private";
      };
      if (!response.ok || !result.visibility) {
        throw new Error(result.error ?? "隐私保护设置失败。");
      }
      onSettingsChange({
        ...optimisticSettings,
        visibility: result.visibility,
        lastSharedVisibility:
          result.visibility === "private"
            ? optimisticSettings.lastSharedVisibility
            : result.visibility,
      });
      onPersisted();
    } catch (privacyError) {
      onSettingsChange(previousSettings);
      setError(
        privacyError instanceof Error
          ? privacyError.message
          : "隐私保护设置失败。",
      );
    } finally {
      setPending(false);
      onPendingChange(false);
    }
  }

  return (
    <span className="profile-privacy-control">
      <button
        aria-label={protectedNow ? "关闭隐私保护" : "开启隐私保护"}
        aria-describedby={tooltipId}
        aria-pressed={protectedNow}
        className={protectedNow ? "is-protected" : ""}
        disabled={pending}
        onClick={() => void togglePrivacy()}
        type="button"
      >
        <span
          aria-hidden="true"
          className="t-icon-swap profile-privacy-icon-swap"
          data-state={protectedNow ? "a" : "b"}
        >
          <span className="t-icon" data-icon="a">
            <LockKeyhole size={17} />
          </span>
          <span className="t-icon" data-icon="b">
            <LockKeyholeOpen size={17} />
          </span>
        </span>
        <span
          aria-hidden="true"
          className="profile-privacy-text-swap"
          data-state={protectedNow ? "a" : "b"}
        >
          <span data-text="a">隐私保护中</span>
          <span data-text="b">开启隐私保护</span>
        </span>
      </button>
      <span className="profile-privacy-tooltip" id={tooltipId} role="tooltip">
        选中时他人将<strong>无法获悉</strong>你的隐私数据
      </span>
      {error ? (
        <span className="profile-privacy-error" role="alert">{error}</span>
      ) : null}
    </span>
  );
}

function ProfileFeed({
  friends,
  profile,
}: {
  friends: FriendSummary[];
  profile: ProfilePageData;
}) {
  const [posts, setPosts] = useState(profile.posts);
  const [nextCursor, setNextCursor] = useState(profile.nextCursor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function loadMore() {
    if (!nextCursor || pending) return;
    setPending(true);
    setError("");
    try {
      const query = new URLSearchParams({
        view: profile.view,
        cursor: nextCursor,
      });
      const response = await fetch(
        `/api/profile/${profile.id}/posts?${query.toString()}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as {
        error?: string;
        nextCursor?: string | null;
        posts?: FeedPost[];
      };
      if (!response.ok || !result.posts) {
        throw new Error(result.error ?? "更多动态加载失败。");
      }
      setPosts((current) => [
        ...current,
        ...result.posts!.filter(
          (post) => !current.some((existing) => existing.id === post.id),
        ),
      ]);
      setNextCursor(result.nextCursor ?? null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "更多动态加载失败。",
      );
    } finally {
      setPending(false);
    }
  }

  if (!posts.length) {
    const copy = emptyCopy(profile);
    return (
      <div className="profile-feed-empty">
        <strong>{copy.title}</strong>
        <p>{copy.detail}</p>
        {profile.view !== "all" ? (
          <Link href={profileHref(profile.id, "all")}>回到全部</Link>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <PostStream friends={friends} posts={posts} />
      {error ? (
        <div className="profile-load-state" role="alert">
          <span>{error}</span>
          <button onClick={() => void loadMore()} type="button">重试</button>
        </div>
      ) : nextCursor ? (
        <button
          className="profile-load-more"
          disabled={pending}
          onClick={() => void loadMore()}
          type="button"
        >
          {pending ? "正在找更早的片段…" : "继续往前看"}
        </button>
      ) : (
        <p className="profile-feed-end">已经走到目前记录的开头了。</p>
      )}
    </>
  );
}

export function ProfileView({
  profile,
  friends,
  currentUser,
}: {
  profile: ProfilePageData;
  friends: FriendSummary[];
  currentUser: ShellUser;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editorMounted, setEditorMounted] = useState(false);
  const [profileHeaderCompact, setProfileHeaderCompact] = useState(false);
  const [privacyPending, setPrivacyPending] = useState(false);
  const identityRowRef = useRef<HTMLDivElement>(null);
  const [profileInfoSettingsSource, setProfileInfoSettingsSource] =
    useState(profile.personalInfoSettings);
  const [profileInfoSettings, setProfileInfoSettings] =
    useState<ProfileInfoSettings>(() =>
      resolvedProfileInfoSettings(profile.personalInfoSettings),
    );
  if (profileInfoSettingsSource !== profile.personalInfoSettings) {
    setProfileInfoSettingsSource(profile.personalInfoSettings);
    setProfileInfoSettings(
      resolvedProfileInfoSettings(profile.personalInfoSettings),
    );
  }
  const recordStart = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  }).format(new Date(profile.createdAt));
  const profileDisplayName = profile.nickname ?? profile.realName;

  useEffect(() => {
    const identityRow = identityRowRef.current;
    if (!identityRow) return;

    const observer = new IntersectionObserver(
      ([entry]) => setProfileHeaderCompact(!entry.isIntersecting),
      {
        rootMargin: "-64px 0px 0px",
        threshold: 0,
      },
    );
    observer.observe(identityRow);
    return () => observer.disconnect();
  }, []);

  function beginEdit() {
    if (privacyPending) return;
    if (window.matchMedia("(max-width: 700px)").matches) {
      router.push(
        `/profile/${profile.id}/edit?returnTo=${encodeURIComponent(
          `/profile/${profile.id}`,
        )}`,
      );
      return;
    }
    setEditorMounted(true);
    setEditing(true);
  }

  return (
    <AppShell
      mobileHeader={{
        compactProfile: profileHeaderCompact,
        mode: profile.isSelf ? "primary" : "detail",
        profileIdentity: {
          image: profile.avatar.src,
          imageStyle: profileMediaImageStyle(profile.avatar),
          name: profileDisplayName,
        },
        title: "个人",
      }}
      pageClassName="profile-page"
      user={currentUser}
    >
      <section
        className={`profile-masthead profile-theme-${profile.theme}${
          profile.isSelf ? " profile-masthead--self" : ""
        }`}
      >
        <div
          className={`profile-cover${profile.cover?.src ? " has-image" : ""}`}
          aria-hidden="true"
        >
          {profile.cover?.src ? (
            <img
              alt=""
              src={profile.cover.src}
              style={profileMediaImageStyle(profile.cover)}
            />
          ) : null}
        </div>

        <div className="profile-intro">
          <div className="profile-identity-row" ref={identityRowRef}>
            <div className="profile-avatar">
              <UserAvatar
                image={profile.avatar.src}
                imageStyle={profileMediaImageStyle(profile.avatar)}
                name={profile.name}
              />
            </div>

            <div className="profile-identity">
              <p className="profile-context">
                {profile.nickname ??
                  (profile.isSelf
                    ? "我的个人空间"
                    : profile.isLimitedByCircle
                      ? "共同圈子成员"
                      : "朋友的个人空间")}
              </p>
              <h1>{profile.realName}</h1>
            </div>
          </div>

          <p className={`profile-bio${profile.bio ? "" : " is-empty"}`}>
            {profile.bio ||
              (profile.isSelf
                ? "可以写一句简单的自我介绍。"
                : "这个人还没有写简介。")}
          </p>
          <p className="profile-record-since">
            从 <time dateTime={profile.createdAt}>{recordStart}</time> 开始记录
          </p>
          <ProfilePersonalInfo profile={profile} />

          {profile.isSelf ? (
            <div className="profile-hero-actions">
              <ComposerLauncher
                currentUserId={currentUser.id}
                friends={friends}
                mobileHref={`/compose/personal?returnTo=${encodeURIComponent(
                  `/profile/${profile.id}`,
                )}`}
                returnHref={`/profile/${profile.id}`}
                target={{ kind: "personal" }}
              />
              <button
                className="secondary-action"
                disabled={privacyPending}
                onClick={beginEdit}
                type="button"
              >
                <Pencil size={17} />编辑资料
              </button>
            </div>
          ) : null}
        </div>

        {profile.isSelf && profile.email ? (
          <div className="profile-private-tools">
            <div className="profile-shortcuts">
              <Link href="/drafts">
                <FilePenLine size={17} />
                草稿{currentUser.draftCount ? ` ${currentUser.draftCount}` : ""}
              </Link>
              <ProfilePrivacyToggle
                onPendingChange={setPrivacyPending}
                onPersisted={() => router.refresh()}
                onSettingsChange={setProfileInfoSettings}
                settings={profileInfoSettings}
              />
            </div>
            <ProfileAccountDetails email={profile.email} userId={profile.id} />
          </div>
        ) : null}
      </section>

      <section
        aria-labelledby="profile-stream-title"
        className="profile-stream"
      >
        <header className="profile-stream-heading">
          <nav aria-label="筛选个人空间内容" className="profile-content-tabs">
            {(profile.isSelf ? [...tabs, privateTab] : tabs).map((tab) => (
              <Link
                aria-current={profile.view === tab.value ? "page" : undefined}
                href={profileHref(profile.id, tab.value)}
                key={tab.value}
                scroll={false}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
          <div>
            <p className="profile-stream-label">个人动态</p>
            <h2 id="profile-stream-title">
              {profile.isSelf ? "我留下的片段" : `${profile.name} 留下的片段`}
            </h2>
          </div>
        </header>
        <ProfileFeed
          friends={friends}
          key={`${profile.id}:${profile.view}`}
          profile={profile}
        />
      </section>

      {editorMounted ? (
        <ProfileEditor
          friends={friends}
          modalOpen={editing}
          onClose={() => setEditing(false)}
          onModalAfterClose={() => setEditorMounted(false)}
          presentation="modal"
          profile={{
            ...profile,
            personalInfoSettings: profileInfoSettings,
          }}
          returnHref={`/profile/${profile.id}`}
        />
      ) : null}
    </AppShell>
  );
}
