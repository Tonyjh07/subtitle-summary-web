import { formatDurationWords } from '@/lib/format'
import { getPlatformMeta } from '@/lib/platforms/registry'
import type { VideoInfo } from '@/lib/types'

/**
 * 导出工具：导出「全文阅读」式的纯文本文章（不含任何时间戳）。
 * 段落由 formatTranscriptToArticle 从文字稿派生（见 src/lib/article.ts）。
 */

export type ExportFormat = 'txt' | 'md'

export interface ExportInput {
  video: VideoInfo
  /** 无时间戳的自然段落 */
  paragraphs: string[]
}

function metaLine(video: VideoInfo): string {
  return `来源：${getPlatformMeta(video.platform).name} ｜ 时长：${formatDurationWords(video.duration)}`
}

export function buildPlainText({ video, paragraphs }: ExportInput): string {
  const lines: string[] = []
  lines.push(`《${video.title}》`)
  lines.push('')
  lines.push(metaLine(video))
  lines.push('')
  lines.push(paragraphs.join('\n\n'))
  return lines.join('\n')
}

export function buildMarkdown({ video, paragraphs }: ExportInput): string {
  const lines: string[] = []
  lines.push(`# ${video.title}`)
  lines.push('')
  lines.push(`> ${metaLine(video)}`)
  lines.push('')
  lines.push('## 正文')
  lines.push('')
  lines.push(paragraphs.join('\n\n'))
  return lines.join('\n')
}

/** 文件名安全化：去除路径分隔符与非法字符，限制长度 */
function sanitizeFilename(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|#%&{}$!'@+`=\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || '文字稿').slice(0, 60)
}

export function buildExportFilename(format: ExportFormat, video: VideoInfo): string {
  const extension = format === 'md' ? 'md' : 'txt'
  return `${sanitizeFilename(video.title)}-文字稿.${extension}`
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function exportResult(format: ExportFormat, input: ExportInput): void {
  const content = format === 'md' ? buildMarkdown(input) : buildPlainText(input)
  downloadTextFile(buildExportFilename(format, input.video), content)
}
