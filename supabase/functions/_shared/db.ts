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
      step: data.step || 'menu',
      context: (data.context as Record<string, unknown>) || {},
    }
  }
  return { phone: p, step: 'menu', context: {} }
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
  await saveSession(db, phone, 'menu', {})
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

export function menuText(): string {
  return [
    '*BarberAI* — como posso ajudar?',
    '',
    '1️⃣ Agendar horário',
    '2️⃣ Meus horários',
    '3️⃣ Cancelar agendamento',
    '0️⃣ Menu / ajuda',
    '',
    'Envie o *número* da opção.',
  ].join('\n')
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
