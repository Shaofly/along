# 数据库规范

PostgreSQL 是圆个圈关系、权限和内容元数据的唯一事实来源。Drizzle Schema 描述当前结构，`drizzle/` 中的顺序 SQL 文件描述结构如何演进；两者必须同步提交。

## 领域划分

| 领域 | 表 |
| --- | --- |
| 认证 | `user`、`session`、`account`、`verification` |
| 邀请与关系 | `invitations`、`invitation_sponsors`、`friendships`、`friend_remarks` |
| 小圈子 | `circles`、`circle_membership_periods`、`circle_join_proposals`、`circle_proposal_approvals`、`circle_events` |
| 内容 | `posts`、`post_viewers`、`circle_post_snapshots`、`drafts`、`draft_viewers` |
| 媒体 | `media_assets`、`media_variants`、`media_upload_sessions`、`media_processing_jobs`、`post_media`、`draft_media` |

二进制图片不进入 PostgreSQL。数据库只保存随机存储键、归属、类型、大小、尺寸、处理状态和内容关联。

## 人物名称与关系身份

- `user.real_name` 保存必填真名，`user.nickname` 保存可选昵称；Better Auth 使用的 `user.name` 保留为主要显示名缓存，并在资料修改时与昵称或真名同步。
- 现有用户迁移时将原 `name` 复制为 `real_name`，`nickname` 留空，保证旧账号无需重新注册且不会丢失身份。
- `friend_remarks` 以“设置者 + 被备注的朋友”为唯一键保存单向私有备注。备注不放进 `friendships` 的单个共享字段，避免双方互相覆盖。
- `circle_membership_periods.circle_nickname` 保存该次成员期的圈子昵称。退出与再次加入是不同成员期，因此可以保留历史身份并在新周期重新设置。
- `circle_membership_periods.last_viewed_at` 保存该次活跃成员期最近真正进入圈子的时间；退出后旧周期不再更新，再次加入从新周期重新计算未读。
- `user.bio` 是个人简介的唯一字段，首页可以把它按单行个性签名展示，不增加重复的 `signature` 字段。
- 所有姓名字段在写入时去除首尾空白；真名不得为空，昵称、备注和圈子昵称为空字符串时统一转为 `NULL`。

## 命名与类型

- 数据库对象使用 `snake_case`，TypeScript 字段使用 `camelCase`。
- 主键当前统一为应用生成的文本 ID，时间统一使用带时区的 `timestamptz`。
- 有限且稳定的状态使用 PostgreSQL enum；自由正文和可扩展系统事件使用 text。
- 关系表必须有外键，删除策略必须显式选择；当前不提供账号删除，因此涉及历史归属的用户外键默认限制删除。
- 所有多列唯一关系和常用权限查询路径必须有命名明确的索引。

## 数据库不变量

迁移 `0006_dapper_thor.sql` 将以下规则下沉到 PostgreSQL：

- 邮箱统一为去除首尾空白的小写形式，并建立大小写不敏感唯一索引。
- 同一认证提供方账号只能绑定一次；好友双方必须不同，并通过 `least` / `greatest` 无序唯一索引阻止反向重复关系。
- 邀请人数限制为 2 至 5，使用状态与使用人、使用时间必须一致。
- 圈子名称不能为空，名称和简介长度受限，解散状态必须带解散时间。
- 成员退出时间不能早于加入时间，同一用户在一个圈子里最多只有一个活跃周期。
- 成员最近查看时间不能早于加入时间；圈子未读由服务端按活跃成员期的查看时间、内容权限和事件时间计算。
- 同一圈子和候选人最多只有一项待处理加入提案，提案状态与解决时间一致。
- 个人内容不能使用圈内共同管理，圈子内容在通用可见范围字段中必须保持 private，由圈子成员周期单独授权。
- 草稿沿用正式内容的可见范围与管理方式约束，但始终只允许作者通过草稿接口读取；指定查看者和圈子仅用于恢复发布设置，不会让其他人提前看到草稿。
- 每个媒体资源最多关联一条草稿，草稿内位置保持 0 至 19 唯一；草稿被放弃时，未进入正式内容的私有媒体一并清理，发布成功时只删除草稿关系而保留正式媒体。
- 正文长度、媒体字节数和单条内容的媒体排序位置有数据库级边界。
- `media_assets` 是逻辑资源，`media_variants` 以“媒体 + 变体类型”为主键保存 `thumbnail`、`preview`、`hd` 三个正式对象。
- `media_upload_sessions` 保存 incoming Key、预期类型和大小以及 24 小时过期时间；`media_processing_jobs` 保存处理提供方、尝试次数和失败原因。
- 媒体只有 `ready` 状态才必须带 `ready_at`，失败状态必须带失败代码；变体字节数和尺寸必须为正数。
- 动态使用 `publishing`、`published`、`failed` 表达图片处理生命周期；只有 `published` 必须带 `published_at`，非作者只能查询已发布动态。

跨表规则，例如“空正文必须至少有一张图片”“selected 动态必须至少有一位查看者”“全部关联媒体 ready 后才能把动态变为 published”，无法用普通 CHECK 可靠表达，继续由事务内的服务端业务层验证。

## 迁移规则

1. 只修改 `db/schema.ts`，不要手写修改已发布迁移。
2. 运行 `pnpm run db:generate` 生成新的顺序迁移。
3. 审查 SQL，确认没有意外删表、改类型或丢数据操作。
4. 在现有开发数据上运行 `pnpm run db:migrate`。
5. 运行测试和业务冒烟测试，再同时提交 Schema、SQL 与 `drizzle/meta`。

生产迁移前必须完成数据库备份。多实例部署时只允许一个受控迁移任务执行 DDL，应用实例不应在启动时自动改表。

## 权限与备份

- 本地开发可使用单一开发账号；正式环境应分离迁移、运行、只读备份和人工运维账号。
- 应用账号不得拥有创建角色、创建数据库或绕过行级权限的能力。
- PostgreSQL 备份必须加密、定期恢复演练，并与媒体对象的备份时间点协调。
- 当前权限由服务端查询统一实施，尚未启用 PostgreSQL Row Level Security；启用 RLS 前需先完成连接池会话身份传递设计。

---

[返回文档索引](README.md)
