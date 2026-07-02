# BCI Tracker — 代理开发规范

> 本文件定义了 AI 代理在本项目中的开发约束和工作流程。
> 每次会话开始时必须读取此文件。

## 项目概要

BCI Tracker 是一个 **脑机接口行业动态看板**，面向 NeuroWorm 团队的投资决策和竞品追踪。

| 属性 | 值 |
|------|-----|
| 运行时 | Node.js (≥18) + Express 4 |
| 数据库 | SQLite (better-sqlite3, WAL 模式) |
| 前端 | 纯 HTML/CSS/JS (无框架) |
| AI 摘要 | DeepSeek 日报/周报/单篇分析；`/api/summary` 为本地兼容简报 |
| 部署 | 腾讯云 Lighthouse + Nginx HTTPS (`njubci.com`)，Node 仅监听 `127.0.0.1:4000` |
| 数据源 | PubMed, arXiv, Nature RSS, Science RSS, Neuron RSS, Google News, YouTube |
| 定时任务 | 每 30 分钟数据抓取, 每日 08:00 邮件简报 |

## 技术栈约束

- **不得引入前端框架** (React, Vue, Angular 等)。前端维持纯 JS。
- **不得更换数据库**。SQLite 足以满足当前场景。
- **不得移除 demo 数据**。DEMO_DATA 是网络不可达时的降级兜底。
- **CSS 变量** 已用于主题系统 — 新增样式必须使用 CSS 变量，不得硬编码颜色。
- **.env 中的 API Key 绝不可出现在代码或提交记录中**。

## 文件架构

```
BCI Tracker/
├── server.js              # Express 瘦入口 (中间件挂载 + 路由注册 + 定时任务)
├── middleware/
│   ├── security.js        # 安全头 + 速率限制 + 全局错误处理
│   └── auth.js            # session cookie 解析 + requireAuth/requireRole
├── routes/
│   ├── auth.js            # /api/auth 登录、用户管理、审计
│   ├── pubmed.js          # /api/pubmed 数据源路由
│   ├── arxiv.js           # /api/arxiv 数据源路由
│   ├── journals.js        # /api/journals RSS 路由 (Nature, Science)
│   ├── news.js            # /api/news Google News 路由
│   ├── youtube.js         # /api/youtube YouTube 数据源路由
│   └── api.js             # 业务 API (all, stats, collections, summary, analysis, import)
├── services/
│   ├── fetcher.js         # 数据抓取服务 (fetch 工具 + DEMO_DATA + enrichItem)
│   ├── import.js          # URL 导入 + SSRF/内容类型/大小边界
│   ├── deepseek.js        # DeepSeek 日报/周报/单篇分析
│   └── auth.js            # 密码哈希、session、owner bootstrap
├── gemini.js              # Gemini 实验模块 (@google/genai SDK)，当前未接入主路由
├── db.js                  # SQLite 数据层 (schema + prepared statements)
├── scoring.js             # 重要性评分系统 (来源 × 时效 × 关键词)
├── translate.js           # 英文标题中译 (词典匹配, 非 API 调用)
├── briefing.js            # 每日邮件简报 (Gmail SMTP + nodemailer)
├── company_profile.md     # NeuroWorm 公司简介 (供 AI 竞品分析参考)
├── public/
│   ├── index.html         # SPA 入口
│   ├── app.js             # 前端逻辑 (数据获取 + DOM 渲染 + 交互)
│   └── style.css          # 全局样式 (暗色主题 + 响应式)
├── test/
│   └── smoke.js           # 冒烟测试 (由 scripts/run_smoke_with_server.js 启停服务)
└── .env                   # 环境变量 (PORT, DEEPSEEK_API_KEY, YOUTUBE_API_KEY, AUTH_*, Gmail 等)
```

## 必须遵循的工作流

### 1. 新功能开发 → `spec-driven-development`
- 先写需求规格 (spec)，再写代码
- 必须回答：要解决什么问题？影响哪些文件？如何验证？

### 2. 代码实现 → `incremental-implementation`
- 每个改动是一个可独立验证的 **薄垂直切片**
- 单次提交不超过 ~100 行
- 每个切片完成后立刻运行验证

### 3. Bug 修复 → `ao-debugging-and-error-recovery`
- **先复现，再修复**。用测试用例证明 bug 存在
- 修复后添加回归测试到 `test/smoke.js`
- 禁止猜测性修复

### 4. 代码审查 → `ao-code-review-and-quality`
- 五轴审查：正确性、可读性、架构、安全性、性能
- 重点关注：SQL 注入防护、输入验证、错误信息泄露

### 5. 安全规范 → `ao-security-and-hardening`
- 所有用户输入必须在边界处验证 (已有 `rateLimit` 和 HTML 转义)
- 数据库操作使用 prepared statements (已全部参数化)
- API 响应不得暴露 stack trace (生产环境已配置)
- **禁止在 console.log/error 中输出 API key 或用户敏感数据**

