import type { MetadataRoute } from 'next'

/** PWA manifest：由 Next 构建时生成到 /manifest.webmanifest */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '视频转文字 — 链接一键生成文字稿与 AI 总结',
    short_name: '视频转文字',
    description:
      '粘贴 B站视频链接，自动获取字幕生成带时间戳的文字稿与 AI 总结，支持导出 TXT / Markdown。',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    lang: 'zh-CN',
    background_color: '#ffffff',
    theme_color: '#7c3aed',
    categories: ['productivity', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
