/**
 * Xiaomi MiMo chat completions client (OpenAI-compatible-ish)
 * Endpoint base: https://token-plan-sgp.xiaomimimo.com/v1
 */

export type MimoConfig = {
  apiKey: string
  baseUrl: string
  model: string
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  reasoning_content?: string | null
  tool_calls?: ToolCall[] | null
  tool_call_id?: string
  name?: string
}

export type ToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type ToolDef = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export async function loadMimoConfig(
  db: { from: (t: string) => { select: (c: string) => { eq: (a: string, b: number) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> } } } },
): Promise<MimoConfig | null> {
  const envKey = Deno.env.get('MIMO_API_KEY') || ''
  const envBase = Deno.env.get('MIMO_BASE_URL') || ''
  const envModel = Deno.env.get('MIMO_MODEL') || ''

  let row: Record<string, unknown> | null = null
  try {
    const { data } = await db.from('whatsapp_secrets').select('mimo_api_key, mimo_base_url, mimo_model').eq('id', 1).maybeSingle()
    row = data
  } catch {
    /* ignore */
  }

  const apiKey = String(envKey || row?.mimo_api_key || '').trim()
  if (!apiKey) return null

  let baseUrl = String(envBase || row?.mimo_base_url || 'https://token-plan-sgp.xiaomimimo.com/v1')
    .trim()
    .replace(/\/$/, '')
  if (!/^https?:\/\//i.test(baseUrl)) baseUrl = `https://${baseUrl}`

  const model = String(envModel || row?.mimo_model || 'mimo-v2.5-pro').trim() || 'mimo-v2.5-pro'
  return { apiKey, baseUrl, model }
}

export async function mimoChat(params: {
  config: MimoConfig
  messages: ChatMessage[]
  tools?: ToolDef[]
  tool_choice?: 'auto' | 'none' | object
  temperature?: number
  max_completion_tokens?: number
}): Promise<{
  ok: boolean
  message?: ChatMessage
  error?: string
  raw?: unknown
}> {
  const { config, messages, tools } = params
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: params.temperature ?? 0.6,
    max_completion_tokens: params.max_completion_tokens ?? 1024,
    stream: false,
  }
  if (tools?.length) {
    body.tools = tools
    body.tool_choice = params.tool_choice ?? 'auto'
  }

  let res: Response
  try {
    res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.apiKey,
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  const raw = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      typeof raw === 'object' && raw && 'error' in raw
        ? JSON.stringify((raw as { error: unknown }).error)
        : `MiMo HTTP ${res.status}`
    return { ok: false, error: msg, raw }
  }

  const choice = (raw as { choices?: Array<{ message?: ChatMessage }> })?.choices?.[0]
  if (!choice?.message) {
    return { ok: false, error: 'MiMo sem choices.message', raw }
  }
  return { ok: true, message: choice.message, raw }
}
