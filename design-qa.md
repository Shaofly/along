# 手机个人主页 Design QA

## Comparison target

- source visual truth path: `/Users/msf/.codex/generated_images/019f75a6-efc1-7853-9ec7-29266445f323/call_J0n3gBRAxrIL9N5zhO0T5fCP.png`
- browser-rendered implementation screenshot path: `/tmp/along-profile-mobile-375x812-final.jpg`
- protected-state implementation screenshot path: `/tmp/along-profile-mobile-375x812-protected.jpg`
- route: `http://localhost:3000/profile/JffWWzlWM3CLfbpTplYUaroBMKTOdlkA`
- viewport: `375 × 812` CSS pixels
- state: 本人个人主页、真实封面和资料、账号信息折叠；另捕获隐私保护开启状态
- full-view comparison evidence: `/tmp/along-profile-mobile-comparison-final.png`
- focused toolbar comparison evidence: `/tmp/along-profile-mobile-toolbar-comparison-final.png`

完整视图用于判断封面比例、透明页眉、身份区、操作区和内容区节奏；工具栏局部另行放大比较了按钮、图标、三等分、状态底色和筛选栏，因此不需要第三个局部裁切。

## Findings

最终对照中没有仍需处理的 P0、P1 或 P2 问题。

- 字体和层级：实现继续使用项目既有中文无衬线体系；真名、昵称说明、正文与小型工具文字的层级接近参考图，没有新增来源不明的字体，375 和 320 宽度下没有异常逐字换行。
- 间距和布局：封面改为手机固定 `8:5`，主身份落在渐隐末段；本人操作保持同高近似等宽；草稿、隐私保护、账号信息在 320、375、390 三档都是真正三等分且无横向溢出。
- 颜色和视觉 token：沿用 Along 的暖白、草绿、蜜桃和鼠尾草选中态；页眉透明度允许封面透出，没有紫色渐变、玻璃卡片墙或额外重阴影。
- 图片质量：使用现有受保护封面和头像资源，按已保存焦点裁切；没有用 CSS 图形、占位块或自制 SVG 替代可见资产。
- 文案和内容：实现显示真实用户资料和真实动态。参考图中的“草稿 3”与三个公共筛选是示意状态；本人真实状态没有草稿计数，并按既定产品规则额外显示“私密动态”，属于预期数据差异。
- 图标和交互：使用项目现有 Lucide 图标。隐私锁图标和文字同步交叉切换；账号信息使用人物图标，展开时采用与隐私保护一致的选中态。

## Comparison history

### Iteration 1

- earlier finding [P2]: 初版手机封面仍是 `16:7`，导致主身份和整个工具区明显高于参考图，改变了首屏主要区域比例。
- fix: 手机主页和手机编辑器封面改为固定 `8:5`，保留多段渐隐和焦点裁切。
- post-fix evidence: `/tmp/along-profile-mobile-comparison-final.png`

- earlier finding [P2]: 工具栏沿用隐式网格后，前两项实际只有六分之一宽，出现隐私文字换行；账号详情展开后只有 125 像素宽。
- fix: 使用明确的三列网格，前两项容器跨前两列；账号按钮改为可访问的独立展开按钮，详情作为下一行整行面板。
- post-fix evidence: `/tmp/along-profile-mobile-toolbar-comparison-final.png`

- earlier finding [P2]: 隐私状态直接替换图标和文字，没有过渡；账号入口仍使用方向字符；手机资料编辑页头像区偏左。
- fix: 加入支持减少动态偏好的图标缩放/虚化交叉切换和文字位移/虚化交叉切换；账号入口改用人物图标与统一选中态；头像标题、选择入口和预览改为中轴布局。
- post-fix evidence: `/tmp/along-profile-mobile-375x812-protected.jpg`；浏览器实测编辑页头像区居中。

## Primary interactions tested

- 个人主页从顶部滚动 500 像素后，页眉中间由“个人”切换为小头像和主要显示名；内容筛选继续吸顶。
- 隐私保护从关闭切到开启，再切回原状态；`aria-pressed`、图标状态、文字状态和持久化结果一致。
- 账号信息展开与收起；展开按钮出现选中态，详情宽度为完整视口，可看到登录邮箱和用户编号。
- 手机资料编辑页打开成功；头像选择区居中，封面使用 `8:5` 预览。
- 响应式复核：`320 × 700`、`375 × 812`、`390 × 844`；页面 `scrollWidth` 均未超过视口。
- 浏览器控制台错误检查：没有应用页面的 error 或 warning。

## Follow-up polish

- [P3] 参考视觉只有三个公共筛选，而本人页必须额外显示“私密动态”；如果以后筛选继续增加，应改为可横向滚动或二级筛选，避免持续压缩字距。

final result: passed
