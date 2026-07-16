# 技术架构与部署

本文件记录运行架构、代码目录、本地开发和自托管部署边界。数据库细节见独立数据库文档。

## 技术架构

- Next.js 16 + React 19 + TypeScript。
- PostgreSQL 17。
- Drizzle ORM 与 SQL 迁移文件。
- Better Auth 管理密码哈希、数据库会话和安全 Cookie。
- 标准 Node.js 自托管运行方式，生产构建支持 standalone 输出。
- 当前本地开发和单机测试使用服务器私有上传目录，文件不放进 `public/`，必须经过权限接口读取。
- 正式长期部署应将存储适配层切换到私有对象存储，不把用户媒体长期堆在应用服务器磁盘中。
- 正式版本面向自租服务器上的标准 Next.js、Node.js、PostgreSQL 和对象存储部署。
## 项目结构

```text
along/
├── app/                    # Next.js 页面、布局与服务端 API
│   ├── api/                # 认证、注册、初始化和共同邀请接口
│   ├── components/         # 共享页眉外壳、分段控件和动态内容组件
│   ├── circles/            # 圈子列表、共同动态、成员周期和圈内发布
│   ├── feed/               # 当前用户有权查看的完整动态流
│   ├── friends/            # 直接朋友列表、搜索与私有备注
│   ├── home/               # 登录后的真实数据库主页与发布入口
│   ├── invites/            # 共同邀请管理页面
│   ├── notifications/      # 站内通知入口与后续通知列表
│   ├── profile/            # 本人及朋友的个人空间
│   └── setup/              # 首次部署初始化页面
├── db/                     # Drizzle 数据库连接与表结构
├── drizzle/                # 可提交、可追踪的 PostgreSQL SQL 迁移
├── lib/                    # 认证、邀请校验和关系查询等服务端逻辑
├── public/                 # Logo 等浏览器直接访问的品牌静态资源
├── scripts/                # 本地启动与 standalone 构建辅助脚本
├── .env.example            # 环境变量模板，不含真实密码和密钥
├── next.config.ts          # Next.js standalone 自托管配置
└── package.json            # pnpm 脚本、依赖和当前版本号
```

当前代码边界：

- 账号、会话、朋友关系、邀请、个人资料、动态、服务端草稿及媒体元数据都连接 PostgreSQL，并通过 `drizzle/` 中的迁移维护。
- 小圈子使用独立成员周期和加入提案表；同一成员多次加入不会覆盖过去的加入与退出记录。
- 图片文件默认位于 `.data/uploads`，该目录不提交 Git；数据库只保存随机存储键和必要元数据。
- 草稿通过独立的 `/api/drafts` 服务端接口读写；首页首次服务端渲染会读取当前账号的最新草稿并直接传给发布器，展开操作不再重复请求，因此切换设备后重新进入或刷新首页即可继续编辑。草稿图片继续走私有媒体权限接口，发布事务成功后转为正式内容关联，放弃草稿时清理未被正式内容使用的文件。
- 首页动态数据拆为独立的 React `Suspense` 区域，并用结构对应的 Skeleton 作为真实加载回退；服务端数据已准备好时不人为延迟。
- 圈子未读位置按成员期保存在 PostgreSQL，由用户实际进入圈子后通过受保护接口更新，首页服务端查询只返回聚合后的可见未读状态。
- `.env.local`、构建产物、依赖目录和本地数据库数据不会提交到 GitHub。
- 项目统一使用 pnpm，因此仓库只保留 `pnpm-lock.yaml`，避免不同包管理器的锁文件互相冲突。
## 开发原则

