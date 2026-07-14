"use client";

import { FormEvent, useMemo, useState } from "react";

const friends = [
  {
    name: "小林",
    role: "夜聊搭子",
    note: "总能把普通一天讲成连续剧，也会认真记住每个小细节。",
    hue: "mint",
  },
  {
    name: "阿澈",
    role: "行动派",
    note: "负责把“改天吧”变成“现在就出门”，照片里永远笑得最亮。",
    hue: "sun",
  },
  {
    name: "眠眠",
    role: "情绪翻译官",
    note: "不急着给答案，只是安静坐在旁边，就已经很可靠。",
    hue: "rose",
  },
];

const memories = [
  {
    time: "三月傍晚",
    title: "便利店门口的热牛奶",
    text: "那天风很大，我们站在路灯下面说了很久没头没尾的话。",
    tag: "日常",
  },
  {
    time: "夏天周末",
    title: "把歌单放到很大声",
    text: "没有目的地，只是沿着河边走。后来每次听到那首歌都会想起这天。",
    tag: "出走",
  },
  {
    time: "生日凌晨",
    title: "零点的第一句祝福",
    text: "消息同时弹出来的时候，突然觉得自己被很多温柔接住了。",
    tag: "纪念",
  },
];

const starterPosts = [
  {
    author: "我",
    mood: "被朋友惦记着的一天",
    body: "今天想做一个只给熟人看的地方，慢慢放照片、碎碎念、约饭计划和那些不想被算法打扰的小事。",
    detail: "刚刚",
  },
  {
    author: "小林",
    mood: "收藏一段晚风",
    body: "如果页面里可以有一个角落，专门放大家的“今天还不错”，那应该会很可爱。",
    detail: "18:42",
  },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState("全部");
  const [posts, setPosts] = useState(starterPosts);
  const [draft, setDraft] = useState("");

  const filteredMemories = useMemo(() => {
    if (activeTab === "全部") {
      return memories;
    }

    return memories.filter((memory) => memory.tag === activeTab);
  }, [activeTab]);

  function publishPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanDraft = draft.trim();

    if (!cleanDraft) {
      return;
    }

    setPosts([
      {
        author: "我",
        mood: "新鲜心情",
        body: cleanDraft,
        detail: "刚刚发布",
      },
      ...posts,
    ]);
    setDraft("");
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[var(--cream)] text-[var(--ink)]">
      <section className="hero-shell">
        <nav className="topbar" aria-label="主要导航">
          <a className="brand" href="#home" aria-label="回到首页">
            <span className="brand-mark" aria-hidden="true">
              心
            </span>
            <span>小小朋友圈</span>
          </a>
          <div className="nav-links">
            <a href="#feed">动态</a>
            <a href="#friends">朋友</a>
            <a href="#memories">回忆</a>
          </div>
        </nav>

        <div className="hero-grid" id="home">
          <div className="hero-copy">
            <p className="eyebrow">只给自己和朋友的小站</p>
            <h1>把我们闪闪发亮的普通日子，慢慢存起来。</h1>
            <p className="hero-text">
              一个温柔、私密、像手账一样的社交网页：写今日心情，贴朋友的近况，
              收藏一起走过的时间，也给未来的约定留一盏小灯。
            </p>
            <div className="hero-actions" aria-label="快捷入口">
              <a className="primary-action" href="#composer">
                写一条近况
              </a>
              <a className="secondary-action" href="#memories">
                翻翻回忆
              </a>
            </div>
          </div>

          <aside className="hero-board" aria-label="今日温柔看板">
            <div className="photo-stack" aria-hidden="true">
              <div className="photo-card photo-card-a">
                <span>晚风</span>
              </div>
              <div className="photo-card photo-card-b">
                <span>合照</span>
              </div>
              <div className="photo-card photo-card-c">
                <span>奶茶</span>
              </div>
            </div>
            <div className="today-note">
              <span>今日小纸条</span>
              <strong>记得约一次没有目的地的散步。</strong>
            </div>
          </aside>
        </div>
      </section>

      <section className="content-band feed-layout" id="feed">
        <div className="section-heading">
          <p>动态</p>
          <h2>朋友们最近在想什么</h2>
        </div>

        <form className="composer" id="composer" onSubmit={publishPost}>
          <label htmlFor="post-draft">写给朋友看的今日片段</label>
          <div className="composer-row">
            <input
              id="post-draft"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="比如：今天路过花店，突然很想大家。"
              maxLength={80}
            />
            <button type="submit">发布</button>
          </div>
        </form>

        <div className="feed-list" aria-live="polite">
          {posts.map((post) => (
            <article className="post-card" key={`${post.author}-${post.body}`}>
              <div className="post-avatar" aria-hidden="true">
                {post.author.slice(0, 1)}
              </div>
              <div>
                <div className="post-meta">
                  <strong>{post.author}</strong>
                  <span>{post.detail}</span>
                </div>
                <h3>{post.mood}</h3>
                <p>{post.body}</p>
                <div className="post-actions" aria-label="动态互动">
                  <button type="button">喜欢</button>
                  <button type="button">抱抱</button>
                  <button type="button">下次一起</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="content-band friend-grid" id="friends">
        <div className="section-heading">
          <p>朋友</p>
          <h2>这些人让日子有了回声</h2>
        </div>

        <div className="cards-grid">
          {friends.map((friend) => (
            <article className={`friend-card ${friend.hue}`} key={friend.name}>
              <div className="friend-avatar" aria-hidden="true">
                {friend.name.slice(0, 1)}
              </div>
              <span>{friend.role}</span>
              <h3>{friend.name}</h3>
              <p>{friend.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="content-band memories" id="memories">
        <div className="section-heading">
          <p>回忆</p>
          <h2>把小事放进时间盒子</h2>
        </div>

        <div className="memory-tabs" role="tablist" aria-label="回忆分类">
          {["全部", "日常", "出走", "纪念"].map((tab) => (
            <button
              className={activeTab === tab ? "active" : ""}
              key={tab}
              onClick={() => setActiveTab(tab)}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="timeline">
          {filteredMemories.map((memory) => (
            <article className="memory-item" key={memory.title}>
              <span>{memory.time}</span>
              <h3>{memory.title}</h3>
              <p>{memory.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
