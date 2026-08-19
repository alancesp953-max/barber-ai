/**
 * Minimal UAZAPI client for Edge Functions.
 * Docs: https://docs.uazapi.com/
 */

export type UazapiConfig = {
  baseUrl: string
  token: string
}

export function getUazapiConfig(overrides?: Partial<UazapiConfig>): UazapiConfig {
  let baseUrl = (
    overrides?.baseUrl ||
    Deno.env.get('UAZAPI_BASE_URL') ||
    ''
  ).trim().replace(/\/$/, '')
  const token = (overrides?.token || Deno.env.get('UAZAPI_INSTANCE_TOKEN') || '').trim()
  if (!baseUrl || !token) {
    throw new Error('UAZAPI_BASE_URL e UAZAPI_INSTANCE_TOKEN devem ser configurados nos secrets')
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    baseUrl = `https://${baseUrl}`
  }
  // UUID-only "host" is never valid (instance id mistaken for base URL)
  try {
    const host = new URL(baseUrl).hostname
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(host)) {
      throw new Error(
        `UAZAPI_BASE_URL inválida (${host}). Use a URL do servidor, ex: https://barberai.uazapi.com`,
      )
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('UAZAPI_BASE_URL inválida')) throw e
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
  // UAZAPI instance auth is header "token" only (not Bearer) — see docs.uazapi.com
  const headers: Record<string, string> = {
    Accept: 'application/json',
    token: cfg.token,
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

  // Server-level health payload (invalid or admin token / wrong base) is not instance QR
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    if (
      typeof o.info === 'string' &&
      o.info.toLowerCase().includes('server is up')
    ) {
      return {
        ok: false,
        status: res.status,
        error:
          'A UAZAPI devolveu status do SERVIDOR (não da instância). Confira se UAZAPI_INSTANCE_TOKEN é o token da INSTÂNCIA (header token), não o admintoken do servidor, e se UAZAPI_BASE_URL é https://seu-subdominio.uazapi.com',
        data,
      }
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


export type PresenceType = 'composing' | 'paused' | 'recording'

/**
 * POST /message/presence
 * `delay` (ms) = quanto tempo o WhatsApp mostra "digitando…" / "gravando…".
 * Sem delay a presença some na hora e o cliente não vê nada.
 */
export async function sendPresence(
  number: string,
  presence: PresenceType,
  config?: UazapiConfig,
  delayMs?: number,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const phone = normalizePhone(number)
  const body: Record<string, unknown> = {
    number: phone,
    presence,
  }
  if (delayMs != null && delayMs > 0) {
    body.delay = Math.round(delayMs)
  }
  const result = await uazRequest(
    '/message/presence',
    { method: 'POST', body },
    config,
  )
  return { ok: result.ok, data: result.data, error: result.error }
}

/**
 * Tempo de “digitação” legível no celular.
 * Mín ~1.8s (cumprimentos curtos ainda parecem humanos); máx ~5s.
 */
export function typingDelayMs(text: string): number {
  // ~45ms por caractere + margem, sem ficar absurdamente longo no Edge
  const byLen = 800 + text.length * 45
  return Math.min(5000, Math.max(1800, byLen))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Simula humano: "digitando…" (presence com delay) → espera → envia texto.
 * Presence falha não bloqueia o envio.
 */
export async function humanReply(
  number: string,
  text: string,
  config?: UazapiConfig,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  if (!config?.baseUrl || !config?.token) {
    return { ok: false, error: 'UAZAPI config obrigatória (use resolveUazConfig)' }
  }
  const phone = normalizePhone(number)
  const delay = typingDelayMs(text)

  // 1) Marca digitando pelo tempo calculado (UAZAPI usa o campo delay)
  const presence = await sendPresence(phone, 'composing', config, delay)
  if (!presence.ok) {
    console.warn('sendPresence composing failed', presence.error)
  }

  // 2) Espera o mesmo tempo (composing some cedo se mandar a msg antes)
  await sleep(delay)

  // 3) Envia o texto (delay extra 0 — já esperamos)
  const result = await sendText(phone, text, config, 0)

  // 4) Encerra status (best-effort)
  const paused = await sendPresence(phone, 'paused', config)
  if (!paused.ok) {
    console.warn('sendPresence paused failed', paused.error)
  }

  return result
}

export async function sendText(
  number: string,
  text: string,
  config?: UazapiConfig,
  delayMs?: number,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const phone = normalizePhone(number)
  const body: Record<string, unknown> = {
    number: phone,
    text,
    readchat: true,
    readmessages: true,
  }
  if (delayMs != null && delayMs > 0) {
    body.delay = Math.round(delayMs)
  }
  const result = await uazRequest(
    '/send/text',
    { method: 'POST', body },
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

/** GET /instance/status — poll QR updates while connecting */
export async function getInstanceStatus(
  config?: UazapiConfig,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  // Do NOT call bare /status — that is server health, not instance
  const paths = ['/instance/status', '/instance/connectionState']
  let last: { ok: boolean; data?: unknown; error?: string } = {
    ok: false,
    error: 'status da instância falhou',
  }
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

  // Prefer explicit instance.status; fallback status.connected object
  let status = pick('status', 'state', 'instanceStatus')
  if (!status || status === 'object') {
    const st = root.status
    if (st && typeof st === 'object') {
      const o = st as Record<string, unknown>
      if (o.connected === true || o.loggedIn === true) status = 'connected'
      else if (o.connected === false) status = 'disconnected'
    }
    if (typeof nested.status === 'string') status = nested.status
  }
  if (root.connected === true) status = 'connected'
  if (root.connected === false && !status) status = 'disconnected'

  return {
    qrcode,
    paircode: pick('paircode', 'pairCode', 'pairingCode', 'code'),
    status,
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
