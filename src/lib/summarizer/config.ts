/**
 * LLM 总结配置（服务端，移植自 backend/app/config.py LLM 段）。
 *
 * 两级配置（docs/MIGRATION.md §2）：
 * 1. **前端优先**：浏览器设置界面填写，存 localStorage，随 /api/summarize 请求体的
 *    `llm` 字段带来 —— 服务端只做白名单校验（validateClientLlm），不落盘、不回显；
 * 2. **服务端兜底**：DEEPSEEK_API_KEY 或 DASHSCOPE_API_KEY（通义千问兼容模式），
 *    LLM_PROVIDER=deepseek|qwen 切换，仅在请求未带前端配置时读取。
 *
 * 两级都没有 → SUMMARIZE_NOT_CONFIGURED。Key 仍不带 NEXT_PUBLIC_ 前缀（不进客户端 bundle）。
 */
import type { LlmClientSettings } from '@/lib/types'

export interface LlmPreset {
  base_url: string
  default_model: string
  /** 该 provider 读取的环境变量名 */
  key_env: 'DEEPSEEK_API_KEY' | 'DASHSCOPE_API_KEY'
}

/** 各 provider 的 OpenAI 兼容端点与默认模型（模型可被 LLM_MODEL / 前端 model 覆盖） */
export const LLM_PRESETS: Record<string, LlmPreset> = {
  deepseek: {
    base_url: 'https://api.deepseek.com/v1',
    default_model: 'deepseek-flash',
    key_env: 'DEEPSEEK_API_KEY',
  },
  qwen: {
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    default_model: 'qwen-plus',
    key_env: 'DASHSCOPE_API_KEY',
  },
}

/** 解析后的 provider 配置 */
export interface LlmConfig {
  baseUrl: string
  apiKey: string
  model: string
}

/**
 * 校验前端带来的 LLM 配置（provider 白名单 + Key 非空 trim）。
 * 非法输入返回 null（调用方回落服务端 env 兜底），绝不抛错、不回显。
 */
export function validateClientLlm(client: unknown): LlmConfig | null {
  if (!client || typeof client !== 'object' || Array.isArray(client)) return null
  const { provider, apiKey, model } = client as Partial<LlmClientSettings>
  const preset = typeof provider === 'string' ? LLM_PRESETS[provider] : undefined
  if (!preset) return null
  const key = typeof apiKey === 'string' ? apiKey.trim() : ''
  if (!key) return null
  const override = typeof model === 'string' ? model.trim() : ''
  return { baseUrl: preset.base_url, apiKey: key, model: override || preset.default_model }
}

/**
 * 解析 (baseUrl, apiKey, model)：前端配置优先，服务端 env 兜底；均未配置返回 null。
 */
export function resolveLlmConfig(client?: unknown): LlmConfig | null {
  const fromClient = validateClientLlm(client)
  if (fromClient) return fromClient

  const provider = process.env.LLM_PROVIDER || 'deepseek'
  const preset = LLM_PRESETS[provider]
  if (!preset) return null
  const apiKey = process.env[preset.key_env] || ''
  if (!apiKey) return null
  const model = process.env.LLM_MODEL || preset.default_model
  return { baseUrl: preset.base_url, apiKey, model }
}

/** 服务端 env 兜底是否已配好 Key（供 /api/capabilities；前端配置由客户端自行合并） */
export function isSummarizeConfigured(): boolean {
  return resolveLlmConfig() !== null
}
