/**
 * B站字幕获取编排（服务端）：用户 URL → 视频元数据 / 文字稿。
 *
 * 链路（侦察报告见旧仓库 backend/docs/bili-subtitle-recon.md）：
 *   1. resolveVideoUrl 字符串层校验（复用前端同一套白名单 + SSRF 守卫）
 *   2. b23.tv 短链：服务端跟随 302 展开（浏览器直调 CORS 不可见 Location）
 *   3. view API → aid / cid / title / cover / duration（替代 yt-dlp 解析）
 *   4. dm/view → 字幕轨道（CC 优先于 AI，AI 仅 ai_status=2）
 *   5. 下载字幕体（域名白名单 + http→https）→ 多格式解析 → transcript
 *
 * 无字幕（实测约 1/6 视频）→ 抛 NO_SUBTITLE，不做 ASR 兜底（产品决策，见 docs/MIGRATION.md §2）。
 */
import { ApiError } from '@/lib/api-error'
import { getSubtitleTracks, getViewInfo, type BiliViewInfo } from '@/lib/bili/dm-view'
import { downloadText } from '@/lib/bili/http'
import { parseSubtitleBody } from '@/lib/bili/subtitle-parser'
import { resolveVideoUrl } from '@/lib/platform'
import type { TranscriptItem, TranscriptSource, VideoInfo } from '@/lib/types'

/** 最多尝试下载的轨道数（按 排序后的优先顺序） */
const MAX_TRACKS_TO_TRY = 5

/** 用户输入 → B站视频标识（bvid/aid + 分P 页码） */
export interface BiliTarget {
  bvid?: string
  aid?: number
  /** 多 P 页码，缺省 1 */
  page: number
  /** 展开/规范化后的视频页 URL（供日志与调试） */
  canonicalUrl: string
}

const BV_PATTERN = /\/video\/(BV[0-9A-Za-z]+)/i
const AV_PATTERN = /\/video\/(av\d+)/i

/**
 * 校验并展开用户输入的 B站链接 → 视频标识。
 * - 非法 / 非 B站 → 抛 INVALID_URL / UNSUPPORTED_PLATFORM
 * - b23.tv 短链 → 服务端跟随重定向取最终 URL 再提取
 * - 提取不到 BV/av → 抛 PARSE_FAILED（链接形态无法识别）
 */
export async function resolveBiliTarget(rawUrl: string): Promise<BiliTarget> {
  const trimmed = rawUrl.trim()
  const resolved = resolveVideoUrl(trimmed)
  if (!resolved.ok) {
    if (resolved.reason === 'invalid') {
      throw new ApiError('INVALID_URL', '链接格式不正确，请粘贴完整的视频链接')
    }
    throw new ApiError(
      'UNSUPPORTED_PLATFORM',
      `暂不支持「${resolved.host ?? '该平台'}」，当前仅支持哔哩哔哩`,
    )
  }

  let candidate = trimmed
  if (!BV_PATTERN.test(candidate) && !AV_PATTERN.test(candidate)) {
    // b23.tv 等短链：路径里没有 BV 号，必须先服务端展开
    candidate = await expandShortLink(candidate)
  }

  return extractTarget(candidate)
}

/**
 * b23.tv 短链展开：服务端跟随 302（最多 3 跳），落地页仍须通过 B站平台校验。
 * 非短链原样返回（已通过 B站平台校验的页面链接）。
 */
async function expandShortLink(url: string): Promise<string> {
  const resolved = resolveVideoUrl(url)
  if (!resolved.ok) return url

  let current = url
  for (let hop = 0; hop < 3; hop++) {
    let response: Response
    try {
      response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
      })
    } catch {
      return current // 网络失败：按原 URL 继续，交由 view API 给出最终错误
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) return current
      let next: string
      try {
        next = new URL(location, current).toString()
      } catch {
        return current
      }
      // 落地目标仍须是合法 B站页面（防止短链重定向到任意域）
      const check = resolveVideoUrl(next)
      if (!check.ok) return current
      current = next
      continue
    }
    return current
  }
  return current
}

