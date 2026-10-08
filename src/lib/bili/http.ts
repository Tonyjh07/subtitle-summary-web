/**
 * B站接口请求层（服务端专用）：1.5s 节流 + 浏览器 UA/Referer 头。
 *
 * 移植自 backend/app/services/bili_player_api.py（节流 + _get_json）与
 * subtitles.py（字幕下载）。约束不变：
 * - API 请求（api.bilibili.com）串行节流，模拟正常网页节奏，避免触发反爬
 * - 字幕体下载走 aisubtitle CDN，与 API 节流无关（不同域名，直接并发）
 * - 超时统一 AbortSignal.timeout，避免挂死 Route Handler
 */

/** API 请求间隔（毫秒）：距上一次 API 请求不足该间隔则排队等待 */
const REQUEST_INTERVAL_MS = 1500

/** 单次请求超时 */
const REQUEST_TIMEOUT_MS = 20_000

/** 正常 Chrome UA + B站 Referer（未登录零 Cookie 前提下 dm/view 可用，见侦察报告） */
const API_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Referer: 'https://www.bilibili.com/',
  Origin: 'https://www.bilibili.com',
  Accept: 'application/json, text/plain, */*',
}

/** 字幕体下载头（与 API 头分离：CDN 不需要 Origin） */
const DOWNLOAD_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  Referer: 'https://www.bilibili.com/',
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let lastRequestAt = 0
let queue: Promise<unknown> = Promise.resolve()

/** 节流后的 fetch：所有 API 请求排进同一条队列，相邻请求间隔 ≥ REQUEST_INTERVAL_MS */
async function throttledFetch(url: string): Promise<Response> {
  const run = async (): Promise<Response> => {
    const wait = lastRequestAt + REQUEST_INTERVAL_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
    return fetch(url, {
      headers: API_HEADERS,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'follow',
    })
  }
  // 队列串行化：无论前一个请求成败，后续请求都要等它落地
  const task = queue.then(run, run)
  queue = task.catch(() => undefined)
  return task
}

type JsonObject = Record<string, unknown>

/**
 * 瞬时故障重试次数（412 风控 / 超时 / 连接重置等导致的「拿不到载荷」）。
 * 每次重试仍走节流队列（相邻请求 ≥1.5s），不会放大请求频率。
 * 注意：`payload.code !== 0` 属于**明确的服务端应答**（如视频不存在），不重试。
 */
const FETCH_RETRIES = 2

async function getJsonOnce(url: string): Promise<JsonObject | null> {
  try {
    const response = await throttledFetch(url)
    if (!response.ok) return null
    const payload: unknown = await response.json()
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload as JsonObject
    }
    return null
  } catch {
    return null
  }
}

/**
 * 节流 GET JSON：返回对象载荷，任何失败（网络/超时/非对象/非 JSON）重试
 * `FETCH_RETRIES` 次后返回 null。调用方（分层降级）依赖 null 判断「本层未命中」，不抛异常。
 *
 * 修复：B站接口偶发 412/超时若不重试，会被上层误报成「视频不存在」或「无字幕」。
 */
export async function throttledGetJson(url: string): Promise<JsonObject | null> {
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    const payload = await getJsonOnce(url)
    if (payload) return payload
  }
  return null
}

/**
 * 下载字幕体文本：仅 http/https 且域名在 B站白名单内（调用方已校验，此处兜底再查一次）。
 * 失败返回 null（上层静默降级到下一条轨道）。
 */
export async function downloadText(url: string): Promise<string | null> {
  if (!isAllowedSubtitleUrl(url)) return null
  const downloadUrl = url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : url
  try {
    const response = await fetch(downloadUrl, {
      headers: DOWNLOAD_HEADERS,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'follow',
    })
    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  }
}

/** 字幕下载 URL 仅允许 B站自家域名（该 URL 来自 dm/view 的解析结果） */
const ALLOWED_SUBTITLE_HOST_SUFFIXES = ['bilibili.com', 'hdslb.com', 'bilibili.tv']

/** hostname 是否在字幕下载白名单（与 url-guard 的保留地址拒绝叠加使用） */
export function isAllowedSubtitleUrl(rawUrl: string): boolean {
  let host: string | null
  try {
    host = new URL(rawUrl).hostname.toLowerCase()
  } catch {
    return false
  }
  if (!host) return false
  return ALLOWED_SUBTITLE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}
