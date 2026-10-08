import { NextResponse } from 'next/server'
import { ApiError, API_ERROR_STATUS } from '@/lib/api-error'
import type { ApiErrorBody, AppError } from '@/lib/types'

/**
 * Route Handler 共享工具：把业务错误（ApiError）映射为契约约定的 HTTP 状态码。
 */

export function toErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } satisfies AppError },
      { status: API_ERROR_STATUS[error.code] ?? 500 },
    )
  }
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: '服务开小差了，请稍后重试' } satisfies AppError },
    { status: 500 },
  )
}

export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}
