import { create } from 'zustand'
import { api, ApiError, type ClientErrorCode } from '@/lib/api'
import { hasLocalLlm, readLlmSettings } from '@/lib/llm-settings'
import { decodeTaskId, encodeTaskId, readTaskCache, saveTaskCache, videoFromPayload } from '@/lib/task-cache'
import type {
  Capabilities,
  SummarizeRequest,
  Summary,
  TaskStage,
  TranscriptItem,
  TranscriptSource,
  VideoInfo,
} from '@/lib/types'

/** UI 层错误 = 接口契约错误码 + 客户端网络层错误码 */
export interface UiError {
  code: ClientErrorCode
  message: string
}

/**
 * 任务状态机（纯前端形态）：idle → parsing → fetching → summarizing → done | error。
 *
 * 与旧版的差异（docs/MIGRATION.md §4）：
 * - 无轮询：字幕获取是单次 /api/subtitle 请求（5-7s），进度条由客户端 ticker 推算动画
 * - 无服务端任务：taskId 自含上下文，结果缓存 localStorage，刷新由 recover 恢复
 * - 阶段 4 → 3（解析链接 → 获取字幕 → 生成总结）
 */
export type TaskPhase = 'idle' | 'parsing' | 'fetching' | 'summarizing' | 'done' | 'error'

interface TaskState {
  phase: TaskPhase
  taskId: string | null
  video: VideoInfo | null
  /** 提交时的原始链接；恢复场景缺省时由 videoId 重建（仅支持 B站视频页） */
  sourceUrl: string | null
  stage: TaskStage | null
  progress: number
  transcript: TranscriptItem[] | null
  plainText: string | null
  summary: Summary | null
  /** 总结失败信息（P0 降级：不影响 phase，文字稿照常渲染，仅总结区显示错误与重试） */
  summaryError: string | null
  error: UiError | null
  /** 解析后自动 AI 总结（首页开关；用户偏好，localStorage 持久化，跨任务保留，不随 reset 清空） */
  autoSummary: boolean
  /** 文字稿来源（结果页显示来源 Badge） */
  transcriptSource: TranscriptSource | null
  /** 能力探测：null=检测中；会话内加载一次，跨任务保留；不随 reset 清空 */
  capabilities: Capabilities | null

  /** 首页提交链接：解析视频信息并生成 taskId。成功返回 taskId（供路由跳转），失败返回 null。 */
  submitUrl: (url: string) => Promise<string | null>
  /** 进度页流水线：获取字幕 →（autoSummary）生成总结。幂等，进行中重入直接返回。 */
  runPipeline: () => Promise<void>
  /** 刷新 / 直链访问时按 taskId 恢复：cache 命中恢复结果；miss 时按 mode 续跑或报错 */
  recover: (taskId: string, mode: 'processing' | 'result') => Promise<void>
  /** 失败后重试：重置错误并重新进入流水线（taskId 不变，同视频） */
  retry: () => void
  /** 总结失败后重试（文字稿已在手，直接重调 summarize） */
  retrySummary: () => Promise<void>
  /** 加载能力探测（幂等；`force` 强制刷新——设置保存/清除后重新合并本机配置） */
  loadCapabilities: (options?: { force?: boolean }) => Promise<void>
  /** 首页切换「解析后自动 AI 总结」（写入 localStorage） */
  setAutoSummary: (enabled: boolean) => void
  /** 从 localStorage 水合用户偏好：挂载后调用（SSR 阶段不读 localStorage，避免水合不一致） */
  hydratePreferences: () => void
  reset: () => void
}

/** 本地偏好存储键：仅布尔值（'false' = 关闭），不含任何 Key 或隐私信息 */
const AUTO_SUMMARY_KEY = 'autoSummary'

/** 读偏好：读不到 / 存储不可用一律视为开启（默认开启） */
function readAutoSummary(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(AUTO_SUMMARY_KEY) !== 'false'
  } catch {
    return true
  }
}

function persistAutoSummary(enabled: boolean): void {
  try {
    window.localStorage.setItem(AUTO_SUMMARY_KEY, String(enabled))
  } catch {
    // 隐私模式 / 配额受限：仅本次会话生效，不阻塞主流程
  }
}

/** B站视频页 URL 模板（恢复场景从 videoId 重建请求 URL；仅支持 B站） */
function rebuildUrl(videoId: string): string {
  return `https://www.bilibili.com/video/${videoId}`
}

/** 总结请求体：附带前端设置的 LLM 配置（localStorage；缺省 → 服务端 .env 兜底） */
function withLocalLlm(request: Omit<SummarizeRequest, 'llm'>): SummarizeRequest {
  return { ...request, llm: readLlmSettings() ?? undefined }
}

/** 未配置 LLM Key 的统一引导文案（指向顶栏设置弹窗） */
const NOT_CONFIGURED_HINT = '未配置 LLM Key，无法生成总结：请点击右上角「设置」按钮填写后重试'

// ---- 进度 ticker：单次长请求期间的客户端推算动画 ----

let progressTimer: ReturnType<typeof setInterval> | null = null

