'use client'

import { useEffect, useRef, useState } from 'react'
import { Clock, FileDown, Link2, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { UrlForm } from '@/components/home/url-form'
import { AutoSummaryToggle } from '@/components/home/auto-summary-toggle'
import { ExampleLinks } from '@/components/home/example-links'
import { useTaskStore } from '@/stores/task-store'

const FEATURES = [
  { icon: Link2, title: '粘贴链接', description: '支持 B站视频链接（含 b23.tv 短链），无需下载视频文件' },
  { icon: Clock, title: '带时间戳', description: '逐句时间戳，点击即可跳转对应画面' },
  { icon: Sparkles, title: 'AI 总结', description: '一句话概要、核心要点与章节笔记自动生成' },
  { icon: FileDown, title: '一键导出', description: '支持导出 TXT / Markdown，笔记软件直接用' },
]

export function HomeView() {
  const [url, setUrl] = useState('')
  const inputRef = useRef<HTMLDivElement>(null)
  const loadCapabilities = useTaskStore((s) => s.loadCapabilities)

  // 能力探测（幂等）：总结区据此决定「未配置」引导
  useEffect(() => {
    void loadCapabilities()
  }, [loadCapabilities])

  const pickExample = (exampleUrl: string) => {
    setUrl(exampleUrl)
    inputRef.current?.querySelector('input')?.focus()
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10 sm:py-16">
      {/* Hero */}
      <section className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl sm:leading-tight">
          视频链接，<span className="text-primary">一键转文字</span>
        </h1>
        <p className="max-w-xl text-balance text-sm text-muted-foreground sm:text-base">
          粘贴 B站视频链接，自动获取字幕生成带时间戳的文字稿与 AI 总结，支持导出 TXT / Markdown。
        </p>
      </section>

      {/* 输入区 */}
      <section className="flex flex-col gap-4">
        <div ref={inputRef}>
          <UrlForm url={url} onUrlChange={setUrl} />
        </div>
        <AutoSummaryToggle />
        <ExampleLinks onPick={pickExample} />
      </section>

      {/* 工作流程 */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <Card key={title} className="rounded-xl border-dashed">
            <CardContent className="flex flex-col gap-2 p-4">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden />
              </div>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
