/**
 * B站弹幕元数据接口字幕探测（未登录，零 Cookie）。
 *
 * 链路（侦察报告 backend/docs/bili-subtitle-recon.md）：
 *   GET /x/web-interface/view?bvid=      → data.aid / data.cid / title / pic / duration
 *   GET /x/v2/dm/view?aid=&oid=&type=1   → data.subtitle.subtitles[]（CC 与 AI 轨道）
 *
 * 关键事实（2026-10-06 实测）：
 * - dm/view 未登录即可访问，无需 Cookie / wbi 签名；player/v2 与 wbi/v2 的未登录响应恒为空轨道
 * - AI 轨道（lan 以 "ai-" 开头）仅在 ai_status == 2（已生成）时可用，0/1 跳过；
 *   UP 主手传 CC 轨道无 ai_status 过滤问题
 * - 实测覆盖 5/6 视频；未命中（无字幕）→ 上层报 NO_SUBTITLE，不做 ASR 兜底
 */
import { throttledGetJson } from '@/lib/bili/http'

const API_BASE = 'https://api.bilibili.com'

/** view API 返回的视频元数据（解析与字幕探测共用） */
export interface BiliViewInfo {
  aid: number
  /** 分P的 cid：多 P 视频取 ?p= 对应页，缺省第 1 页 */
  cid: number
  bvid: string
  title: string
  /** 封面 URL（已 http→https 升级） */
  cover: string
  /** 时长（秒） */
  duration: number
}

/** dm/view 返回的字幕轨道（lang/URL 已规范化） */
export interface BiliSubtitleTrack {
  lan: string
  /** 已升级为 https */
  subtitleUrl: string
  isAi: boolean
}

/** view 结果缓存：同视频多次调用（parse + subtitle 两跳）不重复请求 */
const viewCache = new Map<string, BiliViewInfo>()

function toHttps(url: string): string {
  return url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : url
}

/** view API 的视频标识：BV 号优先，其次 av 号（aid） */
export interface BiliVideoRef {
  bvid?: string
  aid?: number
}

/**
 * view API：视频标识 → 视频元数据；失败（视频不存在/私密/接口异常）返回 null。
 * 支持 `p` 参数（多 P 视频，缺省第 1 页）。
 */
export async function getViewInfo(ref: BiliVideoRef, page = 1): Promise<BiliViewInfo | null> {
  const idQuery = ref.bvid
    ? `bvid=${encodeURIComponent(ref.bvid)}`
    : ref.aid
      ? `aid=${ref.aid}`
      : null
  if (!idQuery) return null

  const cacheKey = `${idQuery}?p=${page}`
  const cached = viewCache.get(cacheKey)
  if (cached) return cached

  const payload = await throttledGetJson(`${API_BASE}/x/web-interface/view?${idQuery}`)
  if (!payload || payload.code !== 0) return null
  const data = (payload.data ?? {}) as Record<string, unknown>
  const aid = Number(data.aid)
  const cid = Number(data.cid)
  if (!aid || !cid) return null

  // 多 P：data.pages[p-1].cid 才是目标分P 的 cid
  let finalCid = cid
  if (page > 1) {
    const pages = Array.isArray(data.pages) ? (data.pages as Record<string, unknown>[]) : []
    const target = pages[page - 1]
    const pageCid = target ? Number(target.cid) : 0
    if (!pageCid) return null
    finalCid = pageCid
  }

  const info: BiliViewInfo = {
    aid,
    cid: finalCid,
    bvid: String(data.bvid || ref.bvid || `av${aid}`),
    title: String(data.title || ''),
    cover: toHttps(String(data.pic || '')),
    duration: Number(data.duration) || 0,
  }
  viewCache.set(cacheKey, info)
  return info
}

/**
 * dm/view：视频 → 字幕轨道列表（中文优先，AI 轨道仅收 ai_status=2，CC 优先于 AI）。
 *
 * 返回值语义（侦察报告实测：真无字幕视频返回 code=0 + 空轨道）：
 * - `null`：探测失败（拿不到载荷 / 非 0 应答，如限流、接口抖动）→ 调用方报可重试的 SUBTITLE_FETCH_FAILED
 * - `[]`：**确认**该视频无可用字幕 → 调用方报 NO_SUBTITLE
 * 混淆二者会把「接口暂时不可用」误报成「无字幕，换视频」。
 */
export async function getSubtitleTracks(
  aid: number,
  cid: number,
): Promise<BiliSubtitleTrack[] | null> {
  const payload = await throttledGetJson(
    `${API_BASE}/x/v2/dm/view?aid=${aid}&oid=${cid}&type=1`,
  )
  if (!payload || payload.code !== 0) return null

  const data = (payload.data ?? {}) as Record<string, unknown>
  const subtitle = (data.subtitle ?? {}) as Record<string, unknown>
  const subtitles = Array.isArray(subtitle.subtitles)
    ? (subtitle.subtitles as Record<string, unknown>[])
    : []

  const tracks: BiliSubtitleTrack[] = []
  for (const sub of subtitles) {
    const lan = String(sub.lan || '')
    const rawUrl = String(sub.subtitle_url || '')
    if (!lan || !rawUrl) continue
    const isAi = lan.startsWith('ai-')
    // AI 轨道 ai_status: 2=已生成；0/1 跳过。CC 轨道不适用该字段。
    if (isAi && Number(sub.ai_status) !== 2) continue
    tracks.push({ lan, subtitleUrl: toHttps(rawUrl), isAi })
  }

  // CC 优先于 AI；中文优先
  const rank = (track: BiliSubtitleTrack): number => {
    const lang = track.lan.toLowerCase()
    const zhScore = lang.startsWith('zh') ? 2 : lang.includes('zh') ? 1 : 0
    return (track.isAi ? 1 : 0) * 4 + (2 - zhScore)
  }
  tracks.sort((a, b) => rank(a) - rank(b))
  return tracks
}
