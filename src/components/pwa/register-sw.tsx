'use client'

import { useEffect } from 'react'

/** 与 public/sw.js 的 CACHE_NAME 同前缀；历史版本的外壳缓存一并清理 */
const SHELL_CACHE_PREFIX = 'vtt-shell-'

/** Service Worker 脚本路径（public/sw.js） */
const SW_PATH_SUFFIX = '/sw.js'

/**
 * 生产环境注册 Service Worker（开发环境跳过，避免缓存干扰）。
 *
 * 开发环境反向自愈：注销访问过生产构建时残留的 Service Worker 并清理外壳缓存——
 * 否则「旧壳 / 旧 chunk + 新构建」混用会让页面启动即报 webpack
 * `Cannot read properties of undefined (reading 'call')`，只能靠硬刷新恢复。
 */
export function RegisterSw() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV !== 'production') {
      void cleanupLeftoverServiceWorker()
      return
    }

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('[pwa] service worker 注册失败', error)
      })
    }

    if (document.readyState === 'complete') {
      void register()
      return
    }
    window.addEventListener('load', register, { once: true })
    return () => window.removeEventListener('load', register)
  }, [])

  return null
}

/** 注销本应用的 SW 注册并删除本应用的外壳缓存（只清理自己的，不动同源其它缓存） */
async function cleanupLeftoverServiceWorker(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    const ours = registrations.filter((registration) =>
      [registration.active, registration.installing, registration.waiting].some((worker) =>
        worker?.scriptURL.endsWith(SW_PATH_SUFFIX),
      ),
    )
    const removed = await Promise.all(ours.map((registration) => registration.unregister()))

    let cleanedCaches = 0
    if ('caches' in window) {
      const shellKeys = (await caches.keys()).filter((key) => key.startsWith(SHELL_CACHE_PREFIX))
      cleanedCaches = (await Promise.all(shellKeys.map((key) => caches.delete(key)))).filter(Boolean).length
    }

    const unregistered = removed.filter(Boolean).length
    if (unregistered > 0 || cleanedCaches > 0) {
      console.info(`[pwa] 开发环境已清理残留 Service Worker（注销 ${unregistered} 个，缓存 ${cleanedCaches} 个）`)
    }
  } catch (error) {
    console.warn('[pwa] 开发环境清理 Service Worker 失败', error)
  }
}
