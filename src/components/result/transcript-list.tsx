'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatTimestamp } from '@/lib/format'
import type { TranscriptItem } from '@/lib/types'

interface TranscriptListProps {
  items: TranscriptItem[]
}

/** 带时间戳的文字稿：点击时间戳复制该句（含 [mm:ss] 前缀） */
export function TranscriptList({ items }: TranscriptListProps) {
  const [copiedTime, setCopiedTime] = useState<number | null>(null)

  const copyItem = async (item: TranscriptItem) => {
    const text = `[${formatTimestamp(item.time)}] ${item.text}`
    try {
      await navigator.clipboard.writeText(text)
      setCopiedTime(item.time)
      setTimeout(() => {
        setCopiedTime((current) => (current === item.time ? null : current))
      }, 1500)
    } catch {
      // 剪贴板不可用（非 https / 权限拒绝）时静默降级
    }
  }

  return (
    <ScrollArea className="h-[420px] pr-3 sm:h-[560px]" data-testid="transcript-list">
      <ul className="flex flex-col">
        {items.map((item, index) => {
          const copied = copiedTime === item.time
          return (
            <li
              key={`${item.time}-${index}`}
              className="group flex items-start gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60"
            >
              <button
                type="button"
                onClick={() => copyItem(item)}
                title="点击复制该句（含时间戳）"
                className="mt-0.5 flex shrink-0 items-center gap-1 rounded-md border bg-muted/60 px-1.5 py-0.5 font-mono text-xs tabular-nums text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                {copied ? (
                  <Check className="size-3 text-primary" aria-hidden />
                ) : (
                  <Copy className="size-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                )}
                {formatTimestamp(item.time)}
              </button>
              <p className="text-sm leading-relaxed">{item.text}</p>
            </li>
          )
        })}
      </ul>
    </ScrollArea>
  )
}
