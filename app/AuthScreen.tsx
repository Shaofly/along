"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

import { authClient } from "@/lib/auth-client";

type Mode = "login" | "register";

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setPending(true);

    const form = new FormData(event.currentTarget);
    const { error: signInError } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      rememberMe: true,
    });

    setPending(false);
    if (signInError) {
      setError(
        signInError.status === 403
          ? "当前访问地址尚未被服务器信任，请检查隧道地址配置。"
          : "邮箱或密码不正确。",
      );
      return;
    }

    window.location.href = "/home";
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setPending(true);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
        inviteCode: form.get("inviteCode"),
      }),
    });
    const result = (await response.json()) as { error?: string };

    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "注册失败，请稍后再试。");
      return;
    }

    setMode("login");
    setNotice("注册成功，现在可以登录了。");
  }

  return (
    <main className="auth-shell">
      <section className="auth-story" aria-labelledby="welcome-title">
        <Link className="brand auth-brand" href="/" aria-label="圆个圈首页">
          <span className="brand-mark" aria-hidden="true">圆</span>
          <span>圆个圈 <small>Along</small></span>
        </Link>
        <div className="auth-copy">
          <p className="eyebrow">只让熟人进来的共同生活档案</p>
          <h1 id="welcome-title">欢迎回来，看看朋友们最近留下了什么。</h1>
          <p>
            这里没有公开广场，也没有陌生人推荐。每一段关系都由朋友确认，
            每一份回忆都有清楚的边界。
          </p>
        </div>
        <div className="auth-memory" aria-hidden="true">
          <span>那年今天</span>
          <strong>一起在便利店门口躲过一场雨。</strong>
        </div>
      </section>

      <section className="auth-panel" aria-label="账号入口">
        <div className="auth-tabs" role="tablist" aria-label="登录或注册">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            登录
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "active" : ""}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            邀请注册
          </button>
        </div>

        <div className="auth-heading">
          <span>{mode === "login" ? "朋友入口" : "带着邀请来"}</span>
          <h2>{mode === "login" ? "回到我们的小站" : "加入朋友的生活档案"}</h2>
          <p>
            {mode === "login"
              ? "使用注册时的邮箱和密码。"
              : "邀请码会与你的邮箱绑定，并自动连接共同邀请你的朋友。"}
          </p>
        </div>

        {notice ? <p className="form-notice success">{notice}</p> : null}
        {error ? <p className="form-notice error">{error}</p> : null}

        {mode === "login" ? (
          <form className="auth-form" onSubmit={submitLogin}>
            <label>
              邮箱
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              密码
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                minLength={10}
                required
              />
            </label>
            <button className="auth-submit" type="submit" disabled={pending}>
              {pending ? "正在登录…" : "进入小站"}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={submitRegistration}>
            <label>
              昵称
              <input name="name" autoComplete="nickname" maxLength={40} required />
            </label>
            <label>
              邮箱
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              邀请码
              <input name="inviteCode" autoCapitalize="characters" required />
            </label>
            <label>
              密码
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
              />
              <small>至少 10 位，请不要使用其他网站的密码。</small>
            </label>
            <button className="auth-submit" type="submit" disabled={pending}>
              {pending ? "正在确认邀请…" : "接受邀请并注册"}
            </button>
          </form>
        )}

        <Link className="setup-link" href="/setup">
          首次部署：创建两位创始成员
        </Link>
      </section>
    </main>
  );
}
