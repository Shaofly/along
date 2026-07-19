import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";

import pg from "pg";
import sharp from "sharp";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const databaseUrl = process.env.DATABASE_URL;
const gate = process.env.REGISTRATION_GATE_SECRET;
const maintenanceSecret = process.env.MEDIA_MAINTENANCE_SECRET;
assert(databaseUrl && gate, "DATABASE_URL and REGISTRATION_GATE_SECRET are required");

const pool = new pg.Pool({ connectionString: databaseUrl });
const suffix = randomUUID().slice(0, 8);
const users = [
  {
    name: "冒烟测试甲",
    realName: "冒烟测试甲",
    email: `along-a-${suffix}@example.invalid`,
    password: `Along-test-${suffix}-A`,
  },
  {
    name: "冒烟测试乙",
    realName: "冒烟测试乙",
    email: `along-b-${suffix}@example.invalid`,
    password: `Along-test-${suffix}-B`,
  },
  {
    name: "冒烟测试丙",
    realName: "冒烟测试丙",
    email: `along-c-${suffix}@example.invalid`,
    password: `Along-test-${suffix}-C`,
  },
  {
    name: "冒烟测试丁",
    realName: "冒烟测试丁",
    email: `along-d-${suffix}@example.invalid`,
    password: `Along-test-${suffix}-D`,
  },
  {
    name: "冒烟测试戊",
    realName: "冒烟测试戊",
    email: `along-e-${suffix}@example.invalid`,
    password: `Along-test-${suffix}-E`,
  },
  {
    name: "冒烟测试己",
    realName: "冒烟测试己",
    email: `along-f-${suffix}@example.invalid`,
    password: `Along-test-${suffix}-F`,
  },
  {
    name: "冒烟测试庚",
    realName: "冒烟测试庚",
    email: `along-g-${suffix}@example.invalid`,
    password: `Along-test-${suffix}-G`,
  },
  {
    name: "冒烟测试辛",
    realName: "冒烟测试辛",
    email: `along-h-${suffix}@example.invalid`,
    password: `Along-test-${suffix}-H`,
  },
  {
    name: "冒烟测试壬",
    realName: "冒烟测试壬",
    email: `along-i-${suffix}@example.invalid`,
    password: `Along-test-${suffix}-I`,
  },
  {
    name: "冒烟测试癸",
    realName: "冒烟测试癸",
    email: `along-j-${suffix}@example.invalid`,
    password: `Along-test-${suffix}-J`,
  },
  {
    name: "冒烟测试子",
    realName: "冒烟测试子",
    email: `along-k-${suffix}@example.invalid`,
    password: `Along-test-${suffix}-K`,
  },
];
const createdPostIds = [];
const createdCircleIds = [];
const protectedMediaCacheControl =
  "private, no-cache, max-age=0, must-revalidate";

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

function assertProtectedMediaCache(response) {
  assert.equal(
    response.headers.get("cache-control"),
    protectedMediaCacheControl,
  );
  const etag = response.headers.get("etag");
  assert(etag, "Protected media response must include an ETag");
  return etag;
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
  const media = await response.json();
  assert.equal(media.status, "processing");
  await waitForMediaReady(cookie, media.id);
  return media;
}

