"use client";

/* eslint-disable @next/next/no-img-element -- Private avatar URLs are authenticated and not known to Next Image. */

import { Check, Pencil, Search, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AppShell, type ShellUser } from "@/app/components/AppShell";
import { DissolveInput } from "@/app/components/DissolveField";
import type { FriendSummary } from "@/lib/content-types";

export function FriendsClient({
  currentUser,
  friends,
}: {
  currentUser: ShellUser;
  friends: FriendSummary[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [remark, setRemark] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const visibleFriends = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    if (!normalized) return friends;
    return friends.filter((friend) =>
      [friend.displayName, friend.identityName, friend.realName, friend.nickname, friend.remark]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("zh-CN").includes(normalized)),
    );
  }, [friends, query]);

  function beginRemark(friend: FriendSummary) {
    setEditingId(friend.id);
    setRemark(friend.remark ?? "");
    setError("");
  }

  async function saveRemark(event: FormEvent, friendId: string) {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch(`/api/friends/${friendId}/remark`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ remark }),
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "备注保存失败。");
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  return (
    <AppShell pageClassName="friends-page" user={currentUser}>
      <section className="friends-heading">
        <div>
          <p className="eyebrow">朋友</p>
          <h1>熟悉的人，都在这里</h1>
          <p>朋友列表只属于你；别人看到的始终只有与你共同认识的人。</p>
        </div>
        <Link className="primary-soft-action" href="/invites"><UserPlus size={18} />邀请朋友</Link>
      </section>

      <section className="friend-directory" aria-labelledby="friend-directory-title">
        <div className="friend-directory-toolbar">
          <h2 id="friend-directory-title">全部朋友 <span>{friends.length}</span></h2>
          <label className="friend-search">
            <Search aria-hidden="true" size={18} />
            <span className="sr-only">搜索朋友</span>
            <DissolveInput
              aria-label="搜索朋友"
              onValueChange={setQuery}
              placeholder="搜索昵称、真名或备注"
              value={query}
              wrapperClassName="friend-search-field"
            />
          </label>
        </div>

        {visibleFriends.length ? (
          <div className="friend-directory-list">
            {visibleFriends.map((friend) => (
              <article className="friend-directory-row" key={friend.id}>
                <Link className="friend-directory-main" href={`/profile/${friend.id}`}>
                  <span className="friend-avatar">
                    {friend.image ? <img alt="" src={friend.image} /> : friend.displayName.slice(0, 1)}
                  </span>
                  <span>
                    <strong>{friend.displayName}</strong>
                    {friend.displayName !== friend.identityName ? <small>{friend.identityName}</small> : friend.nickname ? <small>真名：{friend.realName}</small> : null}
                  </span>
                </Link>
                {editingId === friend.id ? (
                  <form className="friend-remark-form" onSubmit={(event) => saveRemark(event, friend.id)}>
                    <input autoFocus maxLength={40} onChange={(event) => setRemark(event.target.value)} placeholder="只对你显示的备注" value={remark} />
                    <button aria-label="保存备注" disabled={pending} type="submit"><Check size={18} /></button>
                    <button aria-label="取消修改" onClick={() => setEditingId(null)} type="button"><X size={18} /></button>
                  </form>
                ) : (
                  <button className="icon-command" aria-label={`修改 ${friend.identityName} 的备注`} onClick={() => beginRemark(friend)} type="button"><Pencil size={17} /></button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="quiet-empty">
            <strong>{friends.length ? "没有找到这个名字" : "朋友列表还空着"}</strong>
            <p>{friends.length ? "换一个昵称、真名或备注试试。" : "完成一次共同邀请后，新朋友会自动出现在这里。"}</p>
          </div>
        )}
        {error ? <p className="composer-error">{error}</p> : null}
      </section>
    </AppShell>
  );
}
