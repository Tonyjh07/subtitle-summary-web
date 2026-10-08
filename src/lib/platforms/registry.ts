import type { Platform } from '@/lib/types'

/**
 * 平台注册表：新增平台只需在此追加条目（M2 多平台支持，见 docs/ROADMAP.md）。
 * UI 侧（平台徽章、封面配色）均由注册表驱动，不需要改组件。
 */
export interface PlatformMeta {
  id: Platform
  name: string
  /** 展示用主色（徽章文字、图标描边） */
  color: string
  /** 封面占位渐变（未提供封面图时的兜底） */
  gradient: [string, string]
  /** 正式站域名（www / m 等子域均可） */
  hostPatterns: RegExp[]
  /** 分享短链域名，仅用于识别平台；真实后端会 302 展开短链 */
  shareHostPatterns: RegExp[]
  /** 从 URL 路径提取 videoId 的规则，取第 1 个捕获组 */
  videoIdPatterns: RegExp[]
}

export const PLATFORM_REGISTRY: Record<Platform, PlatformMeta> = {
  bilibili: {
    id: 'bilibili',
    name: '哔哩哔哩',
    color: '#fb7299',
    gradient: ['#fb7299', '#ff9cb8'],
    hostPatterns: [/^([\w-]+\.)*bilibili\.com$/],
    shareHostPatterns: [/^b23\.tv$/],
    videoIdPatterns: [/\/video\/(BV[\w]+)/i, /\/video\/(av\d+)/i],
  },
}

export function getPlatformMeta(platform: Platform): PlatformMeta {
  return PLATFORM_REGISTRY[platform]
}
