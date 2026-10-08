import { NextResponse } from 'next/server'
import { fetchTranscript } from '@/lib/bili'
import { readJsonBody, toErrorResponse } from '@/lib/api-server'

/**
 * POST /api/subtitle：B站视频页链接 → { transcript, plainText, transcriptSource }。
 *
 * 服务端执行：view API → dm/view 字幕轨道 → 下载字幕体 → 多格式解析。
 * 无可用字幕 → NO_SUBTITLE（不做 ASR 兜底）；有轨道但下载失败 → SUBTITLE_FETCH_FAILED。
 * 单次请求约 5-7 秒（含 1.5s 节流的多跳请求）。
 */
export async function POST(request: Request) {
  try {
    const body = await readJsonBody<{ url?: string }>(request)
    const result = await fetchTranscript(body?.url ?? '')
    return NextResponse.json(result)
  } catch (error) {
    return toErrorResponse(error)
  }
}
