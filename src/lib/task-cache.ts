import type {
  Platform,
  Summary,
  TranscriptItem,
  TranscriptSource,
  VideoInfo,
} from '@/lib/types'

/**
 * 任务身份与结果缓存（服务端无存储，刷新恢复全靠这里）。
 *
 * - taskId = base64url(JSON { v: videoId, p, s: startedAt, m: 元数据 })：自含上下文，
 *   与旧 Mock 同款编码（路径段安全），直链访问 /processing、/result 均可重建视频卡
 * - 结果缓存 = localStorage[taskCacheKey(taskId)]：{ video, transcript, plainText,
 *   transcriptSource, summary }；刷新后结果页直接渲染，无需重新请求 B站 / LLM
 * - 缓存 miss → 结果页报 INVALID_TASK「任务已过期」（替代旧 SQLite interrupted 逻辑）
 */

/** taskId 载荷（编解码协议，字段缩写控制 URL 长度） */
export interface TaskPayload {
  /** videoId（BV 号） */
  v: string
  /** platform */
  p: Platform
  /** startedAt（毫秒时间戳） */
  s: number
  /** 元数据（标题/封面/时长）：直链访问时无需再请求 view API 即可渲染视频卡 */
  m?: { t: string; c: string; d: number }
}

const TASK_CACHE_PREFIX = 'subtitle-summary:task:'
/** 缓存条目上限：超出按写入时间淘汰最旧（防 localStorage 撑爆 5MB 配额） */
const MAX_CACHE_ENTRIES = 20

export function encodeTaskId(payload: TaskPayload): string {
  const json = JSON.stringify(payload)
  // btoa 只接受 Latin1：先按 UTF-8 编码再转 base64url（元数据含中文标题）
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeTaskId(taskId: string): TaskPayload | null {
  try {
    const base64 = taskId.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64)
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as TaskPayload
    if (typeof payload?.v !== 'string' || typeof payload?.p !== 'string' || typeof payload?.s !== 'number') {
      return null
    }
    return payload
  } catch {
    return null
  }
}

/** 由 taskId 载荷重建 VideoInfo（直链访问结果页/进度页的视频卡数据） */
export function videoFromPayload(payload: TaskPayload): VideoInfo {
  return {
    platform: payload.p,
    videoId: payload.v,
    title: payload.m?.t ?? '',
    cover: payload.m?.c ?? '',
    duration: payload.m?.d ?? 0,
  }
}

/** 结果缓存条目 */
export interface TaskCacheEntry {
  video: VideoInfo
  transcript: TranscriptItem[]
  plainText: string
  transcriptSource: TranscriptSource | null
  summary: Summary | null
  /** 写入时间（毫秒），淘汰最旧用 */
  savedAt: number
}

function taskCacheKey(taskId: string): string {
  return `${TASK_CACHE_PREFIX}${taskId}`
}

/** 写入结果缓存（失败静默：隐私模式 / 配额受限不阻塞主流程） */
export function saveTaskCache(taskId: string, entry: Omit<TaskCacheEntry, 'savedAt'>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      taskCacheKey(taskId),
      JSON.stringify({ ...entry, savedAt: Date.now() } satisfies TaskCacheEntry),
    )
    pruneOldEntries()
  } catch {
    // 忽略：缓存是加速手段，miss 时有降级路径
  }
}

/** 读取结果缓存；miss / 损坏返回 null */
export function readTaskCache(taskId: string): TaskCacheEntry | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(taskCacheKey(taskId))
    if (!raw) return null
    const entry = JSON.parse(raw) as TaskCacheEntry
    if (!entry?.video || !Array.isArray(entry.transcript)) return null
    return entry
  } catch {
    return null
  }
}

/** 超出条目上限时按 savedAt 淘汰最旧 */
function pruneOldEntries(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key?.startsWith(TASK_CACHE_PREFIX)) keys.push(key)
    }
    if (keys.length <= MAX_CACHE_ENTRIES) return
    const dated = keys.map((key) => {
      let savedAt = 0
      try {
        savedAt = (JSON.parse(window.localStorage.getItem(key) ?? '{}') as TaskCacheEntry).savedAt ?? 0
      } catch {
        savedAt = 0
      }
      return { key, savedAt }
    })
    dated.sort((a, b) => a.savedAt - b.savedAt)
    for (const { key } of dated.slice(0, keys.length - MAX_CACHE_ENTRIES)) {
      window.localStorage.removeItem(key)
    }
  } catch {
    // 忽略：淘汰失败不影响功能
  }
}
