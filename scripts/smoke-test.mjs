import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";

import pg from "pg";
import sharp from "sharp";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const databaseUrl = process.env.DATABASE_URL;
const gate = process.env.REGISTRATION_GATE_SECRET;
assert(databaseUrl && gate, "DATABASE_URL and REGISTRATION_GATE_SECRET are required");

const pool = new pg.Pool({ connectionString: databaseUrl });
const suffix = randomUUID().slice(0, 8);
const users = [
  { name: "冒烟测试甲", email: `along-a-${suffix}@example.invalid`, password: `Along-test-${suffix}-A` },
  { name: "冒烟测试乙", email: `along-b-${suffix}@example.invalid`, password: `Along-test-${suffix}-B` },
];
const createdPostIds = [];
const createdCircleIds = [];

function cookieFrom(response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
}

async function api(pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { origin: baseUrl, ...options.headers },
    redirect: "manual",
  });
}

async function assertStatus(response, expected) {
  if (response.status !== expected) {
    assert.equal(response.status, expected, await response.text());
  }
}

async function register(person) {
  const response = await api("/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-registration-gate": gate,
    },
    body: JSON.stringify(person),
  });
  await assertStatus(response, 200);
}

async function login(person) {
  const response = await api("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: person.email, password: person.password }),
  });
  await assertStatus(response, 200);
  return cookieFrom(response);
}

