import { NextResponse } from 'next/server'
import { readJsonBody, toErrorResponse } from '@/lib/api-server'
import { summarizeTranscript } from '@/lib/summarizer'
import type { SummarizeRequest, Summary } from '@/lib/types'

/**
 * POST /api/summarize：生成 AI 总结。
 * 请求体 {transcript, title, duration, llm?} → { summary, keyPoints, chapters }。
 *
 * LLM 配置两级：请求体 llm（前端设置，localStorage）优先 → 服务端 .env.local 兜底。
 * 服务端只校验 provider 白名单 + Key 非空，不落盘、不回显、不打进任何响应。
 * 未配 → SUMMARIZE_NOT_CONFIGURED；过长 → TRANSCRIPT_TOO_LONG；上游失败 → SUMMARIZE_FAILED。
 */
export async function POST(request: Request) {
  try {
    const body = await readJsonBody<Partial<SummarizeRequest>>(request)
    const transcript = body?.transcript ?? []
    const summary: Summary = await summarizeTranscript(
      transcript,
      body?.title ?? '',
      body?.duration ?? 0,
      body?.llm,
    )
    return NextResponse.json(summary)
  } catch (error) {
    return toErrorResponse(error)
  }
}
