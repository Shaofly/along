"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Bell, LogOut, Settings, UserRound, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PointerEvent, ReactNode, useEffect, useRef, useState } from "react";

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
  const gestureStart = useRef<{ x: number; y: number } | null>(null);
  const navigationTimer = useRef<number | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<{
    fromPath: string;
    value: PrimaryRoute;
  } | null>(null);
  const activeRoute = pendingNavigation?.fromPath === pathname
    ? pendingNavigation.value
    : routeFromPath(pathname, user.id);

  useEffect(() => {
    const onPopState = () => setDrawerOpen(false);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => () => {
    if (navigationTimer.current) window.clearTimeout(navigationTimer.current);
  }, []);

  function openDrawer() {
    if (drawerOpen) return;
    window.history.pushState({ alongDrawer: true }, "", window.location.href);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    if (!drawerOpen) return;
    if (window.history.state?.alongDrawer) window.history.back();
    else setDrawerOpen(false);
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

  function beginOpenGesture(event: PointerEvent<HTMLDivElement>) {
    if (drawerOpen || event.clientX < 18 || event.clientX > 64) return;
    if ((event.target as HTMLElement).closest("a, button, input, textarea, select, [data-no-drawer-gesture]")) return;
    gestureStart.current = { x: event.clientX, y: event.clientY };
  }

  function finishOpenGesture(event: PointerEvent<HTMLDivElement>) {
    const start = gestureStart.current;
    gestureStart.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = Math.abs(event.clientY - start.y);
    if (dx > 80 && dx > dy * 1.5) openDrawer();
  }

  async function signOut() {
    await authClient.signOut();
    window.location.href = "/";
  }

  return (
    <div className={`app-shell${drawerOpen ? " drawer-open" : ""}`}>
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
        animate={{ x: drawerOpen ? "min(84vw, 340px)" : 0 }}
        className="app-shell-stage"
        onClick={drawerOpen ? closeDrawer : undefined}
        onPointerDown={beginOpenGesture}
        onPointerUp={finishOpenGesture}
        transition={reducedMotion ? { duration: 0.01 } : { type: "spring", stiffness: 380, damping: 34, mass: 0.82 }}
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
