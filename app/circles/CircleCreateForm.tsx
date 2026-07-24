"use client";

import { Check } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { AnimatedCheckbox } from "@/app/components/AnimatedCheckbox";
import { UserAvatar } from "@/app/components/UserAvatar";
import {
  circleThemeClass,
  circleThemes,
  defaultCircleTheme,
  type CircleTheme,
} from "@/lib/circle-theme";
import type { FriendSummary } from "@/lib/content-types";

export function CircleCreateForm({
  friends,
  onCreated,
  presentation = "inline",
}: {
  friends: FriendSummary[];
  onCreated?: () => void;
  presentation?: "inline" | "page";
}) {
  const router = useRouter();
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [theme, setTheme] = useState<CircleTheme>(defaultCircleTheme);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function createCircle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setError("");
    const form = new FormData(formElement);
    const response = await fetch("/api/circles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        description: form.get("description"),
        theme,
        invitedUserIds: selectedFriends,
      }),
    });
    const result = (await response.json()) as { requestId?: string; error?: string };
    setPending(false);
    if (!response.ok || !result.requestId) {
      setError(result.error ?? "建立圈子失败。");
      return;
    }

    formElement.reset();
    setSelectedFriends([]);
    setTheme(defaultCircleTheme);
    if (onCreated) {
      onCreated();
      router.refresh();
      return;
    }
    router.push("/circles");
    router.refresh();
  }

  return (
    <form
      className={`circle-create-form circle-create-form--${presentation}`}
      onSubmit={createCircle}
    >
      <div className="circle-create-fields">
        <label>
          <span>圈子名称</span>
          <input
            maxLength={40}
            name="name"
            placeholder="比如：晚饭后散步小队"
            required
            type="text"
          />
        </label>
        <label>
          <span>一句简介 <small>选填</small></span>
          <textarea
            maxLength={160}
            name="description"
            placeholder="简单说明这个圈子的用途"
          />
        </label>
      </div>

      <fieldset className="circle-theme-picker">
        <legend className="sr-only">主题色</legend>
        <div className="circle-create-row">
          <span aria-hidden="true">主题色</span>
          <div className="circle-theme-options">
            {circleThemes.map((option) => (
              <label
                className={`circle-theme-swatch ${circleThemeClass(option.value)}`}
                key={option.value}
              >
                <input
                  checked={theme === option.value}
                  name="circle-theme"
                  onChange={() => setTheme(option.value)}
                  type="radio"
                  value={option.value}
                />
                <span aria-hidden="true">
                  {theme === option.value ? <Check size={19} strokeWidth={2.2} /> : null}
                </span>
                <span className="sr-only">{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <fieldset className="circle-friend-picker">
        <legend className="sr-only">邀请 1 至 4 位朋友</legend>
        <div className="circle-create-row">
          <span aria-hidden="true">邀请 1 至 4 位朋友</span>
          <div className="circle-friend-options">
            {friends.length ? friends.map((friend) => (
              <label key={friend.id}>
                <AnimatedCheckbox
                  aria-label={friend.displayName}
                  checked={selectedFriends.includes(friend.id)}
                  disabled={!selectedFriends.includes(friend.id) && selectedFriends.length >= 4}
                  markClassName="circle-friend-check"
                  onChange={(event) => setSelectedFriends((current) =>
                    event.target.checked
                      ? [...current, friend.id]
                      : current.filter((id) => id !== friend.id),
                  )}
                />
                <span className="circle-friend-avatar">
                  <UserAvatar image={friend.image} name={friend.displayName} />
                </span>
                {friend.displayName}
              </label>
            )) : <p>添加朋友后，才能邀请他们建立圈子。</p>}
          </div>
        </div>
      </fieldset>

      {error ? <p className="composer-error">{error}</p> : null}
      <div className="circle-create-actions">
        <span>邀请 24 小时内有效</span>
        <button
          className="publish-button"
          disabled={pending || selectedFriends.length === 0}
          type="submit"
        >
          {pending ? "正在发出" : "发出邀请"}
        </button>
      </div>
    </form>
  );
}