### 6. 提交规范 → `ao-git-workflow-and-versioning`
```
feat: 新增功能
fix: 修复 bug
refactor: 重构 (不改变行为)
docs: 文档更新
chore: 构建、依赖等杂项
```

### 7. 部署验证 → `ao-shipping-and-launch`
- 部署前必须通过：`npm run verify`
- 部署命令：`ssh ubuntu@111.229.73.49 "cd ~/bci-tracker && git pull && npm install && pm2 restart bci-tracker"`

## 验证清单 (每次改动后执行)

```bash
# 1. 语法检查
node -c server.js && node -c routes/api.js && node -c services/fetcher.js && node -c public/app.js && echo "✅ Syntax OK"

# 2. 冒烟测试 (需服务运行)
npm test

# 3. 完整验证
npm run verify
```

## API 端点一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/all` | 分页查询文章 (支持 q, category, source, sort, page, limit, from, to) |
| GET | `/api/auth/me` | 当前登录用户 |
| POST | `/api/auth/login` | 登录并写入 HttpOnly session cookie |
| POST | `/api/auth/logout` | 退出登录 |
| POST | `/api/auth/change-password` | 当前用户修改自己的密码 |
| GET | `/api/auth/users` | 用户列表 (owner) |
| POST | `/api/auth/users` | 创建授权用户 (owner) |
| PATCH | `/api/auth/users/:id` | 更新用户/角色/状态/密码 (owner) |
| GET | `/api/auth/audit` | 审计日志 (owner) |
| GET | `/api/stats` | 统计数据 (total, journals, preprints, news) |
| GET | `/api/source-health` | 数据源抓取健康度 (owner/operator) |
| GET | `/api/summary` | 本地兼容行业简报 (45 分钟缓存，不调用 Hunyuan) |
| GET | `/api/summary/daily` | DeepSeek 每日行业速递 |
| GET | `/api/summary/weekly` | DeepSeek 每周行业周报 |
| GET | `/api/trending` | 热门关键词 (支持 period: week/month/quarter/year) |
| GET | `/api/sources` | 数据源列表 |
| GET | `/api/collections` | 专题集合列表 |
| GET | `/api/collections/:id` | 专题内容 |
| POST | `/api/collections` | 创建专题 |
| POST | `/api/collections/:id/add` | 添加到专题 |
| DELETE | `/api/collections/:id` | 删除专题 |
| DELETE | `/api/collections/:collectionId/items/:articleId` | 移除专题内容 |
| POST | `/api/subscribe` | 订阅每日简报 (限速 5次/分钟) |
| POST | `/api/unsubscribe` | 退订 |
| POST | `/api/briefing/send` | 手动触发简报发送 |
| POST | `/api/import` | URL 导入文章 |
| GET | `/api/pubmed` | PubMed 数据源 (内部) |
| GET | `/api/arxiv` | arXiv 数据源 (内部) |
| GET | `/api/journals` | 期刊 RSS 数据源 (内部) |
| GET | `/api/news` | Google News 数据源 (内部) |
| GET | `/api/youtube` | YouTube 数据源 (内部) |
| GET | `/api/analysis/:articleId` | DeepSeek 单篇文章深度分析 (限速 10次/分钟) |

## 业务上下文

- **核心用户**：NeuroWorm (仿生蠕动微纤维 BCI) 团队，用于竞品追踪和投资决策
- **权限模型**：三档角色 `owner`、`operator`、`reader`；所有 `/api/*` 业务接口默认需要登录，权限判断必须在后端完成
- **AI 分析**以 DeepSeek 日报/周报/单篇分析为主；旧 `/api/summary` 已退役 Hunyuan 调用，改为本地兼容简报
- **评分系统**中，Tier 1 追踪公司 (Neuralink, Synchron, Axoft 等) 和融资事件具有最高权重
- **翻译模块**为离线词典匹配 (338 条 BCI 术语)，不调用外部 API

## 已知限制 & 技术债

1. ~~`server.js` 过大~~ — ✅ 已拆分为 middleware/ + routes/ + services/ (v4.2)
2. ~~冒烟测试需要服务运行中~~ — ✅ `npm test` 通过 `scripts/run_smoke_with_server.js` 自行启动/关闭测试服务
3. `translate.js` 为简单词典替换 — 对复杂句式效果有限
4. 前端 `app.js` 无模块化 — 全局函数 + DOM 操作
5. AI JSON 解析已有 DeepSeek/Gemini 共享修复工具和 degraded fallback；日报/周报成功结构仍需更多真实样本回归覆盖
6. 无 TypeScript — 无类型安全保障
7. 无 CI/CD 管道 — 部署为手动 SSH

## 禁止事项

- ❌ 删除 DEMO_DATA (网络降级的安全网)
- ❌ 移除 rate limiter 或 security headers
- ❌ 在 `.env` 以外的地方硬编码 API key
- ❌ 修改 SQLite schema 而不在同一 PR 中更新 db.js 的 upsert/search 语句
- ❌ 向公共 API 暴露 server 内部错误详情
- ❌ 绕过 `requireAuth` / `requireRole` 新增业务接口