type ProgressSetter = (updater: (state: TaskState) => Partial<TaskState>) => void

/**
 * 启动进度动画：每 350ms 向 `cap` 逼近（渐近收敛，不会越过上限，
 * 阶段切换时换 cap，完成时由 stopProgress + progress:100 收尾）。
 */
function startProgress(set: ProgressSetter, cap: number): void {
  stopProgress()
  progressTimer = setInterval(() => {
    set((state) => {
      if (state.progress >= cap) return {}
      const next = Math.min(cap, state.progress + (cap - state.progress) * 0.06 + 0.6)
      return { progress: Math.round(next * 10) / 10 }
    })
  }, 350)
}

function stopProgress(): void {
  if (progressTimer) {
    clearInterval(progressTimer)
    progressTimer = null
  }
}

/** 防止流水线重入（模块级，比 state 快一拍，StrictMode 双调用也只跑一次） */
let pipelineInFlight = false

/**
 * 防止提交重入（与 pipelineInFlight 同款）：解析进行中重复提交直接复用同一 Promise。
 * 背景：`submitting` 是 React 异步 state，快速连击/回车+点击竞态可穿透守卫，
 * 并发打多个 /api/parse 会加剧 B站限流——前几个失败误报「视频不存在」，
 * 后成功的那个又自动跳转，出现「报错后自己进入解析」的矛盾现象（线上 bug 实测）。
 */
let submitInFlight: Promise<string | null> | null = null

const IDLE = {
  phase: 'idle' as const,
  taskId: null,
  video: null,
  sourceUrl: null,
  stage: null,
  progress: 0,
  transcript: null,
  plainText: null,
  summary: null,
  summaryError: null,
  error: null,
  transcriptSource: null,
}

function toAppError(error: unknown): UiError {
  if (error instanceof ApiError) {
    return { code: error.code, message: error.message }
  }
  return { code: 'INTERNAL_ERROR', message: '出了点问题，请稍后重试' }
}

