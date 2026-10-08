/**
 * 前后端接口契约（单一事实来源）。
 *
 * 纯前端形态：所有服务端逻辑都在同仓库的 Next Route Handlers（src/app/api），
 * 本文件即接口文档。无服务端任务存储——任务由客户端状态机 + localStorage 缓存驱动。
 */

/** 平台标识：纯前端形态仅支持 B站（字幕快路径，见 docs/MIGRATION.md §2） */
export type Platform = 'bilibili'

export interface VideoInfo {
  title: string
  /** 封面图 URL（view API 返回，已 http→https 升级） */
  cover: string
  /** 时长（秒） */
  duration: number
  platform: Platform
  videoId: string
}

export interface TranscriptItem {
  /** 相对视频开头的秒数 */
  time: number
  text: string
}

export interface Chapter {
  /** 章节开始时间（秒） */
  time: number
  title: string
  note: string
}

/** AI 总结契约：LLM 生成，keyPoints 时间戳指向原 transcript（服务端就近吸附校验） */
export interface KeyPoint {
  /** 秒，取自原 transcript 时间戳（服务端就近吸附） */
  time: number
  text: string
}

export interface ChapterNote {
  title: string
  /** 秒 */
  timeStart: number
  timeEnd: number
  note: string
}

export interface Summary {
  /** 一句话概要 */
  summary: string
  /** 要点（3-5 条，带原文字稿时间戳） */
  keyPoints: KeyPoint[]
  /** 章节笔记 */
  chapters: ChapterNote[]
}

/** LLM provider（与服务端 LLM_PRESETS 白名单一致） */
export type LlmProvider = 'deepseek' | 'qwen'

/**
 * 浏览器端 LLM 配置（前端设置，localStorage 键 `llmSettings`）。
 * 随 summarize 请求体发送，由服务端代为调用上游（dashscope 浏览器 CORS 不通，
 * 见 docs/MIGRATION.md §3）；服务端只做白名单校验，不落盘、不回显 Key。
 */
export interface LlmClientSettings {
  provider: LlmProvider
  apiKey: string
  /** 可选模型覆盖（缺省用 provider 默认：deepseek-flash / qwen-plus） */
  model?: string
}

/** AI 总结请求（无状态）：transcript/title/duration 全量透传给服务端 */
export interface SummarizeRequest {
  transcript: TranscriptItem[]
  title: string
  duration: number
  /** 前端设置的 LLM 配置（可选；缺省回落服务端 .env.local 兜底配置） */
  llm?: LlmClientSettings
}

/** 字幕获取响应（POST /api/subtitle） */
export interface TranscriptResponse {
  transcript: TranscriptItem[]
  /** 纯文本全文（无时间戳） */
  plainText: string
  transcriptSource: TranscriptSource
}

/** 健康检查响应（GET /api/health）：仅可达性探测，不含任何配置信息 */
export interface HealthResponse {
  status: string
}

/** 能力探测：只含布尔配置状态，不返回 Key 的任何信息 */
export interface Capabilities {
  /**
   * 总结是否可用：服务端 .env.local 兜底配置 或 前端设置（localStorage llmSettings）任一可用即 true。
   * 本字段只反映**服务端兜底**状态；客户端需与 hasLocalLlm() 合并（见 task-store.loadCapabilities）。
   */
  summarizeConfigured: boolean
}

/**
 * 文字稿来源：subtitle_cc（B站 UP 主手传 CC 字幕）/ subtitle_ai（B站 AI 字幕，
 * 未登录弹幕接口获取）。结果页显示「来源：B站字幕」Badge。
 */
export type TranscriptSource = 'subtitle_cc' | 'subtitle_ai'

/** 流水线阶段：解析链接（提交时）→ 获取字幕（5-7s）→ 生成总结（30-70s） */
export type TaskStage = 'parse_link' | 'fetch_subtitle' | 'summarize'

export interface StageMeta {
  id: TaskStage
  label: string
  description: string
}

/** 三阶段流水线的展示信息 */
export const TASK_STAGES: StageMeta[] = [
  { id: 'parse_link', label: '解析链接', description: '读取视频信息与元数据' },
  { id: 'fetch_subtitle', label: '获取字幕', description: '拉取 CC / AI 字幕并解析' },
  { id: 'summarize', label: '生成总结', description: '提炼概要、要点与章节笔记' },
]

// ---- 错误契约 ----

export type ApiErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_PLATFORM'
  /** 任务缓存不存在（结果页直链但 localStorage 已清） */
  | 'INVALID_TASK'
  /** view API 解析失败（视频不存在/私密/接口异常） */
  | 'PARSE_FAILED'
  /** 视频无可用字幕（不做 ASR 兜底，见 docs/MIGRATION.md §2） */
  | 'NO_SUBTITLE'
  /** 有字幕轨道但下载/解析全部失败（CDN 异常等） */
  | 'SUBTITLE_FETCH_FAILED'
  | 'SUMMARIZE_NOT_CONFIGURED'
  | 'TRANSCRIPT_TOO_LONG'
  | 'SUMMARIZE_FAILED'
  | 'INTERNAL_ERROR'

export interface AppError {
  code: ApiErrorCode
  message: string
}

/** 所有非 2xx 响应的错误体形状 */
export interface ApiErrorBody {
  error: AppError
}
