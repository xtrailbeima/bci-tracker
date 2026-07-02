# BCI Tracker v5 Requirements

> 当前文档是 BCI Tracker 的主需求规格，用于校准 v5 已实现能力，并定义下一版需求边界、验收标准和验证方式。
> 本文档只描述需求与接口，不改变运行时代码、数据库 schema 或部署脚本。

## 1. 产品定位

BCI Tracker v5 是面向 NeuroWorm 团队的 BCI 行业情报工作台，服务于投资决策、竞品追踪和技术趋势判断。系统不只是信息聚合页，而是把全球论文、预印本、产业新闻、视频和手动导入材料统一入库，再通过重要性评分、专题归集和 AI 投资分析形成可执行的情报流。

核心用户是 NeuroWorm 团队成员，尤其是需要快速判断行业信号的创始人、投资分析和战略/BD 角色。

核心成功标准：

- 用户能在一个工作台内浏览、搜索、过滤并打开高价值 BCI 动态。
- 用户能基于重要性评分优先查看融资、监管、临床、头部竞品和技术突破。
- 用户能查看 DeepSeek 生成的每日速递、每周周报和单篇投资分析。
- 用户能把外部链接手动导入系统，并归集到预设或自定义专题。
- 系统能给合伙人和核心公司高管开放受控访问，按三档权限限制可读、可改、可授权的范围。
- 系统在外部网络或 API key 不可用时仍有明确降级行为，不崩溃、不暴露敏感信息。

## 2. v5 当前能力基线

### 2.1 信息流

- 聚合来源：PubMed、arXiv、Nature RSS、Science RSS、Neuron RSS、Google News、YouTube。
- 支持分类：`journal`、`preprint`、`news`、`video`。
- 支持分页查询、关键词搜索、分类过滤、来源过滤、时间范围过滤和按重要性/日期排序。
- 前端展示英文标题、离线词典中文标题、摘要、作者、来源、日期、重要性等级和原文链接。

### 2.2 重要性评分

- 评分维度：来源权威性、时效性、高价值关键词。
- 高权重内容包括：Neuralink、Synchron、Blackrock Neurotech、Paradromics、Axoft、Merge Labs、Nudge、Forest Neurotech、SPIRE Therapeutics、融资轮次、FDA/临床里程碑、柔性电极、超声神经调控等。
- 输出字段：`importance` 为 0-100，`importanceLevel` 为 `critical`、`high`、`medium`、`low`。

### 2.3 专题追踪

- 数据库内置预设专题：Neuralink 动态、Synchron 进展、BCI 融资事件、柔性电极技术、FDA/监管审批、非侵入式 BCI。
- 支持创建自定义专题、删除非预设专题、手动把文章加入专题。
- 抓取或导入后会按专题规则自动归集。
- 当前专题规则写在数据库初始化逻辑中，前端暂不支持编辑规则。

### 2.4 URL 导入

- 前端提供导入弹窗，支持粘贴文章 URL。
- 后端从 HTML meta、`article`、`main`、JSON-LD 等位置提取标题、摘要、日期、作者和来源。
- 来源识别覆盖微信公众号、X/Twitter、YouTube、Nature、Science、PubMed、arXiv、bioRxiv、知乎、36 氪、头条及普通域名。
- 导入后执行标题翻译、重要性评分、入库和自动专题归集。

### 2.5 AI 分析

- DeepSeek 是当前前端 AI 分析主力：
  - 每日行业速递：投资信号、重点动态、板块总结、天使投资风向标。
  - 每周行业周报：本周态势、里程碑、板块复盘、融资格局、战略指南。
  - 单篇文章分析：核心摘要、关键发现、投资价值、市场影响、竞争洞察、评分和标签。
- 旧版 Hunyuan `/api/summary` 已退役为本地兼容简报接口，不再调用已下线的 Hunyuan 模型。
- `gemini.js` 模块存在，包含 Gemini 行业简报和单篇分析能力，但当前主路由未实际挂载为前端调用路径。

### 2.6 邮件简报

- 支持前端订阅每日简报。
- 每日 08:00 北京时间发送邮件简报。
- 邮件内容包含 24 小时新增条目、重点内容、论文/预印本/产业动态和趋势关键词。
- SMTP 使用 Gmail App Password，通过环境变量配置。

