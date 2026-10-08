# 迁移与重构计划：纯前端化（仅保留 B站字幕 + AI 总结）

> 状态：**进行中** ｜ 创建：2026-10-08 ｜ 源仓库：`E:\video-to-text`（旧仓库，保留不动）｜ 目标仓库：本目录 `subtitle-summary-web`
>
> 本文档是跨会话的唯一进度凭据。继续实施前先读完本文，完成后更新「进度清单」。

## 1. 背景与目标

把旧项目 `video-to-text` 转为**纯前端形态**：删除整个 Python 后端（`backend/`：FastAPI + yt-dlp + faster-whisper + FFmpeg + SQLite），**仅保留两个功能**：

1. **B站字幕获取**（CC / AI 字幕快路径，未登录零 Cookie）
2. **AI 总结**（DeepSeek / 通义，服务端持 Key）

**明确放弃的功能**：本地/云端 ASR 兜底、人声分离、多平台（抖音）、yt-dlp 解析、任务持久化（SQLite）、托盘控制台/后端进程管理脚本。

## 2. 关键决策（已与用户确认，勿再询问）

| 决策点 | 结论 |
| --- | --- |
| 架构形态 | ❌ 纯静态不可行（实测 B站 API 无 CORS 头）→ ✅ **删除 `backend/`，字幕+总结移植为 Next.js Route Handlers（TS）**，仍是单仓库单命令部署 |
| 无字幕视频（实测约 1/6 概率） | **直接报错**「该视频无可用字幕」，不做任何 ASR 兜底 |
| Mock 层 | **删除**（`mock-api.ts` / `mock-data.ts` / `NEXT_PUBLIC_USE_MOCK` 全删），e2e 改用 **Playwright route interception** 提供 fixture |
| 新仓库文件夹名 | `subtitle-summary-web`（已建，已 `git init`，已建 `.gitignore`） |
| 配置项前端化（2026-10-08） | **范围仅 LLM 三项**（provider / API Key / 模型覆盖；`autoSummary` 原本就在 localStorage）。**UI = 顶栏齿轮按钮 + 弹窗**（不新增路由）。**安全模型已确认接受**：Key 明文存 localStorage、随请求发给自己服务端、上游仍服务端代发，同机他人可在 DevTools 看到 |
| LLM Key 位置 | ~~服务端 env~~ **已推翻（2026-10-08 二次决策）**：**前端优先**——顶栏「设置」弹窗填写，存 localStorage（键 `llmSettings`），随 `/api/summarize` 请求体 `llm` 字段发送；服务端 `.env.local` **降为兜底**（前端未配置时才读）。仍不带 `NEXT_PUBLIC_`（前端 Key 运行时读 localStorage，不进 bundle）；服务端只校验白名单不落盘不回显。dashscope 浏览器 CORS 不通，故仍由服务端代发上游请求（§3） |

## 3. 实测依据（2026-10-08，本机 Chrome 跨域 fetch 实测）

| 接口 | 结果 | 结论 |
| --- | --- | --- |
| `api.bilibili.com/x/web-interface/view`、`/x/v2/dm/view` | `TypeError: Failed to fetch`（无 ACAO 头） | ❌ 浏览器直连被 CORS 拦截 → **必须走 Next 服务端代理** |
| `aisubtitle.hdslb.com` 字幕文件 | HTTP 200，body 可读（24800 字节，type=cors） | ✅ 字幕本体浏览器可直下（但统一走服务端更简单） |
| `api.deepseek.com/chat/completions` | CORS 放行（401 可读） | ✅ 可直调，但 Key 会暴露 → 仍走服务端 |
| `dashscope.aliyuncs.com`（通义兼容模式） | preflight 失败 | ❌ 浏览器不可直调 → 必须走服务端 |

B站字幕链路的侦察结论（旧仓库 `backend/docs/bili-subtitle-recon.md`，务必已验证）：

```
1. GET https://api.bilibili.com/x/web-interface/view?bvid={bvid} → data.aid / data.cid / title / pic / duration
2. GET https://api.bilibili.com/x/v2/dm/view?aid={aid}&oid={cid}&type=1 → data.subtitle.subtitles[]
   - 无需 Cookie、无需 wbi 签名、无登录态
   - AI 轨道 lan 以 "ai-" 开头，仅 ai_status==2 采纳；UP 主 CC 轨道无此限制
   - 实测覆盖 5/6 视频（player/v2 与 wbi/v2 未登录响应恒为空，别走错接口）
3. subtitle_url（http://aisubtitle.hdslb.com/...?auth_key=...）→ http 升 https 后直接 GET
   → {"body": [{"from": 0.08, "to": 1.2, "content": "..."}]} 与 CC 字幕同格式
```