- 身份、关系和权限优先于展示功能。
- 每个读取和写入接口都执行服务端权限校验。
- 图片原图与缩略图分开处理，避免移动端加载过重。
- 精确位置、联系方式等敏感信息默认不公开。
- 内容只保存当前版本和最后编辑信息；删除、权限变更、紧急隐藏等敏感操作保留不可篡改的审计元数据。
- 数据结构应允许未来迁移到独立服务器或其他云平台。
- 界面导航暂不锁死，根据真实内容和设备测试持续调整。
- 一级页眉统一由共享组件提供。桌面和平板采用“一体化头像 + 首页/圈子/朋友/个人分段导航 / 通知”，手机采用“头像与主要显示名 / 通知”；页眉不放 Logo，圆形品牌图标由根布局配置为浏览器 favicon。朋友列表和邀请管理必须是独立路由。
- 用户资料将 Better Auth 兼容的 `name` 保留为主要显示名缓存，同时以独立的必填 `real_name` 和可选 `nickname` 表达真实业务含义。朋友备注按关系方向保存，圈子昵称按成员期保存，避免一个全局字段承担多种身份。
## 本地开发

需要 Node.js 22.13.0 或更高版本，以及 PostgreSQL 17。

首次安装 PostgreSQL 后启动服务并创建开发数据库：

```bash
brew services start postgresql@17
createdb friend_nest
```

从 `.env.example` 准备本机 `.env.local`，至少设置数据库地址、认证密钥、内部注册密钥和创始成员创建密钥。`.env.local` 不会提交到 Git。

当前图片目录固定为 `.data/uploads`。生产服务器需要把 `.data` 放在持久化磁盘并纳入备份，直到对象存储适配完成。

安装依赖并应用数据库迁移：

```bash
pnpm install
pnpm run db:migrate
pnpm run dev
```

在当前这台开发电脑上，也可以直接运行已经准备好的启动脚本：

```bash
./scripts/start-local.sh
```

该脚本会启动 PostgreSQL 与固定在 `3000` 端口的 Next.js 开发服务器，并在服务器启动后自动打开 `http://localhost:3000`。

手机与电脑连接同一局域网时，可以通过电脑的局域网 IP 和端口 `3000` 访问。该地址还需要加入 `.env.local` 的 `TRUSTED_ORIGINS`，更换网络导致 IP 改变后应同步更新。

使用 Cloudflare Quick Tunnel 在外网临时测试时，应用会自动信任 `https://*.trycloudflare.com`，不需要在每次生成随机域名后修改 `.env.local`。`TRUSTED_ORIGINS` 仍用于配置本机、局域网地址和以后购买的正式域名，多个地址使用英文逗号分隔。例如：

```env
TRUSTED_ORIGINS=http://localhost:3000,http://192.168.1.10:3000,https://along.example.com
```

Quick Tunnel 每次重新启动都可能生成不同域名，但 `*.trycloudflare.com` 通配规则会继续生效；应用本身重新启动后即可使用新的隧道地址。该规则只覆盖 Cloudflare 的 HTTPS 临时隧道子域名，不会信任任意网站。正式服务器应配置固定域名，并把 `BETTER_AUTH_URL` 和 `TRUSTED_ORIGINS` 都改为正式的 HTTPS 地址。

首次打开 `/setup`，使用 `BOOTSTRAP_KEY` 先创建管理员账号，再创建第二位普通创始成员。两人会自动成为朋友。创建完成后，普通新成员只能通过至少两位朋友确认生成的邀请码注册。

构建检查：

```bash
pnpm run test
pnpm run build
```

本地服务已经启动时，可以额外运行完整业务冒烟测试。测试会临时创建两位账号和朋友关系，验证登录、动态权限、私有图片、EXIF 清除和资料修改，结束后自动清理：

```bash
pnpm run test:smoke
```

准备上传 GitHub 前可运行：

```bash
pnpm run test
pnpm run build
git status --short
```

确认 `.env.local` 没有出现在 Git 状态中再提交。服务器部署时应在服务器上单独创建环境变量和 PostgreSQL 数据库，不能把本机 `.env.local` 或数据库文件上传到仓库。

---

产品、权限或交互共识应更新到对应专题文档；本文件只维护技术架构、开发与部署方式。

---

[返回项目 README](../README.md)
