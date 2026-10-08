'use client'

import { Check, Captions, Link2, Sparkles } from 'lucide-react'
import { TASK_STAGES, type TaskStage } from '@/lib/types'
import { cn } from '@/lib/utils'

const STAGE_ICONS = {
  parse_link: Link2,
  fetch_subtitle: Captions,
  summarize: Sparkles,
} as const

interface StageStepsProps {
  /** 当前阶段；完成后为 summarize 且整体进入 done */
  current: TaskStage | null
  /** 整体是否已完成（所有阶段打勾） */
  completed?: boolean
}

/** 三阶段步进条：解析链接 → 获取字幕 → 生成总结 */
export function StageSteps({ current, completed = false }: StageStepsProps) {
  const currentIndex = TASK_STAGES.findIndex((stage) => stage.id === current)

  return (
    <ol className="flex flex-col gap-0" aria-label="任务阶段">
      {TASK_STAGES.map((stage, index) => {
        const isDone = completed || (currentIndex > -1 && index < currentIndex)
        const isCurrent = !completed && stage.id === current
        const Icon = STAGE_ICONS[stage.id]

        return (
          <li key={stage.id} className="relative flex gap-3 pb-6 last:pb-0">
            {/* 连接线：非最后一项时渲染 */}
            {index < TASK_STAGES.length - 1 ? (
              <span
                className={cn(
                  'absolute left-4 top-8 h-[calc(100%-2rem)] w-px',
                  isDone ? 'bg-primary' : 'bg-border',
                )}
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-background',
                isDone && 'border-primary bg-primary text-primary-foreground',
                isCurrent && 'border-primary text-primary',
                !isDone && !isCurrent && 'border-border text-muted-foreground',
              )}
              aria-hidden
            >
              {isDone ? <Check className="size-4" /> : <Icon className="size-4" />}
            </span>
            <div className="flex flex-col gap-0.5 pt-1">
              <span
                className={cn(
                  'text-sm font-medium',
                  isCurrent && 'text-primary',
                  !isDone && !isCurrent && 'text-muted-foreground',
                )}
              >
                {stage.label}
                {isCurrent ? <span className="sr-only">（进行中）</span> : null}
              </span>
              <span className="text-xs text-muted-foreground">{stage.description}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
