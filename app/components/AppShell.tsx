"use client";

import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion } from "motion/react";
import { ArrowLeft, Bell, ChevronDown, FilePenLine, LogOut, Menu, Settings, UserRound, UsersRound, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CSSProperties, MouseEvent, PointerEvent, ReactNode, useEffect, useRef, useState } from "react";

import { SegmentedControl } from "@/app/components/SegmentedControl";
import { TaskRouteTransitionProvider } from "@/app/components/TaskRouteTransition";
import { UserAvatar } from "@/app/components/UserAvatar";
import { authClient } from "@/lib/auth-client";
import { profileMediaImageStyle } from "@/lib/profile-media";

export type ShellUser = {
  id: string;
  name: string;
  realName: string;
  nickname: string | null;
  image: string | null;
  avatarFocusX: number;
  avatarFocusY: number;
  avatarScale: number;
  role?: "admin" | "member";
  draftCount: number;
};

type PrimaryRoute = "home" | "circles" | "friends" | "profile";
type DrawerGestureMode = "pending" | "horizontal";

export type MobileHeaderContext = {
  compactProfile?: boolean;
  mode?: "primary" | "detail";
  profileIdentity?: {
    image: string | null;
    imageStyle?: CSSProperties;
    name: string;
  };
  title?: string;
};

const primaryOptions = [
  { value: "home", label: "首页" },
  { value: "circles", label: "圈子" },
  { value: "friends", label: "朋友" },
  { value: "profile", label: "个人" },
] as const;

function routeFor(value: PrimaryRoute, userId: string) {
  if (value === "home") return "/home";
  if (value === "circles") return "/circles";
  if (value === "friends") return "/friends";
  return `/profile/${userId}`;
}

function routeFromPath(pathname: string, userId: string): PrimaryRoute {
  if (pathname.startsWith("/circles")) return "circles";
  if (pathname.startsWith("/friends") || pathname.startsWith("/invites")) return "friends";
  if (
    pathname === `/profile/${userId}` ||
    pathname === "/profile" ||
    pathname.startsWith("/drafts") ||
    pathname.startsWith("/compose/personal")
  ) {
    return "profile";
  }
  return "home";
}

function secondaryRouteTitle(pathname: string) {
  if (pathname.startsWith("/notifications")) return "通知";
  if (pathname === "/drafts") return "草稿箱";
  return null;
}

function isTaskRoutePath(pathname: string) {
  return pathname === "/compose/personal"
    || /^\/circles\/[^/]+\/compose$/.test(pathname)
    || /^\/drafts\/[^/]+\/edit$/.test(pathname)
    || /^\/posts\/[^/]+\/edit$/.test(pathname)
    || /^\/profile\/[^/]+\/edit$/.test(pathname);
}

function drawerWidth() {
  return Math.min(window.innerWidth * 0.84, 340);
}

