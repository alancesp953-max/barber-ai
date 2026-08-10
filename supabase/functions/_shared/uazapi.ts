/**
 * Minimal UAZAPI client for Edge Functions.
 * Docs: https://docs.uazapi.com/
 */

export type UazapiConfig = {
  baseUrl: string
  token: string
}

export function getUazapiConfig(): UazapiConfig {
  const baseUrl = (Deno.env.get('UAZAPI_BASE_URL') || '').replace(/\/$/, '')
  const token = Deno.env.get('UAZAPI_INSTANCE_TOKEN') || ''
  if (!baseUrl || !token) {
    throw new Error('UAZAPI_BASE_URL e UAZAPI_INSTANCE_TOKEN devem ser configurados nos secrets')
  }
  return { baseUrl, token }
}

async function uazRequest(
  path: string,
  options: { method?: string; body?: unknown } = {},
  config?: UazapiConfig,
): Promise<{ ok: boolean; data?: unknown; error?: string; status: number }> {
  const cfg = config ?? getUazapiConfig()
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      token: cfg.token,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: typeof data === 'object' && data && 'message' in data
        ? String((data as { message: unknown }).message)
        : `UAZAPI HTTP ${res.status}`,
      data,
    }
  }
  return { ok: true, status: res.status, data }
}

export async function sendText(
  number: string,
  text: string,
  config?: UazapiConfig,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const phone = normalizePhone(number)
  const result = await uazRequest(
    '/send/text',
    { method: 'POST', body: { number: phone, text } },
    config,
  )
  return { ok: result.ok, data: result.data, error: result.error }
}

/**
 * POST /instance/connect
 * Sem `phone` → retorna QR code (base64). Com `phone` → pair code.
 * Docs: https://docs.uazapi.com/
 */
export async function connectInstance(
  phone?: string,
  config?: UazapiConfig,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const body = phone ? { phone: normalizePhone(phone) } : {}
  const result = await uazRequest(
    '/instance/connect',
    { method: 'POST', body },
    config,
  )
  return { ok: result.ok, data: result.data, error: result.error }
}

/** GET /instance/status */
export async function getInstanceStatus(
  config?: UazapiConfig,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const result = await uazRequest('/instance/status', { method: 'GET' }, config)
  return { ok: result.ok, data: result.data, error: result.error }
}

/** POST /instance/disconnect */
export async function disconnectInstance(
  config?: UazapiConfig,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const result = await uazRequest('/instance/disconnect', { method: 'POST', body: {} }, config)
  return { ok: result.ok, data: result.data, error: result.error }
}

/** Normaliza campos de QR da resposta da UAZAPI (qrcode | qrCode | base64 …) */
export function extractQrFromResponse(data: unknown): {
  qrcode?: string
  paircode?: string
  status?: string
  raw: unknown
} {
  if (!data || typeof data !== 'object') return { raw: data }
  const root = data as Record<string, unknown>
  const nested =
    root.instance && typeof root.instance === 'object'
      ? (root.instance as Record<string, unknown>)
      : root.data && typeof root.data === 'object'
        ? (root.data as Record<string, unknown>)
        : root

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = nested[k] ?? root[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return undefined
  }

  let qrcode = pick('qrcode', 'qrCode', 'qr_code', 'base64', 'base64QR', 'qr')
  if (qrcode && !qrcode.startsWith('data:') && !qrcode.startsWith('http')) {
    // base64 puro → imagem data URL
    if (/^[A-Za-z0-9+/=]+$/.test(qrcode.slice(0, 80)) || qrcode.startsWith('iVBOR') || qrcode.startsWith('/9j/')) {
      qrcode = `data:image/png;base64,${qrcode.replace(/^data:image\/\w+;base64,/, '')}`
    }
  }

  return {
    qrcode,
    paircode: pick('paircode', 'pairCode', 'pairingCode', 'code'),
    status: pick('status', 'state', 'instanceStatus'),
    raw: data,
  }
}

/** Digits only, with Brazilian country code when missing */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  // WhatsApp JIDs sometimes appear as 5511...@s.whatsapp.net
  if (digits.includes('@')) digits = digits.split('@')[0]
  if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith('55')) {
    digits = `55${digits}`
  }
  return digits
}

export function phoneVariants(raw: string): string[] {
  const n = normalizePhone(raw)
  const set = new Set<string>([n, raw.replace(/\D/g, '')])
  if (n.startsWith('55') && n.length > 11) {
    set.add(n.slice(2))
  }
  return [...set].filter(Boolean)
}
