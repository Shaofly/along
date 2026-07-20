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
import {
  clampProfileMediaScale,
  PROFILE_AVATAR_SCALE_MAX,
  PROFILE_COVER_SCALE_MAX,
  PROFILE_MEDIA_SCALE_BASE,
  profileMediaImageStyle,
} from "@/lib/profile-media";

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

type ProfilePreviewGeometry = {
  baseHeight: number;
  baseWidth: number;
  containerHeight: number;
  containerWidth: number;
};

function clampProfileFocus(value: number) {
  return Math.round(Math.min(10000, Math.max(0, value)));
}

function getProfilePreviewGeometry(
  preview: HTMLDivElement | null,
  image: HTMLImageElement | null,
): ProfilePreviewGeometry | null {
  if (!preview || !image || !image.naturalWidth || !image.naturalHeight) {
    return null;
  }
  const bounds = preview.getBoundingClientRect();
  const containerRatio = bounds.width / bounds.height;
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const baseWidth =
    imageRatio >= containerRatio ? bounds.height * imageRatio : bounds.width;
  const baseHeight =
    imageRatio >= containerRatio ? bounds.height : bounds.width / imageRatio;
  return {
    baseHeight,
    baseWidth,
    containerHeight: bounds.height,
    containerWidth: bounds.width,
  };
}

