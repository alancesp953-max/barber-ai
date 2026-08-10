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

export async function sendText(
  number: string,
  text: string,
  config?: UazapiConfig,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const cfg = config ?? getUazapiConfig()
  const phone = normalizePhone(number)

  const res = await fetch(`${cfg.baseUrl}/send/text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      token: cfg.token,
    },
    body: JSON.stringify({
      number: phone,
      text,
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return {
      ok: false,
      error: typeof data === 'object' && data && 'message' in data
        ? String((data as { message: unknown }).message)
        : `UAZAPI HTTP ${res.status}`,
      data,
    }
  }
  return { ok: true, data }
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
