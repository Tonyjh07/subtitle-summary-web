'use client'

import { ExternalLink } from 'lucide-react'
import { PlatformBadge, UnsupportedBadge } from '@/components/shared/platform-badge'

export interface ExampleLink {
  label: string
  url: string
  platform: 'bilibili' | 'unsupported'
  hint?: string
}

export const EXAMPLE_LINKS: ExampleLink[] = [
  {
    label: 'B站视频示例',
    url: 'https://www.bilibili.com/video/BV1GJ411x7h7',
    platform: 'bilibili',
  },
  {
    label: '不支持平台演示',
    url: 'https://v.qq.com/x/cover/mzc00200xxxx.html',
    platform: 'unsupported',
    hint: '演示错误提示',
  },
]

interface ExampleLinksProps {
  onPick: (url: string) => void
}

/** 示例链接：一键填充输入框 */
export function ExampleLinks({ onPick }: ExampleLinksProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">试试示例链接：</span>
      {EXAMPLE_LINKS.map((example) => (
        <button
          key={example.url}
          type="button"
          onClick={() => onPick(example.url)}
          title={example.url}
          className="group inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/40 hover:bg-accent"
        >
          {example.platform === 'unsupported' ? (
            <UnsupportedBadge className="border-0 bg-transparent p-0" />
          ) : (
            <PlatformBadge platform="bilibili" className="border-0 bg-transparent p-0" />
          )}
          <span className="font-medium">{example.label}</span>
          {example.hint ? (
            <span className="whitespace-nowrap text-xs text-muted-foreground">（{example.hint}）</span>
          ) : null}
          <ExternalLink className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
        </button>
      ))}
    </div>
  )
}
