import { JSON_HEADERS, toJson, throwNetworkError, type ApiClient } from '@/lib/http'
import type {
  Capabilities,
  HealthResponse,
  SummarizeRequest,
  Summary,
  TranscriptResponse,
  VideoInfo,
} from '@/lib/types'

export { ApiError, type ClientErrorCode } from '@/lib/http'

/**
 * 客户端 API 单一实现（同源 /api/* Route Handlers，见 src/app/api/）。
 *
 * 请求目标均为编译期字面量路径；无 Mock / 真实双实现分流（Mock 层已删除）。
 */

export const api: ApiClient = {
  /** POST /api/parse：解析视频链接（服务端 view API + 短链展开） */
  parseVideo: (url: string): Promise<VideoInfo> =>
    toJson(
      fetch('/api/parse', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ url }) }).catch(
        throwNetworkError,
      ),
    ),

  /** POST /api/subtitle：获取文字稿（约 5-7s，单次往返，无轮询） */
  fetchSubtitle: (url: string): Promise<TranscriptResponse> =>
    toJson(
      fetch('/api/subtitle', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ url }) }).catch(
        throwNetworkError,
      ),
    ),

  /** POST /api/summarize：生成 AI 总结（服务端代发上游请求；Key 随请求体 llm 字段带来，优先于服务端 env 兜底） */
  summarize: (request: SummarizeRequest): Promise<Summary> =>
    toJson(
      fetch('/api/summarize', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(request),
      }).catch(throwNetworkError),
    ),

  /** GET /api/capabilities：服务端 env 兜底的 Key 是否已配置（客户端与 localStorage 配置合并） */
  getCapabilities: (): Promise<Capabilities> =>
    toJson(fetch('/api/capabilities').catch(throwNetworkError)),

  /** GET /api/health：同源健康检查 */
  healthCheck: (signal?: AbortSignal): Promise<HealthResponse> =>
    toJson(fetch('/api/health', { signal }).catch(throwNetworkError)),
} as const