## 3. 约束与非目标

必须保持：

- 前端使用纯 HTML/CSS/JS，不引入 React、Vue、Angular 等框架。
- 数据库继续使用 SQLite 和 `better-sqlite3`，不更换数据库。
- `DEMO_DATA` 必须保留，作为网络不可达时的降级安全网。
- 新增样式必须使用 CSS 变量，不硬编码主题颜色。
- API key 只能从 `.env`/环境变量读取，不能写入代码、日志或提交记录。
- 公共 API 不暴露内部 stack trace、API key、SMTP 凭据或用户敏感数据。

本需求更新不包含：

- 不新增数据库表或迁移。
- 不改部署脚本。
- 不清理未跟踪的 `bci-tracker/` 旧版/副本目录。
- 不把 `gemini.js` 接入生产路由；这属于后续实现项。

## 4. Public Interfaces

### 4.1 API 清单

| 方法 | 路径 | 用途 | 主要参数 | 认证/限流 | 降级行为 | 前端使用位置 |
|------|------|------|----------|-----------|----------|--------------|
| GET | `/api/auth/me` | 当前登录用户 | 无 | 未登录返回 401 | 返回 `setupRequired` 提示 | 登录态初始化 |
| POST | `/api/auth/login` | 登录并写入 HttpOnly session cookie | `email`, `password` | 8 次/分钟 | 401 JSON error | 登录页 |
| POST | `/api/auth/logout` | 退出登录 | 无 | 登录用户 | 清理 cookie | 顶部退出 |
| POST | `/api/auth/change-password` | 当前用户修改自己的密码 | `password` | 登录用户 | 400 JSON error | 后端接口，前端暂未主路径使用 |
| GET | `/api/auth/users` | 用户列表 | 无 | owner | 403 JSON error | 用户管理 |
| POST | `/api/auth/users` | 创建授权用户 | `email`, `password`, `role`, `name` | owner | 400/409 JSON error | 用户管理 |
| PATCH | `/api/auth/users/:id` | 更新用户、角色、状态或密码 | `email`, `name`, `role`, `active`, `password` | owner | 400/404 JSON error | 用户管理 |
| GET | `/api/auth/audit` | 审计日志 | `limit` | owner | 403 JSON error | 后台审计 |
| GET | `/api/all` | 分页查询文章；reader 返回已脱敏条目 | `q`, `category`, `source`, `sort`, `page`, `limit`, `from`, `to` | owner/operator/reader；reader 不返回精确评分和抓取诊断字段 | 查询失败返回空列表结构 | 信息流 |
| GET | `/api/stats` | 获取文章统计 | 无 | owner/operator/reader | 返回 0 统计 | 顶部统计栏 |
| GET | `/api/source-health` | 获取数据源抓取健康度 | 无 | owner/operator | 返回空数组 | 后续后台健康看板 |
| GET | `/api/trending` | 热门关键词 | `period=week/month/quarter/year` | owner/operator/reader | 返回空数组 | 趋势关键词面板 |
| GET | `/api/sources` | 来源列表 | `category` | owner/operator/reader | 返回空数组 | 来源过滤 |
| GET | `/api/collections` | 专题列表 | 无 | owner/operator/reader | 500 JSON error | 专题追踪 |
| GET | `/api/collections/:id` | 专题内容；reader 返回已脱敏条目 | `page`, `limit` | owner/operator/reader；reader 不返回精确评分和抓取诊断字段 | 500 JSON error | 专题详情 |
| POST | `/api/collections` | 创建专题 | `name`, `icon` | owner/operator | 400/500 JSON error | 新建专题弹窗 |
| POST | `/api/collections/:id/add` | 添加文章到专题 | `articleId` | owner/operator | 500 JSON error | 文章归集弹窗 |
| DELETE | `/api/collections/:id` | 删除非预设专题 | 无 | owner/operator | 500 JSON error | 专题追踪 |
| DELETE | `/api/collections/:collectionId/items/:articleId` | 从专题移除文章 | 无 | owner/operator | 500 JSON error | 后端已提供，前端暂未主路径使用 |
| POST | `/api/import` | 从 URL 导入文章 | `url` | owner/operator，10 次/分钟 | 400 JSON error | 导入文章弹窗 |
| POST | `/api/subscribe` | 订阅每日简报 | `email`, `name` | 登录用户，5 次/分钟 | 400/500 JSON error | 底部订阅表单 |
| POST | `/api/unsubscribe` | 退订每日简报 | `email` | 登录用户 | 400/500 JSON error | 后端接口 |
| POST | `/api/briefing/send` | 手动触发邮件简报 | 无 | owner | 500 JSON error | 运维/手动触发 |
| GET | `/api/summary` | 旧版兼容行业简报 | `force=1` | owner/operator | 本地按重要性分组生成，不调用 Hunyuan；失败返回本地兼容结构 | 兼容接口，当前主前端不作为 AI 分析主入口 |
| GET | `/api/summary/daily` | DeepSeek 每日速递 | `force=1` | owner/operator，全局 2 分钟冷却 | 未配置 key 返回 503；失败返回错误摘要 | AI 分析：每日行业速递 |
| GET | `/api/summary/weekly` | DeepSeek 每周周报 | `force=1` | owner/operator，全局 5 分钟冷却 | 未配置 key 返回 503；失败返回错误周报 | AI 分析：每周行业周报 |
| GET | `/api/analysis/:articleId` | DeepSeek 单篇文章分析 | 路径参数 `articleId` | owner/operator，10 次/分钟 | 未配置 key 返回 503；JSON 解析失败返回 degraded fallback | 卡片 AI 分析按钮 |
| GET | `/api/pubmed` | PubMed 数据源 | `q`, `max` | owner/operator | 返回 PubMed demo 数据 | 后台抓取 |
| GET | `/api/arxiv` | arXiv 数据源 | `q`, `max` | owner/operator | 返回 arXiv demo 数据 | 后台抓取 |
| GET | `/api/journals` | 期刊 RSS 数据源 | 无 | owner/operator | 返回 Nature/Science demo 数据 | 后台抓取 |
| GET | `/api/news` | Google News 数据源 | 无 | owner/operator | 返回 news demo 数据 | 后台抓取 |
| GET | `/api/youtube` | YouTube 视频数据源 | 无 | owner/operator | 未配置 key 或错误时返回空数组 | 后台抓取 |

