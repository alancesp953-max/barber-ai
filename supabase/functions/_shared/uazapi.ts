/**
 * Minimal UAZAPI client for Edge Functions.
 * Docs: https://docs.uazapi.com/
 */

export type UazapiConfig = {
  baseUrl: string
  token: string
}

export function getUazapiConfig(): UazapiConfig {
  let baseUrl = (Deno.env.get('UAZAPI_BASE_URL') || '').trim().replace(/\/$/, '')
  const token = (Deno.env.get('UAZAPI_INSTANCE_TOKEN') || '').trim()
  if (!baseUrl || !token) {
    throw new Error('UAZAPI_BASE_URL e UAZAPI_INSTANCE_TOKEN devem ser configurados nos secrets')
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    baseUrl = `https://${baseUrl}`
  }
  return { baseUrl, token }
}

async function uazRequest(
  path: string,
  options: { method?: string; body?: unknown; skipBody?: boolean } = {},
  config?: UazapiConfig,
): Promise<{ ok: boolean; data?: unknown; error?: string; status: number }> {
  const cfg = config ?? getUazapiConfig()
  const method = options.method || 'GET'
  const headers: Record<string, string> = {
    Accept: 'application/json',
    token: cfg.token,
    // alguns gateways aceitam Authorization
    Authorization: `Bearer ${cfg.token}`,
  }

  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD' && !options.skipBody) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body ?? {})
  }

  const url = `${cfg.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  let res: Response
  try {
    res = await fetch(url, { method, headers, body })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      status: 0,
      error: `Não foi possível contatar UAZAPI (${cfg.baseUrl}): ${msg}. Verifique UAZAPI_BASE_URL.`,
    }
  }

  const text = await res.text()
  let data: unknown = {}
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text.slice(0, 500) }
    }
  }

  if (!res.ok) {
    let errMsg = `UAZAPI HTTP ${res.status} em ${path}`
    if (data && typeof data === 'object') {
      const o = data as Record<string, unknown>
      const m = o.message ?? o.error ?? o.msg ?? o.detail
      if (m) errMsg = `${errMsg}: ${String(m)}`
    } else if (text) {
      errMsg = `${errMsg}: ${text.slice(0, 200)}`
    }
    return { ok: false, status: res.status, error: errMsg, data }
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
 * Sem `phone` → QR code. Com `phone` → pair code.
 */
export async function connectInstance(
  phone?: string,
  config?: UazapiConfig,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const tries: Array<{ path: string; body?: unknown; skipBody?: boolean }> = phone
    ? [{ path: '/instance/connect', body: { phone: normalizePhone(phone) } }]
    : [
      { path: '/instance/connect', skipBody: true },
      { path: '/instance/connect', body: {} },
    ]

  let last: { ok: boolean; data?: unknown; error?: string } = { ok: false, error: 'connect falhou' }
  for (const t of tries) {
    const result = await uazRequest(
      t.path,
      { method: 'POST', body: t.body, skipBody: t.skipBody },
      config,
    )
    last = result
    if (result.ok) return { ok: true, data: result.data }
  }
  return last
}

/** GET /instance/status (fallback em outros paths comuns) */
export async function getInstanceStatus(
  config?: UazapiConfig,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const paths = ['/instance/status', '/instance/connectionState', '/status']
  let last: { ok: boolean; data?: unknown; error?: string } = { ok: false, error: 'status falhou' }
  for (const path of paths) {
    const result = await uazRequest(path, { method: 'GET' }, config)
    last = result
    if (result.ok) return { ok: true, data: result.data }
  }
  return last
}

/** POST /instance/disconnect */
export async function disconnectInstance(
  config?: UazapiConfig,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const result = await uazRequest(
    '/instance/disconnect',
    { method: 'POST', body: {} },
    config,
  )
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
