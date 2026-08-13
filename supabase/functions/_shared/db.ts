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
    if (data) {
      // Atualiza nome só se veio um nome real e o cadastro ainda é genérico
      if (nome?.trim() && isKnownLeadName(nome) && !isKnownLeadName(data.nome)) {
        const { data: updated } = await db
          .from('clientes')
          .update({ nome: nome.trim() })
          .eq('id', data.id)
          .select()
          .single()
        if (updated) return updated
      }
      return data
    }
  }

  const norm = normalizePhone(phone)
  // Nunca grava o nome do perfil WhatsApp automaticamente — placeholder até o lead informar
  const displayName = (nome?.trim() && isKnownLeadName(nome))
    ? nome.trim()
    : `Cliente ${norm.slice(-4)}`
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

/** Nome vindo do cadastro e não placeholder genérico. */
export function isKnownLeadName(nome?: string | null): boolean {
  if (!nome?.trim()) return false
  const t = nome.trim()
  const n = normalizeMatch(t)
  if (n.startsWith('cliente ')) return false
  if (['cliente', 'user', 'usuario', 'usuário', 'undefined', 'null'].includes(n)) return false
  if (t.length < 2) return false
  return true
}

/** Texto parece um nome de pessoa (não pedido de agendamento / cumprimento). */
export function isPlausiblePersonName(text: string): boolean {
  const raw = text.trim().replace(/^me chamo\s+/i, '').replace(/^sou\s+(o|a)\s+/i, '').replace(/^é\s+/i, '').trim()
  if (!raw || raw.length > 50) return false
  if (isGreetingOnly(raw)) return false
  const n = normalizeMatch(raw)
  // intenções comuns que não são nome
  const blocked = [
    'agendar', 'marcar', 'cancelar', 'desmarcar', 'horarios', 'horario',
    'preco', 'preços', 'servico', 'servicos', 'barba', 'corte', 'remarc',
    'meu nome', 'nao sei', 'tanto faz',
  ]
  if (blocked.some((b) => n === b || n.startsWith(b + ' '))) return false
  if (/\d{3,}/.test(raw)) return false
  const words = raw.split(/\s+/).filter(Boolean)
  if (words.length < 1 || words.length > 5) return false
  if (!/^[\p{L}\s'’.-]+$/u.test(raw)) return false
  return true
}

export function cleanLeadName(text: string): string {
  return text
    .trim()
    .replace(/^me chamo\s+/i, '')
    .replace(/^eu sou\s+(o|a)\s+/i, '')
    .replace(/^sou\s+(o|a)\s+/i, '')
    .replace(/^meu nome e\s+/i, '')
    .replace(/^meu nome é\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function saveLeadName(
  db: SupabaseClient,
  phone: string,
  nome: string,
): Promise<string> {
  const cleaned = cleanLeadName(nome)
  const client = await findOrCreateClientByPhone(db, phone, cleaned)
  if (isKnownLeadName(client.nome) && normalizeMatch(client.nome) === normalizeMatch(cleaned)) {
    return client.nome
  }
  const { data, error } = await db
    .from('clientes')
    .update({ nome: cleaned })
    .eq('id', client.id)
    .select('nome')
    .single()
  if (error) throw new Error(error.message)
  return data?.nome || cleaned
}

export async function getLeadDisplayName(
  db: SupabaseClient,
  phone: string,
): Promise<string | null> {
  const client = await findOrCreateClientByPhone(db, phone)
  return isKnownLeadName(client.nome) ? String(client.nome) : null
}

export async function isBotActive(db: SupabaseClient): Promise<boolean> {
  const { data } = await db
    .from('configuracoes')
    .select('whatsapp_bot_ativo')
    .eq('id', 1)
    .maybeSingle()
  return data?.whatsapp_bot_ativo === true
}

export function firstNameFrom(senderName?: string | null): string | null {
  if (!senderName) return null
  const first = senderName.trim().split(/\s+/)[0] || ''
  if (first.length < 2 || /^\d+$/.test(first)) return null
  // ignora nomes genéricos do WhatsApp
  if (['cliente', 'user', 'usuario', 'usuário'].includes(normalizeMatch(first))) return null
  return first
}

/** Cumprimento da barbearia — sem se dizer assistente/bot. */
export function greetingText(
  senderName?: string | null,
  shopName?: string | null,
): string {
  const first = firstNameFrom(senderName)
  const place = (shopName || '').trim()
  const fromLine = place ? `Aqui é da ${place}.` : 'Aqui é da barbearia.'
  const hi = first ? `Oi, ${first}! Tudo bem?` : 'Oi! Tudo bem?'
  return `${hi} ${fromLine} Como podemos ajudá-lo?`
}

/** @deprecated use greetingText */
export function menuText(senderName?: string | null, shopName?: string | null): string {
  return greetingText(senderName, shopName)
}

export async function fetchShopName(db: SupabaseClient): Promise<string | null> {
  const { data } = await db
    .from('configuracoes')
    .select('nome_barbearia')
    .eq('id', 1)
    .maybeSingle()
  const n = typeof data?.nome_barbearia === 'string' ? data.nome_barbearia.trim() : ''
  return n || null
}

/** Dados oficiais da unidade (fallback se o admin ainda não salvou). */
export const DEFAULT_SHOP_ADDRESS =
  'Rua Castro Monte 165, Bairro Varjota, Fortaleza'
export const DEFAULT_SHOP_HOURS_OPEN = '08:30 - 19:30'
export const DEFAULT_SHOP_HOURS_CLOSED = 'Fechado'

export type ShopPublicInfo = {
  nome: string | null
  endereco: string
  horarios: {
    segunda: string
    terca: string
    quarta: string
    quinta: string
    sexta: string
    sabado: string
    domingo: string
  }
  resumo: string
}

export function shopInfoResumo(endereco: string, openLabel = '08h30 às 19h30'): string {
  return [
    `Endereço: ${endereco}`,
    `Funcionamento: segunda a sábado, ${openLabel}. Domingo fechado.`,
  ].join('\n')
}

export async function fetchShopPublicInfo(db: SupabaseClient): Promise<ShopPublicInfo> {
  const { data } = await db.from('configuracoes').select('*').eq('id', 1).maybeSingle()
  const c = data || {}
  const open = DEFAULT_SHOP_HOURS_OPEN
  const closed = DEFAULT_SHOP_HOURS_CLOSED
  const endereco =
    (typeof c.endereco === 'string' && c.endereco.trim()) || DEFAULT_SHOP_ADDRESS
  const horarios = {
    segunda: (c.horario_segunda as string)?.trim() || open,
    terca: (c.horario_terca as string)?.trim() || open,
    quarta: (c.horario_quarta as string)?.trim() || open,
    quinta: (c.horario_quinta as string)?.trim() || open,
    sexta: (c.horario_sexta as string)?.trim() || open,
    sabado: (c.horario_sabado as string)?.trim() || open,
    domingo: (c.horario_domingo as string)?.trim() || closed,
  }
  return {
    nome: typeof c.nome_barbearia === 'string' ? c.nome_barbearia.trim() || null : null,
    endereco,
    horarios,
    resumo: shopInfoResumo(endereco),
  }
}

/** Cliente perguntando endereço / funcionamento (não horário de agendamento). */
export function wantsShopInfo(text: string): boolean {
  const t = normalizeMatch(text)
  if (!t) return false
  if (
    t.includes('endereco') ||
    t.includes('onde fica') ||
    t.includes('onde voces') ||
    t.includes('localizacao') ||
    t.includes('como chegar') ||
    t.includes('mapa') ||
    t.includes('varjota') ||
    t.includes('castro monte')
  ) {
    return true
  }
  if (
    t.includes('funcionamento') ||
    t.includes('horario de func') ||
    t.includes('que horas abre') ||
    t.includes('que hora abre') ||
    t.includes('que horas fecha') ||
    t.includes('que hora fecha') ||
    t.includes('ate que hora') ||
    t.includes('voces abrem') ||
    t.includes('esta aberto') ||
    t.includes('abre sabado') ||
    t.includes('abre domingo')
  ) {
    return true
  }
  if (
    (t.includes('horario') || t.includes('horarios')) &&
    (t.includes('loja') || t.includes('salao') || t.includes('barbearia'))
  ) {
    return true
  }
  return false
}

export type UpcomingAppt = {
  id: string
  data: string
  data_br: string
  horario: string
  status: string
  servico: string | null
  barbeiro: string | null
}

/** Agendamentos futuros (pendente/confirmado) do telefone. */
export async function fetchUpcomingAppointments(
  db: SupabaseClient,
  phone: string,
  _senderName?: string | null,
): Promise<UpcomingAppt[]> {
  // Não usa nome do WhatsApp — só telefone
  const client = await findOrCreateClientByPhone(db, phone)
  const today = todaySaoPauloISO()
  const { data, error } = await db
    .from('agendamentos')
    .select('id, data, horario, status, servicos(nome), barbeiros(nome)')
    .eq('cliente_id', client.id)
    .in('status', ['pendente', 'confirmado'])
    .gte('data', today)
    .order('data', { ascending: true })
    .order('horario', { ascending: true })

  if (error || !data?.length) return []

  return data.map((a: {
    id: string
    data: string
    horario: string
    status: string
    servicos: { nome: string } | { nome: string }[] | null
    barbeiros: { nome: string } | { nome: string }[] | null
  }) => {
    const serv = Array.isArray(a.servicos) ? a.servicos[0] : a.servicos
    const barb = Array.isArray(a.barbeiros) ? a.barbeiros[0] : a.barbeiros
    return {
      id: a.id,
      data: a.data,
      data_br: formatDateBR(String(a.data)),
      horario: String(a.horario).slice(0, 5),
      status: a.status,
      servico: serv?.nome || null,
      barbeiro: barb?.nome || null,
    }
  })
}

function formatApptShort(a: UpcomingAppt): string {
  const serv = a.servico ? ` (${a.servico})` : ''
  const barb = a.barbeiro ? ` com ${a.barbeiro}` : ''
  return `${a.data_br} às ${a.horario}${serv}${barb}`
}

/**
 * Cumprimento consciente do lead: se já tem horário, menciona e abre opção
 * (sem menu robótico / sem "assistente").
 * `senderName` = nome informado/salvo do lead (NUNCA o nome do perfil WhatsApp).
 */
export function greetingWithAppointments(
  senderName: string | null | undefined,
  shopName: string | null | undefined,
  appts: UpcomingAppt[],
): string {
  const base = greetingText(senderName, shopName)
  if (!appts.length) return base

  if (appts.length === 1) {
    const a = appts[0]
    return `${base} Vi que você já tem horário marcado em ${formatApptShort(a)}. Quer remarcar, cancelar ou marcar outro?`
  }

  const next = appts[0]
  return `${base} Vi que você já tem ${appts.length} horários marcados (próximo em ${formatApptShort(next)}). Quer ver todos, remarcar, cancelar ou marcar outro?`
}

/** Primeiro contato: pede nome (não usa perfil WhatsApp). */
export function askNameText(shopName?: string | null): string {
  const shop = (shopName || '').trim()
  const from = shop ? `Aqui é da ${shop}.` : 'Aqui é da barbearia.'
  return `Oi! Tudo bem? ${from} Qual é o seu nome?`
}

/** Depois que o lead informa o nome. */
export function afterNameGreeting(
  fullName: string,
  shopName?: string | null,
  appts: UpcomingAppt[] = [],
): string {
  const first = firstNameFrom(fullName) || fullName.trim().split(/\s+/)[0]
  const shop = (shopName || '').trim()
  const from = shop ? `Aqui é da ${shop}.` : 'Aqui é da barbearia.'
  const base = `Prazer, ${first}! ${from} Como podemos ajudá-lo?`
  if (!appts.length) return base
  if (appts.length === 1) {
    const a = appts[0]
    return `${base} Vi que você já tem horário marcado em ${formatApptShort(a)}. Quer remarcar, cancelar ou marcar outro?`
  }
  const next = appts[0]
  return `${base} Vi que você já tem ${appts.length} horários (próximo em ${formatApptShort(next)}). Quer ver, remarcar, cancelar ou marcar outro?`
}

/** Texto de contexto para a IA sobre agenda do lead. */
export function appointmentsContextLines(appts: UpcomingAppt[]): string[] {
  if (!appts.length) {
    return ['O cliente NÃO tem agendamentos futuros no sistema.']
  }
  const lines = [
    `O cliente JÁ TEM ${appts.length} agendamento(s) futuro(s):`,
    ...appts.slice(0, 6).map((a) =>
      `- id ${a.id.slice(0, 8)}… | ${formatApptShort(a)} | status ${a.status}`,
    ),
  ]
  if (appts.length > 6) lines.push(`(e mais ${appts.length - 6})`)
  lines.push(
    'Se o assunto for o horário existente, priorize consulta/cancelamento/remarcação. Se for agendar de novo, avise que ele já tem horário e pergunte se quer outro mesmo assim.',
  )
  return lines
}

/** Short closer after a finished action. */
export function aftercareText(): string {
  return 'Qualquer coisa, me chama aqui.'
}

export function isGreetingOnly(text: string): boolean {
  const t = normalizeMatch(text)
    .replace(/[!?.,…]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return true
  const greetings = new Set([
    'oi', 'ola', 'oie', 'oii', 'oiii',
    'bom dia', 'boa tarde', 'boa noite',
    'eai', 'e ai', 'eae', 'opa', 'fala', 'salve',
    'hey', 'hello', 'hi', 'tudo bem', 'td bem', 'tudo bom',
  ])
  if (greetings.has(t)) return true
  // "oi tudo bem" / "ola bom dia"
  if (/^(oi|ola|oie)\s+(tudo bem|td bem|tudo bom|bom dia|boa tarde|boa noite)?$/.test(t)) return true
  if (/^(bom dia|boa tarde|boa noite)\s*(tudo bem|td bem)?$/.test(t)) return true
  return false
}

/** Remove emojis e colapsa excesso de linhas em branco. */
export function stripBotChrome(text: string): string {
  let s = text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\u200d\ufe0f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  // linhas que ficaram só com espaços/símbolos isolados
  s = s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l, i, arr) => l.length > 0 || (i > 0 && arr[i - 1].length > 0))
    .join('\n')
    .trim()
  return s
}

/** Detecta o padrão “assistente virtual + lista de opções”. */
export function looksLikeRobotMenu(text: string): boolean {
  const raw = text || ''
  const t = normalizeMatch(raw)
  if (
    t.includes('assistente virtual') ||
    t.includes('assistente da barbearia') ||
    t.includes('sou o assistente') ||
    t.includes('sou a assistente') ||
    t.includes('sou um bot') ||
    t.includes('sou o bot') ||
    t.includes('posso te ajudar com') ||
    t.includes('o que deseja fazer') ||
    t.includes('bem-vindo a') ||
    t.includes('bem vindo a') ||
    t.includes('bem-vindo à')
  ) {
    return true
  }
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  // 4+ linhas com vários "tópicos" = menu
  if (lines.length >= 5 && /agendar|cancelar|servicos|serviços|funcionamento|agendamento/.test(t)) {
    return true
  }
  const emojiCount = (raw.match(/\p{Extended_Pictographic}/gu) || []).length
  if (emojiCount >= 2 && lines.length >= 3) return true
  return false
}

/**
 * Garante tom humano no texto final.
 * Se vier menu-robô, troca por cumprimento ou pedido simples.
 */
export function humanizeOutbound(
  text: string,
  opts?: { senderName?: string | null; userText?: string },
): string {
  const cleaned = stripBotChrome(text)
  if (!cleaned) {
    return isGreetingOnly(opts?.userText || '')
      ? greetingText(opts?.senderName)
      : 'Me conta o que você precisa.'
  }
  if (looksLikeRobotMenu(cleaned) || looksLikeRobotMenu(text)) {
    if (opts?.userText && isGreetingOnly(opts.userText)) {
      return greetingText(opts.senderName)
    }
    return 'Me conta o que você precisa.'
  }
  return cleaned
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
