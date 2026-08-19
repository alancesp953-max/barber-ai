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

const INTENT_NAME_BLOCK = [
  'agendar', 'agendamento', 'agendamentos', 'marcar', 'marcacao', 'marcação',
  'cancelar', 'desmarcar', 'horarios', 'horario', 'preco', 'precos', 'preços',
  'servico', 'servicos', 'barba', 'corte', 'cabelo', 'pezinho', 'sobrancelha',
  'combo', 'remarc', 'remarcar', 'disponivel', 'disponiveis', 'opcoes', 'opções',
  'meu nome', 'nao sei', 'tanto faz', 'qualquer', 'diva', 'barbearia',
  'pode', 'apenas', 'sistema', 'obg', 'obrigado', 'valeu', 'sim', 'nao',
  'domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado',
]

export function looksLikeIntentNotName(text: string): boolean {
  const n = normalizeMatch(text)
  if (!n) return false
  const words = n.split(/\s+/).filter(Boolean)
  return INTENT_NAME_BLOCK.some((b) => {
    const nb = normalizeMatch(b)
    if (!nb) return false
    if (n === nb) return true
    return words.includes(nb)
  })
}

/** Nome vindo do cadastro e não placeholder genérico. */
export function isKnownLeadName(nome?: string | null): boolean {
  if (!nome?.trim()) return false
  const t = nome.trim()
  const n = normalizeMatch(t)
  if (n.startsWith('cliente ')) return false
  if (['cliente', 'user', 'usuario', 'usuário', 'undefined', 'null'].includes(n)) return false
  if (looksLikeIntentNotName(t)) return false
  if (t.length < 2) return false
  return true
}

/** Texto parece um nome de pessoa (não pedido de agendamento / cumprimento). */
export function isPlausiblePersonName(text: string): boolean {
  const raw = text.trim().replace(/^me chamo\s+/i, '').replace(/^sou\s+(o|a)\s+/i, '').replace(/^é\s+/i, '').trim()
  if (!raw || raw.length > 50) return false
  if (isGreetingOnly(raw)) return false
  if (looksLikeIntentNotName(raw)) return false
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
  if (!senderName || !isKnownLeadName(senderName)) return null
  const first = senderName.trim().split(/\s+/)[0] || ''
  if (first.length < 2 || /^\d+$/.test(first)) return null
  if (looksLikeIntentNotName(first)) return null
  return first
}

export const DIVA_IDENTITY = 'Eu sou a Diva da Divina Barbearia da Varjota'

export function punctualityConfirmText(): string {
  return 'Seu agendamento foi confirmado! Pedimos pontualidade, pois trabalhamos com tolerância mínima para atrasos e, caso passe do horário, a vaga será passada para o próximo atendimento.'
}

