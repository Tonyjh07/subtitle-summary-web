import type {
  ApiErrorCode,
  ApiErrorBody,
  Capabilities,
  HealthResponse,
  SummarizeRequest,
  Summary,
  TranscriptResponse,
  VideoInfo,
} from '@/lib/types'

/**
 * HTTP 客户端共享类型与错误解析。
 *
 * 各客户端方法内联字面量路径直接 fetch（请求目标为编译期常量，不含 URL 污点流）；
 * 本模块只处理与 Response 相关的错误解析，不接触 URL。
 */

/** 客户端 API 形状契约（单一实现，见 api.ts） */
export interface ApiClient {
  /** POST /api/parse：链接 → 视频元数据 */
  parseVideo: (url: string) => Promise<VideoInfo>
  /** POST /api/subtitle：链接 → 文字稿（约 5-7s；无字幕 → NO_SUBTITLE） */
  fetchSubtitle: (url: string) => Promise<TranscriptResponse>
  /** POST /api/summarize：文字稿 → AI 总结（请求体可携带前端 llm 配置） */
  summarize: (request: SummarizeRequest) => Promise<Summary>
  /** GET /api/capabilities：服务端兜底能力探测（只读布尔，不含 Key；客户端与 localStorage 合并） */
  getCapabilities: () => Promise<Capabilities>
  /** GET /api/health：同源健康检查（失败 / 超时 / 非 2xx 均视为服务不可达） */
  healthCheck: (signal?: AbortSignal) => Promise<HealthResponse>
}

/** 客户端可见的错误码 = 契约错误码 + 网络层补充码 */
export type ClientErrorCode = ApiErrorCode | 'NETWORK_ERROR' | 'UNKNOWN_ERROR'

export class ApiError extends Error {
  constructor(
    public code: ClientErrorCode,
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** 网络层错误归一化：包住 fetch 本身抛出的异常 */
export function throwNetworkError(error: unknown): never {
  if (error instanceof ApiError) throw error
  throw new ApiError('NETWORK_ERROR', '网络异常，请检查网络连接后重试', 0)
}

/** 非 2xx 响应 → ApiError（解析 { error: { code, message } } 形状） */
export async function parseErrorResponse(
  response: Response,
  fallbackCode: ClientErrorCode = 'UNKNOWN_ERROR',
): Promise<ApiError> {
  let code: ClientErrorCode = fallbackCode
  let message = `请求失败（HTTP ${response.status}）`
  try {
    const body = (await response.json()) as ApiErrorBody
    if (body?.error) {
      code = body.error.code
      message = body.error.message
    }
  } catch {
    // 错误体不是 JSON，保留默认提示
  }
  return new ApiError(code, message, response.status)
}

/** 响应 → 数据；请求目标由调用方以字面量路径给出 */
export async function toJson<T>(response: Promise<Response>): Promise<T> {
  let response_: Response
  try {
    response_ = await response
  } catch (error) {
    throwNetworkError(error)
  }
  if (!response_.ok) throw await parseErrorResponse(response_)
  return response_.json() as Promise<T>
}