### 4.2 环境变量

| 变量 | 用途 | 必需性 | 备注 |
|------|------|--------|------|
| `PORT` | 服务端口 | 必需于生产 | 默认 3000，部署约定 4000 |
| `DEEPSEEK_API_KEY` | DeepSeek 日报/周报/单篇分析 | AI 分析必需 | 不配置时相关接口返回 503 |
| `HUNYUAN_API_KEY` | 已退役 Hunyuan 兼容变量 | 可选/遗留 | 当前 `/api/summary` 不再读取该变量；保留仅为历史部署兼容 |
| `GEMINI_API_KEY` | Gemini 模块 | 当前可选 | 模块存在但未接入主路由 |
| `YOUTUBE_API_KEY` | YouTube Data API | YouTube 源可选 | 不配置时 `/api/youtube` 返回空数组 |
| `GMAIL_USER` | Gmail SMTP 用户 | 邮件必需 | 不配置则跳过邮件发送 |
| `GMAIL_APP_PASSWORD` | Gmail SMTP App Password | 邮件必需 | 不能进入日志或前端 |
| `AUTH_OWNER_EMAIL` | 首个 owner 账号邮箱 | 首次部署必需 | 仅在 `users` 表为空时用于 bootstrap |
| `AUTH_OWNER_PASSWORD` | 首个 owner 初始密码 | 首次部署必需 | 至少 10 位；只读环境变量，不提交 |
| `AUTH_OWNER_NAME` | 首个 owner 显示名 | 可选 | 默认 `Owner` |
| `AUTH_COOKIE_SECURE` | 强制 session cookie Secure | 生产建议 | HTTPS 反代下可设为 `1` |
| `GOOGLE_GENAI_USE_VERTEXAI` | Gemini Vertex 模式 | 可选 | 需要配套 Google Cloud 环境变量 |
| `GOOGLE_CLOUD_PROJECT` | Vertex 项目 | 可选 | 仅 Vertex 模式需要 |
| `GOOGLE_CLOUD_LOCATION` | Vertex 区域 | 可选 | 默认 `global` |

