'use client'

import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** 顶栏“安装应用”按钮：捕获 beforeinstallprompt，可安装时展示 */
export function InstallAppButton() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setInstallEvent(null)
    }

    setInstalled(isStandalone())
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed || !installEvent) return null

  const handleInstall = async () => {
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    setInstallEvent(null)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleInstall} className="gap-1.5">
      <Download className="size-3.5" aria-hidden />
      安装应用
    </Button>
  )
}