export const useTaskStore = create<TaskState>((set, get) => ({
  ...IDLE,
  autoSummary: true,
  capabilities: null,

  loadCapabilities: async (options) => {
    if (!options?.force && get().capabilities) return // 幂等：会话内只探测一次
    try {
      const server = await api.getCapabilities()
      // 两级配置合并：服务端 .env 兜底 || 前端设置（localStorage llmSettings）
      set({ capabilities: { summarizeConfigured: server.summarizeConfigured || hasLocalLlm() } })
    } catch {
      // 探测失败不阻塞主流程：乐观放行（后续 summarize 请求会给出明确错误）
      set({ capabilities: { summarizeConfigured: true } })
    }
  },

  submitUrl: (url) => {
    if (submitInFlight) return submitInFlight
    submitInFlight = (async () => {
      stopProgress()
      set({ ...IDLE, phase: 'parsing' })
      try {
        const video = await api.parseVideo(url)
        const taskId = encodeTaskId({
          v: video.videoId,
          p: video.platform,
          s: Date.now(),
          m: { t: video.title, c: video.cover, d: video.duration },
        })
        set({
          video,
          sourceUrl: url,
          taskId,
          phase: 'fetching',
          stage: 'parse_link',
          progress: 2,
        })
        return taskId
      } catch (error) {
        set({ phase: 'error', error: toAppError(error) })
        return null
      } finally {
        submitInFlight = null
      }
    })()
    return submitInFlight
  },

  runPipeline: async () => {
    const { taskId, sourceUrl, video } = get()
    if (!taskId || !video) return
    if (get().phase !== 'fetching') return
    if (pipelineInFlight) return
    pipelineInFlight = true

    const requestUrl = sourceUrl ?? rebuildUrl(video.videoId)

    try {
      // ---- 阶段 2：获取字幕（单次请求 5-7s，含 view + dm/view + 字幕下载的节流多跳） ----
      set({ stage: 'fetch_subtitle', error: null, summaryError: null })
      startProgress(set, 88)

      const result = await api.fetchSubtitle(requestUrl)
      if (get().taskId !== taskId) return // 用户已离开当前任务

      const transcriptReady = {
        transcript: result.transcript,
        plainText: result.plainText,
        transcriptSource: result.transcriptSource,
      }
      set({ ...transcriptReady, stage: 'summarize' })
      // 先落文字稿缓存：总结中断 / 刷新时结果页仍可直接恢复
      saveTaskCache(taskId, { video, ...transcriptReady, summary: null })

      // ---- 用户偏好（autoSummary=false）：不自动调用 summarize，结果页提供手动生成入口 ----
      if (!get().autoSummary) {
        stopProgress()
        set({ phase: 'done', progress: 100, summary: null, summaryError: null })
        return
      }

      set({ phase: 'summarizing' })
      startProgress(set, 97)

      // 能力前置：本机与服务端都没配置 LLM Key 时不发起无用请求，直接给出引导
      if (!get().capabilities) await get().loadCapabilities() // 首页/直访未探测时补一次
      if (get().capabilities?.summarizeConfigured === false && !hasLocalLlm()) {
        stopProgress()
        set({ phase: 'done', progress: 100, summary: null, summaryError: NOT_CONFIGURED_HINT })
        return
      }

      try {
        const summary = await api.summarize(
          withLocalLlm({
            transcript: result.transcript,
            title: video.title,
            duration: video.duration,
          }),
        )
        if (get().taskId !== taskId) return
        stopProgress()
        set({ phase: 'done', progress: 100, summary })
        saveTaskCache(taskId, { video, ...transcriptReady, summary })
      } catch (error) {
        // P0 降级：总结失败不改变任务 phase，文字稿照常渲染，仅记录总结错误
        if (get().taskId !== taskId) return
        stopProgress()
        set({ phase: 'done', progress: 100, summary: null, summaryError: toAppError(error).message })
      }
    } catch (error) {
      stopProgress()
      if (get().taskId !== taskId) return
      set({ phase: 'error', error: toAppError(error) })
    } finally {
      pipelineInFlight = false
      // 竞态兜底：流水线运行期间 taskId 被并发提交/恢复替换（旧流水线在
      // `taskId !== 任务` 检查处退出），且视图 effect 早已因 pipelineInFlight
      // 早退、状态不再变化 → effect 永不重触发，页面会永久卡住。
      // 此时状态仍停在 fetching，说明新任务还没人跑 → 主动补跑。
      const state = get()
      if (state.phase === 'fetching' && state.taskId && state.taskId !== taskId) {
        void get().runPipeline()
      }
    }
  },

  recover: async (taskId, mode) => {
    if (get().taskId === taskId && (get().phase === 'done' || get().phase === 'summarizing')) return
    stopProgress()

    const payload = decodeTaskId(taskId)
    if (!payload) {
      set({ ...IDLE, taskId, phase: 'error', error: { code: 'INVALID_TASK', message: '链接无效，请重新解析视频链接' } })
      return
    }

    const cache = readTaskCache(taskId)
    const video = cache?.video ?? videoFromPayload(payload)
    set({ ...IDLE, taskId, video, sourceUrl: rebuildUrl(payload.v) })

    // ---- 缓存 miss ----
    if (!cache) {
      if (mode === 'processing') {
        // 进度页刷新（任务进行中被刷新，结果尚未落缓存）：续跑流水线
        set({ phase: 'fetching', stage: 'parse_link', progress: 2 })
        return
      }
      set({ phase: 'error', error: { code: 'INVALID_TASK', message: '任务已过期或本地缓存已清除，请重新解析视频链接' } })
      return
    }

    const transcriptReady = {
      transcript: cache.transcript,
      plainText: cache.plainText,
      transcriptSource: cache.transcriptSource,
    }
    set({ ...transcriptReady })

    // ---- 缓存命中：已有总结 → 直接完成 ----
    if (cache.summary) {
      set({ phase: 'done', progress: 100, summary: cache.summary })
      return
    }

    // ---- 缓存命中但无总结：尊重 autoSummary 开关补生成（P0 降级同流水线） ----
    if (!get().autoSummary) {
      set({ phase: 'done', progress: 100, summary: null, summaryError: null })
      return
    }

    set({ phase: 'summarizing', stage: 'summarize', progress: 90, summaryError: null })
    if (!get().capabilities) await get().loadCapabilities()
    if (get().capabilities?.summarizeConfigured === false && !hasLocalLlm()) {
      set({ phase: 'done', progress: 100, summary: null, summaryError: NOT_CONFIGURED_HINT })
      return
    }
    try {
      const summary = await api.summarize(
        withLocalLlm({
          transcript: cache.transcript,
          title: video.title,
          duration: video.duration,
        }),
      )
      if (get().taskId !== taskId) return
      set({ phase: 'done', progress: 100, summary })
      saveTaskCache(taskId, { video, ...transcriptReady, summary })
    } catch (error) {
      // P0 降级：文字稿可渲染，仅总结区降级
      if (get().taskId !== taskId) return
      set({ phase: 'done', progress: 100, summary: null, summaryError: toAppError(error).message })
    }
  },

  retry: () => {
    stopProgress()
    set({ phase: 'fetching', stage: 'parse_link', progress: 2, error: null, summaryError: null })
  },

  retrySummary: async () => {
    const { taskId, transcript, video } = get()
    if (!taskId || !transcript) return
    set({ summaryError: null })
    try {
      const summary = await api.summarize(
        withLocalLlm({
          transcript,
          title: video?.title ?? '',
          duration: video?.duration ?? 0,
        }),
      )
      set({ summary })
      if (video) saveTaskCache(taskId, { video, transcript, plainText: get().plainText ?? '', transcriptSource: get().transcriptSource, summary })
    } catch (error) {
      set({ summaryError: toAppError(error).message })
    }
  },

  setAutoSummary: (enabled) => {
    set({ autoSummary: enabled })
    persistAutoSummary(enabled)
  },

  hydratePreferences: () => set({ autoSummary: readAutoSummary() }),

  // 不清 autoSummary：用户偏好，跨任务保留
  reset: () => {
    stopProgress()
    set({ ...IDLE })
  },
}))

/** 非组件场景读取状态（如导出前校验） */
export const getTaskState = useTaskStore.getState
