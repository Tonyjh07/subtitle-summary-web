'use client'

import { Sparkles } from 'lucide-react'
import { useTaskStore } from '@/stores/task-store'
import { cn } from '@/lib/utils'

/**
 * 首页「解析后自动 AI 总结」开关（任务 M2-P3）：默认开启，关闭后结果页提供手动生成入口。
 * 状态存 localStorage（键 autoSummary，仅布尔值），跨任务与刷新保留。
 */
export function AutoSummaryToggle() {
  const autoSummary = useTaskStore((state) => state.autoSummary)
  const setAutoSummary = useTaskStore((state) => state.setAutoSummary)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="auto-summary-row">
      <button
        type="button"
        role="switch"
        aria-checked={autoSummary}
        data-testid="auto-summary-toggle"
        onClick={() => setAutoSummary(!autoSummary)}
        className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-accent"
      >
        <span
          aria-hidden
          className={cn(
            'relative h-4 w-7 shrink-0 rounded-full transition-colors',
            autoSummary ? 'bg-primary' : 'bg-muted-foreground/30',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'absolute top-0.5 size-3 rounded-full bg-background shadow transition-all',
              autoSummary ? 'left-3.5' : 'left-0.5',
            )}
          />
        </span>
        <span className="flex items-center gap-1.5 font-medium">
          <Sparkles className="size-3.5 text-primary" aria-hidden />
          解析后自动 AI 总结
        </span>
      </button>
      <span className="text-xs text-muted-foreground">
        {autoSummary ? '获取字幕后自动生成总结' : '已关闭：文字稿照常生成，结果页可手动生成'}
      </span>
    </div>
  )
}