async function waitForMediaReady(cookie, mediaId) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const response = await api(`/api/media/${mediaId}/status`, {
      headers: { cookie },
    });
    await assertStatus(response, 200);
    const result = await response.json();
    if (result.status === "ready") return;
    assert.notEqual(
      result.status,
      "failed",
      `Media processing failed: ${result.failureCode ?? "unknown"}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.fail(`Media ${mediaId} did not become ready before the timeout`);
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
  const registrationResults = await Promise.allSettled(users.map(register));
  const registrationFailure = registrationResults.find(
    (result) => result.status === "rejected",
  );
  if (registrationFailure?.status === "rejected") {
    throw registrationFailure.reason;
  }
  const rows = await pool.query(
    `select id, email from "user" where email = any($1::text[])`,
    [users.map((person) => person.email)],
  );
  assert.equal(rows.rowCount, users.length);
  const ids = new Map(rows.rows.map((row) => [row.email, row.id]));
  const userAId = ids.get(users[0].email);
  for (const person of users.slice(1)) {
    const [userOneId, userTwoId] = [
      userAId,
      ids.get(person.email),
    ].sort();
    await pool.query(
      `insert into friendships (id, user_one_id, user_two_id) values ($1, $2, $3)`,
      [randomUUID(), userOneId, userTwoId],
    );
  }

  if (maintenanceSecret) {
    const expiredOrphanMediaId = randomUUID();
    await pool.query(
      `insert into media_assets
        (id, owner_id, storage_key, original_name, mime_type, byte_size,
         status, ready_at, created_at, updated_at)
       values ($1, $2, $3, 'expired-orphan.jpg', 'image/jpeg', 1,
         'ready', now() - interval '2 days',
         now() - interval '2 days', now() - interval '2 days')`,
      [
        expiredOrphanMediaId,
        userAId,
        `smoke-orphan-${suffix}.jpg`,
      ],
    );
    await pool.query(
      `insert into media_upload_sessions
        (id, media_id, owner_id, incoming_key, status, expected_mime_type,
         expected_byte_size, expires_at, created_at, completed_at)
       values ($1, $2, $3, $4, 'verified', 'image/jpeg',
         1, now() - interval '1 day', now() - interval '2 days',
         now() - interval '2 days')`,
      [
        randomUUID(),
        expiredOrphanMediaId,
        userAId,
        `incoming/${userAId}/smoke-orphan-${suffix}.jpg`,
      ],
    );
    const orphanMaintenance = await api(
      "/api/internal/media-maintenance",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${maintenanceSecret}`,
        },
      },
    );
    await assertStatus(orphanMaintenance, 200);
    const expiredOrphanMedia = await pool.query(
      `select id from media_assets where id = $1`,
      [expiredOrphanMediaId],
    );
    assert.equal(expiredOrphanMedia.rowCount, 0);
  }

  const [
    cookieA,
    cookieB,
    cookieC,
    cookieD,
    cookieE,
    ,
    ,
    ,
    ,
    cookieJ,
    cookieK,
  ] = await Promise.all(users.map(login));
  const publicMedia = await upload(cookieA, { r: 194, g: 215, b: 198 });
  const temporaryMediaResponse = await api(
    `/api/media/${publicMedia.id}/thumbnail`,
    { headers: { cookie: cookieA } },
  );
  await assertStatus(temporaryMediaResponse, 200);
  const temporaryEtag = assertProtectedMediaCache(temporaryMediaResponse);
  const cachedTemporaryMedia = await api(
    `/api/media/${publicMedia.id}/thumbnail`,
    {
      headers: {
        cookie: cookieA,
        "if-none-match": temporaryEtag,
      },
    },
  );
  await assertStatus(cachedTemporaryMedia, 304);
  assertProtectedMediaCache(cachedTemporaryMedia);
  await pool.query(
    `update media_upload_sessions
        set expires_at = now() - interval '1 second'
      where media_id = $1`,
    [publicMedia.id],
  );
  const expiredTemporaryMedia = await api(
    `/api/media/${publicMedia.id}/thumbnail`,
    { headers: { cookie: cookieA } },
  );
  await assertStatus(expiredTemporaryMedia, 404);
  assert.equal(
    expiredTemporaryMedia.headers.get("cache-control"),
    "private, no-store",
  );
  const expiredTemporaryStatus = await api(
    `/api/media/${publicMedia.id}/status`,
    { headers: { cookie: cookieA } },
  );
  await assertStatus(expiredTemporaryStatus, 404);
  await pool.query(
    `update media_upload_sessions
        set expires_at = now() + interval '1 day'
      where media_id = $1`,
    [publicMedia.id],
  );
  await createPost(cookieA, {
    body: `朋友可见冒烟测试 ${suffix}`,
    visibility: "friends",
    viewerIds: [],
    mediaIds: [publicMedia.id],
  });
  const committedPublicMedia = await pool.query(
    `select content_committed_at
       from media_assets
      where id = $1`,
    [publicMedia.id],
  );
  assert(committedPublicMedia.rows[0]?.content_committed_at);
  await assert.rejects(
    pool.query(
      `update media_assets
          set content_committed_at = null
        where id = $1`,
      [publicMedia.id],
    ),
    /content commitment is immutable/i,
  );

  const friendHome = await api("/home", { headers: { cookie: cookieB } });
  assert.equal(friendHome.status, 200);
  assert.match(await friendHome.text(), new RegExp(`朋友可见冒烟测试 ${suffix}`));
  const expectedVariants = [
    { type: "thumbnail", width: 405, height: 720, format: "webp" },
    { type: "preview", width: 1080, height: 1920, format: "webp" },
    { type: "hd", width: 1800, height: 3200, format: "jpeg" },
  ];
  for (const expected of expectedVariants) {
    const response = await api(
      `/api/media/${publicMedia.id}/${expected.type}`,
      { headers: { cookie: cookieB } },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-media-variant"), expected.type);
    const etag = assertProtectedMediaCache(response);
    const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    assert.equal(metadata.width, expected.width);
    assert.equal(metadata.height, expected.height);
    assert.equal(metadata.format, expected.format);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.orientation, undefined);
    const cachedResponse = await api(
      `/api/media/${publicMedia.id}/${expected.type}`,
      {
        headers: {
          cookie: cookieB,
          "if-none-match": etag,
        },
      },
    );
    await assertStatus(cachedResponse, 304);
    assert.equal(cachedResponse.headers.get("etag"), etag);
    assertProtectedMediaCache(cachedResponse);
  }
  const protectedDownload = await api(
    `/api/media/${publicMedia.id}/hd?download=1`,
    { headers: { cookie: cookieB } },
  );
  await assertStatus(protectedDownload, 200);
  assertProtectedMediaCache(protectedDownload);
  assert.match(
    protectedDownload.headers.get("content-disposition") ?? "",
    /^attachment;/,
  );
  await protectedDownload.arrayBuffer();

  const privateMedia = await upload(cookieA, { r: 235, g: 192, b: 177 });
  await createPost(cookieA, {
    body: `仅自己可见冒烟测试 ${suffix}`,
    visibility: "private",
    viewerIds: [],
    mediaIds: [privateMedia.id],
  });
  const forbiddenImage = await api(`/api/media/${privateMedia.id}`, { headers: { cookie: cookieB } });
  assert.equal(forbiddenImage.status, 404);

  const draftOnlyMedia = await upload(cookieA, { r: 207, g: 191, b: 219 });
  const saveMediaDraft = await api("/api/drafts", {
    method: "PUT",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({
      body: `仅草稿媒体 ${suffix}`,
      visibility: "private",
      circleId: null,
      managementMode: "creator",
      viewerIds: [],
      mediaIds: [draftOnlyMedia.id],
    }),
  });
  await assertStatus(saveMediaDraft, 200);
  const { id: mediaDraftId } = await saveMediaDraft.json();
  assert(mediaDraftId);
  await pool.query(
    `update media_upload_sessions
        set expires_at = now() - interval '1 second'
      where media_id = $1`,
    [draftOnlyMedia.id],
  );
  const draftAuthorMedia = await api(
    `/api/media/${draftOnlyMedia.id}/preview`,
    { headers: { cookie: cookieA } },
  );
  await assertStatus(draftAuthorMedia, 200);
  assertProtectedMediaCache(draftAuthorMedia);
  const draftFriendMedia = await api(
    `/api/media/${draftOnlyMedia.id}/preview`,
    { headers: { cookie: cookieB } },
  );
  await assertStatus(draftFriendMedia, 404);
  const forkMediaDraftResponse = await api(
    `/api/drafts/${mediaDraftId}/fork`,
    {
      method: "POST",
      headers: { cookie: cookieA, "content-type": "application/json" },
      body: JSON.stringify({
        body: `草稿媒体副本 ${suffix}`,
        visibility: "private",
        circleId: null,
        managementMode: "creator",
        viewerIds: [],
        participantIds: [],
        mediaIds: [draftOnlyMedia.id],
      }),
    },
  );
  await assertStatus(forkMediaDraftResponse, 200);
  const forkMediaDraft = await forkMediaDraftResponse.json();
  assert(forkMediaDraft.id);
  assert.equal(forkMediaDraft.media.length, 1);
  assert.notEqual(forkMediaDraft.media[0].id, draftOnlyMedia.id);
  const forkedDraftMedia = await api(
    `/api/media/${forkMediaDraft.media[0].id}/preview`,
    { headers: { cookie: cookieA } },
  );
  await assertStatus(forkedDraftMedia, 200);
  assertProtectedMediaCache(forkedDraftMedia);
  const uncommittedDraftMedia = await pool.query(
    `select content_committed_at
       from media_assets
      where id = $1`,
    [draftOnlyMedia.id],
  );
  assert.equal(uncommittedDraftMedia.rows[0]?.content_committed_at, null);
  const deleteMediaDraft = await api(`/api/drafts/${mediaDraftId}`, {
    method: "DELETE",
    headers: { cookie: cookieA },
  });
  await assertStatus(deleteMediaDraft, 200);
  const deleteForkMediaDraft = await api(
    `/api/drafts/${forkMediaDraft.id}`,
    {
      method: "DELETE",
      headers: { cookie: cookieA },
    },
  );
  await assertStatus(deleteForkMediaDraft, 200);

  const firstMultiDraftResponse = await api("/api/drafts", {
    method: "POST",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({
      body: `多草稿一 ${suffix}`,
      visibility: "private",
      circleId: null,
      managementMode: "creator",
      viewerIds: [],
      participantIds: [],
      mediaIds: [],
    }),
  });
  await assertStatus(firstMultiDraftResponse, 200);
  const firstMultiDraft = await firstMultiDraftResponse.json();
  const secondMultiDraftResponse = await api("/api/drafts", {
    method: "POST",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({
      body: `多草稿二 ${suffix}`,
      visibility: "private",
      circleId: null,
      managementMode: "creator",
      viewerIds: [],
      participantIds: [],
      mediaIds: [],
    }),
  });
  await assertStatus(secondMultiDraftResponse, 200);
  const secondMultiDraft = await secondMultiDraftResponse.json();
  assert.notEqual(firstMultiDraft.id, secondMultiDraft.id);
  const multiDraftListResponse = await api(
    "/api/drafts?target=personal&limit=60",
    { headers: { cookie: cookieA } },
  );
  await assertStatus(multiDraftListResponse, 200);
  const multiDraftList = await multiDraftListResponse.json();
  assert(
    multiDraftList.drafts.some((draft) => draft.id === firstMultiDraft.id),
  );
  assert(
    multiDraftList.drafts.some((draft) => draft.id === secondMultiDraft.id),
  );

  const updateFirstDraftResponse = await api(
    `/api/drafts/${firstMultiDraft.id}`,
    {
      method: "PATCH",
      headers: { cookie: cookieA, "content-type": "application/json" },
      body: JSON.stringify({
        body: `多草稿一更新 ${suffix}`,
        visibility: "private",
        circleId: null,
        managementMode: "creator",
        viewerIds: [],
        participantIds: [],
        mediaIds: [],
        expectedUpdatedAt: firstMultiDraft.updatedAt,
      }),
    },
  );
  await assertStatus(updateFirstDraftResponse, 200);
  const staleDraftUpdateResponse = await api(
    `/api/drafts/${firstMultiDraft.id}`,
    {
      method: "PATCH",
      headers: { cookie: cookieA, "content-type": "application/json" },
      body: JSON.stringify({
        body: `本地冲突版本 ${suffix}`,
        visibility: "private",
        circleId: null,
        managementMode: "creator",
        viewerIds: [],
        participantIds: [],
        mediaIds: [],
        expectedUpdatedAt: firstMultiDraft.updatedAt,
      }),
    },
  );
  await assertStatus(staleDraftUpdateResponse, 409);
  const staleDraftUpdate = await staleDraftUpdateResponse.json();
  assert.equal(staleDraftUpdate.code, "draft_conflict");
  const forkDraftResponse = await api(
    `/api/drafts/${firstMultiDraft.id}/fork`,
    {
      method: "POST",
      headers: { cookie: cookieA, "content-type": "application/json" },
      body: JSON.stringify({
        body: `本地冲突版本 ${suffix}`,
        visibility: "private",
        circleId: null,
        managementMode: "creator",
        viewerIds: [],
        participantIds: [],
        mediaIds: [],
      }),
    },
  );
  await assertStatus(forkDraftResponse, 200);
  const forkedDraft = await forkDraftResponse.json();
  assert(forkedDraft.id);
  assert.notEqual(forkedDraft.id, firstMultiDraft.id);
  for (const draftId of [
    firstMultiDraft.id,
    secondMultiDraft.id,
    forkedDraft.id,
  ]) {
    const cleanupDraft = await api(`/api/drafts/${draftId}`, {
      method: "DELETE",
      headers: { cookie: cookieA },
    });
    await assertStatus(cleanupDraft, 200);
  }

  const profileUpdate = await api("/api/profile", {
    method: "PATCH",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({
      realName: users[0].realName,
      nickname: "",
      bio: "这是一条测试简介。",
    }),
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
  const { requestId: circleCreationRequestId } = await circleCreate.json();
  const circlesBeforeAcceptance = await pool.query(
    `select id from circles where name = $1`,
    [`冒烟小圈子 ${suffix}`],
  );
  assert.equal(circlesBeforeAcceptance.rowCount, 0);
  const initialAccept = await api(`/api/circles/creation-requests/${circleCreationRequestId}/respond`, {
    method: "POST",
    headers: { cookie: cookieB, "content-type": "application/json" },
    body: JSON.stringify({ decision: "accept" }),
  });
  await assertStatus(initialAccept, 200);
  const { circleId } = await initialAccept.json();
  assert(circleId);
  createdCircleIds.push(circleId);
  const oldCircleNickname = `旧周期昵称${suffix}`;
  const currentCircleNickname = `当前周期昵称${suffix}`;
  const setOldCircleNickname = await api(`/api/circles/${circleId}/nickname`, {
    method: "PATCH",
    headers: { cookie: cookieB, "content-type": "application/json" },
    body: JSON.stringify({ nickname: oldCircleNickname }),
  });
  await assertStatus(setOldCircleNickname, 200);
  const initialMembersPage = await api(`/circles/${circleId}/members`, {
    headers: { cookie: cookieB },
  });
  await assertStatus(initialMembersPage, 200);
  assert.match(
    await initialMembersPage.text(),
    new RegExp(oldCircleNickname),
  );

  const historyBoundary = new Date();
  const hiddenCircleEvent = `加入前系统动态 ${suffix}`;
  await pool.query(
    `update circle_member_relations
        set history_visible_from = $1
      where circle_id = $2 and user_id = $3`,
    [historyBoundary, circleId, ids.get(users[1].email)],
  );
  await pool.query(
    `insert into circle_events (id, circle_id, actor_id, type, message, created_at)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      randomUUID(),
      circleId,
      ids.get(users[0].email),
      "history_boundary_test",
      hiddenCircleEvent,
      new Date(historyBoundary.getTime() - 1_000),
    ],
  );

  const circleMedia = await upload(cookieB, { r: 221, g: 205, b: 177 });
  const circlePost = await createPost(cookieB, {
    body: `退出前共同记录 ${suffix}`,
    circleId,
    managementMode: "circle",
    visibility: "private",
    viewerIds: [],
    participantIds: [
      ids.get(users[0].email),
      ids.get(users[1].email),
    ],
    mediaIds: [circleMedia.id],
  });
  createdPostIds.at(-1).cookie = cookieA;
  const concurrentCirclePost = await createPost(cookieA, {
    body: `并发编辑初始版本 ${suffix}`,
    circleId,
    managementMode: "circle",
    visibility: "private",
    viewerIds: [],
    participantIds: [
      ids.get(users[0].email),
      ids.get(users[1].email),
    ],
    mediaIds: [],
  });
  const concurrentCircleVersion = await pool.query(
    `select updated_at from posts where id = $1`,
    [concurrentCirclePost.id],
  );
  const concurrentExpectedUpdatedAt =
    concurrentCircleVersion.rows[0].updated_at.toISOString();
  const concurrentBodies = [
    `并发编辑甲胜出 ${suffix}`,
    `并发编辑乙胜出 ${suffix}`,
  ];
  const concurrentEdits = await Promise.all([
    api(`/api/posts/${concurrentCirclePost.id}`, {
      method: "PATCH",
      headers: { cookie: cookieA, "content-type": "application/json" },
      body: JSON.stringify({
        body: concurrentBodies[0],
        managementMode: "circle",
        viewerIds: [],
        expectedUpdatedAt: concurrentExpectedUpdatedAt,
      }),
    }),
    api(`/api/posts/${concurrentCirclePost.id}`, {
      method: "PATCH",
      headers: { cookie: cookieB, "content-type": "application/json" },
      body: JSON.stringify({
        body: concurrentBodies[1],
        managementMode: "circle",
        viewerIds: [],
        expectedUpdatedAt: concurrentExpectedUpdatedAt,
      }),
    }),
  ]);
  assert.deepEqual(
    concurrentEdits
      .map((response) => response.status)
      .sort((left, right) => left - right),
    [200, 409],
  );
  const rejectedConcurrentEdit = concurrentEdits.find(
    (response) => response.status === 409,
  );
  const rejectedConcurrentEditBody = await rejectedConcurrentEdit.json();
  assert.equal(rejectedConcurrentEditBody.code, "post_conflict");
  assert.equal(rejectedConcurrentEditBody.terminal, true);
  const finalConcurrentPost = await pool.query(
    `select body from posts where id = $1`,
    [concurrentCirclePost.id],
  );
  assert(
    concurrentBodies.includes(finalConcurrentPost.rows[0]?.body),
    "Exactly one concurrent edit body must be committed",
  );
  const memberCirclePage = await api(`/circles/${circleId}`, { headers: { cookie: cookieB } });
  assert.equal(memberCirclePage.status, 200);
  const memberCircleHtml = await memberCirclePage.text();
  assert.match(memberCircleHtml, new RegExp(`退出前共同记录 ${suffix}`));
  assert.doesNotMatch(memberCircleHtml, new RegExp(hiddenCircleEvent));
  const activeProfile = await api(`/profile/${ids.get(users[1].email)}`, {
    headers: { cookie: cookieB },
  });
  assert.equal(activeProfile.status, 200);
  assert.match(
    await activeProfile.text(),
    new RegExp(`退出前共同记录 ${suffix}`),
  );

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
  const activeFormerMembersPage = await api(`/circles/${circleId}/members`, {
    headers: { cookie: cookieA },
  });
  await assertStatus(activeFormerMembersPage, 200);
  const activeFormerMembersHtml = await activeFormerMembersPage.text();
  assert.doesNotMatch(
    activeFormerMembersHtml,
    new RegExp(oldCircleNickname),
  );
  assert.match(
    activeFormerMembersHtml,
    new RegExp(users[1].name),
  );
  const afterSharedEdit = await pool.query(`select updated_at from posts where id = $1`, [circlePost.id]);
  const creatorEdit = await api(`/api/posts/${circlePost.id}`, {
    method: "PATCH",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({
      body: `退出后的新版本 ${suffix}`,
      managementMode: "circle",
      viewerIds: [],
      participantIds: [
        ids.get(users[0].email),
        ids.get(users[1].email),
      ],
      expectedUpdatedAt: afterSharedEdit.rows[0].updated_at.toISOString(),
    }),
  });
  await assertStatus(creatorEdit, 200);
  const historicalPage = await api(`/circles/${circleId}`, { headers: { cookie: cookieB } });
  const historicalHtml = await historicalPage.text();
  assert.match(historicalHtml, new RegExp(`退出时保存的版本 ${suffix}`));
  assert.doesNotMatch(historicalHtml, new RegExp(`退出后的新版本 ${suffix}`));
  assert.doesNotMatch(historicalHtml, new RegExp(hiddenCircleEvent));
  const historicalMembersPage = await api(`/circles/${circleId}/members`, {
    headers: { cookie: cookieB },
  });
  await assertStatus(historicalMembersPage, 200);
  const historicalMembersHtml = await historicalMembersPage.text();
  assert.doesNotMatch(
    historicalMembersHtml,
    new RegExp(oldCircleNickname),
  );
  assert.match(historicalMembersHtml, new RegExp(users[1].name));
  const historicalImage = await api(`/api/media/${circleMedia.id}`, { headers: { cookie: cookieB } });
  assert.equal(historicalImage.status, 200);
  const circleMediaEtag = assertProtectedMediaCache(historicalImage);
  const cachedHistoricalImage = await api(`/api/media/${circleMedia.id}`, {
    headers: {
      cookie: cookieB,
      "if-none-match": circleMediaEtag,
    },
  });
  await assertStatus(cachedHistoricalImage, 304);
  assertProtectedMediaCache(cachedHistoricalImage);
  const exitedProfile = await api(`/profile/${ids.get(users[1].email)}`, {
    headers: { cookie: cookieB },
  });
  assert.equal(exitedProfile.status, 200);
  assert.doesNotMatch(
    await exitedProfile.text(),
    new RegExp(`退出时保存的版本 ${suffix}`),
  );

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

  const newerHistoricalCircleName = `较晚退出圈子 ${suffix}`;
  const newerHistoricalCircleRequest = await api("/api/circles", {
    method: "POST",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({
      name: newerHistoricalCircleName,
      description: "验证历史圈子不会被当前活动重新排序。",
      invitedUserIds: [ids.get(users[1].email)],
    }),
  });
  await assertStatus(newerHistoricalCircleRequest, 200);
  const { requestId: newerHistoricalRequestId } =
    await newerHistoricalCircleRequest.json();
  const acceptNewerHistoricalCircle = await api(
    `/api/circles/creation-requests/${newerHistoricalRequestId}/respond`,
    {
      method: "POST",
      headers: { cookie: cookieB, "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    },
  );
  await assertStatus(acceptNewerHistoricalCircle, 200);
  const { circleId: newerHistoricalCircleId } =
    await acceptNewerHistoricalCircle.json();
  assert(newerHistoricalCircleId);
  createdCircleIds.push(newerHistoricalCircleId);
  const leaveNewerHistoricalCircle = await api(
    `/api/circles/${newerHistoricalCircleId}/leave`,
    {
      method: "POST",
      headers: { cookie: cookieB },
    },
  );
  await assertStatus(leaveNewerHistoricalCircle, 200);

  await new Promise((resolve) => setTimeout(resolve, 10));
  const beforeHistoricalOrderProbe = await pool.query(
    `select updated_at from posts where id = $1`,
    [circlePost.id],
  );
  const historicalOrderProbe = await api(`/api/posts/${circlePost.id}`, {
    method: "PATCH",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({
      body: `退出后的新版本 ${suffix}`,
      managementMode: "circle",
      viewerIds: [],
      participantIds: [
        ids.get(users[0].email),
        ids.get(users[1].email),
      ],
      expectedUpdatedAt:
        beforeHistoricalOrderProbe.rows[0].updated_at.toISOString(),
    }),
  });
  await assertStatus(historicalOrderProbe, 200);
  const historicalSortEvidence = await pool.query(
    `select
       cmr.circle_id,
       c.updated_at,
       ces.captured_at
     from circle_member_relations cmr
     join circles c on c.id = cmr.circle_id
     join circle_exit_snapshots ces on ces.relation_id = cmr.id
     where cmr.user_id = $1 and cmr.circle_id = any($2::text[])`,
    [
      ids.get(users[1].email),
      [circleId, newerHistoricalCircleId],
    ],
  );
  const olderHistoricalEvidence = historicalSortEvidence.rows.find(
    (row) => row.circle_id === circleId,
  );
  const newerHistoricalEvidence = historicalSortEvidence.rows.find(
    (row) => row.circle_id === newerHistoricalCircleId,
  );
  assert(
    olderHistoricalEvidence?.updated_at >
      newerHistoricalEvidence?.updated_at,
  );
  assert(
    olderHistoricalEvidence?.captured_at <
      newerHistoricalEvidence?.captured_at,
  );
  const historicalDashboard = await api("/circles", {
    headers: { cookie: cookieB },
  });
  await assertStatus(historicalDashboard, 200);
  const historicalDashboardHtml = await historicalDashboard.text();
  const newerHistoricalPosition = historicalDashboardHtml.indexOf(
    newerHistoricalCircleName,
  );
  const olderHistoricalPosition = historicalDashboardHtml.indexOf(
    `冒烟小圈子 ${suffix}`,
  );
  assert(newerHistoricalPosition >= 0 && olderHistoricalPosition >= 0);
  assert(
    newerHistoricalPosition < olderHistoricalPosition,
    "Historical circles must remain ordered by each archive capture time",
  );

  const rejoinRequest = await api(`/api/circles/${circleId}/rejoin`, {
    method: "POST",
    headers: { cookie: cookieB },
  });
  await assertStatus(rejoinRequest, 200);
  const { proposalId: rejoinProposalId } = await rejoinRequest.json();
  const approveRejoin = await api(
    `/api/circles/proposals/${rejoinProposalId}/respond`,
    {
      method: "POST",
      headers: { cookie: cookieA, "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    },
  );
  await assertStatus(approveRejoin, 200);
  const acceptRejoin = await api(
    `/api/circles/proposals/${rejoinProposalId}/respond`,
    {
      method: "POST",
      headers: { cookie: cookieB, "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    },
  );
  await assertStatus(acceptRejoin, 200);

  const rejoinedMembersBeforeNickname = await api(
    `/circles/${circleId}/members`,
    { headers: { cookie: cookieB } },
  );
  await assertStatus(rejoinedMembersBeforeNickname, 200);
  const rejoinedMembersBeforeNicknameHtml =
    await rejoinedMembersBeforeNickname.text();
  assert.doesNotMatch(
    rejoinedMembersBeforeNicknameHtml,
    new RegExp(oldCircleNickname),
  );
  assert.match(
    rejoinedMembersBeforeNicknameHtml,
    new RegExp(users[1].name),
  );
  const setCurrentCircleNickname = await api(
    `/api/circles/${circleId}/nickname`,
    {
      method: "PATCH",
      headers: { cookie: cookieB, "content-type": "application/json" },
      body: JSON.stringify({ nickname: currentCircleNickname }),
    },
  );
  await assertStatus(setCurrentCircleNickname, 200);
  const rejoinedMembersAfterNickname = await api(
    `/circles/${circleId}/members`,
    { headers: { cookie: cookieB } },
  );
  await assertStatus(rejoinedMembersAfterNickname, 200);
  const rejoinedMembersAfterNicknameHtml =
    await rejoinedMembersAfterNickname.text();
  assert.match(
    rejoinedMembersAfterNicknameHtml,
    new RegExp(currentCircleNickname),
  );
  assert.doesNotMatch(
    rejoinedMembersAfterNicknameHtml,
    new RegExp(oldCircleNickname),
  );

  const rejoinedCirclePage = await api(`/circles/${circleId}`, {
    headers: { cookie: cookieB },
  });
  assert.equal(rejoinedCirclePage.status, 200);
  const rejoinedHtml = await rejoinedCirclePage.text();
  assert.match(rejoinedHtml, new RegExp(`退出后的新版本 ${suffix}`));
  assert.match(rejoinedHtml, new RegExp(`退出后新增记录 ${suffix}`));
  assert.doesNotMatch(rejoinedHtml, new RegExp(hiddenCircleEvent));
  const restoredFutureImage = await api(`/api/media/${afterLeaveMedia.id}`, {
    headers: { cookie: cookieB },
  });
  assert.equal(restoredFutureImage.status, 200);
  const archivedAfterRejoin = await pool.query(
    `select ces.id
       from circle_exit_snapshots ces
       join circle_member_relations cmr on cmr.id = ces.relation_id
      where cmr.circle_id = $1 and cmr.user_id = $2`,
    [circleId, ids.get(users[1].email)],
  );
  assert.equal(archivedAfterRejoin.rowCount, 0);

  const rejoinedProfile = await api(`/profile/${ids.get(users[1].email)}`, {
    headers: { cookie: cookieB },
  });
  assert.equal(rejoinedProfile.status, 200);
  const rejoinedProfileHtml = await rejoinedProfile.text();
  assert.match(
    rejoinedProfileHtml,
    new RegExp(`退出后的新版本 ${suffix}`),
  );
  assert.doesNotMatch(
    rejoinedProfileHtml,
    new RegExp(`退出后新增记录 ${suffix}`),
  );

  const relationRows = await pool.query(
    `select id, user_id, active_period_id
       from circle_member_relations
      where circle_id = $1`,
    [circleId],
  );
  assert.equal(relationRows.rowCount, 2);
  const relationA = relationRows.rows.find(
    (row) => row.user_id === ids.get(users[0].email),
  );
  const relationB = relationRows.rows.find(
    (row) => row.user_id === ids.get(users[1].email),
  );
  assert(relationA?.active_period_id && relationB?.active_period_id);
  const constraintClient = await pool.connect();
  try {
    await constraintClient.query("begin");
    await constraintClient.query(
      `update circle_member_relations set active_period_id = $1 where id = $2`,
      [relationB.active_period_id, relationA.id],
    );
    await assert.rejects(
      constraintClient.query("commit"),
      /active period|relation|membership/i,
    );
  } finally {
    await constraintClient.query("rollback").catch(() => undefined);
    constraintClient.release();
  }

  const secondLeave = await api(`/api/circles/${circleId}/leave`, {
    method: "POST",
    headers: { cookie: cookieB },
  });
  await assertStatus(secondLeave, 200);
  const secondArchivePage = await api(`/circles/${circleId}`, {
    headers: { cookie: cookieB },
  });
  assert.equal(secondArchivePage.status, 200);
  const secondArchiveHtml = await secondArchivePage.text();
  assert.match(secondArchiveHtml, new RegExp(`退出后的新版本 ${suffix}`));
  assert.match(secondArchiveHtml, new RegExp(`退出后新增记录 ${suffix}`));
  const secondArchiveMembersPage = await api(
    `/circles/${circleId}/members`,
    { headers: { cookie: cookieB } },
  );
  await assertStatus(secondArchiveMembersPage, 200);
  const secondArchiveMembersHtml = await secondArchiveMembersPage.text();
  assert.doesNotMatch(
    secondArchiveMembersHtml,
    new RegExp(oldCircleNickname),
  );
  assert.doesNotMatch(
    secondArchiveMembersHtml,
    new RegExp(currentCircleNickname),
  );
  assert.match(secondArchiveMembersHtml, new RegExp(users[1].name));
  const latestArchiveRows = await pool.query(
    `select ces.id
       from circle_exit_snapshots ces
       join circle_member_relations cmr on cmr.id = ces.relation_id
      where cmr.circle_id = $1 and cmr.user_id = $2`,
    [circleId, ids.get(users[1].email)],
  );
  assert.equal(latestArchiveRows.rowCount, 1);

  const deleteArchive = await api(`/api/circles/${circleId}/archive`, {
    method: "DELETE",
    headers: { cookie: cookieB },
  });
  await assertStatus(deleteArchive, 200);
  const deletedArchivePage = await api(`/circles/${circleId}`, {
    headers: { cookie: cookieB },
  });
  assert.equal(deletedArchivePage.status, 404);
  const deletedArchiveRows = await pool.query(
    `select ces.id
       from circle_exit_snapshots ces
       join circle_member_relations cmr on cmr.id = ces.relation_id
      where cmr.circle_id = $1 and cmr.user_id = $2`,
    [circleId, ids.get(users[1].email)],
  );
  assert.equal(deletedArchiveRows.rowCount, 0);
  const revokedOwnerMedia = await api(`/api/media/${circleMedia.id}`, {
    headers: {
      cookie: cookieB,
      "if-none-match": circleMediaEtag,
    },
  });
  await assertStatus(revokedOwnerMedia, 404);
  assert.equal(
    revokedOwnerMedia.headers.get("cache-control"),
    "private, no-store",
  );
  const revokedOwnerMediaStatus = await api(
    `/api/media/${circleMedia.id}/status`,
    { headers: { cookie: cookieB } },
  );
  await assertStatus(revokedOwnerMediaStatus, 404);
  const stillAuthorizedMemberMedia = await api(
    `/api/media/${circleMedia.id}`,
    {
      headers: {
        cookie: cookieA,
        "if-none-match": circleMediaEtag,
      },
    },
  );
  await assertStatus(stillAuthorizedMemberMedia, 304);
  assertProtectedMediaCache(stillAuthorizedMemberMedia);

  const pendingFinalRejoin = await api(`/api/circles/${circleId}/rejoin`, {
    method: "POST",
    headers: { cookie: cookieB },
  });
  await assertStatus(pendingFinalRejoin, 200);
  const { proposalId: pendingFinalRejoinId } =
    await pendingFinalRejoin.json();
  const approveFinalRejoin = await api(
    `/api/circles/proposals/${pendingFinalRejoinId}/respond`,
    {
      method: "POST",
      headers: { cookie: cookieA, "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    },
  );
  await assertStatus(approveFinalRejoin, 200);
  const finalMemberLeave = await api(`/api/circles/${circleId}/leave`, {
    method: "POST",
    headers: { cookie: cookieA },
  });
  await assertStatus(finalMemberLeave, 200);
  const frozenCircle = await pool.query(
    `select status, frozen_at, delete_at, recoverable_by_user_id
       from circles
      where id = $1`,
    [circleId],
  );
  assert.equal(frozenCircle.rows[0]?.status, "frozen");
  assert.equal(
    frozenCircle.rows[0]?.recoverable_by_user_id,
    ids.get(users[0].email),
  );
  assert.equal(
    frozenCircle.rows[0]?.delete_at.getTime() -
      frozenCircle.rows[0]?.frozen_at.getTime(),
    60 * 60 * 1000,
  );
  const invalidatedFinalRejoin = await pool.query(
    `select status from circle_join_proposals where id = $1`,
    [pendingFinalRejoinId],
  );
  assert.equal(invalidatedFinalRejoin.rows[0]?.status, "invalidated");
  const staleCandidateAccept = await api(
    `/api/circles/proposals/${pendingFinalRejoinId}/respond`,
    {
      method: "POST",
      headers: { cookie: cookieB, "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    },
  );
  assert.equal(staleCandidateAccept.status, 400);
  const restoreCircle = await api(`/api/circles/${circleId}/restore`, {
    method: "POST",
    headers: { cookie: cookieA },
  });
  await assertStatus(restoreCircle, 200);
  const restoredCircle = await pool.query(
    `select status, frozen_at, delete_at, recoverable_by_user_id
       from circles
      where id = $1`,
    [circleId],
  );
  assert.equal(restoredCircle.rows[0]?.status, "active");
  assert.equal(restoredCircle.rows[0]?.frozen_at, null);
  assert.equal(restoredCircle.rows[0]?.delete_at, null);
  assert.equal(restoredCircle.rows[0]?.recoverable_by_user_id, null);

  const soleMemberInvite = await api(
    `/api/circles/${circleId}/proposals`,
    {
      method: "POST",
      headers: { cookie: cookieA, "content-type": "application/json" },
      body: JSON.stringify({
        candidateId: ids.get(users[2].email),
        allowHistory: true,
      }),
    },
  );
  await assertStatus(soleMemberInvite, 200);
  const { proposalId: soleMemberProposalId } =
    await soleMemberInvite.json();
  const soleMemberProposal = await pool.query(
    `select
       proposal.status,
       count(approval.user_id)::int as approval_count
     from circle_join_proposals proposal
     left join circle_proposal_approvals approval
       on approval.proposal_id = proposal.id
     where proposal.id = $1
     group by proposal.id`,
    [soleMemberProposalId],
  );
  assert.equal(
    soleMemberProposal.rows[0]?.status,
    "awaiting_candidate",
  );
  assert.equal(soleMemberProposal.rows[0]?.approval_count, 0);
  const acceptSoleMemberInvite = await api(
    `/api/circles/proposals/${soleMemberProposalId}/respond`,
    {
      method: "POST",
      headers: { cookie: cookieC, "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    },
  );
  await assertStatus(acceptSoleMemberInvite, 200);
  const directlyJoinedMember = await pool.query(
    `select active_period_id
       from circle_member_relations
      where circle_id = $1 and user_id = $2`,
    [circleId, ids.get(users[2].email)],
  );
  assert(directlyJoinedMember.rows[0]?.active_period_id);
  const directlyJoinedMemberLeave = await api(
    `/api/circles/${circleId}/leave`,
    {
      method: "POST",
      headers: { cookie: cookieC },
    },
  );
  await assertStatus(directlyJoinedMemberLeave, 200);

  const failedCreation = await api("/api/circles", {
    method: "POST",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({
      name: `无人接受 ${suffix}`,
      description: "验证创建失败结果卡。",
      invitedUserIds: [ids.get(users[2].email)],
    }),
  });
  await assertStatus(failedCreation, 200);
  const { requestId: failedCreationRequestId } =
    await failedCreation.json();
  const declineCreation = await api(
    `/api/circles/creation-requests/${failedCreationRequestId}/respond`,
    {
      method: "POST",
      headers: { cookie: cookieC, "content-type": "application/json" },
      body: JSON.stringify({ decision: "decline" }),
    },
  );
  await assertStatus(declineCreation, 200);
  assert.equal((await declineCreation.json()).circleId, null);
  const failedCreationDashboard = await api("/circles", {
    headers: { cookie: cookieA },
  });
  assert.match(
    await failedCreationDashboard.text(),
    new RegExp(`无人接受 ${suffix}`),
  );
  const acknowledgeFailedCreation = await api(
    `/api/circles/creation-requests/${failedCreationRequestId}/acknowledge`,
    {
      method: "POST",
      headers: { cookie: cookieA },
    },
  );
  await assertStatus(acknowledgeFailedCreation, 200);

  const expiredCreation = await api("/api/circles", {
    method: "POST",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({
      name: `到期未接受 ${suffix}`,
      description: "验证截止瞬间会提交统一结算。",
      invitedUserIds: [ids.get(users[2].email)],
    }),
  });
  await assertStatus(expiredCreation, 200);
  const { requestId: expiredCreationRequestId } =
    await expiredCreation.json();
  await pool.query(
    `update circle_creation_requests
        set created_at = now() - interval '2 seconds',
            expires_at = now() - interval '1 second'
      where id = $1`,
    [expiredCreationRequestId],
  );
  const respondAfterCreationExpiry = await api(
    `/api/circles/creation-requests/${expiredCreationRequestId}/respond`,
    {
      method: "POST",
      headers: { cookie: cookieC, "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    },
  );
  assert.equal(respondAfterCreationExpiry.status, 400);
  const expiredCreationState = await pool.query(
    `select request.status as request_status, invitee.status as invitee_status
       from circle_creation_requests request
       join circle_creation_invitees invitee on invitee.request_id = request.id
      where request.id = $1`,
    [expiredCreationRequestId],
  );
  assert.equal(expiredCreationState.rows[0]?.request_status, "failed");
  assert.equal(expiredCreationState.rows[0]?.invitee_status, "expired");
  const acknowledgeExpiredCreation = await api(
    `/api/circles/creation-requests/${expiredCreationRequestId}/acknowledge`,
    {
      method: "POST",
      headers: { cookie: cookieA },
    },
  );
  await assertStatus(acknowledgeExpiredCreation, 200);

  const governanceCircleCreate = await api("/api/circles", {
    method: "POST",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({
      name: `审批成员变化 ${suffix}`,
      description: "验证退出成员不能处理或阻塞既有提案。",
      invitedUserIds: [
        ids.get(users[1].email),
        ids.get(users[2].email),
      ],
    }),
  });
  await assertStatus(governanceCircleCreate, 200);
  const { requestId: governanceCreationRequestId } =
    await governanceCircleCreate.json();
  const firstCreationResponse = await api(
    `/api/circles/creation-requests/${governanceCreationRequestId}/respond`,
    {
      method: "POST",
      headers: { cookie: cookieB, "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    },
  );
  await assertStatus(firstCreationResponse, 200);
  assert.equal((await firstCreationResponse.json()).circleId, null);
  const secondCreationResponse = await api(
    `/api/circles/creation-requests/${governanceCreationRequestId}/respond`,
    {
      method: "POST",
      headers: { cookie: cookieC, "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    },
  );
  await assertStatus(secondCreationResponse, 200);
  const { circleId: governanceCircleId } =
    await secondCreationResponse.json();
  assert(governanceCircleId);
  createdCircleIds.push(governanceCircleId);

  const inviteD = await api(
    `/api/circles/${governanceCircleId}/proposals`,
    {
      method: "POST",
      headers: { cookie: cookieA, "content-type": "application/json" },
      body: JSON.stringify({
        candidateId: ids.get(users[3].email),
        allowHistory: true,
      }),
    },
  );
  await assertStatus(inviteD, 200);
  const { proposalId: proposalDId } = await inviteD.json();
  const inviteE = await api(
    `/api/circles/${governanceCircleId}/proposals`,
    {
      method: "POST",
      headers: { cookie: cookieA, "content-type": "application/json" },
      body: JSON.stringify({
        candidateId: ids.get(users[4].email),
        allowHistory: true,
      }),
    },
  );
  await assertStatus(inviteE, 200);
  const { proposalId: proposalEId } = await inviteE.json();

  const approveEByC = await api(
    `/api/circles/proposals/${proposalEId}/respond`,
    {
      method: "POST",
      headers: { cookie: cookieC, "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    },
  );
  await assertStatus(approveEByC, 200);
  const governanceLeaveB = await api(
    `/api/circles/${governanceCircleId}/leave`,
    {
      method: "POST",
      headers: { cookie: cookieB },
    },
  );
  await assertStatus(governanceLeaveB, 200);

  const exitedApprovals = await pool.query(
    `select proposal_id
       from circle_proposal_approvals
      where user_id = $1
        and proposal_id = any($2::text[])`,
    [
      ids.get(users[1].email),
      [proposalDId, proposalEId],
    ],
  );
  assert.equal(exitedApprovals.rowCount, 0);
  const proposalsAfterExit = await pool.query(
    `select id, status
       from circle_join_proposals
      where id = any($1::text[])`,
    [[proposalDId, proposalEId]],
  );
  const statusAfterExit = new Map(
    proposalsAfterExit.rows.map((row) => [row.id, row.status]),
  );
  assert.equal(statusAfterExit.get(proposalDId), "pending_approval");
  assert.equal(statusAfterExit.get(proposalEId), "awaiting_candidate");

  await pool.query(
    `insert into circle_proposal_approvals (proposal_id, user_id)
     values ($1, $2)`,
    [proposalDId, ids.get(users[1].email)],
  );
  const exitedApproverDashboard = await api("/circles", {
    headers: { cookie: cookieB },
  });
  assert.equal(exitedApproverDashboard.status, 200);
  assert.doesNotMatch(
    await exitedApproverDashboard.text(),
    new RegExp(users[3].name),
  );
  const exitedApproverDecline = await api(
    `/api/circles/proposals/${proposalDId}/respond`,
    {
      method: "POST",
      headers: { cookie: cookieB, "content-type": "application/json" },
      body: JSON.stringify({ decision: "decline" }),
    },
  );
  assert.equal(exitedApproverDecline.status, 400);
  assert.match(
    (await exitedApproverDecline.json()).error,
    /只有当前活跃成员/,
  );
  const proposalAfterExitedDecline = await pool.query(
    `select status from circle_join_proposals where id = $1`,
    [proposalDId],
  );
  assert.equal(
    proposalAfterExitedDecline.rows[0]?.status,
    "pending_approval",
  );
  await pool.query(
    `delete from circle_proposal_approvals
      where proposal_id = $1 and user_id = $2`,
    [proposalDId, ids.get(users[1].email)],
  );

  const participantRacePost = await createPost(cookieA, {
    body: `参与者状态复核 ${suffix}`,
    circleId: governanceCircleId,
    managementMode: "circle",
    visibility: "private",
    viewerIds: [],
    participantIds: [ids.get(users[0].email)],
    mediaIds: [],
  });
  const participantRaceVersion = await pool.query(
    `select body, updated_at from posts where id = $1`,
    [participantRacePost.id],
  );
  const addExitedParticipant = await api(
    `/api/posts/${participantRacePost.id}`,
    {
      method: "PATCH",
      headers: { cookie: cookieA, "content-type": "application/json" },
      body: JSON.stringify({
        body: `不应写入的参与者版本 ${suffix}`,
        managementMode: "circle",
        viewerIds: [],
        participantIds: [
          ids.get(users[0].email),
          ids.get(users[1].email),
        ],
        expectedUpdatedAt:
          participantRaceVersion.rows[0].updated_at.toISOString(),
      }),
    },
  );
  assert.equal(addExitedParticipant.status, 409);
  const addExitedParticipantBody = await addExitedParticipant.json();
  assert.equal(addExitedParticipantBody.code, "participants_changed");
  assert.equal(addExitedParticipantBody.terminal, true);
  const unchangedParticipantRacePost = await pool.query(
    `select body from posts where id = $1`,
    [participantRacePost.id],
  );
  assert.equal(
    unchangedParticipantRacePost.rows[0]?.body,
    participantRaceVersion.rows[0]?.body,
  );

  const approveDByC = await api(
    `/api/circles/proposals/${proposalDId}/respond`,
    {
      method: "POST",
      headers: { cookie: cookieC, "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    },
  );
  await assertStatus(approveDByC, 200);
  const acceptD = await api(
    `/api/circles/proposals/${proposalDId}/respond`,
    {
      method: "POST",
      headers: { cookie: cookieD, "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    },
  );
  await assertStatus(acceptD, 200);
  const acceptE = await api(
    `/api/circles/proposals/${proposalEId}/respond`,
    {
      method: "POST",
      headers: { cookie: cookieE, "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    },
  );
  await assertStatus(acceptE, 200);
  const joinedLaterApproval = await pool.query(
    `select 1
       from circle_proposal_approvals
      where proposal_id = $1 and user_id = $2`,
    [proposalEId, ids.get(users[3].email)],
  );
  assert.equal(joinedLaterApproval.rowCount, 0);

  const capacityCircleId = randomUUID();
  const proposalJId = randomUUID();
  const proposalKId = randomUUID();
  const capacityCreatedAt = new Date();
  const capacityClient = await pool.connect();
  try {
    await capacityClient.query("begin");
    await capacityClient.query(
      `insert into circles
        (id, name, description, status, created_by_id, created_at, updated_at)
       values ($1, $2, $3, 'active', $4, $5, $5)`,
      [
        capacityCircleId,
        `并发容量测试 ${suffix}`,
        "验证两个候选人同时确认时不会突破十人上限。",
        ids.get(users[0].email),
        capacityCreatedAt,
      ],
    );
    for (const [memberIndex, person] of users.slice(0, 9).entries()) {
      const relationId = randomUUID();
      const periodId = randomUUID();
      await capacityClient.query(
        `insert into circle_member_relations
          (id, circle_id, user_id, history_visible_from, created_at)
         values ($1, $2, $3, $4, $4)`,
        [
          relationId,
          capacityCircleId,
          ids.get(person.email),
          capacityCreatedAt,
        ],
      );
      await capacityClient.query(
        `insert into circle_membership_periods
          (id, relation_id, joined_at, last_viewed_at)
         values ($1, $2, $3, $3)`,
        [periodId, relationId, capacityCreatedAt],
      );
      await capacityClient.query(
        `update circle_member_relations
            set active_period_id = $1, active_slot = $2
          where id = $3`,
        [periodId, memberIndex + 1, relationId],
      );
    }
    for (const [proposalId, candidate] of [
      [proposalJId, users[9]],
      [proposalKId, users[10]],
    ]) {
      await capacityClient.query(
        `insert into circle_join_proposals
          (id, circle_id, candidate_id, proposer_id, kind, allow_history,
           status, expires_at, created_at)
         values ($1, $2, $3, $4, 'add', true, 'awaiting_candidate', $5, $6)`,
        [
          proposalId,
          capacityCircleId,
          ids.get(candidate.email),
          ids.get(users[0].email),
          new Date(capacityCreatedAt.getTime() + 3 * 24 * 60 * 60 * 1000),
          capacityCreatedAt,
        ],
      );
    }
    await capacityClient.query("commit");
  } catch (error) {
    await capacityClient.query("rollback");
    throw error;
  } finally {
    capacityClient.release();
  }

  const [acceptJ, acceptK] = await Promise.all([
    api(`/api/circles/proposals/${proposalJId}/respond`, {
      method: "POST",
      headers: { cookie: cookieJ, "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    }),
    api(`/api/circles/proposals/${proposalKId}/respond`, {
      method: "POST",
      headers: { cookie: cookieK, "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    }),
  ]);
  assert.deepEqual(
    [acceptJ.status, acceptK.status].sort((left, right) => left - right),
    [200, 400],
  );
  const rejectedCapacityResponse = acceptJ.status === 400 ? acceptJ : acceptK;
  assert.match(
    (await rejectedCapacityResponse.json()).error,
    /最多 10 位活跃成员/,
  );
  const activeCapacityMembers = await pool.query(
    `select count(*)::int as count
       from circle_member_relations
      where circle_id = $1 and active_period_id is not null`,
    [capacityCircleId],
  );
  assert.equal(activeCapacityMembers.rows[0]?.count, 10);
  const capacityProposalStatuses = await pool.query(
    `select status, count(*)::int as count
       from circle_join_proposals
      where id = any($1::text[])
      group by status`,
    [[proposalJId, proposalKId]],
  );
  assert.deepEqual(
    new Map(
      capacityProposalStatuses.rows.map((row) => [row.status, row.count]),
    ),
    new Map([
      ["accepted", 1],
      ["awaiting_candidate", 1],
    ]),
  );
  const rejectedCandidate = await pool.query(
    `select candidate_id
       from circle_join_proposals
      where id = any($1::text[]) and status = 'awaiting_candidate'`,
    [[proposalJId, proposalKId]],
  );
  assert.equal(rejectedCandidate.rowCount, 1);
  const slotConstraintClient = await pool.connect();
  try {
    const relationId = randomUUID();
    const periodId = randomUUID();
    await slotConstraintClient.query("begin");
    await slotConstraintClient.query(
      `insert into circle_member_relations
        (id, circle_id, user_id, history_visible_from, created_at)
       values ($1, $2, $3, $4, $4)`,
      [
        relationId,
        capacityCircleId,
        rejectedCandidate.rows[0].candidate_id,
        capacityCreatedAt,
      ],
    );
    await slotConstraintClient.query(
      `insert into circle_membership_periods
        (id, relation_id, joined_at, last_viewed_at)
       values ($1, $2, $3, $3)`,
      [periodId, relationId, capacityCreatedAt],
    );
    await assert.rejects(
      slotConstraintClient.query(
        `update circle_member_relations
            set active_period_id = $1, active_slot = 11
          where id = $2`,
        [periodId, relationId],
      ),
      /active_slot_range|check constraint/i,
    );
  } finally {
    await slotConstraintClient.query("rollback").catch(() => undefined);
    slotConstraintClient.release();
  }

  for (const post of createdPostIds) {
    const response = await api(`/api/posts/${post.id}`, {
      method: "DELETE",
      headers: { cookie: post.cookie },
    });
    await assertStatus(response, 200);
  }
  createdPostIds.length = 0;
  console.log(
    "Smoke test passed: auth, media safety and expired-orphan cleanup, permission-revalidated ETag caching, temporary and draft media boundaries, multi-draft listing, optimistic draft conflicts and conflict forking, owner revocation after archive deletion, personal visibility, participant revalidation, atomic edit conflicts, early-or-24-hour circle creation settlement, durable circle membership, frozen exit archives, activity-independent historical ordering, rejoin restoration, approval membership changes, direct sole-member invitations, serialized and database-constrained circle capacity, deferred database constraints, archive deletion, and cleanup.",
  );
} finally {
  const rows = await pool.query(
    `select id from "user" where email = any($1::text[])`,
    [users.map((person) => person.email)],
  );
  const userIds = rows.rows.map((row) => row.id);
  if (userIds.length > 0) {
    const media = await pool.query(
      `select ma.storage_key, mus.incoming_key
       from media_assets ma
       left join media_upload_sessions mus on mus.media_id = ma.id
       where ma.owner_id = any($1::text[])`,
      [userIds],
    );
    const variants = await pool.query(
      `select mv.storage_key
       from media_variants mv
       join media_assets ma on ma.id = mv.media_id
       where ma.owner_id = any($1::text[])`,
      [userIds],
    );
    await pool.query(`delete from posts where author_id = any($1::text[])`, [userIds]);
    await pool.query(`delete from circles where created_by_id = any($1::text[])`, [userIds]);
    await pool.query(
      `delete from circle_creation_requests where creator_id = any($1::text[])`,
      [userIds],
    );
    await pool.query(`delete from media_assets where owner_id = any($1::text[])`, [userIds]);
    await pool.query(
      `delete from friendships where user_one_id = any($1::text[]) or user_two_id = any($1::text[])`,
      [userIds],
    );
    await pool.query(`delete from "user" where id = any($1::text[])`, [userIds]);
    await Promise.all(
      [
        ...media.rows.flatMap((row) => [row.storage_key, row.incoming_key]),
        ...variants.rows.map((row) => row.storage_key),
      ]
        .filter(Boolean)
        .map((storageKey) =>
          rm(path.resolve(".data/media", storageKey), { force: true }),
        ),
    );
  }
  await pool.end();
}
