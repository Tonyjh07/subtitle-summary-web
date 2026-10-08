'use client'

import { AlertCircle, RotateCcw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { UiError } from '@/stores/task-store'

interface ErrorAlertProps {
  error: UiError
  onRetry?: () => void
  retrying?: boolean
  onBack: () => void
}

/** 错误提示 + 重试 / 返回首页操作 */
export function ErrorAlert({ error, onRetry, retrying = false, onBack }: ErrorAlertProps) {
  return (
    <Alert variant="destructive" role="alert" className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <AlertCircle className="size-5 shrink-0" aria-hidden />
      <div className="flex-1 space-y-1">
        <AlertTitle>{errorTitle(error.code)}</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </div>
      <div className="flex shrink-0 gap-2">
        {onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying} className="gap-1.5">
            <RotateCcw className="size-3.5" aria-hidden />
            {retrying ? '重试中…' : '重试'}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onBack}>
          返回首页
        </Button>
      </div>
    </Alert>
  )
}

function errorTitle(code: string): string {
  switch (code) {
    case 'INVALID_URL':
      return '链接无效'
    case 'UNSUPPORTED_PLATFORM':
      return '平台暂不支持'
    case 'INVALID_TASK':
      return '任务不存在'
    case 'PARSE_FAILED':
      return '视频解析失败'
    case 'NO_SUBTITLE':
      return '该视频无可用字幕'
    case 'SUBTITLE_FETCH_FAILED':
      return '字幕获取失败'
    case 'SUMMARIZE_NOT_CONFIGURED':
      return 'AI 总结未配置'
    case 'SUMMARIZE_FAILED':
      return 'AI 总结失败'
    case 'NETWORK_ERROR':
      return '网络异常'
    default:
      return '出了点问题'
  }
}
