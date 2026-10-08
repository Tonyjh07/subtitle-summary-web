'use client'

import { Progress } from '@/components/ui/progress'
import { TASK_STAGES, type TaskStage } from '@/lib/types'

interface ProgressOverviewProps {
  progress: number
  stage: TaskStage | null
}

/** 整体进度：百分比 + 进度条 + 当前阶段说明 */
export function ProgressOverview({ progress, stage }: ProgressOverviewProps) {
  const stageMeta = TASK_STAGES.find((item) => item.id === stage)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">
          {stageMeta ? stageMeta.label : '准备中'}…
        </span>
        <span className="text-2xl font-bold tabular-nums text-primary">{progress}%</span>
      </div>
      <Progress value={progress} className="h-2" aria-label={`任务进度 ${progress}%`} />
      <p className="text-xs text-muted-foreground">
        {stageMeta ? stageMeta.description : '正在准备任务'}
      </p>
    </div>
  )
}