/** 从（已展开的）视频页 URL 提取 BV/av 与分P 页码 */
function extractTarget(url: string): BiliTarget {
  const bv = BV_PATTERN.exec(url)?.[1]
  if (bv) return { bvid: bv, page: readPageParam(url), canonicalUrl: url }

  const av = AV_PATTERN.exec(url)?.[1]
  if (av) return { aid: Number(av.slice(2)), page: readPageParam(url), canonicalUrl: url }

  throw new ApiError('PARSE_FAILED', '无法从链接中识别视频号，请检查链接是否为 B站视频页')
}

/** 读取 ?p= 分P 参数（缺省第 1 页） */
function readPageParam(url: string): number {
  try {
    const p = Number(new URL(url).searchParams.get('p'))
    return Number.isInteger(p) && p > 0 ? p : 1
  } catch {
    return 1
  }
}

/** view API 拉取视频元数据；失败（不存在/私密/接口异常）→ PARSE_FAILED */
async function requireViewInfo(target: BiliTarget): Promise<BiliViewInfo> {
  const info = await getViewInfo({ bvid: target.bvid, aid: target.aid }, target.page)
  if (!info) {
    throw new ApiError('PARSE_FAILED', '视频不存在、不可访问或链接有误，请检查后重试')
  }
  return info
}

/** POST /api/parse：B站视频页 URL → VideoInfo（view API 替代 yt-dlp） */
export async function parseVideo(rawUrl: string): Promise<VideoInfo> {
  const target = await resolveBiliTarget(rawUrl)
  const info = await requireViewInfo(target)
  return {
    title: info.title,
    cover: info.cover,
    duration: info.duration,
    platform: 'bilibili',
    videoId: info.bvid,
  }
}

/** 文字稿获取结果 */
export interface TranscriptResult {
  transcript: TranscriptItem[]
  /** 纯文本全文（无时间戳） */
  plainText: string
  transcriptSource: TranscriptSource
}

/**
 * POST /api/subtitle：B站视频页 URL → 文字稿。
 *
 * 覆盖不到字幕（dm/view 无轨道）→ NO_SUBTITLE；
 * 有轨道但下载/解析全部失败 → SUBTITLE_FETCH_FAILED。
 */
export async function fetchTranscript(rawUrl: string): Promise<TranscriptResult> {
  const target = await resolveBiliTarget(rawUrl)
  const info = await requireViewInfo(target)

  const tracks = await getSubtitleTracks(info.aid, info.cid)
  if (tracks.length === 0) {
    throw new ApiError(
      'NO_SUBTITLE',
      '该视频无可用字幕（UP 主未上传 CC 字幕，AI 字幕也未生成），暂无法生成文字稿',
    )
  }

  for (const track of tracks.slice(0, MAX_TRACKS_TO_TRY)) {
    const text = await downloadText(track.subtitleUrl)
    if (!text) continue
    const items = parseSubtitleBody(text, guessExt(track.subtitleUrl))
    if (!items) continue
    return toTranscriptResult(items, track.isAi)
  }

  throw new ApiError('SUBTITLE_FETCH_FAILED', '字幕下载失败，请稍后重试')
}

/** 从 URL 路径猜扩展名（B站字幕 URL 通常以 .json / .vtt 结尾，猜不出按 json 兜底） */
function guessExt(url: string): string {
  const path = url.split('?')[0]
  const match = /\.([a-z0-9]+)$/i.exec(path)
  return match ? match[1].toLowerCase() : 'json'
}

function toTranscriptResult(items: TranscriptItem[], isAi: boolean): TranscriptResult {
  return {
    transcript: items,
    plainText: items.map((item) => item.text).join(''),
    transcriptSource: isAi ? 'subtitle_ai' : 'subtitle_cc',
  }
}