### 4.3 数据库实体

当前需求只描述现有表，不新增 schema：

- `articles`：文章/新闻/视频统一内容表，唯一键为 `url`。
- `subscribers`：每日简报订阅者。
- `collections`：专题定义，包含预设专题和自定义专题。
- `collection_items`：专题与文章的关联关系，支持 `manual` 和 `auto` 来源。
- `fetch_runs`：每个数据源的抓取运行记录，保存状态、条数、开始/结束时间和错误摘要。
- `users`：授权用户，包含 `owner`、`operator`、`reader` 三档角色和 scrypt 密码哈希。
- `sessions`：HttpOnly cookie 对应的 session token hash、过期时间和用户关联。
- `audit_logs`：登录、导入、专题维护、AI 生成、用户权限变更、手动推送等关键操作审计。

### 4.4 三档权限模型

后续授权先采用三档权限，不做复杂角色拆分。权限判断必须在后端完成，前端只负责隐藏不可用入口，不能作为安全边界。

| 等级 | 建议代号 | 典型对象 | 可读范围 | 可写/操作范围 |
|------|----------|----------|----------|---------------|
| 最高等级 | `owner` | 创始团队、系统负责人 | 全部原始信息、AI 分析、来源状态、抓取失败、审计记录、用户列表 | 管理用户与邀请、调整权限、管理数据源、触发抓取/推送、导入/删除/修正内容、管理专题、查看审计 |
| 中等等级 | `operator` | 投资分析、战略/BD、核心研究成员 | 全部情报内容、原始来源、AI 分析、专题和推送结果 | 导入链接、生成/刷新 AI 分析、创建和维护专题、修正标签与重要性、标记待跟进；不能管理用户或系统级配置 |
| 部分阅读等级 | `reader` | 合伙人、核心公司高管、外部顾问 | 已整理后的情报事件、日报/周报、重点专题、允许展示的来源链接 | 默认只读；可收藏、标记已读或提交反馈；不能导入、删除、改标签、触发抓取或查看系统日志 |

接口权限原则：

- 所有 `/api/*` 业务接口后续默认要求登录，只有登录、邀请、健康检查和必要静态资源例外。
- 内容读取接口根据等级返回不同细节：`reader` 不展示抓取错误、内部评分细节、系统日志、订阅者和用户信息。
- 已实现的 reader 脱敏范围：`/api/all` 和 `/api/collections/:id` 不返回 `importance`、抓取访问状态、内容质量分、来源可靠性、提取方式、抓取状态、抓取错误和内部采集时间；前端在缺少精确分值时只展示重要性等级。
- 写操作默认只开放给 `owner` 和必要的 `operator`，包括导入、专题维护、AI 生成和标签修正。
- 用户管理、权限变更、来源配置、手动推送、审计查看只能由 `owner` 执行。
- 所有登录、授权、导入、删除、权限变更、手动推送和 AI 生成操作都必须写入审计日志。

## 5. 下一版需求优先级

### P0：授权与审计

当前 v5.1 已实现最小闭环：后端 session/cookie 登录、`owner/operator/reader` 三档权限、owner 用户管理、审计日志、前端登录门、按权限隐藏入口，以及 reader 读取接口的基础脱敏。后续仍可继续扩展邀请链接、密码重置、审计筛选和更细的数据脱敏。

- 增加后端登录、邀请和 session/cookie 访问控制，保护当前公开的业务 API。
- 采用三档权限：`owner`、`operator`、`reader`；先不做更细角色拆分。
- 建立最小审计日志，记录登录、导入、删除、权限变更、AI 生成、手动推送等关键动作。
- 前端按权限隐藏不可用入口，但所有安全判断以后端中间件为准。

验收标准：

- 未登录用户无法访问情报数据和 AI 分析接口。
- `reader` 只能读取已整理内容，不能导入、删除、创建专题或触发 AI/推送。
- `operator` 能处理情报内容，但不能管理用户、权限、数据源配置或审计记录。
- `owner` 能完成用户授权、权限调整、系统配置和审计查看。
- 敏感操作在审计日志中能追溯到用户、时间、动作和目标对象。

