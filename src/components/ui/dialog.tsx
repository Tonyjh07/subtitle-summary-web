'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * 轻量 Dialog（shadcn 风格 API，不引入 @radix-ui/react-dialog 依赖）。
 *
 * 行为：portal 到 body、遮罩点击/Esc 关闭、打开时把焦点移入面板、关闭后归还焦点、
 * 打开期间锁定 body 滚动。语义（role=dialog / aria-modal / aria-labelledby）齐备。
 */

interface DialogContextValue {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DialogContext = React.createContext<DialogContextValue | null>(null)

function useDialogContext(component: string): DialogContextValue {
  const context = React.useContext(DialogContext)
  if (!context) throw new Error(`${component} 必须在 <Dialog> 内使用`)
  return context
}

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <DialogContext.Provider value={{ open, onOpenChange }}>
      {children}
    </DialogContext.Provider>
  )
}

function DialogContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { open, onOpenChange } = useDialogContext('DialogContent')
  const panelRef = React.useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = React.useState(false)
  const previouslyFocused = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => setMounted(true), [])

  // 打开：记下原焦点 → 锁滚动 → 焦点移入面板；关闭：解锁 + 归还焦点
  React.useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  // Esc 关闭
  React.useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  if (!open || !mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center sm:p-6">
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      {/* 面板 */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          'relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-background p-6 shadow-lg',
          'focus:outline-none',
          className,
        )}
        {...props}
      >
        <button
          type="button"
          aria-label="关闭"
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export { DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter }

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-5 flex flex-col gap-1.5 pr-8', className)} {...props} />
}

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-lg font-semibold tracking-tight', className)} {...props} />
}

function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
}