请求约束：Chrome UA + `Referer: https://www.bilibili.com/`、请求间隔 **1.5s** 节流、每任务约 3 个请求（view + dm/view + 字幕下载）。

## 4. 目标架构

```
浏览器 ──同源 /api/*──▶ Next.js Route Handlers（唯一服务端，TS 实现）
                          ├─ POST /api/parse        {url} → VideoInfo（view API 取 title/cover/duration/aid/cid；替代 yt-dlp）
                          ├─ POST /api/subtitle     {url} → { transcript, plainText, transcriptSource }
                          │                            （dm/view 轨道 → 下载字幕 → 解析；无字幕 → NO_SUBTITLE 错误）
                          ├─ POST /api/summarize    {transcript, title, duration, llm?} → Summary（chunking+时间戳吸附）
                          │                            （llm = 前端 localStorage 配置优先，服务端 .env.local 兜底）
                          ├─ GET  /api/capabilities → { summarizeConfigured: boolean }（服务端兜底状态，客户端与 localStorage 合并）
                          └─ GET  /api/health       → { status: 'ok' }
```

- `next.config.mjs` 的 `/backend-api` rewrites **删除**（不再有外部后端）
- 反爬约束照搬：1.5s 节流、B站域名白名单、UA/Referer 头
- **无服务端任务存储**：taskId = base64url 自含上下文 + **localStorage 按 taskId 缓存** `{video, transcript, plainText, transcriptSource, summary}`，刷新恢复；缓存 miss → 结果页报「任务已过期」（替代 SQLite interrupted 逻辑）
- 状态机简化：**轮询删除**（旧 `use-task-polling.ts`）。字幕 5-7s 一次请求返回 → `submitUrl` 顺序执行 parse → subtitle →（autoSummary 开关）summarize，进度用客户端推算动画

## 5. 待移植代码对照表（源仓库路径）

### 5.1 直接移植（Python → TS）

| 源文件 | 目标 | 要点 |
| --- | --- | --- |
| `backend/app/services/bili_player_api.py`（151 行） | `src/lib/bili/dm-view.ts` | view + dm/view 两跳、1.5s 节流（模块级 lastRequestAt）、ai_status=2 过滤、CC>AI 中文优先排序、aid/cid 缓存 |
| `backend/app/services/subtitles.py`（209 行） | `src/lib/bili/subtitle.ts` | 三种解析器 `_parse_bilibili_json`/`_parse_json3`/`_parse_vtt`（json/json3/vtt/srt 分派）、域名白名单（bilibili.com/hdslb.com/bilibili.tv）+ `isBlockedHost`、http→https 升级、UA/Referer 下载 |
| `backend/app/services/summarizer.py`（257 行） | `src/lib/summarizer/` | system prompt（JSON 输出契约）、`response_format=json_object`、解析失败重试 ×2（错误反馈回模型）、**按条目边界 6000 字分块**（多块先逐块提取候选要点再合并）、**时间戳就近吸附** `_snap_summary_times`、keyPoints ≤5、MAX_TRANSCRIPT_CHARS=100_000 |
| `backend/app/config.py` LLM 段（97-124 行） | `src/lib/summarizer/config.ts` | LLM_PROVIDER=deepseek 默认；presets：deepseek → `https://api.deepseek.com/v1`（deepseek-flash）、qwen → dashscope compatible-mode（qwen-plus）；单价表可省略 |
| `backend/app/services/parser.py` 部分 | `src/lib/bili/parse.ts` | 不移植 yt-dlp；改用 view API。友好错误（404/私密/超时 → 中文提示）保留思路 |
| `backend/app/errors.py` | `src/lib/api-server.ts`（已有，扩展） | 状态码映射已存在于 `src/lib/api-server.ts`：INVALID_URL 400 / UNSUPPORTED_PLATFORM 422 / INVALID_TASK 404 / SUMMARIZE_NOT_CONFIGURED 400 / TRANSCRIPT_TOO_LONG 413 / SUMMARIZE_FAILED 502 |

### 5.2 前端已有、基本不动

`platform.ts`（URL 解析，SSRF 守卫逻辑服务端复用 `url-guard.ts`）、`platforms/registry.ts`、`article.ts`、`export.ts`、`format.ts`、result/processing 组件、`task-store.ts` 主体结构、PWA（manifest/sw/register-sw）、`auto-summary-toggle`。

### 5.3 需删除