export function formatBrl(value: number): string {
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`
}

export function formatServicePriceList(
  services: { nome: string; preco: number }[],
): string {
  const lines = services.map((s) => `${s.nome}: ${formatBrl(s.preco)}`)
  return ['Opções de serviço:', ...lines].join('\n')
}

export function closedShopNotice(): string {
  return 'O expediente de atendimento de hoje já está encerrado. Posso agendar para amanhã ou outra data disponível, se quiser. Vamos agendar?'
}

/** Cumprimento da barbearia — Diva, sem se dizer assistente/bot. */
export function greetingText(
  senderName?: string | null,
  _shopName?: string | null,
): string {
  const first = firstNameFrom(senderName)
  const hi = first ? `Oi, ${first}! Tudo bem?` : 'Oi! Tudo bem?'
  return `${hi} ${DIVA_IDENTITY}. Vamos agendar?`
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

function isClosedLabel(raw: string): boolean {
  const t = raw.trim().toLowerCase()
  return !t || t === '-' || t === 'fechado' || t === 'closed'
}

/** "08:30 - 19:30" / "8.30-19.30" / "08h30 às 19h30" → "08h30 às 19h30" */
export function hoursRangeToPt(raw: string, fallback = '08h30 às 19h30'): string {
  if (isClosedLabel(raw)) return 'fechado'
  let s = raw
    .trim()
    .replace(/[–—]/g, '-')
    .replace(/\s+às\s+/gi, '-')
    .replace(/\s+as\s+/gi, '-')
  const parts = s.split('-').map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2) return fallback
  const norm = (tok: string) => {
    const t = tok.toLowerCase().replace(/h/g, ':').replace(/\./g, ':').replace(',', ':')
    const m = t.match(/^(\d{1,2}):(\d{1,2})/)
    if (!m) return null
    return `${m[1].padStart(2, '0')}h${m[2].padStart(2, '0')}`
  }
  const a = norm(parts[0])
  const b = norm(parts[1])
  if (!a || !b) return fallback
  return `${a} às ${b}`
}

export function shopInfoResumo(
  endereco: string,
  openLabel = '08h30 às 19h30',
  domingoLabel = 'fechado',
): string {
  const dom =
    !domingoLabel || isClosedLabel(domingoLabel)
      ? 'Domingo fechado.'
      : `Domingo ${hoursRangeToPt(domingoLabel)}.`
  return [`Endereço: ${endereco}`, `Funcionamento: segunda a sábado, ${openLabel}. ${dom}`].join(
    '\n',
  )
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
  const week = [
    horarios.segunda,
    horarios.terca,
    horarios.quarta,
    horarios.quinta,
    horarios.sexta,
    horarios.sabado,
  ]
  const openOnes = week.filter((h) => !isClosedLabel(h))
  const unique = [...new Set(openOnes.map((h) => hoursRangeToPt(h)))]
  const openLabel =
    unique.length === 1
      ? unique[0]
      : unique.length > 1
        ? unique.join(' / ')
        : hoursRangeToPt(open)
  return {
    nome: typeof c.nome_barbearia === 'string' ? c.nome_barbearia.trim() || null : null,
    endereco,
    horarios,
    resumo: shopInfoResumo(endereco, openLabel, horarios.domingo),
  }
}

function parseHmRange(raw: string): { open: string; close: string } | null {
  if (isClosedLabel(raw)) return null
  let s = raw.trim().replace(/[–—]/g, '-').replace(/\s+às\s+/gi, '-').replace(/\s+as\s+/gi, '-')
  const parts = s.split('-').map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const norm = (tok: string) => {
    const t = tok.toLowerCase().replace(/h/g, ':').replace(/\./g, ':').replace(',', ':')
    const m = t.match(/^(\d{1,2}):(\d{1,2})/)
    if (!m) return null
    return `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}`
  }
  const open = norm(parts[0])
  const close = norm(parts[1])
  if (!open || !close) return null
  return { open, close }
}

/** Expediente da loja agora (America/Sao_Paulo), com horários salvos em Configurações. */
export async function isShopOpenNow(db: SupabaseClient): Promise<boolean> {
  const info = await fetchShopPublicInfo(db)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const map: Record<string, string> = {}
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  const wd = (map.weekday || '').slice(0, 3).toLowerCase()
  const key =
    wd.startsWith('sun') || wd === 'dom' ? 'domingo'
    : wd.startsWith('mon') || wd === 'seg' ? 'segunda'
    : wd.startsWith('tue') || wd === 'ter' ? 'terca'
    : wd.startsWith('wed') || wd === 'qua' ? 'quarta'
    : wd.startsWith('thu') || wd === 'qui' ? 'quinta'
    : wd.startsWith('fri') || wd === 'sex' ? 'sexta'
    : 'sabado'
  const range = parseHmRange(info.horarios[key as keyof typeof info.horarios])
  if (!range) return false
  const hour = map.hour === '24' ? '00' : map.hour
  const now = `${hour}:${map.minute}`
  return now >= range.open && now < range.close
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
export function askNameText(_shopName?: string | null): string {
  return `Oi! Tudo bem? ${DIVA_IDENTITY}. Qual é o seu nome?`
}

export function askNameAgainText(): string {
  return 'Pra te atender melhor, me diz só o seu nome (como você gosta de ser chamado).'
}

/** Depois que o lead informa o nome. */
export function afterNameGreeting(
  fullName: string,
  shopName?: string | null,
  appts: UpcomingAppt[] = [],
): string {
  const first = firstNameFrom(fullName) || fullName.trim().split(/\s+/)[0]
  const base = `Prazer, ${first}! ${DIVA_IDENTITY}. Vamos agendar?`
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
  // Confirmação / horários / barbeiros NÃO são menu
  if (
    t.includes('barbeiro') ||
    t.includes('horario') ||
    t.includes('confirma') ||
    t.includes('pontualidade') ||
    t.includes('opcoes de servico') ||
    t.includes('opções de serviço')
  ) {
    return false
  }
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines[0]?.toLowerCase().startsWith('opções de serviço') || lines[0]?.toLowerCase().startsWith('opcoes de servico')) {
    return false
  }
  if (normalizeMatch(raw).includes('seu agendamento foi confirmado')) {
    return false
  }
  // Só trata como menu se parecer inventário de capacidades (1. agendar 2. cancelar…)
  const numbered = lines.filter((l) => /^\d+[\).\-]/.test(l)).length
  if (numbered >= 3 && /agendar|cancelar|servicos|serviços|funcionamento/.test(t)) {
    return true
  }
  const emojiCount = (raw.match(/\p{Extended_Pictographic}/gu) || []).length
  if (emojiCount >= 2 && lines.length >= 3) return true
  return false
}

export function looksLikeBookingUtterance(text: string): boolean {
  const raw = text.trim()
  if (!raw) return false
  const t = normalizeMatch(raw)
  if (/\d{1,2}\s*h\s*\d{0,2}/.test(t) || /\d{1,2}:\d{2}/.test(t)) return true
  if (
    /\b(hoje|amanha|sabado|domingo|segunda|terca|quarta|quinta|sexta)\b/.test(t) &&
    t.split(/\s+/).length >= 2
  ) {
    return true
  }
  if (/\b(corte|barba|combo|pezinho|sobrancelha|marcar|remarcar|cancelar)\b/.test(t)) {
    return !isPlausiblePersonName(raw)
  }
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
  const keepAsIs =
    /^opções de serviço:/i.test(cleaned) ||
    /^opcoes de servico:/i.test(cleaned) ||
    /seu agendamento foi confirmado/i.test(cleaned) ||
    /vou lhe enviar as opções de serviços abaixo/i.test(cleaned) ||
    /prefer[eê]ncia por algum barbeiro/i.test(cleaned) ||
    /posso (fechar|confirmar|agendar)/i.test(cleaned)
  if (keepAsIs) return cleaned
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

export function isAffirmative(text: string): boolean {
  const t = normalizeMatch(text)
  if (!t) return false
  if (
    t === '1' ||
    t === 's' ||
    t === 'sim' ||
    t === 'yes' ||
    t === 'ok' ||
    t === 'pode' ||
    t === 'topo' ||
    t === 'topa' ||
    t === 'claro' ||
    t === 'bora' ||
    t === 'quero' ||
    t === 'fechado' ||
    t === 'ss' ||
    t === 'ssiim'
  ) {
    return true
  }
  return (
    t.includes('pode sim') ||
    t.includes('quero sim') ||
    t.includes('quero avaliar') ||
    t.includes('pode avaliar') ||
    t.includes('vamos la') ||
    t.includes('topa')
  )
}

export function isNegative(text: string): boolean {
  const t = normalizeMatch(text)
  if (!t) return false
  if (
    t === '2' ||
    t === 'n' ||
    t === 'nao' ||
    t === 'no' ||
    t === 'nop' ||
    t === 'agora nao' ||
    t === 'depois' ||
    t === 'obrigado' ||
    t === 'obrigada'
  ) {
    return true
  }
  return (
    t.includes('nao quero') ||
    t.includes('nao preciso') ||
    t.includes('sem precis') ||
    t.includes('deixa pra') ||
    t.includes('outra hora') ||
    t.includes('nao agora') ||
    t.includes('prefiro nao')
  )
}

/** Extrai nota 1–5 do texto do cliente. */
export function parseRatingScore(text: string): number | null {
  const t = normalizeMatch(text)
  if (!t) return null

  const wordMap: Record<string, number> = {
    um: 1,
    uma: 1,
    dois: 2,
    duas: 2,
    tres: 3,
    quatro: 4,
    cinco: 5,
  }
  for (const [w, n] of Object.entries(wordMap)) {
    if (t === w || t.includes(`nota ${w}`) || t.includes(`${w} estrela`)) return n
  }

  const m = t.match(/\b([1-5])\b/)
  if (m) return Number(m[1])
  return null
}

/**
 * Grava avaliação e atualiza média ponderada em barbeiros.avaliacao.
 * Retorna false se já existir avaliação para o agendamento.
 */
export async function applyBarberRating(
  db: SupabaseClient,
  opts: {
    agendamentoId: string
    barbeiroId: string
    clienteId?: string | null
    nota: number
    origem?: string
  },
): Promise<{ ok: true; media: number; count: number } | { ok: false; error: string }> {
  const nota = Math.round(opts.nota)
  if (nota < 1 || nota > 5) return { ok: false, error: 'Nota inválida' }

  const { data: existing } = await db
    .from('avaliacoes')
    .select('id')
    .eq('agendamento_id', opts.agendamentoId)
    .maybeSingle()
  if (existing) return { ok: false, error: 'Já avaliado' }

  const { error: errIns } = await db.from('avaliacoes').insert({
    agendamento_id: opts.agendamentoId,
    barbeiro_id: opts.barbeiroId,
    cliente_id: opts.clienteId || null,
    nota,
    origem: opts.origem || 'whatsapp',
  })
  if (errIns) return { ok: false, error: errIns.message }

  const { data: barb, error: errB } = await db
    .from('barbeiros')
    .select('id, avaliacao, avaliacao_count')
    .eq('id', opts.barbeiroId)
    .single()
  if (errB || !barb) return { ok: false, error: errB?.message || 'Barbeiro não encontrado' }

  const count = Number(barb.avaliacao_count || 0)
  const old = Number(barb.avaliacao ?? 5)
  const media =
    count <= 0 ? nota : Math.round(((old * count + nota) / (count + 1)) * 100) / 100
  const newCount = count + 1

  const { error: errUp } = await db
    .from('barbeiros')
    .update({ avaliacao: media, avaliacao_count: newCount })
    .eq('id', opts.barbeiroId)
  if (errUp) return { ok: false, error: errUp.message }

  return { ok: true, media, count: newCount }
}
