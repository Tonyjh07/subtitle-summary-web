/**
 * 字幕体解析：按扩展名分派多格式解析器（移植自 backend/app/services/subtitles.py）。
 *
 * 支持三种格式：
 * - B站 CC/AI 字幕 JSON：{"body": [{"from": 1.2, "to": 3.4, "content": "..."}]}
 * - json3（YouTube 风格）：{"events": [{"tStartMs": ..., "segs": [{"utf8": ...}]}]}
 * - WebVTT / SRT：时间轴两行式
 */
import type { TranscriptItem } from '@/lib/types'

/** B站 CC/AI 字幕格式 */
function parseBilibiliJson(text: string): TranscriptItem[] {
  const body = (JSON.parse(text).body ?? []) as Record<string, unknown>[]
  return body.map((item) => ({
    time: Number(item.from ?? 0),
    text: String(item.content ?? '').trim(),
  }))
}

/** json3 风格：{"events": [{"tStartMs": ..., "segs": [{"utf8": ...}]}]} */
function parseJson3(text: string): TranscriptItem[] {
  const events = (JSON.parse(text).events ?? []) as Record<string, unknown>[]
  const items: TranscriptItem[] = []
  for (const event of events) {
    const start = event.tStartMs
    if (typeof start !== 'number') continue
    const segs = Array.isArray(event.segs) ? (event.segs as Record<string, unknown>[]) : []
    const line = segs
      .map((seg) => String(seg.utf8 ?? ''))
      .join('')
      .trim()
    if (line) items.push({ time: start / 1000, text: line })
  }
  return items
}

/** WebVTT/SRT：00:00:01.000 --> 00:00:03.000 两行式 */
function parseVtt(text: string): TranscriptItem[] {
  const timestamp =
    /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})/
  const items: TranscriptItem[] = []
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    const match = timestamp.exec(lines[index])
    if (!match) continue
    const [, h1, m1, s1, ms1] = match
    const time = Number(h1) * 3600 + Number(m1) * 60 + Number(s1) + Number(ms1) / 1000
    const contentLines: string[] = []
    for (const following of lines.slice(index + 1, index + 3)) {
      if (following.includes('-->') || !following.trim()) break
      contentLines.push(following.trim())
    }
    const line = contentLines.join(' ').trim()
    if (line) items.push({ time, text: line })
  }
  return items
}

type Parser = (text: string) => TranscriptItem[]

const PARSERS_BY_EXT: Record<string, Parser[]> = {
  json: [parseBilibiliJson, parseJson3],
  json3: [parseJson3, parseBilibiliJson],
  vtt: [parseVtt],
  srt: [parseVtt],
}

const FALLBACK_PARSERS: Parser[] = [parseBilibiliJson, parseJson3, parseVtt]

/** 按扩展名解析字幕体；解析不出任何条目返回 null。 */
export function parseSubtitleBody(text: string, ext: string): TranscriptItem[] | null {
  const parsers = PARSERS_BY_EXT[ext] ?? FALLBACK_PARSERS
  for (const parser of parsers) {
    let items: TranscriptItem[]
    try {
      items = parser(text)
    } catch {
      continue
    }
    if (items.length > 0) return items.filter((item) => item.text)
  }
  return null
}
