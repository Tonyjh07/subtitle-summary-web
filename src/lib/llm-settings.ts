import type { LlmClientSettings, LlmProvider } from '@/lib/types'

/**
 * 前端 LLM 配置（设置弹窗 → localStorage，优先于服务端 .env.local 兜底）。
 *
 * - 键 `llmSettings`：JSON { provider, apiKey, model? }，明文存储（用户已确认接受，
 *   见 docs/MIGRATION.md §2「LLM Key 位置」）
 * - Key 只在运行时读 localStorage 并随 /api/summarize 请求体发送，**不用 NEXT_PUBLIC_
 *   前缀，不进构建产物 bundle**
 * - 与 task-cache.ts 同款防御式读写：隐私模式 / 配额受限 / 数据损坏一律静默降级
 */

const LLM_SETTINGS_KEY = 'llmSettings'

/** 可选 provider 列表（与服务端 LLM_PRESETS 白名单一致） */
export const LLM_PROVIDERS: { value: LlmProvider; label: string; defaultModel: string }[] = [
  { value: 'deepseek', label: 'DeepSeek', defaultModel: 'deepseek-flash' },
  { value: 'qwen', label: '通义千问（阿里云百炼）', defaultModel: 'qwen-plus' },
]

/** provider → 展示信息（设置弹窗 placeholder / e2e 断言用） */
export function llmProviderMeta(provider: string) {
  return LLM_PROVIDERS.find((item) => item.value === provider) ?? LLM_PROVIDERS[0]
}

/** 校验并规范化设置：provider 白名单 + apiKey trim 非空；非法返回 null */
export function normalizeLlmSettings(raw: unknown): LlmClientSettings | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Partial<LlmClientSettings>
  if (!LLM_PROVIDERS.some((item) => item.value === record.provider)) return null
  const apiKey = typeof record.apiKey === 'string' ? record.apiKey.trim() : ''
  if (!apiKey) return null
  const model = typeof record.model === 'string' ? record.model.trim() : ''
  return { provider: record.provider as LlmProvider, apiKey, ...(model ? { model } : {}) }
}

/** 读取设置；未配置 / 损坏 / 存储不可用返回 null */
export function readLlmSettings(): LlmClientSettings | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LLM_SETTINGS_KEY)
    if (!raw) return null
    return normalizeLlmSettings(JSON.parse(raw))
  } catch {
    return null
  }
}

/** 前端是否已配置 LLM（供 capabilities 合并判断） */
export function hasLocalLlm(): boolean {
  return readLlmSettings() !== null
}

/** 写入设置（失败静默：隐私模式下仅本次会话生效，不阻塞主流程） */
export function writeLlmSettings(settings: LlmClientSettings): void {
  const normalized = normalizeLlmSettings(settings)
  if (!normalized) return
  try {
    window.localStorage.setItem(LLM_SETTINGS_KEY, JSON.stringify(normalized))
  } catch {
    // 忽略：存储不可用（隐私模式）时本次会话内存态仍在，但刷新后需重新填写
  }
}

/** 清除设置（回落服务端 .env.local 兜底） */
export function clearLlmSettings(): void {
  try {
    window.localStorage.removeItem(LLM_SETTINGS_KEY)
  } catch {
    // 忽略
  }
}
