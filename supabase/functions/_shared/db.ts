/**
 * Shared helpers for WhatsApp bot → Supabase data access
 */
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { normalizePhone, phoneVariants } from './uazapi.ts'

export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export type SessionRow = {
  phone: string
  step: string
  context: Record<string, unknown>
  updated_at?: string
}

export async function getSession(db: SupabaseClient, phone: string): Promise<SessionRow> {
  const p = normalizePhone(phone)
  const { data } = await db
    .from('whatsapp_sessions')
    .select('*')
    .eq('phone', p)
    .maybeSingle()

  if (data) {
    return {
      phone: data.phone,
      step: data.step || 'chat',
      context: (data.context as Record<string, unknown>) || {},
    }
  }
  return { phone: p, step: 'chat', context: {} }
}

export async function saveSession(
  db: SupabaseClient,
  phone: string,
  step: string,
  context: Record<string, unknown> = {},
): Promise<void> {
  const p = normalizePhone(phone)
  await db.from('whatsapp_sessions').upsert({
    phone: p,
    step,
    context,
    updated_at: new Date().toISOString(),
  })
}

export async function resetSession(db: SupabaseClient, phone: string): Promise<void> {
  await saveSession(db, phone, 'chat', {})
}

export async function findOrCreateClientByPhone(
  db: SupabaseClient,
  phone: string,
  nome?: string,
) {
  const variants = phoneVariants(phone)
  for (const v of variants) {
    const { data } = await db.from('clientes').select('*').eq('telefone', v).limit(1).maybeSingle()
    if (data) return data
  }

  const norm = normalizePhone(phone)
  const displayName = nome?.trim() || `Cliente ${norm.slice(-4)}`
  const email = `wa${norm}@whatsapp.local`

  const { data, error } = await db
    .from('clientes')
    .insert({
      nome: displayName,
      telefone: norm,
      email,
    })
    .select()
    .single()

  if (error) {
    // race / unique email
    const { data: again } = await db
      .from('clientes')
      .select('*')
      .eq('telefone', norm)
      .limit(1)
      .maybeSingle()
    if (again) return again
    throw new Error(error.message)
  }
  return data
}

export async function isBotActive(db: SupabaseClient): Promise<boolean> {
  const { data } = await db
    .from('configuracoes')
    .select('whatsapp_bot_ativo')
    .eq('id', 1)
    .maybeSingle()
  return data?.whatsapp_bot_ativo === true
}

export function greetingText(): string {
  return 'Oi! Tudo bem? Em que posso te ajudar?'
}

/** @deprecated use greetingText — kept as alias for internal redirects */
export function menuText(): string {
  return greetingText()
}

/** Short closer after a finished action. */
export function aftercareText(): string {
  return 'Qualquer coisa, me chama aqui.'
}

/** Normalize for name matching (lowercase, no accents). */
export function normalizeMatch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Match user text to an item by name.
 * Exact → startsWith → includes; pure digit 1..n still accepted for compat.
 */
export function matchByName<T extends { nome: string }>(
  text: string,
  items: T[],
): T | null {
  if (!items.length) return null
  const raw = text.trim()
  if (!raw) return null

  // Compat: pure digit index still works if customer types it unprompted
  if (/^\d+$/.test(raw)) {
    const idx = parseInt(raw, 10) - 1
    if (idx >= 0 && idx < items.length) return items[idx]
  }

  const q = normalizeMatch(raw)
  const exact = items.find((it) => normalizeMatch(it.nome) === q)
  if (exact) return exact

  const starts = items.filter((it) => normalizeMatch(it.nome).startsWith(q))
  if (starts.length === 1) return starts[0]

  const includes = items.filter((it) => {
    const n = normalizeMatch(it.nome)
    return n.includes(q) || q.includes(n)
  })
  if (includes.length === 1) return includes[0]
  return null
}

/** Match a time slot: "15:00", "15h", "15", index digit, or substring. */
export function matchSlot(text: string, slots: string[]): string | null {
  if (!slots.length) return null
  const raw = text.trim()
  if (!raw) return null

  if (/^\d+$/.test(raw) && !raw.includes(':') && raw.length <= 2 && parseInt(raw, 10) <= slots.length) {
    const idx = parseInt(raw, 10) - 1
    if (idx >= 0 && idx < slots.length) return slots[idx].slice(0, 5)
  }

  // HH:MM or HHh or HHhMM
  let want = raw.replace(/\s/g, '').toLowerCase()
  const hm = want.match(/^(\d{1,2})(?::|h)?(\d{2})?h?$/)
  if (hm) {
    const h = hm[1].padStart(2, '0')
    const m = (hm[2] || '00').padStart(2, '0')
    want = `${h}:${m}`
  }

  const exact = slots.find((s) => s.slice(0, 5) === want)
  if (exact) return exact.slice(0, 5)

  // "15" alone → unique slot starting with 15:
  if (/^\d{1,2}$/.test(raw)) {
    const hour = raw.padStart(2, '0')
    const matches = slots.filter((s) => s.slice(0, 2) === hour)
    if (matches.length === 1) return matches[0].slice(0, 5)
  }

  return null
}

export function formatNameList(names: string[]): string {
  return names.map((n) => `• ${n}`).join('\n')
}

export function parseDateBR(input: string): string | null {
  const t = input.trim()
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  // DD/MM/YYYY or DD/MM
  const m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (!m) return null
  const day = m[1].padStart(2, '0')
  const month = m[2].padStart(2, '0')
  let year = m[3]
  if (!year) year = String(new Date().getFullYear())
  if (year.length === 2) year = `20${year}`
  return `${year}-${month}-${day}`
}

export function formatDateBR(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

/** Calendar today in America/Sao_Paulo (YYYY-MM-DD). */
export function todaySaoPauloISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
