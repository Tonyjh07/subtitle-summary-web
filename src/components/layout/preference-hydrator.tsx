'use client'

import { useEffect } from 'react'
import { useTaskStore } from '@/stores/task-store'

/**
 * 本地偏好水合（任务 M2-P3）：挂载后把 localStorage 里的 autoSummary 写入 store。
 *
 * 放在根布局而不是首页：/processing、/result 直链访问时也要按用户偏好执行（不自动总结）。
 * 刻意不在 store 模块初始化时读 localStorage —— 那会造成服务端与客户端首帧不一致的水合错误。
 */
export function PreferenceHydrator() {
  const hydratePreferences = useTaskStore((state) => state.hydratePreferences)

  useEffect(() => {
    hydratePreferences()
  }, [hydratePreferences])

  return null
}