| 文件 | 原因 |
| --- | --- |
| `src/lib/mock-api.ts`、`mock-data.ts`、`api-server.ts` 中 MockApiError 关联 | Mock 删除（api-server 的错误映射保留改名 `ApiError`） |
| `src/lib/real-api.ts` | `/backend-api/*` 代理不复存在 |
| `src/lib/api.ts` mock/real 分流 | 合并为单一实现（同源 `/api/*`） |
| `src/app/api/transcribe/`（2 个路由） | 无任务轮询概念 |
| `src/components/home/transcribe-mode.tsx` | ASR 引擎选择删除 |
| `src/components/layout/backend-health-banner.tsx` | 后端不存在；连带 `layout.tsx` 引用、`site-header.tsx` 的 `--backend-banner-offset` |
| `NEXT_PUBLIC_USE_MOCK` 全部分支（home-view、processing-view） | Mock 标识删除 |
| `TranscribeEngine` / `engine` / `cloudAsrConfigured` / `TranscriptSource:'asr'` | 类型清理 |
| 旧仓库整体不拷贝：`backend/`、`控制台.*`、`run.bat`、`setup.bat`、`logs/`、`.vtt-pids/` | 与新项目无关 |

### 5.4 UI 文案改动点

- `summary-card.tsx:143`：`backend/.env.local` → `.env.local` / Vercel 环境变量
- `home-view.tsx`：删除转写模式区 + Mock 徽章/说明；文案「B站 / 抖音」→「B站」
- `example-links.tsx`：删抖音示例、失败演示（BV1FailDemo 是 Mock 专属）；保留「不支持平台」演示
- `url-form.tsx:34-42`、`platform.ts`、`registry.ts`、`types.ts Platform`：**抖音整体移除**（Platform 联合类型只剩 `'bilibili'`？——注意 registry 是 `Record<Platform,...>`，若删 douyin 需同步 `platform-badge.tsx` 的 ICONS。建议：保留类型但 registry 仅 B站 + 解析直接 UNSUPPORTED，改动最小 → **推荐：Platform 类型删 'douyin'，同步清 3 处引用**）
- `types.ts` 错误码：新增 `NO_SUBTITLE`（404 或 422，建议 404）；删 `CLOUD_NOT_CONFIGURED`、`TRANSCRIBE_FAILED`（→ `SUBTITLE_FAILED` 或保留改文案）、`FILE_*`、`TASK_INTERRUPTED`
- `TASK_STAGES` 四阶段 → 两阶段：`fetch_subtitle`（解析并获取字幕，5-7s）→ `summarize`（30-70s）；`stage-steps.tsx` 图标同步（asr/extract_audio 图标删除）
- e2e 锁定 4（转写模式）、7（Mock 标识）、9（后端横幅）**删除**，其余 7 条改 route interception 实现
- `README.md`、`package.json`（scripts 不变）、`.env.example`（只剩 LLM Key 说明）重写

## 6. 进度清单

