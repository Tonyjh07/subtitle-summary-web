import { getPlatformMeta } from '@/lib/platforms/registry'
import { Tv, TriangleAlert } from 'lucide-react'
import type { Platform } from '@/lib/types'
import { cn } from '@/lib/utils'

const PLATFORM_ICONS: Record<Platform, typeof Tv> = {
  bilibili: Tv,
}

interface PlatformBadgeProps {
  platform: Platform
  className?: string
}

/** 平台徽章：样式由平台注册表驱动，新增平台无需改此组件 */
export function PlatformBadge({ platform, className }: PlatformBadgeProps) {
  const meta = getPlatformMeta(platform)
  const Icon = PLATFORM_ICONS[platform]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium',
        className,
      )}
      style={{ color: meta.color, borderColor: `${meta.color}55`, backgroundColor: `${meta.color}14` }}
    >
      <Icon className="size-3.5" aria-hidden />
      {meta.name}
    </span>
  )
}

/** 用于示例链接中“不支持平台”的占位徽章 */
export function UnsupportedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground',
        className,
      )}
    >
      <TriangleAlert className="size-3.5" aria-hidden />
      不支持的平台
    </span>
  )
}
