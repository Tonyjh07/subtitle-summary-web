/**
 * LLM 总结服务（DeepSeek / 通义，OpenAI 兼容 chat.completions）。
 * 移植自 backend/app/services/summarizer.py，HTTP 从 httpx 改为 fetch。
 *
 * 设计要点（与 Python 版一致）：
 * - 无状态：POST /api/summarize 直接收 {transcript, title, duration, llm?}，
 *   llm = 前端设置（localStorage）带来的配置，优先；服务端 .env.local 兜底
 * - 时间戳三重保障：① 输入格式化为 "[mm:ss] text"；② prompt 要求 time 取自文字稿；
 *   ③ 服务端二次校验——输出 time 不在时间戳集合时就近吸附（防 LLM 编造）
 * - 结构化输出：response_format=json_object；解析失败把错误反馈给模型重试（最多 2 次）
 * - chunking：超过 MAX_CHUNK_CHARS 按条目边界切块，逐块提取候选要点 → 合并终稿
 * - 未配 Key：SUMMARIZE_NOT_CONFIGURED（400，提交即报错不静默）
 */
import { ApiError } from '@/lib/api-error'
import { resolveLlmConfig, type LlmConfig } from '@/lib/summarizer/config'
import type { ChapterNote, KeyPoint, Summary, TranscriptItem } from '@/lib/types'

const MAX_TRANSCRIPT_CHARS = 100_000 // 无状态请求体长度上限（超出报 TRANSCRIPT_TOO_LONG）
const MAX_CHUNK_CHARS = 6_000 // 单次 LLM 调用输入的文字稿字符上限（按条目边界切块）
const MAX_RETRIES = 2 // JSON 解析失败的重试次数
const MAX_KEY_POINTS = 5
const CHAT_TIMEOUT_MS = 120_000

const SYSTEM_PROMPT = [
  '你是视频文字稿总结助手。只输出一个 JSON 对象，不要输出任何其他文字或代码块标记。',
  'JSON 字段：',
  '- "summary"：一句话概要（字符串，不超过 120 字）',
  '- "keyPoints"：3-5 条核心要点，每条 {"time": 秒数, "text": 要点内容}；time 必须从输入文字稿的时间戳中选择，禁止编造不存在的时刻',
  '- "chapters"：按内容逻辑分段，每段 {"title": 段落标题, "timeStart": 秒, "timeEnd": 秒, "note": 该段要点说明}；timeStart/timeEnd 必须落在文字稿时间范围内',
  '所有时间单位为秒。',
].join('\n')

