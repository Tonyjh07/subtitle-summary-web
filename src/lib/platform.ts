import { PLATFORM_REGISTRY, getPlatformMeta } from '@/lib/platforms/registry'
import { isBlockedHost } from '@/lib/url-guard'
import type { Platform } from '@/lib/types'

export interface ResolveSuccess {
  ok: true
  platform: Platform
  videoId: string
}

export interface ResolveFailure {
  ok: false
  reason: 'invalid' | 'unsupported'
  /** reason=unsupported 时的平台域名，用于错误提示 */
  host?: string
}

export type ResolveResult = ResolveSuccess | ResolveFailure

/**
 * 解析用户输入的视频链接。
 * - 格式非法（无法 URL 化、非 http(s)）→ { ok: false, reason: 'invalid' }
 * - 域名不在平台注册表 → { ok: false, reason: 'unsupported' }
 * - 成功 → 平台 + videoId
 *
 * 注意：仅做字符串层面的解析，不发起任何网络请求（SSRF 防护交由真实后端完成）。
 */
export function resolveVideoUrl(rawUrl: string): ResolveResult {
  const trimmed = rawUrl.trim()
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'invalid' }
  }
  // 拒绝 localhost / 环回 / 私有 / 保留地址（为接入真实后端预留的 SSRF 入口约束）
  if (isBlockedHost(url.hostname)) {
    return { ok: false, reason: 'invalid' }
  }

  const host = url.hostname.toLowerCase()
  for (const meta of Object.values(PLATFORM_REGISTRY)) {
    const isMainHost = meta.hostPatterns.some((pattern) => pattern.test(host))
    const isShareHost = meta.shareHostPatterns.some((pattern) => pattern.test(host))
    if (!isMainHost && !isShareHost) continue

    // 路径里能直接取到 videoId（B站 b23.tv/BVxxx 短链路径即含 ID）
    for (const pattern of meta.videoIdPatterns) {
      const match = url.pathname.match(pattern)
      if (match?.[1]) return { ok: true, platform: meta.id, videoId: match[1] }
    }
    // 取不到 videoId：短链等场景，用末段路径做占位（B站场景 b23.tv 由服务端展开后再提取）
    const segments = url.pathname.split('/').filter(Boolean)
    const videoId = segments.at(-1) ?? fallbackVideoId(url)
    return { ok: true, platform: meta.id, videoId }
  }

  return { ok: false, reason: 'unsupported', host }
}

function fallbackVideoId(url: URL): string {
  const digest = Array.from(url.pathname + url.search).reduce(
    (acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0,
    0,
  )
  return `demo${digest.toString(36)}`
}

export { getPlatformMeta }