### P0：文档与版本一致性

- `AGENTS.md` 的架构、API 清单和环境变量已更新到 v5.1 真实状态；后续接口变更必须同步维护。
- 前端 header/footer/server 日志版本文案已统一到 v5.0。
- `scripts/validate_api_docs.js` 已纳入 `npm run verify`，用于校验 `AGENTS.md` 和 `REQUIREMENTS.md` 覆盖当前 Express 路由。
- `bci-tracker/` 未跟踪目录暂按历史副本/本地副本处理，不作为当前实现依据，不纳入提交、验证或部署；只有用户明确授权后才清理、迁移或纳入版本控制。

验收标准：

- 新开发者只读 `AGENTS.md` 和 `REQUIREMENTS.md` 就能正确理解 v5 架构。
- 文档中的 API 与 `routes/` 实际路由一致。
- 页面可见版本号一致。

### P0：导入安全边界

- 为 `/api/import` 增加更明确的 SSRF 防护需求：禁止内网地址、localhost、file 协议和非 HTTP(S) 协议。
- 限制响应体大小和内容类型，避免导入超大文件或非 HTML 内容导致内存压力。
- 保留当前 15 秒超时和 2048 字符 URL 长度限制。

验收标准：

- 私有 IP、`localhost`、非 HTTP(S) URL 被拒绝。
- 大响应体、非 HTML 响应能安全失败。
- 失败信息对用户可读，不暴露内部调用细节。

### P1：AI JSON 容错与可观测性

- 抽出 DeepSeek/Gemini 共用 JSON 解析和修复工具，减少重复逻辑。
- 失败样本保存时不得包含 API key 或用户敏感输入。
- AI 接口响应需稳定区分：未配置、冷却中、上游超时、JSON 解析失败。

验收标准：

- DeepSeek 日报/周报/单篇分析在无 key、冷却、上游失败下都有稳定响应结构。
- 冒烟测试覆盖未配置 key 分支和成功结构兼容分支。

### P1：测试独立性

- 当前 `npm test` 依赖服务已运行；下一版应增加可独立启动/关闭测试服务的测试脚本。
- 保留现有冒烟测试，同时增加 URL 导入校验、专题增删、来源过滤、时间过滤的回归测试。

验收标准：

- 本地能用单条命令完成启动、测试、关闭。
- 无外部 API key 时测试仍可通过降级路径。

### P2：专题规则可配置

- 前端支持查看专题规则。
- 后端提供安全的规则更新接口，仅允许字符串关键词数组。
- 预设专题默认不可删除，但可考虑允许复制为自定义专题。

验收标准：

- 用户能创建一个带规则的专题，并在后续抓取/导入时自动归集。
- 规则输入被长度、数量和字符边界限制。

### P2：Gemini 接入决策

- 明确 Gemini 的产品角色：作为 DeepSeek fallback，还是保留为实验模块。
- 若接入，应定义路由、缓存、冷却、前端入口和测试。

验收标准：

- 文档、路由和前端不再出现“模块存在但产品入口不明确”的状态。

## 6. 验收与验证

文档更新后必须执行：

```bash
node -c server.js
node -c routes/api.js
node -c public/app.js
```

进入代码实现阶段并启动服务后执行：

```bash
npm test
```

部署前执行：

```bash
npm run verify
```

验收口径：

- 文档不引入新的运行时行为。
- 文档中列出的 v5 能力能在当前代码中找到对应入口。
- 文档中列出的下一版需求均有明确优先级和验收标准。
- 安全约束覆盖输入校验、API key、错误信息和外部请求边界。

## 7. 当前已知差异

- `AGENTS.md` 已更新到 DeepSeek、YouTube、URL 导入和三档权限状态；后续改接口时仍需同步维护。
- `public/index.html` header/footer 已统一显示 v5.0。
- `gemini.js` 存在但没有在当前 `routes/api.js` 中作为主路由挂载。
- `bci-tracker/` 未跟踪目录按历史副本/本地副本处理，本需求不把它作为当前实现依据，也不纳入提交、验证或部署。
- `bci-tracker.db-shm` 和 `bci-tracker.db-wal` 是本地 SQLite WAL/SHM 状态文件，不属于需求文档交付内容。
