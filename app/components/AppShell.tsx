"use client";

import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion } from "motion/react";
import { Bell, LogOut, Settings, UserRound, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MouseEvent, PointerEvent, ReactNode, useEffect, useRef, useState } from "react";

import { SegmentedControl } from "@/app/components/SegmentedControl";
import { authClient } from "@/lib/auth-client";

export type ShellUser = {
  id: string;
  name: string;
  realName: string;
  nickname: string | null;
  image: string | null;
  role?: "admin" | "member";
};

type PrimaryRoute = "home" | "circles" | "friends" | "profile";
type DrawerGestureMode = "pending" | "horizontal";

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
  if (pathname === `/profile/${userId}` || pathname === "/profile") return "profile";
  return "home";
}

function drawerWidth() {
  return Math.min(window.innerWidth * 0.84, 340);
}

function Avatar({ user }: { user: ShellUser }) {
  return user.image ? (
    // eslint-disable-next-line @next/next/no-img-element -- Private avatars are served by authenticated routes later.
    <img alt="" src={user.image} />
  ) : (
    <span aria-hidden="true">{user.name.slice(0, 1)}</span>
  );
}

export function AppShell({
  children,
  user,
  pageClassName = "",
}: {
  children: ReactNode;
  user: ShellUser;
  pageClassName?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const stageX = useMotionValue(0);
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
  const navigationTimer = useRef<number | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<{
    fromPath: string;
    value: PrimaryRoute;
  } | null>(null);
  const activeRoute = pendingNavigation?.fromPath === pathname
    ? pendingNavigation.value
    : routeFromPath(pathname, user.id);

  useEffect(() => {
    const onPopState = () => {
      setDrawerOpen(false);
      snapStage(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // stageX is stable for the lifetime of this shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (navigationTimer.current) window.clearTimeout(navigationTimer.current);
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (drawerOpen && !gestureStart.current) stageX.set(drawerWidth());
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [drawerOpen, stageX]);

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
    if (navigationTimer.current) window.clearTimeout(navigationTimer.current);
    navigationTimer.current = window.setTimeout(() => router.push(href), 150);
  }

  function beginDrawerGesture(event: PointerEvent<HTMLDivElement>) {
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

  return (
    <div
      className={`app-shell${drawerOpen ? " drawer-open" : ""}`}
      onClickCapture={handleShellClickCapture}
      onPointerCancel={cancelDrawerGesture}
      onPointerDown={beginDrawerGesture}
      onPointerMove={moveDrawerGesture}
      onPointerUp={finishDrawerGesture}
    >
      <aside className="mobile-drawer" aria-hidden={!drawerOpen}>
        <div className="drawer-profile">
          <div className="drawer-avatar"><Avatar user={user} /></div>
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
            <div className="header-navigation-cluster">
              <button className="header-avatar" aria-label="打开个人菜单" onClick={() => {
                if (window.matchMedia("(max-width: 700px)").matches) openDrawer();
                else setMenuOpen((current) => !current);
              }} type="button">
                <Avatar user={user} />
              </button>
              <SegmentedControl
                ariaLabel="主要栏目"
                className="primary-navigation"
                onValueChange={navigate}
                options={primaryOptions}
                role="tablist"
                value={activeRoute}
              />
            </div>
            <span className="mobile-header-name">{user.name}</span>
            <AnimatePresence>
              {menuOpen ? (
                <motion.div
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="desktop-account-menu"
                  exit={{ opacity: 0, y: -5, scale: 0.98 }}
                  initial={{ opacity: 0, y: -7, scale: 0.98 }}
                  transition={{ duration: reducedMotion ? 0.01 : 0.18 }}
                >
                  <div><strong>{user.name}</strong>{user.nickname ? <span>{user.realName}</span> : null}</div>
                  <Link href={`/profile/${user.id}`} onClick={() => setMenuOpen(false)}><UserRound size={17} />我的主页</Link>
                  <Link href="/notifications" onClick={() => setMenuOpen(false)}><Bell size={17} />通知</Link>
                  <Link href="/friends" onClick={() => setMenuOpen(false)}><UsersRound size={17} />朋友与邀请</Link>
                  <button onClick={signOut} type="button"><LogOut size={17} />退出登录</button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <Link className="notification-button" href="/notifications" aria-label="查看通知">
            <Bell size={21} strokeWidth={1.9} />
          </Link>
        </header>
        <main className={`app-page ${pageClassName}`.trim()}>{children}</main>
      </motion.div>
    </div>
  );
}