function formatTimestamp(seconds: number): string {
  const total = Math.max(Math.trunc(seconds), 0)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

/** 文字稿 → "[mm:ss] text" 行（LLM 输入的时间戳格式） */
export function formatTranscript(transcript: TranscriptItem[]): string {
  return transcript.map((item) => `[${formatTimestamp(item.time)}] ${item.text}`).join('\n')
}

/** time 不在时间戳集合时吸附到最近的时间戳（防 LLM 编造） */
function snapToNearest(timeValue: number, sortedTimes: number[]): number {
  if (sortedTimes.length === 0) return 0
  return sortedTimes.reduce((best, t) => (Math.abs(t - timeValue) < Math.abs(best - timeValue) ? t : best))
}

/** 对 LLM 输出的 keyPoints.time 与 chapters.timeStart/timeEnd 做就近吸附 */
function snapSummaryTimes(summary: Summary, sortedTimes: number[], duration: number): Summary {
  const lastTime = sortedTimes.length > 0 ? sortedTimes[sortedTimes.length - 1] : duration

  summary.keyPoints = (summary.keyPoints || []).map((point) => ({
    ...point,
    time: snapToNearest(Number(point.time) || 0, sortedTimes),
  }))

  summary.chapters = (summary.chapters || []).map((chapter) => {
    const timeStart = snapToNearest(Number(chapter.timeStart) || 0, sortedTimes)
    const timeEnd = snapToNearest(Number(chapter.timeEnd) || 0, sortedTimes)
    return { ...chapter, timeStart, timeEnd: Math.max(timeEnd, timeStart) }
  })

  if (summary.keyPoints.length > 0 && sortedTimes.length > 0) {
    summary.keyPoints = summary.keyPoints.slice(0, MAX_KEY_POINTS)
  }
  if (summary.chapters.length === 0 && sortedTimes.length > 0) {
    summary.chapters = [
      { title: '全文', timeStart: sortedTimes[0], timeEnd: lastTime, note: summary.summary },
    ]
  }
  return summary
}

/** 单次 chat.completions 调用（json_object），返回 content；记录用量日志 */
async function chat(config: LlmConfig, userContent: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    })
  } catch {
    throw new ApiError('SUMMARIZE_FAILED', 'AI 总结服务连接失败，请稍后重试')
  }

  if (!response.ok) {
    throw new ApiError('SUMMARIZE_FAILED', `AI 总结服务返回错误（HTTP ${response.status}）`)
  }

  let payload: Record<string, unknown>
  try {
    payload = (await response.json()) as Record<string, unknown>
  } catch {
    throw new ApiError('SUMMARIZE_FAILED', 'AI 总结服务返回结构异常')
  }

  const usage = (payload.usage ?? {}) as Record<string, number>
  console.info(
    `[summarizer] ${config.model} 输入 ${usage.prompt_tokens ?? 0} tok + 输出 ${usage.completion_tokens ?? 0} tok`,
  )

  const choices = payload.choices as { message?: { content?: string } }[] | undefined
  const content = choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content) {
    throw new ApiError('SUMMARIZE_FAILED', 'AI 总结服务返回结构异常')
  }
  return content
}

/** 解析 LLM 的 JSON 输出并校验必需字段；不合规抛 Error（触发重试） */
function parsePayload(content: string): Summary {
  const data: unknown = JSON.parse(content)
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('顶层不是对象')
  const record = data as Record<string, unknown>

  const summary = record.summary
  if (typeof summary !== 'string' || !summary.trim()) throw new Error('缺少 summary')

  const rawPoints = record.keyPoints
  if (!Array.isArray(rawPoints) || rawPoints.length === 0) throw new Error('缺少 keyPoints')

  const rawChapters = record.chapters
  if (!Array.isArray(rawChapters)) throw new Error('缺少 chapters')

  const keyPoints: KeyPoint[] = []
  for (const point of rawPoints) {
    if (!point || typeof point !== 'object') continue
    const p = point as Record<string, unknown>
    const text = String(p.text ?? '').trim()
    if (!text) continue
    keyPoints.push({ time: Number(p.time) || 0, text })
  }
  if (keyPoints.length === 0) throw new Error('keyPoints 全部为空')

  const chapters: ChapterNote[] = []
  for (const chapter of rawChapters) {
    if (!chapter || typeof chapter !== 'object') continue
    const c = chapter as Record<string, unknown>
    chapters.push({
      title: String(c.title ?? '').trim() || '未命名段落',
      timeStart: Number(c.timeStart) || 0,
      timeEnd: Number(c.timeEnd) || 0,
      note: String(c.note ?? '').trim(),
    })
  }

  return { summary: summary.trim(), keyPoints, chapters }
}

/** 调用 + 解析，失败把错误反馈给模型重试（最多 MAX_RETRIES 次） */
async function chatSummaryWithRetry(config: LlmConfig, userContent: string): Promise<Summary> {
  let feedback = ''
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const content = await chat(config, userContent + feedback)
    try {
      return parsePayload(content)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.warn(`[summarizer] LLM 输出解析失败（第 ${attempt + 1} 次）：${lastError.message}`)
      feedback = `\n\n（你上一次的输出无法解析：${lastError.message}。请严格只输出符合字段要求的 JSON 对象。）`
    }
  }
  throw new ApiError('SUMMARIZE_FAILED', `AI 总结输出解析失败（重试 ${MAX_RETRIES} 次后）：${lastError?.message ?? ''}`)
}

