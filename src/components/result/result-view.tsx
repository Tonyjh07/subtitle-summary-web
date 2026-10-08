'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpenText, FileText, Home, ScrollText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TranscriptList } from '@/components/result/transcript-list'
import { ArticleView } from '@/components/result/full-text-view'
import { ExportMenu } from '@/components/result/export-menu'
import { SummaryCard, SummaryErrorState, SummaryManualPrompt, SummarySkeleton } from '@/components/result/summary-card'
import { ErrorAlert } from '@/components/shared/error-alert'
import { PlatformBadge } from '@/components/shared/platform-badge'
import { formatDuration } from '@/lib/format'
import { formatTranscriptToArticle } from '@/lib/article'
import { useTaskStore } from '@/stores/task-store'
import { cn } from '@/lib/utils'

interface ResultViewProps {
  taskId: string
}

/** 文字稿区两种视图：全文阅读（默认，无时间戳文章排版）与时间戳定位（列表） */
type TranscriptTab = 'article' | 'timestamps'

/** 结果页：左文字稿（双视图 Tab）/ 右 AI 总结（<1024px 上下卡片流）；刷新后按 taskId 恢复 */
export function ResultView({ taskId }: ResultViewProps) {
  const router = useRouter()
  const phase = useTaskStore((state) => state.phase)
  const storeTaskId = useTaskStore((state) => state.taskId)
  const video = useTaskStore((state) => state.video)
  const transcript = useTaskStore((state) => state.transcript)
  const summary = useTaskStore((state) => state.summary)
  const summaryError = useTaskStore((state) => state.summaryError)
  const error = useTaskStore((state) => state.error)
  const transcriptSource = useTaskStore((state) => state.transcriptSource)
  const recover = useTaskStore((state) => state.recover)
  const retry = useTaskStore((state) => state.retry)
  const retrySummary = useTaskStore((state) => state.retrySummary)
  const loadCapabilities = useTaskStore((state) => state.loadCapabilities)
  const capabilities = useTaskStore((state) => state.capabilities)
  const reset = useTaskStore((state) => state.reset)
  const [recovering, setRecovering] = useState(storeTaskId !== taskId)
  const [retrying, setRetrying] = useState(false)
  const [summaryRetrying, setSummaryRetrying] = useState(false)
  const [tab, setTab] = useState<TranscriptTab>('article')

  // P0：summary 可为 null（总结失败/进行中）——分段只用可选的 chapters，导出与页面同源不受影响
  const paragraphs = useMemo(
    () => (transcript ? formatTranscriptToArticle(transcript, summary?.chapters) : []),
    [transcript, summary],
  )

  useEffect(() => {
    void loadCapabilities() // 幂等；直访结果页时用于判断总结不可重试场景
  }, [loadCapabilities])

  useEffect(() => {
    if (storeTaskId !== taskId) {
      setRecovering(true)
      void recover(taskId, 'result').finally(() => setRecovering(false))
    }
  }, [recover, storeTaskId, taskId])

  const handleRetry = () => {
    // 结果页错误态重试（如任务缓存 miss 后重新获取）：回到进度页续跑流水线
    setRetrying(true)
    retry()
    router.replace(`/processing/${taskId}`)
    setRetrying(false)
  }

  const handleSummaryRetry = async () => {
    setSummaryRetrying(true)
    await retrySummary()
    setSummaryRetrying(false)
  }

  const handleBack = () => {
    reset()
    router.push('/')
  }

  if (recovering || phase === 'parsing') {
    return <ResultSkeleton />
  }

  if (phase === 'error' && error) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <ErrorAlert
          error={error}
          onBack={handleBack}
          onRetry={video ? handleRetry : undefined}
          retrying={retrying}
        />
      </div>
    )
  }

  // P0：只要文字稿就绪即可渲染主体（总结失败/进行中不再整页骨架）
  if (!transcript) {
    return <ResultSkeleton />
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:py-10">
      {/* 头部：视频信息 + 返回 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="truncate text-lg font-semibold sm:text-xl">{video?.title ?? '转写结果'}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {video ? <PlatformBadge platform={video.platform} /> : null}
            {transcriptSource ? (
              <Badge variant="secondary" data-testid="source-badge" className="font-normal">
                来源：B站字幕
              </Badge>
            ) : null}
            {video ? <span>{formatDuration(video.duration)}</span> : null}
            <span>共 {transcript.length} 段</span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 self-start sm:self-auto">
          {video ? <ExportMenu video={video} paragraphs={paragraphs} /> : null}
          <Button variant="outline" size="sm" onClick={handleBack} className="gap-1.5">
            <Home className="size-3.5" aria-hidden />
            返回首页
          </Button>
        </div>
      </div>

      {/* 主体：桌面左右分栏，移动端上下卡片流。左栏 = 文字稿双视图 Tab */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.15fr_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <TranscriptTabButton active={tab === 'article'} onClick={() => setTab('article')} icon={BookOpenText}>
                全文阅读
              </TranscriptTabButton>
              <TranscriptTabButton
                active={tab === 'timestamps'}
                onClick={() => setTab('timestamps')}
                icon={ScrollText}
              >
                时间戳定位
              </TranscriptTabButton>
              {tab === 'article' ? (
                <Badge variant="secondary" className="ml-auto font-normal">
                  适合通读
                </Badge>
              ) : (
                <Badge variant="secondary" className="ml-auto font-normal">
                  点击时间可复制
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {tab === 'article' ? (
              <ArticleView paragraphs={paragraphs} />
            ) : (
              <TranscriptList items={transcript} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <FileText className="size-4 text-primary" aria-hidden />
              AI 总结
            </div>
          </CardHeader>
          <CardContent>
            {summary ? (
              <SummaryCard summary={summary} />
            ) : summaryError ? (
              <SummaryErrorState
                message={summaryError}
                onRetry={handleSummaryRetry}
                retrying={summaryRetrying}
                retryable={capabilities?.summarizeConfigured !== false}
              />
            ) : summaryRetrying || phase === 'summarizing' ? (
              <SummarySkeleton />
            ) : (
              /* 未总结态（关闭自动总结）：引导 + 手动生成，与 P0 错误重试共用 retrySummary 逻辑 */
              <SummaryManualPrompt
                onGenerate={handleSummaryRetry}
                disabled={capabilities?.summarizeConfigured === false}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

interface TranscriptTabButtonProps {
  active: boolean
  onClick: () => void
  icon: typeof BookOpenText
  children: React.ReactNode
}

function TranscriptTabButton({ active, onClick, icon: Icon, children }: TranscriptTabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'border bg-muted/50 text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {children}
    </button>
  )
}

function ResultSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:py-10">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.15fr_1fr]">
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Skeleton key={index} className="h-4 w-full" style={{ width: `${92 - (index % 3) * 12}%` }} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <Skeleton className="h-20 w-full" />
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-4 w-full" style={{ width: `${88 - index * 10}%` }} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
