'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { VideoCard } from '@/components/processing/video-card'
import { StageSteps } from '@/components/processing/stage-steps'
import { ProgressOverview } from '@/components/processing/progress-overview'
import { ErrorAlert } from '@/components/shared/error-alert'
import { useTaskPipeline } from '@/hooks/use-task-pipeline'
import { useTaskStore } from '@/stores/task-store'

interface ProcessingViewProps {
  taskId: string
}

/** 进度页：视频信息卡 + 三阶段步进 + 整体进度；支持直链恢复与失败重试 */
export function ProcessingView({ taskId }: ProcessingViewProps) {
  const router = useRouter()
  const phase = useTaskStore((state) => state.phase)
  const storeTaskId = useTaskStore((state) => state.taskId)
  const video = useTaskStore((state) => state.video)
  const stage = useTaskStore((state) => state.stage)
  const progress = useTaskStore((state) => state.progress)
  const error = useTaskStore((state) => state.error)
  const recover = useTaskStore((state) => state.recover)
  const retry = useTaskStore((state) => state.retry)
  const reset = useTaskStore((state) => state.reset)
  const [retrying, setRetrying] = useState(false)

  useTaskPipeline(taskId)

  const needsRecover = storeTaskId !== taskId
  useEffect(() => {
    if (needsRecover) void recover(taskId, 'processing')
  }, [needsRecover, recover, taskId])

  const handleRetry = () => {
    setRetrying(true)
    retry()
    // retry 将 phase 置回 fetching → useTaskPipeline 自动续跑；成功/失败由状态机接管
    setRetrying(false)
  }

  const handleBack = () => {
    reset()
    router.push('/')
  }

  if (needsRecover && (phase === 'idle' || phase === 'parsing')) {
    return <ProcessingSkeleton />
  }

  if (phase === 'error' && error) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <ErrorAlert error={error} onRetry={handleRetry} retrying={retrying} onBack={handleBack} />
        {video ? (
          <Card className="mt-6">
            <CardContent className="p-5 opacity-60">
              <VideoCard video={video} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      {video ? (
        <Card>
          <CardContent className="p-5">
            <VideoCard video={video} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardContent className="flex flex-col gap-6 p-6">
          <ProgressOverview progress={progress} stage={stage} />
          <div className="h-px bg-border" aria-hidden />
          <StageSteps current={stage} completed={phase === 'summarizing' || phase === 'done'} />
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        获取字幕约 5-7 秒，AI 总结约 30-70 秒，完成后自动进入结果页
      </p>
    </div>
  )
}

function ProcessingSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Skeleton className="h-24 w-full rounded-xl sm:w-44" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-6 p-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-px w-full" />
          <div className="flex flex-col gap-5">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
