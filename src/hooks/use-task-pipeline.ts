'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTaskStore } from '@/stores/task-store'

/**
 * 进度页流水线驱动（替代旧版 800ms 轮询）：
 * - 恢复 / 提交进入 fetching 后启动 runPipeline（幂等，重入由 store 防抖）
 * - 进入 done 后自动跳转结果页
 */
export function useTaskPipeline(taskId: string) {
  const router = useRouter()
  const phase = useTaskStore((state) => state.phase)
  const storeTaskId = useTaskStore((state) => state.taskId)
  const runPipeline = useTaskStore((state) => state.runPipeline)

  useEffect(() => {
    if (phase !== 'fetching' || storeTaskId !== taskId) return
    void runPipeline()
  }, [phase, storeTaskId, taskId, runPipeline])

  useEffect(() => {
    if (phase === 'done' && storeTaskId === taskId) {
      router.replace(`/result/${taskId}`)
    }
  }, [phase, storeTaskId, taskId, router])
}