function profileFocusAfterZoom({
  baseHeight,
  baseWidth,
  containerHeight,
  containerWidth,
  currentPointX,
  currentPointY,
  focusX,
  focusY,
  nextScale,
  scale,
  startPointX,
  startPointY,
}: ProfilePreviewGeometry & {
  currentPointX: number;
  currentPointY: number;
  focusX: number;
  focusY: number;
  nextScale: number;
  scale: number;
  startPointX: number;
  startPointY: number;
}) {
  function axisFocus({
    baseSize,
    containerSize,
    currentPoint,
    focus,
    startPoint,
  }: {
    baseSize: number;
    containerSize: number;
    currentPoint: number;
    focus: number;
    startPoint: number;
  }) {
    const startFactor = scale / PROFILE_MEDIA_SCALE_BASE;
    const nextFactor = nextScale / PROFILE_MEDIA_SCALE_BASE;
    const startImageSize = baseSize * startFactor;
    const nextImageSize = baseSize * nextFactor;
    const startOverflow = Math.max(0, startImageSize - containerSize);
    const nextOverflow = Math.max(0, nextImageSize - containerSize);
    if (nextOverflow < 0.5) return clampProfileFocus(focus);
    const startLeft = -startOverflow * (focus / 10000);
    const imagePoint = (startPoint - startLeft) / startImageSize;
    const nextLeft = currentPoint - imagePoint * nextImageSize;
    return clampProfileFocus((-nextLeft / nextOverflow) * 10000);
  }

  return {
    x: axisFocus({
      baseSize: baseWidth,
      containerSize: containerWidth,
      currentPoint: currentPointX,
      focus: focusX,
      startPoint: startPointX,
    }),
    y: axisFocus({
      baseSize: baseHeight,
      containerSize: containerHeight,
      currentPoint: currentPointY,
      focus: focusY,
      startPoint: startPointY,
    }),
  };
}

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
  onScaleChange,
  scale,
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
  onScaleChange: (scale: number) => void;
  scale: number;
  src: string | null;
}) {
  const maxScale =
    kind === "avatar" ? PROFILE_AVATAR_SCALE_MAX : PROFILE_COVER_SCALE_MAX;
  const previewRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragState = useRef<{
    focusX: number;
    focusY: number;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const pinchPointers = useRef(
    new Map<number, { x: number; y: number }>(),
  );
  const pinchState = useRef<{
    baseHeight: number;
    baseWidth: number;
    containerHeight: number;
    containerWidth: number;
    distance: number;
    focusX: number;
    focusY: number;
    midpointX: number;
    midpointY: number;
    scale: number;
  } | null>(null);
  const focusRef = useRef({ x: focusX, y: focusY });
  const scaleRef = useRef(scale);
  const onFocusChangeRef = useRef(onFocusChange);
  const onScaleChangeRef = useRef(onScaleChange);
  const [dragging, setDragging] = useState(false);
  const [pinching, setPinching] = useState(false);
  const previewUrl = useObjectUrl(file);
  const visibleSrc = previewUrl ?? src;

  useEffect(() => {
    focusRef.current = { x: focusX, y: focusY };
    scaleRef.current = scale;
    onFocusChangeRef.current = onFocusChange;
    onScaleChangeRef.current = onScaleChange;
  }, [focusX, focusY, onFocusChange, onScaleChange, scale]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || !visibleSrc) return;
    const zoomWithTrackpad = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const nextScale = clampProfileMediaScale(
        scaleRef.current * Math.exp(-delta * 0.0025),
        maxScale,
      );
      const geometry = getProfilePreviewGeometry(
        previewRef.current,
        imageRef.current,
      );
      if (geometry) {
        const bounds = preview.getBoundingClientRect();
        const nextFocus = profileFocusAfterZoom({
          ...geometry,
          currentPointX: event.clientX - bounds.left,
          currentPointY: event.clientY - bounds.top,
          focusX: focusRef.current.x,
          focusY: focusRef.current.y,
          nextScale,
          scale: scaleRef.current,
          startPointX: event.clientX - bounds.left,
          startPointY: event.clientY - bounds.top,
        });
        focusRef.current = nextFocus;
        onFocusChangeRef.current(nextFocus.x, nextFocus.y);
      }
      scaleRef.current = nextScale;
      onScaleChangeRef.current(nextScale);
    };
    preview.addEventListener("wheel", zoomWithTrackpad, {
      passive: false,
    });
    return () => preview.removeEventListener("wheel", zoomWithTrackpad);
  }, [maxScale, visibleSrc]);

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
    onFocusChange(clampProfileFocus(next.x), clampProfileFocus(next.y));
  }

  function markerPosition(value: number) {
    const fraction = value / 10000;
    return `calc(${value / 100}% + ${15 - fraction * 30}px)`;
  }

  function pointerDistance() {
    const points = [...pinchPointers.current.values()];
    if (points.length < 2) return 0;
    return Math.hypot(
      points[0].x - points[1].x,
      points[0].y - points[1].y,
    );
  }

  function pointerMidpoint() {
    const points = [...pinchPointers.current.values()];
    if (points.length < 2) return null;
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
  }

  function beginPreviewGesture(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch" || !visibleSrc) return;
    pinchPointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pinchPointers.current.size !== 2) return;
    const distance = pointerDistance();
    const midpoint = pointerMidpoint();
    const geometry = getProfilePreviewGeometry(
      previewRef.current,
      imageRef.current,
    );
    const preview = previewRef.current;
    if (!distance || !midpoint || !geometry || !preview) return;
    const bounds = preview.getBoundingClientRect();
    pinchState.current = {
      ...geometry,
      distance,
      focusX,
      focusY,
      midpointX: midpoint.x - bounds.left,
      midpointY: midpoint.y - bounds.top,
      scale: scaleRef.current,
    };
    dragState.current = null;
    setDragging(false);
    setPinching(true);
    for (const pointerId of pinchPointers.current.keys()) {
      try {
        event.currentTarget.setPointerCapture(pointerId);
      } catch {
        // A browser may have already cancelled one pointer for page scrolling.
      }
    }
    event.preventDefault();
  }

  function movePreviewGesture(event: PointerEvent<HTMLDivElement>) {
    if (
      event.pointerType !== "touch" ||
      !pinchPointers.current.has(event.pointerId)
    ) {
      return;
    }
    pinchPointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const pinch = pinchState.current;
    if (!pinch || pinchPointers.current.size < 2) return;
    const distance = pointerDistance();
    const midpoint = pointerMidpoint();
    const preview = previewRef.current;
    if (!distance || !midpoint || !preview) return;
    event.preventDefault();
    const nextScale = clampProfileMediaScale(
      pinch.scale * (distance / pinch.distance),
      maxScale,
    );
    const bounds = preview.getBoundingClientRect();
    const nextFocus = profileFocusAfterZoom({
      baseHeight: pinch.baseHeight,
      baseWidth: pinch.baseWidth,
      containerHeight: pinch.containerHeight,
      containerWidth: pinch.containerWidth,
      currentPointX: midpoint.x - bounds.left,
      currentPointY: midpoint.y - bounds.top,
      focusX: pinch.focusX,
      focusY: pinch.focusY,
      nextScale,
      scale: pinch.scale,
      startPointX: pinch.midpointX,
      startPointY: pinch.midpointY,
    });
    onFocusChange(nextFocus.x, nextFocus.y);
    onScaleChange(nextScale);
  }

  function finishPreviewGesture(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    pinchPointers.current.delete(event.pointerId);
    if (pinchPointers.current.size < 2) {
      pinchState.current = null;
      setPinching(false);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
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
        className={`profile-media-preview${visibleSrc ? " has-image" : ""}${
          pinching ? " is-pinching" : ""
        }`}
        onPointerCancel={finishPreviewGesture}
        onPointerDown={beginPreviewGesture}
        onPointerMove={movePreviewGesture}
        onPointerUp={finishPreviewGesture}
        ref={previewRef}
      >
        {visibleSrc ? (
          <img
            alt=""
            ref={imageRef}
            src={visibleSrc}
            style={profileMediaImageStyle({ focusX, focusY, scale })}
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
        {visibleSrc && kind === "avatar" ? (
          <span aria-hidden="true" className="profile-avatar-safe-area" />
        ) : null}
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
                clampProfileFocus(
                  drag.focusX +
                    (deltaX / Math.max(1, bounds.width - 30)) * 10000,
                ),
                clampProfileFocus(
                  drag.focusY +
                    (deltaY / Math.max(1, bounds.height - 30)) * 10000,
                ),
              );
            }}
            onPointerUp={finishFocusDrag}
            style={{
              left: markerPosition(focusX),
              top: markerPosition(focusY),
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
            <label>
              <span>缩放</span>
              <input
                aria-label={`${kind === "avatar" ? "头像" : "封面"}缩放比例`}
                max={maxScale}
                min={PROFILE_MEDIA_SCALE_BASE}
                onChange={(event) =>
                  onScaleChange(Number(event.target.value))
                }
                type="range"
                value={scale}
              />
              <output>{Math.round(scale / 100)}%</output>
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
  const [avatarScale, setAvatarScale] = useState(profile.avatar.scale);
  const [coverFocus, setCoverFocus] = useState({
    x: profile.cover?.focusX ?? 5000,
    y: profile.cover?.focusY ?? 5000,
  });
  const [coverScale, setCoverScale] = useState(
    profile.cover?.scale ?? PROFILE_MEDIA_SCALE_BASE,
  );
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
      avatarScale: profile.avatar.scale,
      coverFocus: {
        x: profile.cover?.focusX ?? 5000,
        y: profile.cover?.focusY ?? 5000,
      },
      coverScale: profile.cover?.scale ?? PROFILE_MEDIA_SCALE_BASE,
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
    avatarScale,
    coverFocus,
    coverScale,
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
            scale: avatarScale,
          },
          cover: {
            mediaId: nextCoverId,
            focusX: coverFocus.x,
            focusY: coverFocus.y,
            scale: coverScale,
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
              if (file) {
                setAvatarFocus({ x: 5000, y: 5000 });
                setAvatarScale(PROFILE_MEDIA_SCALE_BASE);
              }
              setError("");
            }}
            onFocusChange={(x, y) => setAvatarFocus({ x, y })}
            onRemove={() => {
              void discardPendingMedia(pendingAvatarId);
              setPendingAvatarId(null);
              setAvatarFile(null);
              setAvatarMediaId(null);
              setAvatarSrc(null);
              setAvatarFocus({ x: 5000, y: 5000 });
              setAvatarScale(PROFILE_MEDIA_SCALE_BASE);
            }}
            onScaleChange={setAvatarScale}
            scale={avatarScale}
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
              if (file) {
                setCoverFocus({ x: 5000, y: 5000 });
                setCoverScale(PROFILE_MEDIA_SCALE_BASE);
              }
              setError("");
            }}
            onFocusChange={(x, y) => setCoverFocus({ x, y })}
            onRemove={() => {
              void discardPendingMedia(pendingCoverId);
              setPendingCoverId(null);
              setCoverFile(null);
              setCoverMediaId(null);
              setCoverSrc(null);
              setCoverFocus({ x: 5000, y: 5000 });
              setCoverScale(PROFILE_MEDIA_SCALE_BASE);
            }}
            onScaleChange={setCoverScale}
            scale={coverScale}
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