export function AppShell({
  children,
  mobileHeader,
  user,
  pageClassName = "",
}: {
  children: ReactNode;
  mobileHeader?: MobileHeaderContext;
  user: ShellUser;
  pageClassName?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const secondaryTitle = secondaryRouteTitle(pathname);
  const isSecondaryRoute = secondaryTitle !== null;
  const isTaskRoute = isTaskRoutePath(pathname);
  const isMobileDetailRoute = mobileHeader?.mode === "detail";
  const isProfileHeaderRoute = Boolean(mobileHeader?.profileIdentity);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [secondaryExiting, setSecondaryExiting] = useState(false);
  const [taskExiting, setTaskExiting] = useState(false);
  const stageX = useMotionValue(0);
  const desktopAccountRef = useRef<HTMLDivElement>(null);
  const desktopAccountTriggerRef = useRef<HTMLButtonElement>(null);
  const desktopAccountPathRef = useRef(pathname);
  const gestureStart = useRef<{
    captureTarget: HTMLDivElement;
    lastTime: number;
    lastX: number;
    mode: DrawerGestureMode;
    pointerId: number;
    stageX: number;
    velocityX: number;
    x: number;
    y: number;
  } | null>(null);
  const suppressStageClick = useRef(false);
  const secondaryBackInProgress = useRef(false);
  const taskExitInProgress = useRef(false);
  const [pendingNavigation, setPendingNavigation] = useState<{
    fromPath: string;
    value: PrimaryRoute;
  } | null>(null);
  const activeRoute = pendingNavigation?.fromPath === pathname
    ? pendingNavigation.value
    : routeFromPath(pathname, user.id);
  const accountDisplayName = user.nickname ?? user.realName;
  const shellAvatarStyle = profileMediaImageStyle({
    focusX: user.avatarFocusX,
    focusY: user.avatarFocusY,
    scale: user.avatarScale,
  });
  const primaryTitle =
    primaryOptions.find((option) => option.value === activeRoute)?.label ??
    "首页";
  const mobileHeaderTitle =
    secondaryTitle ?? mobileHeader?.title ?? primaryTitle;
  const showProfileIdentity = Boolean(
    mobileHeader?.profileIdentity &&
      (mobileHeader.compactProfile || isMobileDetailRoute),
  );
  const menuVisible =
    menuOpen && desktopAccountPathRef.current === pathname;

  useEffect(() => {
    const onPopState = () => {
      setDrawerOpen(false);
      setPendingNavigation(null);
      snapStage(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // stageX is stable for the lifetime of this shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (drawerOpen && !gestureStart.current) stageX.set(drawerWidth());
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [drawerOpen, stageX]);

  useEffect(() => {
    if (!drawerOpen || !window.matchMedia("(max-width: 700px)").matches) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!menuVisible) return;
    function closeFromOutside(event: globalThis.PointerEvent) {
      if (
        event.target instanceof Node &&
        !desktopAccountRef.current?.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    }
    function closeFromKeyboard(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      desktopAccountTriggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [menuVisible]);

  function snapStage(open: boolean) {
    const target = open ? drawerWidth() : 0;
    stageX.stop();
    if (reducedMotion) {
      stageX.set(target);
      return;
    }
    animate(stageX, target, {
      type: "spring",
      stiffness: 380,
      damping: 34,
      mass: 0.82,
    });
  }

  function openDrawer() {
    if (!drawerOpen) {
      window.history.pushState({ alongDrawer: true }, "", window.location.href);
      setDrawerOpen(true);
    }
    snapStage(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    snapStage(false);
    if (window.history.state?.alongDrawer) window.history.back();
  }

  function navigate(value: PrimaryRoute) {
    const href = routeFor(value, user.id);
    setMenuOpen(false);
    if (drawerOpen && window.history.state?.alongDrawer) {
      window.history.back();
      window.setTimeout(() => router.push(href), 0);
      return;
    }
    if (value === activeRoute) return;
    setPendingNavigation({ fromPath: pathname, value });
    router.push(href);
  }

  function beginDrawerGesture(event: PointerEvent<HTMLDivElement>) {
    if (isSecondaryRoute || isMobileDetailRoute || isTaskRoute) return;
    if (!window.matchMedia("(max-width: 700px)").matches || !event.isPrimary) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable='true'], [data-no-drawer-gesture]")) return;
    stageX.stop();
    gestureStart.current = {
      captureTarget: event.currentTarget,
      lastTime: event.timeStamp,
      lastX: event.clientX,
      mode: "pending",
      pointerId: event.pointerId,
      stageX: stageX.get(),
      velocityX: 0,
      x: event.clientX,
      y: event.clientY,
    };
  }

  function moveDrawerGesture(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureStart.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;

    if (gesture.mode === "pending") {
      if (Math.hypot(dx, dy) < 9) return;
      if (Math.abs(dy) >= Math.abs(dx) * 0.9) {
        gestureStart.current = null;
        if (gesture.captureTarget.hasPointerCapture(gesture.pointerId)) {
          gesture.captureTarget.releasePointerCapture(gesture.pointerId);
        }
        snapStage(drawerOpen);
        return;
      }
      if (!drawerOpen && dx < 0) {
        gestureStart.current = null;
        snapStage(false);
        return;
      }
      gesture.mode = "horizontal";
      gesture.captureTarget.setPointerCapture(gesture.pointerId);
      suppressStageClick.current = true;
    }

    const elapsed = Math.max(1, event.timeStamp - gesture.lastTime);
    gesture.velocityX = (event.clientX - gesture.lastX) / elapsed;
    gesture.lastX = event.clientX;
    gesture.lastTime = event.timeStamp;

    const width = drawerWidth();
    const rawX = gesture.stageX + dx;
    const resistedX = rawX < 0
      ? rawX * 0.14
      : rawX > width
        ? width + (rawX - width) * 0.14
        : rawX;
    stageX.set(resistedX);
  }

  function finishDrawerGesture() {
    const start = gestureStart.current;
    gestureStart.current = null;
    if (!start) return;
    if (start.captureTarget.hasPointerCapture(start.pointerId)) {
      start.captureTarget.releasePointerCapture(start.pointerId);
    }
    if (start.mode !== "horizontal") {
      snapStage(drawerOpen);
      return;
    }

    const width = drawerWidth();
    const currentX = stageX.get();
    const shouldOpen = start.velocityX > 0.48
      || (start.velocityX >= -0.48 && currentX > width * 0.5);
    window.setTimeout(() => {
      suppressStageClick.current = false;
    }, 0);
    if (shouldOpen) openDrawer();
    else closeDrawer();
  }

  function cancelDrawerGesture(event: PointerEvent<HTMLDivElement>) {
    const start = gestureStart.current;
    gestureStart.current = null;
    if (start?.captureTarget.hasPointerCapture(event.pointerId)) {
      start.captureTarget.releasePointerCapture(event.pointerId);
    }
    suppressStageClick.current = false;
    snapStage(drawerOpen);
  }

  function handleShellClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (suppressStageClick.current) {
      suppressStageClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function handleStageClick() {
    if (suppressStageClick.current) {
      suppressStageClick.current = false;
      return;
    }
    if (drawerOpen) closeDrawer();
  }

  async function signOut() {
    await authClient.signOut();
    window.location.href = "/";
  }

  function completeSecondaryBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/home");
  }

  function returnFromSecondary() {
    if (
      (!isSecondaryRoute && !isMobileDetailRoute) ||
      secondaryBackInProgress.current
    ) return;
    secondaryBackInProgress.current = true;
    setMenuOpen(false);

    const mobile = window.matchMedia("(max-width: 700px)").matches;
    if (!mobile || reducedMotion) {
      completeSecondaryBack();
      return;
    }

    setSecondaryExiting(true);
    window.requestAnimationFrame(() => {
      stageX.stop();
      stageX.set(0);
      animate(stageX, window.innerWidth, {
        duration: 0.28,
        ease: [0.4, 0, 0.2, 1],
      }).then(completeSecondaryBack);
    });
  }

  function leaveTaskRoute(href: string) {
    if (!isTaskRoute || taskExitInProgress.current) return;
    taskExitInProgress.current = true;
    setMenuOpen(false);

    const mobile = window.matchMedia("(max-width: 700px)").matches;
    if (!mobile || reducedMotion) {
      router.push(href);
      return;
    }

    setTaskExiting(true);
    window.requestAnimationFrame(() => {
      stageX.stop();
      stageX.set(0);
      animate(stageX, window.innerWidth, {
        duration: 0.28,
        ease: [0.4, 0, 0.2, 1],
      }).then(() => router.push(href));
    });
  }

  return (
    <div
      className={`app-shell${drawerOpen ? " drawer-open" : ""}${isSecondaryRoute ? " secondary-route" : ""}${isMobileDetailRoute ? " mobile-detail-route" : ""}${isProfileHeaderRoute ? " profile-header-route" : ""}${mobileHeader?.compactProfile ? " mobile-profile-header-compact" : ""}${secondaryExiting ? " secondary-exiting" : ""}${isTaskRoute ? " task-route" : ""}${taskExiting ? " task-exiting" : ""}`}
      onClickCapture={handleShellClickCapture}
      onPointerCancel={cancelDrawerGesture}
      onPointerDown={beginDrawerGesture}
      onPointerMove={moveDrawerGesture}
      onPointerUp={finishDrawerGesture}
    >
      <aside
        aria-hidden={!drawerOpen}
        className="mobile-drawer"
        inert={drawerOpen ? undefined : true}
      >
        <div className="drawer-profile">
          <div className="drawer-avatar"><UserAvatar image={user.image} imageStyle={shellAvatarStyle} name={user.name} /></div>
          <div>
            <strong>{user.name}</strong>
            {user.nickname ? <span>{user.realName}</span> : null}
          </div>
          <button aria-label="关闭个人菜单" onClick={closeDrawer} type="button"><X size={20} /></button>
        </div>
        <Link className="drawer-profile-link" href={`/profile/${user.id}`} onClick={closeDrawer}>查看我的主页</Link>
        <nav aria-label="个人菜单导航">
          {primaryOptions.map((option) => (
            <button className={activeRoute === option.value ? "active" : ""} key={option.value} onClick={() => navigate(option.value)} type="button">
              {option.label}
            </button>
          ))}
        </nav>
        <div className="drawer-secondary">
          <Link href="/drafts" onClick={closeDrawer}><FilePenLine size={18} />草稿箱{user.draftCount > 0 ? `（${user.draftCount}）` : ""}</Link>
          <Link href="/notifications" onClick={closeDrawer}><Bell size={18} />通知</Link>
          <Link href={`/profile/${user.id}`} onClick={closeDrawer}><Settings size={18} />个人设置</Link>
          <Link href="/friends" onClick={closeDrawer}><UsersRound size={18} />朋友与邀请</Link>
          <button onClick={signOut} type="button"><LogOut size={18} />退出登录</button>
        </div>
      </aside>

      <motion.div
        className="app-shell-stage"
        onClick={handleStageClick}
        style={{ x: stageX }}
      >
        <header className="global-header" onClick={(event) => drawerOpen && event.stopPropagation()}>
          <div className="global-header-left">
            <div className="header-navigation-anchor">
              {isSecondaryRoute ? (
                <button
                  aria-label="返回上一页"
                  className="header-back-button"
                  disabled={secondaryExiting}
                  onClick={returnFromSecondary}
                  type="button"
                >
                  <ArrowLeft aria-hidden="true" size={21} strokeWidth={1.9} />
                </button>
              ) : (
                <Link
                  aria-label="回到首页"
                  className="header-brand-mark"
                  href="/home"
                >
                  <Image
                    alt=""
                    height={38}
                    src="/branding/along-mark.png"
                    width={38}
                  />
                </Link>
              )}
              <button
                className="header-avatar header-mobile-account-trigger"
                aria-label="打开个人菜单"
                onClick={openDrawer}
                type="button"
              >
                <Menu aria-hidden="true" size={23} strokeWidth={1.9} />
              </button>
              {isMobileDetailRoute ? (
                <button
                  aria-label="返回上一页"
                  className="header-mobile-detail-back"
                  disabled={secondaryExiting}
                  onClick={returnFromSecondary}
                  type="button"
                >
                  <ArrowLeft aria-hidden="true" size={21} strokeWidth={1.9} />
                </button>
              ) : null}
              <div className="header-navigation-cluster">
                <SegmentedControl
                  ariaLabel="主要栏目"
                  className="primary-navigation"
                  onValueChange={navigate}
                  options={primaryOptions}
                  role="tablist"
                  value={activeRoute}
                />
              </div>
            </div>
            <span className="mobile-header-name">
              <span
                aria-hidden={showProfileIdentity}
                className="mobile-header-title"
              >
                {mobileHeaderTitle}
              </span>
              {mobileHeader?.profileIdentity ? (
                <span
                  aria-hidden={!showProfileIdentity}
                  className="mobile-header-profile-identity"
                >
                  <span className="mobile-header-profile-avatar">
                    <UserAvatar
                      image={mobileHeader.profileIdentity.image}
                      imageStyle={mobileHeader.profileIdentity.imageStyle}
                      name={mobileHeader.profileIdentity.name}
                    />
                  </span>
                  <strong>{mobileHeader.profileIdentity.name}</strong>
                </span>
              ) : null}
            </span>
          </div>

          <div className="header-utility-actions">
            <Link
              aria-current={pathname.startsWith("/drafts") ? "page" : undefined}
              className={`header-utility-button drafts-button${pathname.startsWith("/drafts") ? " active" : ""}`}
              href="/drafts"
              aria-label={user.draftCount > 0 ? `查看草稿箱，共 ${user.draftCount} 条` : "查看草稿箱"}
            >
              <FilePenLine size={20} strokeWidth={1.9} />
              {user.draftCount > 0 ? <span>{user.draftCount > 99 ? "99+" : user.draftCount}</span> : null}
            </Link>
            <Link
              aria-current={pathname.startsWith("/notifications") ? "page" : undefined}
              className={`header-utility-button notification-button${pathname.startsWith("/notifications") ? " active" : ""}`}
              href="/notifications"
              aria-label="查看通知"
            >
              <Bell size={21} strokeWidth={1.9} />
            </Link>
            <div className="header-account" ref={desktopAccountRef}>
              <button
                aria-expanded={menuVisible}
                aria-haspopup="menu"
                aria-label={`打开 ${accountDisplayName} 的个人菜单`}
                className="header-account-trigger"
                onClick={() => {
                  if (menuVisible) {
                    setMenuOpen(false);
                    return;
                  }
                  desktopAccountPathRef.current = pathname;
                  setMenuOpen(true);
                }}
                ref={desktopAccountTriggerRef}
                type="button"
              >
                <span className="header-account-avatar">
                  <UserAvatar image={user.image} imageStyle={shellAvatarStyle} name={user.name} />
                </span>
                <span
                  className="header-account-name"
                  title={accountDisplayName}
                >
                  {accountDisplayName}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="header-account-chevron"
                  size={17}
                  strokeWidth={1.9}
                />
              </button>
              <AnimatePresence>
                {menuVisible ? (
                  <motion.div
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="desktop-account-menu"
                    exit={{ opacity: 0, y: -5, scale: 0.98 }}
                    initial={{ opacity: 0, y: -7, scale: 0.98 }}
                    role="menu"
                    transition={{ duration: reducedMotion ? 0.01 : 0.18 }}
                  >
                    <div><strong>{user.name}</strong>{user.nickname ? <span>{user.realName}</span> : null}</div>
                    <Link href={`/profile/${user.id}`} onClick={() => setMenuOpen(false)} role="menuitem"><UserRound size={17} />我的主页</Link>
                    <Link href="/drafts" onClick={() => setMenuOpen(false)} role="menuitem"><FilePenLine size={17} />草稿箱{user.draftCount > 0 ? `（${user.draftCount}）` : ""}</Link>
                    <Link href="/notifications" onClick={() => setMenuOpen(false)} role="menuitem"><Bell size={17} />通知</Link>
                    <Link href="/friends" onClick={() => setMenuOpen(false)} role="menuitem"><UsersRound size={17} />朋友与邀请</Link>
                    <button onClick={signOut} role="menuitem" type="button"><LogOut size={17} />退出登录</button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </header>
        <TaskRouteTransitionProvider value={leaveTaskRoute}>
          <main className={`app-page ${pageClassName}`.trim()} key={pathname}>{children}</main>
        </TaskRouteTransitionProvider>
      </motion.div>
    </div>
  );
}
