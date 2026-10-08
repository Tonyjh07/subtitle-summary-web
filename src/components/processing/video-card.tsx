/* eslint-disable @next/next/no-img-element */
import { getPlatformMeta } from '@/lib/platforms/registry'
import { formatDuration } from '@/lib/format'
import { PlatformBadge } from '@/components/shared/platform-badge'
import type { VideoInfo } from '@/lib/types'

/** 视频信息卡：封面（本地占位图）+ 时长 + 平台徽章 + 标题 */
export function VideoCard({ video }: { video: VideoInfo }) {
  const meta = getPlatformMeta(video.platform)
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div
        className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl sm:aspect-auto sm:h-24 sm:w-44"
        style={{ background: `linear-gradient(135deg, ${meta.gradient[0]}, ${meta.gradient[1]})` }}
      >
        <img
          src={video.cover}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
          {formatDuration(video.duration)}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <PlatformBadge platform={video.platform} className="w-fit" />
        <h2 className="line-clamp-2 text-base font-semibold leading-snug sm:text-lg">{video.title}</h2>
        <p className="text-xs text-muted-foreground">
          videoId: <span className="font-mono">{video.videoId}</span>
        </p>
      </div>
    </div>
  )
}