/** 按条目边界切块（条目不拆，保时间戳语义） */
function splitChunks(transcript: TranscriptItem[]): TranscriptItem[][] {
  const chunks: TranscriptItem[][] = []
  let current: TranscriptItem[] = []
  let currentChars = 0
  for (const item of transcript) {
    const itemChars = item.text.length + 12
    if (current.length > 0 && currentChars + itemChars > MAX_CHUNK_CHARS) {
      chunks.push(current)
      current = []
      currentChars = 0
    }
    current.push(item)
    currentChars += itemChars
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

/** 业务入口：{transcript, title, duration} → Summary（含时间戳吸附）。
 *  clientLlm = 前端设置（localStorage）随请求带来的配置，优先于服务端 env 兜底。 */
export async function summarizeTranscript(
  transcript: TranscriptItem[],
  title: string,
  duration: number,
  clientLlm?: unknown,
): Promise<Summary> {
  const totalChars = transcript.reduce((sum, item) => sum + item.text.length, 0)
  if (totalChars > MAX_TRANSCRIPT_CHARS) {
    throw new ApiError('TRANSCRIPT_TOO_LONG', '文字稿过长，无法生成总结（上限 10 万字）')
  }

  const config = resolveLlmConfig(clientLlm)
  if (!config) {
    throw new ApiError(
      'SUMMARIZE_NOT_CONFIGURED',
      'AI 总结未配置：请打开右上角「设置」填写 LLM Key（或由部署者在服务端配置兜底 Key）',
    )
  }

  const sortedTimes = Array.from(new Set(transcript.map((item) => Number(item.time) || 0))).sort(
    (a, b) => a - b,
  )
  const chunks = splitChunks(transcript)
  const displayTitle = title || '（无标题）'

  let result: Summary
  if (chunks.length === 1) {
    const userContent = [
      `视频标题：${displayTitle}`,
      `时长：${duration} 秒`,
      '',
      '文字稿（每行 [mm:ss] 文本）：',
      formatTranscript(transcript),
    ].join('\n')
    result = await chatSummaryWithRetry(config, userContent)
  } else {
    // 多块：逐块提取候选要点（时间戳即原 transcript 时间，无需重映射），再合并终稿
    const blockNotes: string[] = []
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index]
      const blockPrompt = [
        `这是长视频文字稿的第 ${index + 1}/${chunks.length} 块（标题：${displayTitle}）。`,
        '请只输出 JSON：{"points": [{"time": 秒, "text": 该块核心要点}], "digest": "该块内容摘要（2-3 句）"}。time 必须取自本块文字稿的时间戳。',
        '',
        '文字稿：',
        formatTranscript(chunk),
      ].join('\n')
      const content = await chat(config, blockPrompt)
      let block: { points?: { time?: number; text?: string }[]; digest?: string }
      try {
        block = JSON.parse(content) as typeof block
      } catch {
        block = {}
      }
      const points = block.points ?? []
      const pointLines = points
        .map((p) => `(${formatTimestamp(Number(p.time) || 0)}) ${p.text ?? ''}`)
        .join('；')
      blockNotes.push(`[块 ${index + 1}] ${block.digest ?? ''}\n候选要点：${pointLines}`)
    }
    const mergePrompt = [
      `视频标题：${displayTitle}`,
      `时长：${duration} 秒`,
      '以下是对长视频逐块总结的要点与摘要，请合并产出最终总结（keyPoints 精选 3-5 条，time 从候选要点的时间戳中选择；chapters 覆盖全片）：',
      '',
      blockNotes.join('\n\n'),
    ].join('\n')
    result = await chatSummaryWithRetry(config, mergePrompt)
  }

  const finalResult = snapSummaryTimes(result, sortedTimes, duration)
  console.info(
    `[summarizer] 完成：${totalChars} 字文字稿 / ${chunks.length} 块 / ${finalResult.keyPoints.length} 条要点 / ${finalResult.chapters.length} 章节`,
  )
  return finalResult
}
