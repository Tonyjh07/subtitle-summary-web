'use client'

import { useEffect, useState } from 'react'
import { Eye, EyeOff, Loader2, Save, Settings, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  clearLlmSettings,
  LLM_PROVIDERS,
  llmProviderMeta,
  normalizeLlmSettings,
  readLlmSettings,
  writeLlmSettings,
} from '@/lib/llm-settings'
import { useTaskStore } from '@/stores/task-store'
import type { LlmProvider } from '@/lib/types'

/**
 * 顶栏「设置」按钮 + LLM 配置弹窗（所有配置项前端化，localStorage 持久化）。
 *
 * - 保存：写 localStorage `llmSettings` → 重新合并 capabilities（总结立即可用）
 * - 清除：删键 → capabilities 回落服务端 .env.local 兜底
 * - Key 明文存储说明在弹窗底部提示（用户已确认接受该安全模型）
 */
export function SettingsButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="设置"
        data-testid="settings-button"
        onClick={() => setOpen(true)}
        className="size-9"
      >
        <Settings className="size-4" aria-hidden />
      </Button>
      <SettingsDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const loadCapabilities = useTaskStore((state) => state.loadCapabilities)

  const [provider, setProvider] = useState<LlmProvider>('deepseek')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)

  // 每次打开重新水合：读不到（未配置 / 隐私模式）时给默认值
  useEffect(() => {
    if (!open) return
    const settings = readLlmSettings()
    setProvider(settings?.provider ?? 'deepseek')
    setApiKey(settings?.apiKey ?? '')
    setModel(settings?.model ?? '')
    setShowKey(false)
  }, [open])

  const providerMeta = llmProviderMeta(provider)

  const handleSave = async () => {
    const normalized = normalizeLlmSettings({ provider, apiKey, model })
    if (!normalized) {
      toast.warning('请填写 API Key')
      return
    }
    setSaving(true)
    try {
      writeLlmSettings(normalized)
      // 重新合并 capabilities：本机已配置 → 总结区立即解锁
      await loadCapabilities({ force: true })
      toast.success('LLM 配置已保存到本机')
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    clearLlmSettings()
    setApiKey('')
    setModel('')
    await loadCapabilities({ force: true })
    toast.success('已清除本机 LLM 配置（回落服务端兜底）')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="settings-dialog">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>
            LLM 总结配置保存在<strong>本机浏览器 localStorage</strong>，优先于服务端环境变量。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="llm-provider">模型服务商</Label>
            <select
              id="llm-provider"
              data-testid="llm-provider-select"
              value={provider}
              onChange={(event) => setProvider(event.target.value as LlmProvider)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
            >
              {LLM_PROVIDERS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="llm-api-key">API Key</Label>
            <div className="relative">
              <Input
                id="llm-api-key"
                data-testid="llm-api-key-input"
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-..."
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                className="pr-10 font-mono"
              />
              <button
                type="button"
                aria-label={showKey ? '隐藏 Key' : '显示 Key'}
                onClick={() => setShowKey((value) => !value)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {showKey ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {provider === 'qwen'
                ? '阿里云百炼控制台获取（兼容模式 Key，以 sk- 开头）'
                : 'platform.deepseek.com 获取'}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="llm-model">模型（可选）</Label>
            <Input
              id="llm-model"
              data-testid="llm-model-input"
              placeholder={`默认：${providerMeta.defaultModel}`}
              value={model}
              onChange={(event) => setModel(event.target.value)}
              spellCheck={false}
            />
          </div>

          <p className="rounded-xl border border-muted bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            配置仅存于本机浏览器（localStorage），并随总结请求发送到本站服务端代为调用 LLM 上游。
            请勿在不受信任的设备或公共电脑上保存 Key。
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            data-testid="settings-clear"
            onClick={handleClear}
            className="gap-1.5 sm:mr-auto"
          >
            <Trash2 className="size-3.5" aria-hidden />
            清除配置
          </Button>
          <Button data-testid="settings-save" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Save className="size-3.5" aria-hidden />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
