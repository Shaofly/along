# 媒体上传与图片规格

本文件是图片上传、处理、存储、访问和迁移规则的唯一权威说明。照片查看器的视觉与手势规范见 [UI 与交互规范](../ux.md)。

## 目标与边界

- 未清理的手机原文件只作为短期处理输入，永远不能成为页面展示或下载的降级资源。
- 每张图片对应一条逻辑媒体记录，并持久化生成三个独立变体；页面不在每次查看时临时转码。
- PostgreSQL 只保存对象 Key、尺寸、类型、字节数和处理状态，不保存图片二进制或永久公开链接。
- 所有媒体读取先经过内容权限校验；对象存储必须保持私有。

## 三种正式规格

| 变体 | 用途 | 当前本地规格 |
| --- | --- | --- |
| `thumbnail` | 动态自然拼贴、首页照片摘要 | 自动转正，长边不超过 720px，WebP quality 82 |
| `preview` | 照片查看器默认展示 | 自动转正，长边不超过 1920px，WebP quality 88 |
| `hd` | 用户主动“查看原图”或下载 | 保留安全处理后的原始尺寸；无透明通道使用 JPEG quality 95，有透明通道使用 PNG |

这里的“原图”指清除隐私元数据、自动转正并重新编码后的安全高清图，不是手机文件的字节级原件。查看器默认只读取 `preview`；只有用户主动点击“查看原图”或下载时才读取 `hd`。

## 图片处理

本地 `LocalSharpProcessor` 对所有正式变体执行：

1. 解码并依据 EXIF Orientation 自动转正。
2. 转换到正常浏览器显示所需的 sRGB 色彩空间。
3. 重新编码为目标格式。
4. 不复制 EXIF、GPS、XMP、IPTC、设备型号、拍摄软件等输入元数据。

图片地点只来自用户主动确认的业务字段，不能从照片 GPS 自动写入地图。当前输入限制为单张 12MB、最多 5000 万像素，支持 JPEG、PNG、WebP、HEIC 和 HEIF；具体能否解码 HEIC 取决于部署环境中的 Sharp/libvips 能力。

## 本地生命周期

```text
浏览器上传
→ PRIVATE_DATA_ROOT/media/incoming/{userId}/{uploadSessionId}/source.ext
→ 创建 media_asset、upload_session、processing_job
→ Next.js after() 异步调用 Sharp
→ PRIVATE_DATA_ROOT/media/media/{mediaId}/thumbnail-*.webp
→ PRIVATE_DATA_ROOT/media/media/{mediaId}/preview-*.webp
→ PRIVATE_DATA_ROOT/media/media/{mediaId}/hd-*.jpg|png
→ 数据库事务标记 ready
→ 删除 incoming 临时原文件
```

上传接口返回时表示文件已经完整到达本地私有目录、处理任务已经创建，随后可以创建状态为 `publishing` 的动态。服务重启后，受保护的媒体维护接口会继续领取未完成任务；过期、失败或未关联内容的临时文件最多保留 24 小时。

维护任务还会分批识别尚无 `media_variants` 记录的旧媒体，并在不影响现有动态读取的前提下生成三个正式规格。只有数据库原子切换成功后才删除旧单文件；处理失败时继续保留旧文件和原有可见性，供下一次维护重试。旧媒体兼容响应也使用浏览器私有不可变缓存，避免动态缩略图和查看器重复传输同一个大文件。

## 动态发布状态

```text
uploaded → processing → ready
                         └→ 动态 published
              └→ failed ─→ 动态 failed
```

- 无图片或所有图片已经 `ready`：动态直接 `published`。
- 至少一张图片仍在处理：动态为 `publishing`，作者可以看到处理提示，其他用户不可见。
- 任一图片处理失败：动态为 `failed`，不会缺图公开；正文和关联关系继续保留，供后续重试或重新选择图片。
- `published_at` 记录真正对其他用户开放的时间，`created_at` 仍记录最初创建时间。

## 正式环境目标

正式接入腾讯云上海 COS 和数据万象后，图片本体不经过香港应用服务器：

```text
浏览器申请短期、最小权限凭证
→ 原文件直传私有 incoming/{userId}/{uploadId}/source
→ 香港应用确认对象 Key、ETag、大小、类型和权限
→ 创建数据万象持久化处理任务
→ 生成 thumbnail、preview、hd 三个正式私有对象
→ 回写变体和任务状态
→ 删除 incoming 原文件
```

香港服务器只处理身份、权限、短期凭证、任务指令、对象元数据和数据库记录，不下载或转发图片本体。COS 生命周期规则还要对 `incoming/` 配置 24 小时自动删除，作为应用清理失败时的第二道保障。

代码使用泛型 `ImageProcessor<TInput, TVariant>` 隔离处理方式：

- `LocalSharpProcessor`：输入为本地 `Buffer`，输出为待写入本地存储的字节变体。
- `TencentCiProcessor`：未来输入为私有 COS 对象描述，输出为数据万象持久化后的对象变体，不要求香港服务器获取图片字节。

腾讯云适配器、STS 策略、CORS、回调验签和生命周期规则尚未启用；拿到正式存储桶、地域、域名和密钥配置后再实现，不能在本地代码中写死长期密钥。

## 权限与响应

- `thumbnail`、`preview`、`hd` 都复用同一逻辑媒体的内容权限。
- 本地环境通过受保护 Route Handler 返回字节；正式环境由服务端校验后返回短期签名地址。
- 数据库不保存签名地址，日志不记录可长期复用的下载链接。
- 下载文件名根据实际变体 MIME 生成扩展名，避免把 JPEG 安全高清图错误命名为 HEIC。
- 删除媒体时同时清理三个正式变体、上传会话、处理任务和残留 incoming 文件。

---

[返回文档索引](../README.md)
