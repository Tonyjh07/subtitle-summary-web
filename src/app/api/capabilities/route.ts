import { NextResponse } from 'next/server'
import { isSummarizeConfigured } from '@/lib/summarizer/config'

/**
 * GET /api/capabilities：只读布尔能力探测（不含 Key 任何信息）。
 *
 * 唯一能力项 summarizeConfigured 反映**服务端 .env.local 兜底**是否可用；
 * 前端设置（localStorage llmSettings）由客户端自行合并（src/stores/task-store.ts
 * 的 loadCapabilities：`server || hasLocalLlm()`）。
 */
export async function GET() {
  return NextResponse.json({ summarizeConfigured: isSummarizeConfigured() })
}