- [x] 评估与决策（本文档 §2、§3）
- [x] 新仓库 `subtitle-summary-web/` 创建 + `git init` + `.gitignore`
- [x] 旧仓库 `.gitignore` 追加 `subtitle-summary-web/`
- [x] 源代码全量摸底（backend 服务层、前端 store/组件/路由/e2e 均已通读）
- [x] 骨架拷贝到新仓库：`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`tsconfig.json`、`next.config.mjs`、`tailwind.config.ts`、`postcss.config.mjs`、`.eslintrc.json`、`components.json`、`playwright.config.ts`、`next-env.d.ts`、`src/`、`public/`、`scripts/`、`e2e/`
- [x] **步骤 1**：`src/lib/bili/` 字幕链路 TS 化（http.ts 节流层 / dm-view.ts / subtitle-parser.ts / index.ts 编排 + `/api/parse`、`/api/subtitle` 路由）
- [x] **步骤 2**：`src/lib/summarizer/` 移植（config.ts + index.ts）+ `/api/summarize`、`/api/capabilities`、`/api/health` 路由
- [x] **步骤 3**：`types.ts` 契约修订 + `api.ts` 单一客户端 + `task-store.ts` 状态机改写（轮询删除、localStorage 缓存 `task-cache.ts`、taskId 编解码 base64url）
- [x] **步骤 4**：UI 清理（§5.3 删除清单 + §5.4 文案；transcribe-mode / backend-health-banner / Mock 分支 / banner offset 偏移全删）
- [x] **步骤 5**：`next.config.mjs` 去 rewrites、`.env.example` 重写、死文件清理（mock-api、mock-data、real-api、transcribe 路由、douyin 封面）
- [x] **步骤 6**：e2e 重写（`e2e/fixtures.ts` route interception + fixture + 无字幕/缓存 miss 用例）→ **10/10 通过**；`pnpm lint` / `pnpm build` 全绿
- [x] **步骤 7**：新仓库 `README.md` 重写；本文档进度勾选归档
- [x] **步骤 8（配置项前端化，2026-10-08）**：LLM 三项（provider / Key / 模型）改前端配置
  - `src/lib/llm-settings.ts`（localStorage `llmSettings` 读写 + 校验）＋ `types.ts` 新增 `LlmClientSettings`、`SummarizeRequest.llm?`
  - `summarizer/config.ts` 加 `validateClientLlm()`，`resolveLlmConfig(client?)` 前端优先 → env 兜底；`/api/summarize` 透传 body.llm，`/api/capabilities` 语义标注为服务端兜底
  - 新增 `src/components/ui/dialog.tsx`（轻量 Dialog，无新依赖）＋ `src/components/layout/settings-dialog.tsx`（齿轮按钮 + 弹窗，含清除/显示 Key/安全提示），接入 `site-header.tsx`
  - `task-store.ts`：`loadCapabilities({ force })` 合并 `hasLocalLlm()`；三处 summarize 调用经 `withLocalLlm()` 附带配置；未配置引导文案改指设置弹窗；总结前补 `await loadCapabilities()` 消除竞态
  - `summary-card.tsx` 两处配置引导文案改指设置弹窗
  - e2e：`fixtures.ts` 记录 `summarizeRequests` 请求体；新增**锁定 11**（设置→localStorage→随请求→服务端未配也能总结→刷新仍在）、**锁定 12**（两级全缺→不发请求+引导）→ **12/12 通过**
  - 文档：`README.md` 配置章节双路径、`.env.example` 降为兜底说明、本文档 §2 决策推翻记录

### 6.1 验证记录（2026-10-08）

- `pnpm lint` ✔ / `pnpm build` ✔ / `pnpm test:e2e` **10 passed**（步骤 1-7 时点）
- 真实链路冒烟（`pnpm start` + curl）：
  - `POST /api/parse`（BV1GJ411x7h7）→ 200，title/cover/duration 正确（view API）
  - `POST /api/subtitle`（同视频）→ 200，`transcriptSource=subtitle_cc`，47 条，UTF-8 中文正常
  - `POST /api/parse`（不存在的 BV）→ 502 `PARSE_FAILED`
  - `POST /api/parse`（v.qq.com）→ 422 `UNSUPPORTED_PLATFORM`
  - `GET /api/capabilities` → `{"summarizeConfigured":false}`；`GET /api/health` → `{"status":"ok"}`
  - `POST /api/summarize`（无 Key）→ 400 `SUMMARIZE_NOT_CONFIGURED`
  - LLM 实际调用未冒烟（本机未配 Key），逻辑由 e2e 锁定 6/7/10 覆盖

### 6.2 验证记录（2026-10-08，配置项前端化步骤 8）

- `pnpm lint` ✔ / `pnpm tsc --noEmit` ✔ / `pnpm build` ✔（11 routes）
- `pnpm test:e2e` **12 passed**（原 10 条零回归 + 新增锁定 11/12）
- 手工核对：设置保存 → `localStorage[llmSettings]` 写入 → `/api/summarize` 请求体含 `llm` 字段
  → 服务端 `validateClientLlm` 白名单校验 → 前端 Key 缺失时回落 env → 两级全缺报 `SUMMARIZE_NOT_CONFIGURED`
- 安全核对：构建产物无 Key（前端配置运行时读 localStorage，无 `NEXT_PUBLIC_` 变量）；服务端不回显 Key

## 7. 风险与注意事项

1. **功能缺口（已接受）**：无字幕视频直接失败，错误码 `NO_SUBTITLE`，UI 需给「换视频」引导
2. **B站接口变更**：dm/view 是弹幕体系老接口较稳定；分层 try/降级 + 清晰错误码兜底
3. **部署环境出网**：Vercel IP 访问 B站 API 可能遇风控（本地开发已验证可行）→ README 注明
4. **频率控制**：Route Handler 无跨实例共享节流，个人使用场景可接受（模块级 lastRequestAt 即可）
5. **taskId 恢复**：e2e 直链访问结果页依赖 localStorage 缓存 → fixture 测试需先 addInitScript 种缓存，或保留 taskId 自含 transcript（base64url 过大不适合长视频，**选 localStorage 种缓存方案**）
6. **e2e 现有 12 条**（10 条迁移改写 + 锁定 11 设置前端化 + 锁定 12 两级配置缺失）全部走 route interception（`e2e/locked-features.spec.ts` + `e2e/fixtures.ts`，2026-10-08 全绿）；Playwright `webServer: pnpm start`，需先 `pnpm build`；本机浏览器已 `playwright install chromium`
7. **前端 Key 暴露面（已接受）**：Key 明文存 localStorage 且随总结请求发送给自己的服务端；XSS / 同机他人可见的风险由用户确认接受（见 §2）。服务端只校验 `provider` 白名单 + Key 非空，不落盘、不回显、不写日志