async function upload(cookie, color) {
  const source = await sharp({
    create: { width: 3200, height: 1800, channels: 3, background: color },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  form.set("file", new File([source], "phone-photo.jpg", { type: "image/jpeg" }));
  const response = await api("/api/media", {
    method: "POST",
    headers: { cookie },
    body: form,
  });
  await assertStatus(response, 200);
  return response.json();
}

async function createPost(cookie, payload) {
  const response = await api("/api/posts", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  await assertStatus(response, 200);
  const result = await response.json();
  createdPostIds.push({ id: result.id, cookie });
  return result;
}

try {
  await Promise.all(users.map(register));
  const rows = await pool.query(
    `select id, email from "user" where email = any($1::text[])`,
    [users.map((person) => person.email)],
  );
  assert.equal(rows.rowCount, 2);
  const ids = new Map(rows.rows.map((row) => [row.email, row.id]));
  const [userOneId, userTwoId] = [...ids.values()].sort();
  await pool.query(
    `insert into friendships (id, user_one_id, user_two_id) values ($1, $2, $3)`,
    [randomUUID(), userOneId, userTwoId],
  );

  const [cookieA, cookieB] = await Promise.all(users.map(login));
  const publicMedia = await upload(cookieA, { r: 194, g: 215, b: 198 });
  await createPost(cookieA, {
    body: `朋友可见冒烟测试 ${suffix}`,
    visibility: "friends",
    viewerIds: [],
    mediaIds: [publicMedia.id],
  });

  const friendHome = await api("/home", { headers: { cookie: cookieB } });
  assert.equal(friendHome.status, 200);
  assert.match(await friendHome.text(), new RegExp(`朋友可见冒烟测试 ${suffix}`));
  const friendImage = await api(`/api/media/${publicMedia.id}`, { headers: { cookie: cookieB } });
  assert.equal(friendImage.status, 200);
  const imageMetadata = await sharp(Buffer.from(await friendImage.arrayBuffer())).metadata();
  assert.equal(imageMetadata.width, 1440);
  assert.equal(imageMetadata.height, 2560);
  assert.equal(imageMetadata.exif, undefined);
  assert.equal(imageMetadata.orientation, undefined);

  const privateMedia = await upload(cookieA, { r: 235, g: 192, b: 177 });
  await createPost(cookieA, {
    body: `仅自己可见冒烟测试 ${suffix}`,
    visibility: "private",
    viewerIds: [],
    mediaIds: [privateMedia.id],
  });
  const forbiddenImage = await api(`/api/media/${privateMedia.id}`, { headers: { cookie: cookieB } });
  assert.equal(forbiddenImage.status, 404);

  const profileUpdate = await api("/api/profile", {
    method: "PATCH",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({ name: users[0].name, bio: "这是一条测试简介。" }),
  });
  await assertStatus(profileUpdate, 200);

  const circleCreate = await api("/api/circles", {
    method: "POST",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({
      name: `冒烟小圈子 ${suffix}`,
      description: "验证成员周期与历史快照。",
      invitedUserIds: [ids.get(users[1].email)],
    }),
  });
  await assertStatus(circleCreate, 200);
  const { circleId } = await circleCreate.json();
  createdCircleIds.push(circleId);
  const proposalRows = await pool.query(
    `select id from circle_join_proposals where circle_id = $1 and candidate_id = $2`,
    [circleId, ids.get(users[1].email)],
  );
  assert.equal(proposalRows.rowCount, 1);
  const initialAccept = await api(`/api/circles/proposals/${proposalRows.rows[0].id}/respond`, {
    method: "POST",
    headers: { cookie: cookieB, "content-type": "application/json" },
    body: JSON.stringify({ decision: "accept" }),
  });
  await assertStatus(initialAccept, 200);

  const circleMedia = await upload(cookieA, { r: 221, g: 205, b: 177 });
  const circlePost = await createPost(cookieA, {
    body: `退出前共同记录 ${suffix}`,
    circleId,
    managementMode: "circle",
    visibility: "private",
    viewerIds: [],
    mediaIds: [circleMedia.id],
  });
  const memberCirclePage = await api(`/circles/${circleId}`, { headers: { cookie: cookieB } });
  assert.equal(memberCirclePage.status, 200);
  assert.match(await memberCirclePage.text(), new RegExp(`退出前共同记录 ${suffix}`));

  const currentPost = await pool.query(`select updated_at from posts where id = $1`, [circlePost.id]);
  const sharedEdit = await api(`/api/posts/${circlePost.id}`, {
    method: "PATCH",
    headers: { cookie: cookieB, "content-type": "application/json" },
    body: JSON.stringify({
      body: `退出时保存的版本 ${suffix}`,
      managementMode: "circle",
      viewerIds: [],
      expectedUpdatedAt: currentPost.rows[0].updated_at.toISOString(),
    }),
  });
  await assertStatus(sharedEdit, 200);

  const leaveResponse = await api(`/api/circles/${circleId}/leave`, {
    method: "POST",
    headers: { cookie: cookieB },
  });
  await assertStatus(leaveResponse, 200);
  const afterSharedEdit = await pool.query(`select updated_at from posts where id = $1`, [circlePost.id]);
  const creatorEdit = await api(`/api/posts/${circlePost.id}`, {
    method: "PATCH",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({
      body: `退出后的新版本 ${suffix}`,
      managementMode: "circle",
      viewerIds: [],
      expectedUpdatedAt: afterSharedEdit.rows[0].updated_at.toISOString(),
    }),
  });
  await assertStatus(creatorEdit, 200);
  const historicalPage = await api(`/circles/${circleId}`, { headers: { cookie: cookieB } });
  const historicalHtml = await historicalPage.text();
  assert.match(historicalHtml, new RegExp(`退出时保存的版本 ${suffix}`));
  assert.doesNotMatch(historicalHtml, new RegExp(`退出后的新版本 ${suffix}`));
  const historicalImage = await api(`/api/media/${circleMedia.id}`, { headers: { cookie: cookieB } });
  assert.equal(historicalImage.status, 200);

  const afterLeaveMedia = await upload(cookieA, { r: 183, g: 208, b: 216 });
  await createPost(cookieA, {
    body: `退出后新增记录 ${suffix}`,
    circleId,
    managementMode: "creator",
    visibility: "private",
    viewerIds: [],
    mediaIds: [afterLeaveMedia.id],
  });
  const historicalPageAfterNewPost = await api(`/circles/${circleId}`, { headers: { cookie: cookieB } });
  assert.doesNotMatch(await historicalPageAfterNewPost.text(), new RegExp(`退出后新增记录 ${suffix}`));
  const forbiddenFutureImage = await api(`/api/media/${afterLeaveMedia.id}`, { headers: { cookie: cookieB } });
  assert.equal(forbiddenFutureImage.status, 404);

  for (const post of createdPostIds) {
    const response = await api(`/api/posts/${post.id}`, {
      method: "DELETE",
      headers: { cookie: post.cookie },
    });
    await assertStatus(response, 200);
  }
  createdPostIds.length = 0;
  console.log("Smoke test passed: auth, personal visibility, private media, circles, shared editing, exit snapshots, future-content isolation, and cleanup.");
} finally {
  const rows = await pool.query(
    `select id from "user" where email = any($1::text[])`,
    [users.map((person) => person.email)],
  );
  const userIds = rows.rows.map((row) => row.id);
  if (userIds.length > 0) {
    const media = await pool.query(
      `select storage_key from media_assets where owner_id = any($1::text[])`,
      [userIds],
    );
    await pool.query(`delete from posts where author_id = any($1::text[])`, [userIds]);
    await pool.query(`delete from circles where created_by_id = any($1::text[])`, [userIds]);
    await pool.query(`delete from media_assets where owner_id = any($1::text[])`, [userIds]);
    await pool.query(
      `delete from friendships where user_one_id = any($1::text[]) or user_two_id = any($1::text[])`,
      [userIds],
    );
    await pool.query(`delete from "user" where id = any($1::text[])`, [userIds]);
    await Promise.all(
      media.rows.map((row) =>
        rm(path.resolve(".data/uploads", row.storage_key), { force: true }),
      ),
    );
  }
  await pool.end();
}
