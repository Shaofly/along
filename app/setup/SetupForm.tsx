"use client";

import { FormEvent, useState } from "react";

export function SetupForm({ existingCount }: { existingCount: number }) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setPending(true);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch("/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
        bootstrapKey: form.get("bootstrapKey"),
      }),
    });
    const result = (await response.json()) as {
      error?: string;
      remaining?: number;
      role?: "admin" | "member";
    };

    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "创建失败，请稍后再试。");
      return;
    }

    formElement.reset();
    if (result.remaining === 0) {
      setNotice("两位创始成员已经准备好，可以返回登录了。");
      window.setTimeout(() => {
        window.location.href = "/";
      }, 1200);
      return;
    }

    setNotice("管理员账号创建成功，请继续创建第二位普通创始成员。");
  }

  return (
    <form className="auth-form setup-form" onSubmit={submit}>
      <p className="setup-progress">已创建 {existingCount} / 2 位创始成员</p>
      {notice ? <p className="form-notice success">{notice}</p> : null}
      {error ? <p className="form-notice error">{error}</p> : null}
      <label>
        昵称
        <input name="name" maxLength={40} required />
      </label>
      <label>
        邮箱
        <input name="email" type="email" required />
      </label>
      <label>
        密码
        <input name="password" type="password" minLength={10} required />
      </label>
      <label>
        创始成员创建密钥
        <input name="bootstrapKey" type="password" required />
      </label>
      <button className="auth-submit" type="submit" disabled={pending}>
        {pending
          ? "正在创建…"
          : existingCount === 0
            ? "创建管理员账号"
            : "创建第二位创始成员"}
      </button>
    </form>
  );
}
