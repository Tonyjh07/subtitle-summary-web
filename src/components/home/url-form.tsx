'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Link2, Loader2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTaskStore } from '@/stores/task-store'
import { resolveVideoUrl } from '@/lib/platform'

interface UrlFormProps {
  url: string
  onUrlChange: (url: string) => void
}

/** 首页输入框 + 解析按钮：前端先做一层格式校验，再提交到任务状态机 */
export function UrlForm({ url, onUrlChange }: UrlFormProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const submitUrl = useTaskStore((s) => s.submitUrl)
  const [submitting, setSubmitting] = useState(false)
  // 同步守卫：`submitting` state 要等重渲染才生效，快速连击会穿透 → 双提交
  const submittingRef = useRef(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submittingRef.current) return
    const trimmed = url.trim()

    if (!trimmed) {
      toast.warning('请先粘贴视频链接')
      inputRef.current?.focus()
      return
    }
    // 与服务端同一套解析规则，非法 / 不支持平台直接拦截在本地
    const result = resolveVideoUrl(trimmed)
    if (!result.ok) {
      toast.error(
        result.reason === 'invalid'
          ? '链接格式不正确，请粘贴完整的视频页面链接'
          : `暂不支持「${result.host}」平台，当前仅支持哔哩哔哩`,
      )
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    const taskId = await submitUrl(trimmed)

    if (taskId) {
      // 成功：保持锁定直到路由卸载本组件。router.push 是异步软导航，
      // 若此刻解锁，导航途中（几十 ms 窗口）的再次点击会发起第二次提交，
      // 产生两个 taskId 互相覆盖（线上连点 bug）。
      router.push(`/processing/${taskId}`)
      return
    }
    // 失败：解锁让用户可以重试
    submittingRef.current = false
    setSubmitting(false)
    const error = useTaskStore.getState().error
    toast.error(error?.message ?? '解析失败，请稍后重试')
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Link2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          ref={inputRef}
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          placeholder="粘贴 B站视频链接，例如 https://www.bilibili.com/video/BV..."
          className="h-12 rounded-xl pl-9 text-sm sm:text-base"
          inputMode="url"
          autoComplete="off"
          aria-label="视频链接"
        />
      </div>
      <Button type="submit" size="lg" disabled={submitting} className="h-12 rounded-xl px-6 text-base font-medium">
        {submitting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Wand2 className="size-4" aria-hidden />
        )}
        {submitting ? '解析中…' : '解析'}
      </Button>
    </form>
  )
}
