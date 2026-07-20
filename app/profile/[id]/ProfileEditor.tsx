"use client";

/* eslint-disable @next/next/no-img-element -- Profile previews use object URLs and authenticated media routes. */

import {
  ArrowLeft,
  Camera,
  ImagePlus,
  LocateFixed,
  LockKeyhole,
  Trash2,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { DissolveTextarea } from "@/app/components/DissolveField";
import { ModalSurface } from "@/app/components/ModalSurface";
import {
  AnimatedReveal,
  SegmentedControl,
} from "@/app/components/SegmentedControl";
import { TextStateSwap } from "@/app/components/TextStateSwap";
import {
  uploadMediaFiles,
  waitForMediaReady,
  type UploadProgress,
} from "@/app/components/media-upload";
import { useTaskRouteTransition } from "@/app/components/TaskRouteTransition";
import { UserAvatar } from "@/app/components/UserAvatar";
import type {
  FriendSummary,
  ProfileInfoVisibility,
  ProfilePageData,
  ProfileTheme,
} from "@/lib/content-types";
import {
  formatProfileResidence,
  mainlandResidenceRegions,
  parseProfileResidence,
  type ProfileResidenceMode,
} from "@/lib/profile-residence";

const themes: Array<{
  description: string;
  label: string;
  value: ProfileTheme;
}> = [
  { value: "sage", label: "鼠尾草", description: "安静的浅绿" },
  { value: "rose", label: "柔粉", description: "温和的粉红" },
  { value: "mist", label: "雾蓝", description: "清淡的蓝灰" },
  { value: "apricot", label: "暖杏", description: "柔软的杏色" },
  { value: "ink", label: "深墨", description: "沉静的墨绿" },
];

const profileInfoAudienceOptions = [
  { value: "all", label: "可访问我的人" },
  { value: "selected", label: "指定朋友" },
  { value: "private", label: "私密" },
] as const;

const residenceModeOptions = [
  { value: "domestic", label: "国内" },
  { value: "overseas", label: "海外" },
] as const;

function fileSignature(file: File | null) {
  return file
    ? `${file.name}:${file.size}:${file.lastModified}`
    : null;
}

function useObjectUrl(file: File | null) {
  const url = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

function ProfileMediaField({
  acceptLabel,
  fallbackName,
  file,
  focusX,
  focusY,
  kind,
  onChoose,
  onFocusChange,
  onRemove,
  src,
}: {
  acceptLabel: string;
  fallbackName: string;
  file: File | null;
  focusX: number;
  focusY: number;
  kind: "avatar" | "cover";
  onChoose: (file: File | null) => void;
  onFocusChange: (x: number, y: number) => void;
  onRemove: () => void;
  src: string | null;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    focusX: number;
    focusY: number;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const previewUrl = useObjectUrl(file);
  const visibleSrc = previewUrl ?? src;

  function clampFocus(value: number) {
    return Math.round(Math.min(10000, Math.max(0, value)));
  }

  function moveFocusWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 500 : 100;
    const next = {
      x: focusX,
      y: focusY,
    };
    if (event.key === "ArrowLeft") next.x -= step;
    else if (event.key === "ArrowRight") next.x += step;
    else if (event.key === "ArrowUp") next.y -= step;
    else if (event.key === "ArrowDown") next.y += step;
    else return;
    event.preventDefault();
    onFocusChange(clampFocus(next.x), clampFocus(next.y));
  }

  function finishFocusDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragState.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <section className={`profile-media-field profile-media-field--${kind}`}>
      <div className="profile-media-field-heading">
        <div>
          <strong>{kind === "avatar" ? "头像" : "个人封面"}</strong>
          <span>{acceptLabel}</span>
        </div>
        <label className="profile-media-choose">
          {kind === "avatar" ? <Camera size={17} /> : <ImagePlus size={17} />}
          {visibleSrc ? "更换" : "选择图片"}
          <input
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(event) => {
              const selectedFile = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = "";
              onChoose(selectedFile);
            }}
            type="file"
          />
        </label>
      </div>

      <div
        className={`profile-media-preview${visibleSrc ? " has-image" : ""}`}
        ref={previewRef}
      >
        {visibleSrc ? (
          <img
            alt=""
            src={visibleSrc}
            style={{
              objectPosition: `${focusX / 100}% ${focusY / 100}%`,
            }}
          />
        ) : kind === "avatar" ? (
          <span className="profile-media-avatar-fallback">
            <UserAvatar image={null} name={fallbackName} />
          </span>
        ) : (
          <span className="profile-media-cover-fallback">
            选择一张能代表近来生活的照片
          </span>
        )}
        {visibleSrc ? (
          <button
            aria-label={`拖动${kind === "avatar" ? "头像" : "封面"}焦点，或使用下方滑杆精确调整`}
            className={`profile-focus-marker${dragging ? " is-dragging" : ""}`}
            onKeyDown={moveFocusWithKeyboard}
            onPointerCancel={finishFocusDrag}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              dragState.current = {
                focusX,
                focusY,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
              };
              setDragging(true);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = dragState.current;
              const preview = previewRef.current;
              if (
                !drag ||
                drag.pointerId !== event.pointerId ||
                !preview
              ) {
                return;
              }
              const bounds = preview.getBoundingClientRect();
              const deltaX = event.clientX - drag.startX;
              const deltaY = event.clientY - drag.startY;
              if (Math.hypot(deltaX, deltaY) < 3) return;
              onFocusChange(
                clampFocus(drag.focusX + (deltaX / bounds.width) * 10000),
                clampFocus(drag.focusY + (deltaY / bounds.height) * 10000),
              );
            }}
            onPointerUp={finishFocusDrag}
            style={{
              left: `${focusX / 100}%`,
              top: `${focusY / 100}%`,
            }}
            type="button"
          >
            <LocateFixed size={18} />
          </button>
        ) : null}
      </div>
      {visibleSrc ? (
        <div className="profile-media-field-footer">
          <div className="profile-focus-controls">
            <label>
              <span>左右</span>
              <input
                aria-label={`${kind === "avatar" ? "头像" : "封面"}焦点左右位置`}
                max={10000}
                min={0}
                onChange={(event) =>
                  onFocusChange(Number(event.target.value), focusY)
                }
                type="range"
                value={focusX}
              />
            </label>
            <label>
              <span>上下</span>
              <input
                aria-label={`${kind === "avatar" ? "头像" : "封面"}焦点上下位置`}
                max={10000}
                min={0}
                onChange={(event) =>
                  onFocusChange(focusX, Number(event.target.value))
                }
                type="range"
                value={focusY}
              />
            </label>
          </div>
          <button onClick={onRemove} type="button">
            <Trash2 size={16} />移除
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function ProfileEditor({
  friends,
  modalOpen = true,
  onClose,
  onModalAfterClose,
  presentation,
  profile,
  returnHref,
}: {
  friends: FriendSummary[];
  modalOpen?: boolean;
  onClose?: () => void;
  onModalAfterClose?: () => void;
  presentation: "modal" | "page";
  profile: ProfilePageData;
  returnHref: string;
}) {
  const router = useRouter();
  const leaveTaskRoute = useTaskRouteTransition();
  const initialResidence = useMemo(
    () => parseProfileResidence(profile.personalInfo?.residence),
    [profile.personalInfo?.residence],
  );
  const [realName, setRealName] = useState(profile.realName);
  const [nickname, setNickname] = useState(profile.nickname ?? "");
  const [bio, setBio] = useState(profile.bio);
  const [gender, setGender] = useState(
    profile.personalInfo?.gender ?? "",
  );
  const [residenceMode, setResidenceMode] =
    useState<ProfileResidenceMode>(initialResidence.mode);
  const [domesticRegion, setDomesticRegion] = useState(
    initialResidence.mode === "domestic" ? initialResidence.primary : "",
  );
  const [domesticCity, setDomesticCity] = useState(
    initialResidence.mode === "domestic" ? initialResidence.secondary : "",
  );
  const [overseasCountry, setOverseasCountry] = useState(
    initialResidence.mode === "overseas" ? initialResidence.primary : "",
  );
  const [overseasCity, setOverseasCity] = useState(
    initialResidence.mode === "overseas" ? initialResidence.secondary : "",
  );
  const [phone, setPhone] = useState(profile.personalInfo?.phone ?? "");
  const [contactEmail, setContactEmail] = useState(
    profile.personalInfo?.contactEmail ?? profile.email ?? "",
  );
  const [school, setSchool] = useState(profile.personalInfo?.school ?? "");
  const [infoVisibility, setInfoVisibility] =
    useState<ProfileInfoVisibility>(
      profile.personalInfoSettings?.visibility ?? "private",
    );
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>(
    profile.personalInfoSettings?.selectedFriendIds.filter((friendId) =>
      friends.some((friend) => friend.id === friendId),
    ) ?? [],
  );
  const [theme, setTheme] = useState(profile.theme);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [avatarMediaId, setAvatarMediaId] = useState(
    profile.avatar.mediaId,
  );
  const [coverMediaId, setCoverMediaId] = useState(
    profile.cover?.mediaId ?? null,
  );
  const [avatarSrc, setAvatarSrc] = useState(profile.avatar.src);
  const [coverSrc, setCoverSrc] = useState(profile.cover?.src ?? null);
  const [avatarFocus, setAvatarFocus] = useState({
    x: profile.avatar.focusX,
    y: profile.avatar.focusY,
  });
  const [coverFocus, setCoverFocus] = useState({
    x: profile.cover?.focusX ?? 5000,
    y: profile.cover?.focusY ?? 5000,
  });
  const [pendingAvatarId, setPendingAvatarId] = useState<string | null>(null);
  const [pendingCoverId, setPendingCoverId] = useState<string | null>(null);
  const cleanupIds = useRef(new Set<string>());
  const committed = useRef(false);
  const previousInfoVisibilityRef = useRef(infoVisibility);
  const selectedFriendsRef = useRef<HTMLDivElement>(null);
  const [uploadProgress, setUploadProgress] =
    useState<UploadProgress | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const residence = formatProfileResidence(
    residenceMode === "domestic" ? domesticRegion : overseasCountry,
    residenceMode === "domestic" ? domesticCity : overseasCity,
  );
  const initialResidenceValue = formatProfileResidence(
    initialResidence.primary,
    initialResidence.secondary,
  );
  const hasCover = Boolean(coverFile || coverMediaId || coverSrc);
  const initialSignature = useMemo(
    () => JSON.stringify({
      realName: profile.realName,
      nickname: profile.nickname ?? "",
      bio: profile.bio,
      gender: profile.personalInfo?.gender ?? "",
      residence: initialResidenceValue,
      phone: profile.personalInfo?.phone ?? "",
      contactEmail:
        profile.personalInfo?.contactEmail ?? profile.email ?? "",
      school: profile.personalInfo?.school ?? "",
      infoVisibility:
        profile.personalInfoSettings?.visibility ?? "private",
      selectedFriendIds:
        profile.personalInfoSettings?.selectedFriendIds
          .filter((friendId) =>
            friends.some((friend) => friend.id === friendId),
          )
          .sort() ?? [],
      theme: profile.theme,
      avatarMediaId: profile.avatar.mediaId,
      coverMediaId: profile.cover?.mediaId ?? null,
      avatarFocus: {
        x: profile.avatar.focusX,
        y: profile.avatar.focusY,
      },
      coverFocus: {
        x: profile.cover?.focusX ?? 5000,
        y: profile.cover?.focusY ?? 5000,
      },
      avatarFile: null,
      coverFile: null,
    }),
    [friends, initialResidenceValue, profile],
  );
  const signature = JSON.stringify({
    realName,
    nickname,
    bio,
    gender,
    residence,
    phone,
    contactEmail,
    school,
    infoVisibility,
    selectedFriendIds: [...selectedFriendIds].sort(),
    theme,
    avatarMediaId,
    coverMediaId,
    avatarFocus,
    coverFocus,
    avatarFile: fileSignature(avatarFile),
    coverFile: fileSignature(coverFile),
  });
  const dirty = signature !== initialSignature;

  useEffect(() => () => {
    if (committed.current) return;
    for (const mediaId of cleanupIds.current) {
      void fetch(`/api/media/${mediaId}`, { method: "DELETE" });
    }
  }, []);

  useEffect(() => {
    const previousVisibility = previousInfoVisibilityRef.current;
    previousInfoVisibilityRef.current = infoVisibility;
    if (
      infoVisibility !== "selected" ||
      previousVisibility === "selected"
    ) {
      return;
    }
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const frame = window.requestAnimationFrame(() => {
      selectedFriendsRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
    });
    const settleTimer = window.setTimeout(() => {
      selectedFriendsRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
    }, reduceMotion ? 0 : 320);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
    };
  }, [infoVisibility]);

  async function discardPendingMedia(mediaId: string | null) {
    if (!mediaId) return;
    const response = await fetch(`/api/media/${mediaId}`, {
      method: "DELETE",
    });
    if (response.ok) cleanupIds.current.delete(mediaId);
  }

  function closeNow() {
    setCloseDialogOpen(false);
    if (onClose) {
      onClose();
      return;
    }
    if (presentation === "page" && leaveTaskRoute) {
      leaveTaskRoute(returnHref);
      return;
    }
    router.push(returnHref);
  }

  function requestClose() {
    if (pending) return;
    if (dirty) {
      setCloseDialogOpen(true);
      return;
    }
    closeNow();
  }

  async function prepareMedia(
    file: File | null,
    pendingMediaId: string | null,
    setPendingMediaId: (mediaId: string) => void,
  ) {
    if (!file) return pendingMediaId;
    let mediaId = pendingMediaId;
    if (!mediaId) {
      const [uploaded] = await uploadMediaFiles([file], setUploadProgress);
      mediaId = uploaded.id;
      cleanupIds.current.add(mediaId);
      setPendingMediaId(mediaId);
    }
    setUploadProgress({ percent: 100, phase: "processing" });
    await waitForMediaReady(mediaId);
    return mediaId;
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const nextAvatarId = avatarFile
        ? await prepareMedia(
            avatarFile,
            pendingAvatarId,
            setPendingAvatarId,
          )
        : avatarMediaId;
      const nextCoverId = coverFile
        ? await prepareMedia(coverFile, pendingCoverId, setPendingCoverId)
        : coverMediaId;
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          realName,
          nickname,
          bio,
          theme,
          personalInfo: {
            gender,
            residence,
            phone,
            contactEmail,
            school,
            visibility: infoVisibility,
            selectedFriendIds,
          },
          avatar: {
            mediaId: nextAvatarId,
            focusX: avatarFocus.x,
            focusY: avatarFocus.y,
          },
          cover: {
            mediaId: nextCoverId,
            focusX: coverFocus.x,
            focusY: coverFocus.y,
          },
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "保存失败。");
      }
      committed.current = true;
      cleanupIds.current.clear();
      if (presentation === "modal") {
        onClose?.();
        router.refresh();
      } else {
        if (leaveTaskRoute) leaveTaskRoute(returnHref);
        else router.push(returnHref);
        router.refresh();
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "个人资料保存失败。",
      );
    } finally {
      setUploadProgress(null);
      setPending(false);
    }
  }

  const form = (
    <form
      className={`profile-editor profile-editor--${presentation} profile-theme-${theme}`}
      onSubmit={saveProfile}
    >
      <header className="profile-editor-header">
        <button
          aria-label="返回个人主页"
          className="profile-editor-back"
          onClick={requestClose}
          type="button"
        >
          {presentation === "page" ? <ArrowLeft size={21} /> : <X size={21} />}
        </button>
        <div>
          <h1 id="profile-editor-title">编辑个人资料</h1>
          <p>让熟悉的人更容易认出你，也保留一点自己的气息。</p>
        </div>
      </header>

      <div className="profile-editor-scroll" data-modal-scroll-root>
        <div className="profile-editor-media-grid">
          <ProfileMediaField
            acceptLabel="建议使用清晰正方形照片"
            fallbackName={nickname || realName}
            file={avatarFile}
            focusX={avatarFocus.x}
            focusY={avatarFocus.y}
            kind="avatar"
            onChoose={(file) => {
              void discardPendingMedia(pendingAvatarId);
              setPendingAvatarId(null);
              setAvatarFile(file);
              setError("");
            }}
            onFocusChange={(x, y) => setAvatarFocus({ x, y })}
            onRemove={() => {
              void discardPendingMedia(pendingAvatarId);
              setPendingAvatarId(null);
              setAvatarFile(null);
              setAvatarMediaId(null);
              setAvatarSrc(null);
            }}
            src={avatarSrc}
          />
          <ProfileMediaField
            acceptLabel="会根据设备比例裁切"
            fallbackName={nickname || realName}
            file={coverFile}
            focusX={coverFocus.x}
            focusY={coverFocus.y}
            kind="cover"
            onChoose={(file) => {
              void discardPendingMedia(pendingCoverId);
              setPendingCoverId(null);
              setCoverFile(file);
              setError("");
            }}
            onFocusChange={(x, y) => setCoverFocus({ x, y })}
            onRemove={() => {
              void discardPendingMedia(pendingCoverId);
              setPendingCoverId(null);
              setCoverFile(null);
              setCoverMediaId(null);
              setCoverSrc(null);
            }}
            src={coverSrc}
          />
        </div>

        <AnimatedReveal
          className="profile-theme-reveal"
          show={!hasCover}
        >
          <fieldset className="profile-theme-fieldset">
            <legend>没有封面时的主题</legend>
            <div>
              {themes.map((option) => (
                <label
                  className={`profile-theme-option profile-theme-${option.value}`}
                  key={option.value}
                >
                  <input
                    checked={theme === option.value}
                    name="profile-theme"
                    onChange={() => setTheme(option.value)}
                    type="radio"
                    value={option.value}
                  />
                  <span aria-hidden="true" />
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </label>
              ))}
            </div>
          </fieldset>
        </AnimatedReveal>

        <div className="profile-editor-fields">
          <label>
            <span>真实姓名</span>
            <input
              maxLength={40}
              onChange={(event) => setRealName(event.target.value)}
              required
              value={realName}
            />
          </label>
          <label>
            <span>昵称 <small>选填</small></span>
            <input
              maxLength={40}
              onChange={(event) => setNickname(event.target.value)}
              value={nickname}
            />
          </label>
          <label className="profile-editor-bio">
            <span>个人介绍</span>
            <DissolveTextarea
              maxLength={160}
              onValueChange={setBio}
              placeholder="写一句简单的自我介绍"
              value={bio}
              wrapperClassName="profile-writing-surface"
            />
            <small>{bio.length} / 160</small>
          </label>
        </div>

        <section className="profile-details-editor">
          <header>
            <div>
              <h2>个人信息</h2>
              <p>只填写你愿意留下的内容；未设置的项目不会显示在主页。</p>
            </div>
          </header>

          <div className="profile-details-fields">
            <label>
              <span>性别 <small>选填</small></span>
              <input
                maxLength={32}
                onChange={(event) => setGender(event.target.value)}
                placeholder="例如：女、男、非二元"
                value={gender}
              />
            </label>
            <label>
              <span>手机号 <small>选填</small></span>
              <input
                autoComplete="tel"
                inputMode="tel"
                maxLength={40}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="支持国际区号"
                type="tel"
                value={phone}
              />
            </label>
            <fieldset className="profile-residence-field">
              <div className="profile-residence-heading">
                <legend>现居地 <small>选填</small></legend>
                <SegmentedControl
                  ariaLabel="现居地范围"
                  className="profile-residence-mode"
                  onValueChange={setResidenceMode}
                  options={residenceModeOptions}
                  value={residenceMode}
                />
              </div>
              {residenceMode === "domestic" ? (
                <div className="profile-residence-inputs">
                  <label>
                    <span>省级地区</span>
                    <select
                      onChange={(event) =>
                        setDomesticRegion(event.target.value)
                      }
                      required={Boolean(domesticCity.trim())}
                      value={domesticRegion}
                    >
                      <option value="">请选择</option>
                      {mainlandResidenceRegions.map((region) => (
                        <option key={region} value={region}>
                          {region}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>城市或地区</span>
                    <input
                      maxLength={40}
                      onChange={(event) => setDomesticCity(event.target.value)}
                      placeholder="例如：合肥（可不填）"
                      value={domesticCity}
                    />
                  </label>
                </div>
              ) : (
                <div className="profile-residence-inputs">
                  <label>
                    <span>国家或地区</span>
                    <input
                      maxLength={40}
                      onChange={(event) =>
                        setOverseasCountry(event.target.value)
                      }
                      placeholder="例如：韩国"
                      required={Boolean(overseasCity.trim())}
                      value={overseasCountry}
                    />
                  </label>
                  <label>
                    <span>城市或地区</span>
                    <input
                      maxLength={40}
                      onChange={(event) => setOverseasCity(event.target.value)}
                      placeholder="例如：首尔（可不填）"
                      value={overseasCity}
                    />
                  </label>
                </div>
              )}
              <small>
                主页统一显示为“
                {residenceMode === "domestic"
                  ? "省级地区 · 城市"
                  : "国家或地区 · 城市"}
                ”；后一项可留空。
              </small>
            </fieldset>
            <label>
              <span>联系邮箱 <small>选填</small></span>
              <input
                autoComplete="email"
                maxLength={254}
                onChange={(event) => setContactEmail(event.target.value)}
                placeholder="用于你愿意公开的联系"
                type="email"
                value={contactEmail}
              />
              <small>初始使用登录邮箱，保存后与登录账号独立。</small>
            </label>
            <label className="profile-login-email">
              <span>登录邮箱</span>
              <span className="profile-readonly-field">
                <LockKeyhole aria-hidden="true" size={16} />
                <input
                  aria-label="登录邮箱"
                  readOnly
                  type="email"
                  value={profile.email ?? ""}
                />
              </span>
              <small>用于登录账号，暂不支持在这里修改。</small>
            </label>
            <label className="profile-details-school">
              <span>学校 <small>选填</small></span>
              <input
                maxLength={100}
                onChange={(event) => setSchool(event.target.value)}
                placeholder="学校或曾经就读的院校"
                value={school}
              />
            </label>
          </div>

          <div className="profile-info-audience">
            <div>
              <strong>谁可以看到这些信息</strong>
              <p>“可访问我的人”只包括本来就有权打开主页的人，不会公开到站外。</p>
            </div>
            <SegmentedControl
              ariaLabel="个人信息可见范围"
              className="profile-info-audience-control"
              onValueChange={setInfoVisibility}
              options={profileInfoAudienceOptions}
              value={infoVisibility}
            />
          </div>

          <AnimatedReveal
            className="profile-selected-friends-reveal"
            show={infoVisibility === "selected"}
          >
            <div ref={selectedFriendsRef}>
              <fieldset className="profile-selected-friends">
                <legend>选择可以查看的朋友</legend>
                {friends.length ? (
                  <div>
                    {friends.map((friend) => {
                      const selected = selectedFriendIds.includes(friend.id);
                      return (
                        <label key={friend.id}>
                          <input
                            checked={selected}
                            onChange={(event) => {
                              setSelectedFriendIds((current) =>
                                event.target.checked
                                  ? [...new Set([...current, friend.id])]
                                  : current.filter(
                                      (friendId) => friendId !== friend.id,
                                    ),
                              );
                            }}
                            type="checkbox"
                          />
                          <span className="profile-selected-friend-avatar">
                            <UserAvatar
                              image={friend.image}
                              name={friend.displayName}
                            />
                          </span>
                          <span>
                            <strong>{friend.displayName}</strong>
                            <small>{friend.identityName}</small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p>还没有可以选择的朋友；保存时会自动改为私密。</p>
                )}
                {friends.length && selectedFriendIds.length === 0 ? (
                  <p className="profile-selected-friends-note">
                    暂未选择朋友，保存后会自动改为私密。
                  </p>
                ) : null}
              </fieldset>
            </div>
          </AnimatedReveal>
        </section>

        {error ? <p className="composer-error">{error}</p> : null}
      </div>

      <footer className="profile-editor-actions">
        <button
          className="secondary-action"
          disabled={pending}
          onClick={requestClose}
          type="button"
        >
          取消
        </button>
        <button className="publish-button" disabled={pending} type="submit">
          <TextStateSwap
            labels={[
              "保存资料",
              "正在保存",
              "正在处理照片",
              "正在上传 100%",
            ]}
            text={
              pending
                ? uploadProgress?.phase === "uploading"
                  ? `正在上传 ${uploadProgress.percent}%`
                  : uploadProgress
                    ? "正在处理照片"
                    : "正在保存"
                : "保存资料"
            }
          />
        </button>
      </footer>

      <ConfirmDialog
        confirmLabel="放弃修改"
        description="尚未保存的文字、图片选择和焦点位置会被丢弃。"
        onCancel={() => setCloseDialogOpen(false)}
        onConfirm={closeNow}
        open={closeDialogOpen}
        title="要放弃这次资料修改吗？"
        tone="danger"
      />
    </form>
  );

  if (presentation === "page") {
    return <div className="profile-editor-page-frame">{form}</div>;
  }
  return (
    <ModalSurface
      labelledBy="profile-editor-title"
      onAfterClose={onModalAfterClose}
      onRequestClose={requestClose}
      open={modalOpen}
      size="expanded"
    >
      {form}
    </ModalSurface>
  );
}
