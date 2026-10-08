import { NextResponse } from 'next/server'
import { parseVideo } from '@/lib/bili'
import { readJsonBody, toErrorResponse } from '@/lib/api-server'

/**
 * POST /api/parse：B站视频页链接 → VideoInfo（title / cover / duration）。
 *
 * 服务端执行：URL 白名单校验 → b23.tv 短链展开 → view API（1.5s 节流）。
 */
export async function POST(request: Request) {
  try {
    const body = await readJsonBody<{ url?: string }>(request)
    const video = await parseVideo(body?.url ?? '')
    return NextResponse.json(video)
  } catch (error) {
    return toErrorResponse(error)
  }
}
