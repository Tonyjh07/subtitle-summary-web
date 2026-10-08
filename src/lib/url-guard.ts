/**
 * URL 安全守卫。
 *
 * 约束：请求 URL 仅允许 http/https，拒绝 localhost、环回、私有与保留地址。
 * 当前 Demo 的客户端请求指向同源 Route Handlers；此守卫用于：
 * 1. NEXT_PUBLIC_API_BASE_URL 配置绝对地址时的出口校验；
 * 2. 接入真实后端后，服务端对用户输入 URL 的入口校验复用同一份规则。
 */

/** hostname 是否属于 localhost / 环回 / 私有 / 保留地址 */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')

  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.local') || host.endsWith('.internal')) return true

  if (host.includes(':')) return isReservedIPv6(host)
  return isReservedIPv4(host)
}

function isReservedIPv4(host: string): boolean {
  const parts = host.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false
  const octets = parts.map(Number)
  if (octets.some((value) => value > 255)) return true

  const [a, b, c] = octets
  if (a === 0 || a === 10 || a === 127) return true // 本网络 / 私有 / 环回
  if (a === 169 && b === 254) return true // 链路本地
  if (a === 172 && b >= 16 && b <= 31) return true // 私有
  if (a === 192 && b === 168) return true // 私有
  if (a === 192 && b === 0) return true // 192.0.0.0/24 与 192.0.2.0/24（TEST-NET-1）
  if (a === 198 && (b === 18 || b === 19)) return true // 网络基准测试
  if (a === 198 && b === 51 && c === 100) return true // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true // TEST-NET-3
  if (a >= 224) return true // 组播 / 保留 / 广播
  return false
}

function isReservedIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (h === '::' || h === '::1') return true // 未指定 / 环回
  if (/^f[cd]/.test(h)) return true // unique local fc00::/7
  if (/^fe[89ab]/.test(h)) return true // 链路本地 fe80::/10
  if (h.startsWith('::ffff:')) return isReservedIPv4(h.slice(7)) // IPv4-mapped
  return false
}

/**
 * 校验完整 URL 可用于发请求：仅 http/https 且 host 非保留地址。
 * `options.selfOrigin`：请求自身站点 origin 时视为可信（同源请求不构成 SSRF）。
 * 不合法返回 null。
 */
export function toSafeHttpUrl(
  raw: string,
  options?: { selfOrigin?: string },
): URL | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (isBlockedHost(url.hostname)) {
    if (options?.selfOrigin && url.origin === options.selfOrigin) return url
    return null
  }
  return url
}
