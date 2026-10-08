import type { ApiErrorCode } from '@/lib/types'

/**
 * 服务端业务错误：携带契约错误码，由 Route Handler 统一映射为
 * `{ error: { code, message } }` + HTTP 状态码（见 api-server.toErrorResponse）。
 *
 * 服务端专用；客户端错误解析见 http.ts 的 ApiError（含 status，两者解耦）。
 */
export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** 契约错误码 → HTTP 状态码（单向映射，客户端不依赖状态码分支） */
export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  INVALID_URL: 400,
  UNSUPPORTED_PLATFORM: 422,
  INVALID_TASK: 404,
  PARSE_FAILED: 502,
  NO_SUBTITLE: 404,
  SUBTITLE_FETCH_FAILED: 502,
  SUMMARIZE_NOT_CONFIGURED: 400,
  TRANSCRIPT_TOO_LONG: 413,
  SUMMARIZE_FAILED: 502,
  INTERNAL_ERROR: 500,
}
