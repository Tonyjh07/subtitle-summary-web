# subtitle-summary-web

B站视频链接 → 带时间戳文字稿 → AI 总结。**纯前端架构**：无 Python 后端、无数据库、无轮询，
所有服务端逻辑都在本仓库的 Next.js Route Handlers 内（`src/app/api/`）。

## 功能范围

| 功能 | 说明 |
| --- | --- |
| B站字幕获取 | 粘贴 B站视频链接（含 b23.tv 短链），服务端经 view → dm/view 链路取 CC / AI 字幕，多格式解析（json / json3 / vtt / srt） |
| AI 总结 | 文字稿交给 DeepSeek / 通义千问（OpenAI 兼容接口），生成一句话概要、带时间戳要点与章节笔记 |
| 文字稿结果 | 全文阅读 / 时间戳定位双视图，导出 TXT / Markdown |

**不做**：语音识别（ASR）、音频分离、本地转写、多平台（抖音等）。无可用字幕的视频（实测约 1/6）
直接报 `NO_SUBTITLE`，不降级转写。

## 快速开始

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

打开页面后点右上角 **「设置」**，选择服务商（DeepSeek / 通义千问）并填入 API Key 即可使用 AI 总结。
配置保存在**本机浏览器 localStorage**（键 `llmSettings`），跨会话保留，**不需要任何环境变量**。

未配置 LLM Key 时，字幕与文字稿功能完全可用，仅总结区显示「未配置」引导（提交即报错不静默）。

## 配置

| 层级 | 位置 | 说明 |
| --- | --- | --- |
| **前端（推荐）** | 右上角「设置」→ localStorage `llmSettings` | 优先级高；provider / API Key / 模型覆盖三项 |
| **服务端（兜底）** | `.env.local`（见 `.env.example`） | 仅在前端未配置时读取；部署者可设全局 Key 供多人共用 |

两级都没有 → 总结接口返回 `SUMMARIZE_NOT_CONFIGURED`，UI 给出设置引导。

> **安全模型**：前端 Key 明文存 localStorage，随 `/api/summarize` 请求发送到本站服务端，
> 由服务端代为调用 LLM 上游（dashscope 浏览器 CORS 不通，见 `docs/MIGRATION.md` §3）。
> Key 不带 `NEXT_PUBLIC_` 前缀，**不进浏览器构建产物**；请勿在不受信任的设备上保存。

## 生产部署

```bash
pnpm build
pnpm start
```

通常无需配置任何环境变量（每个使用者在自己的浏览器里填 Key）；
如需全站兜底 Key，见 `.env.example`。

## 架构

```
浏览器（zustand 状态机：idle → parsing → fetching → summarizing → done | error）
   │  同源 fetch，单次往返（无轮询）
   ▼
Next.js Route Handlers
   POST /api/parse        链接 → VideoInfo（view API + b23.tv 短链展开）
   POST /api/subtitle     链接 → 文字稿（dm/view 字幕轨道 → 下载 → 解析，约 5-7s）
   POST /api/summarize    文字稿 → Summary（LLM，Key 随请求体 llm 字段或服务端 env 兜底）
   GET  /api/capabilities 服务端兜底 Key 是否已配置（客户端与 localStorage 合并）
   GET  /api/health       可达性探测
```

关键设计：

- **B站链路**：`view?bvid=` → aid/cid；`dm/view` 取字幕轨道（未登录零 Cookie 零签名，
  AI 轨道仅收 `ai_status=2`，CC 优先于 AI、中文优先）；字幕 URL 白名单 + http→https。
  API 请求模块级 1.5s 节流（模拟网页节奏防反爬），见 `src/lib/bili/`。
- **任务与恢复**：taskId = base64url 自含上下文（视频元数据）；结果缓存 localStorage
  （键 `subtitle-summary:task:<taskId>`）。刷新由 `recover` 恢复；缓存 miss 报
  「任务已过期」。无服务端任务表、无 SQLite。
- **进度**：字幕获取是单次 5-7s 请求，进度条为客户端渐近收敛动画（`src/stores/task-store.ts`）。
- **配置**：LLM 配置前端优先（`src/lib/llm-settings.ts` → localStorage）→ 服务端 `.env.local` 兜底；
  顶栏「设置」弹窗维护（`src/components/layout/settings-dialog.tsx`）。
- **降级**：总结失败不拖垮文字稿（结果页仅总结区显示错误 + 重试）。

## 测试

```bash
pnpm lint        # ESLint
pnpm build       # 构建 + 类型检查
pnpm test:e2e    # Playwright 12 条锁定用例（自动起服务；先 pnpm build）
```

e2e 全部 `/api/*` 由 Playwright `page.route()` 拦截 + fixture（`e2e/fixtures.ts`），
不依赖真实 B站 / LLM；直链结果页用例通过 `addInitScript` 种入 localStorage 缓存。

## 文档

- `docs/MIGRATION.md` — 从旧仓库（Python 后端 + Mock 双实现）迁移的决策记录、契约映射与进度清单
