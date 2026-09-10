/**
* Barber shop tools for MiMo function-calling on WhatsApp
*/
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  fetchShopPublicInfo,
  findOrCreateClientByPhone,
  formatBrl,
  formatDateBR,
  formatServicePriceList,
  getSession,
  isKnownLeadName,
  normalizeMatch,
  parseDateBR,
  saveSession,
} from './db.ts'
import type { ToolDef } from './mimo.ts'
import { logDiva, logDivaError, supabaseErrDump } from './debug-diva.ts'
import {
createAppointmentAtomic,
fetchAvailableSlots,
listBookableBarbers,
todaySaoPaulo,
} from './slots.ts'
export const BARBER_TOOLS: ToolDef[] = [
{
type: 'function',
function: {
name: 'list_services',
description:
  'Serviços para agendamento: devolva SÓ as 3 opções principais (Corte de Cabelo, Barba Tradicional, Combo Corte e Barba). Adicionais (pezinho, sobrancelha etc.) só se o cliente pedir expressamente.',
parameters: { type: 'object', properties: {} },
},
},
{
type: 'function',
function: {
name: 'list_barbers',
description:
'Lista barbeiros na escala na data (padrão: hoje). Exclui quem está de folga/bloqueio cobrindo o expediente. Passe data se o cliente perguntou de outro dia.',
parameters: {
type: 'object',
properties: {
data: { type: 'string', description: 'YYYY-MM-DD ou DD/MM/AAAA (opcional; default hoje)' },
},
additionalProperties: false,
},
},
},
{
type: 'function',
function: {
name: 'get_shop_hours',
description:
'Retorna endereço e horários de funcionamento da barbearia. Use quando o cliente perguntar onde fica, endereço, localização, funcionamento, que horas abre/fecha.',
parameters: { type: 'object', properties: {} },
},
},
{
type: 'function',
function: {
name: 'get_available_slots',
description:
'Horários livres em uma data para um serviço (e opcionalmente barbeiro). NUNCA sugira 19:30 (fechamento das portas). Último início = 19:30 menos a duração do serviço. Se o cliente já pediu um horário que estiver nesta lista, chame create_appointment na mesma rodada — não peça confirmação.',
parameters: {
type: 'object',
properties: {
data: { type: 'string', description: 'Data YYYY-MM-DD ou DD/MM/AAAA' },
servico_id: { type: 'string', description: 'UUID do serviço' },
barbeiro_id: { type: 'string', description: 'UUID do barbeiro (opcional)' },
},
required: ['data', 'servico_id'],
additionalProperties: false,
},
},
},
{
type: 'function',
function: {
name: 'create_appointment',
description:
'Cria o agendamento IMEDIATAMENTE para o cliente do WhatsApp atual. Chame assim que tiver servico_id, data e um horário livre. NUNCA peça confirmação ("você confirma?", "podemos fechar?", "confirma os dados?") antes de chamar. Recuse início às 19:30 ou qualquer horário cuja duração ultrapasse 19:30; use a mensagem_cliente do erro.',
parameters: {
type: 'object',
properties: {
servico_id: { type: 'string' },
data: { type: 'string', description: 'YYYY-MM-DD ou DD/MM' },
horario: { type: 'string', description: 'HH:MM' },
barbeiro_id: { type: 'string', description: 'opcional' },
cliente_nome: { type: 'string', description: 'nome do cliente se souber' },
},
required: ['servico_id', 'data', 'horario'],
additionalProperties: false,
},
},
},
{
type: 'function',
function: {
name: 'list_my_appointments',
description: 'Lista agendamentos futuros do cliente do telefone atual',
parameters: { type: 'object', properties: {} },
},
},
{
type: 'function',
function: {
name: 'cancel_appointment',
description: 'Cancela agendamento pelo id',
parameters: {
type: 'object',
properties: {
agendamento_id: { type: 'string' },
},
required: ['agendamento_id'],
additionalProperties: false,
},
},
},
]
function normalizeDate(input: string): string | null {
if (!input) return null
if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input
return parseDateBR(input)
}

export function formatHourBR(horario: string): string {
  const hm = String(horario || '').slice(0, 5)
  const [h, m] = hm.split(':')
  if (!h) return hm
  if (!m || m === '00') return `${String(parseInt(h, 10))}h`
  return `${String(parseInt(h, 10))}h${m}`
}

/** Fechamento presencial da loja (WhatsApp nunca inicia atendimento neste horário). */
export const WHATSAPP_SHOP_CLOSE_HM = '19:30'

export function hmToMinutes(hm: string): number {
  const [h, m] = String(hm || '').slice(0, 5).split(':').map(Number)
  return (Number(h) || 0) * 60 + (Number(m) || 0)
}

export function minutesToHm(total: number): string {
  const safe = Math.max(0, Math.round(total))
  const h = Math.floor(safe / 60)
  const m = safe % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function lastWhatsappStartHm(durationMin: number): string {
  const dur = Math.max(1, Math.round(Number(durationMin) || 0))
  return minutesToHm(hmToMinutes(WHATSAPP_SHOP_CLOSE_HM) - dur)
}

export function startFitsWhatsappClose(horario: string, durationMin: number): boolean {
  const start = hmToMinutes(horario)
  const close = hmToMinutes(WHATSAPP_SHOP_CLOSE_HM)
  if (start >= close) return false
  const dur = Math.max(1, Math.round(Number(durationMin) || 0))
  return start + dur <= close
}

export function filterWhatsappSlotsByClose(slots: string[], durationMin: number): string[] {
  return (slots || [])
    .map((h) => String(h).slice(0, 5))
    .filter((h) => h && h !== WHATSAPP_SHOP_CLOSE_HM && startFitsWhatsappClose(h, durationMin))
}

export function whatsappCloseOverflowText(durationMin: number): string {
  const dur = Math.max(1, Math.round(Number(durationMin) || 0))
  const last = formatHourBR(lastWhatsappStartHm(dur))
  return `Fechamos às 19h30, e esse serviço tem duração de ${dur} minutos. O último horário disponível para esse serviço é às ${last}.`
}

export async function fetchWhatsappAvailableSlots(
  db: SupabaseClient,
  data: string,
  servicoId: string,
  barbeiroId?: string | null,
): Promise<{ slots: string[]; error?: string; durationMin: number; lastStart: string }> {
  const { slots, error } = await fetchAvailableSlots(db, data, servicoId, barbeiroId)
  const svc = await loadServiceForConfirm(db, servicoId)
  const durationMin = svc?.duracao_minutos && svc.duracao_minutos > 0 ? svc.duracao_minutos : 30
  const filtered = filterWhatsappSlotsByClose(slots, durationMin)
  return {
    slots: filtered,
    error,
    durationMin,
    lastStart: lastWhatsappStartHm(durationMin),
  }
}

export async function whatsappCloseGate(
  db: SupabaseClient,
  servicoId: string,
  horario: string,
): Promise<string | null> {
  const hm = String(horario || '').slice(0, 5)
  if (!hm) return null
  const svc = await loadServiceForConfirm(db, servicoId)
  const durationMin = svc?.duracao_minutos && svc.duracao_minutos > 0 ? svc.duracao_minutos : 30
  if (hmToMinutes(hm) >= hmToMinutes(WHATSAPP_SHOP_CLOSE_HM)) {
    return whatsappCloseOverflowText(durationMin)
  }
  if (!startFitsWhatsappClose(hm, durationMin)) {
    return whatsappCloseOverflowText(durationMin)
  }
  return null
}

export function clientDateLabel(ymd: string): string {
  const today = todaySaoPaulo()
  if (ymd === today) return 'hoje'
  const [y, m, d] = today.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + 1))
  const tom = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
  if (ymd === tom) return 'amanhã'
  return formatDateBR(ymd)
}

function cleanConfirmLabel(value: unknown): string {
  const s = String(value ?? '').trim()
  if (!s || /^undefined$/i.test(s) || /^null$/i.test(s)) return ''
  return s
}

function confirmPriceLabel(preco: unknown): string {
  const n = Number(preco)
  if (!Number.isFinite(n) || n <= 0) return ''
  return formatBrl(n)
}

function confirmDurationLabel(minutos: unknown): string {
  const n = Number(minutos)
  if (!Number.isFinite(n) || n <= 0) return ''
  return `${Math.round(n)} min`
}

export async function loadServiceForConfirm(
  db: SupabaseClient,
  servicoId?: string | null,
): Promise<{ nome: string; preco: number | null; duracao_minutos: number | null } | null> {
  const id = String(servicoId || '').trim()
  if (!id) return null
  try {
    const { data } = await db
      .from('servicos')
      .select('nome, preco, duracao_minutos')
      .eq('id', id)
      .maybeSingle()
    if (!data) return null
    const preco = data.preco == null ? null : Number(data.preco)
    const duracao = data.duracao_minutos == null ? null : Number(data.duracao_minutos)
    return {
      nome: cleanConfirmLabel(data.nome),
      preco: preco != null && Number.isFinite(preco) && preco > 0 ? preco : null,
      duracao_minutos: duracao != null && Number.isFinite(duracao) && duracao > 0 ? duracao : null,
    }
  } catch {
    return null
  }
}

/** Resumo estruturado após criar o agendamento. */
export function bookingSuccessText(opts: {
  servico?: string | null
  barbeiro?: string | null
  data: string
  horario: string
  preco?: number | null
  duracao_minutos?: number | null
}): string {
  const servico = cleanConfirmLabel(opts.servico)
  const barbeiro = cleanConfirmLabel(opts.barbeiro)
  const when = clientDateLabel(opts.data)
  const hora = formatHourBR(opts.horario)
  const valor = confirmPriceLabel(opts.preco)
  const duracao = confirmDurationLabel(opts.duracao_minutos)
  const lines = ['Agendamento confirmado com sucesso! 💈', '']
  if (servico) lines.push(`• Serviço: ${servico}`)
  if (barbeiro) lines.push(`• Profissional: ${barbeiro}`)
  if (when && hora) lines.push(`• Horário: ${when} às ${hora}`)
  if (valor) lines.push(`• Valor: ${valor}`)
  if (duracao) lines.push(`• Duração estimada: ${duracao}`)
  lines.push('')
  lines.push('Por favor, chegue com alguns minutos de antecedência para garantir o seu horário. Te esperamos!')
  return lines.join('\n')
}

export function isBookingSuccessMessage(text: string): boolean {
  const n = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return n.includes('agendamento confirmado com sucesso')
}

/** Se a IA ou o rodapé de expediente se misturaram, fica só a confirmação estruturada. */
export function isolateBookingSuccessMessage(text: string): string | null {
  const raw = String(text || '').trim()
  if (!isBookingSuccessMessage(raw)) return null
  const m = raw.match(
    /Agendamento confirmado com sucesso![\s\S]*?Te esperamos!/i,
  )
  if (m) return m[0].trim()
  const legacy = raw.match(
    /Agendamento confirmado com sucesso![\s\S]*?anteced[eê]ncia para garantir o seu hor[aá]rio\.?/i,
  )
  if (legacy) return legacy[0].trim()
  return raw.split(/\n\s*\n(?=O atendimento|O expediente|Vamos agendar)/i)[0]?.trim() || raw
}

export const MAIN_SERVICE_LABELS = [
  'Corte de Cabelo',
  'Barba Tradicional',
  'Combo Corte e Barba',
] as const

export function mainServiceAskText(): string {
  return [
    'Qual serviço você quer?',
    '',
    '• Corte de Cabelo',
    '• Barba Tradicional',
    '• Combo Corte e Barba',
  ].join('\n')
}

const EXTRA_SERVICE_RE =
  /\b(pezinho|sobrancelha|pigmentac|hidratac|luzes|progressiva|selagem|botox|tingimento|colorac|platinado|relaxamento|sombra|design)\b/

export function wantsExtraServices(text: string): boolean {
  return EXTRA_SERVICE_RE.test(normalizeMatch(text))
}

export type MainServiceKind = 'corte' | 'barba' | 'combo'

export function classifyMainServiceChoice(text: string): MainServiceKind | null {
  const t = normalizeMatch(text)
  if (!t) return null
  if (t === '1' || t === '1.') return 'corte'
  if (t === '2' || t === '2.') return 'barba'
  if (t === '3' || t === '3.') return 'combo'
  if (
    /\bcombo\b/.test(t) ||
    /corte\s+e\s+barba/.test(t) ||
    /barba\s+e\s+corte/.test(t) ||
    /\bos dois\b/.test(t) ||
    /\bcompleto\b/.test(t)
  ) {
    return 'combo'
  }
  if (/\bcorte\b/.test(t) || /\bcabelo\b/.test(t)) return 'corte'
  if (/\bbarba\b/.test(t)) return 'barba'
  return null
}

export function matchMainServiceRow<T extends { nome: string }>(
  kind: MainServiceKind,
  services: T[],
): T | null {
  const n = (s: T) => normalizeMatch(s.nome)
  if (kind === 'combo') {
    return (
      services.find((s) => n(s).includes('combo')) ||
      services.find((s) => n(s).includes('corte') && n(s).includes('barba')) ||
      null
    )
  }
  if (kind === 'corte') {
    return (
      services.find((s) => n(s).includes('corte de cabelo')) ||
      services.find((s) =>
        n(s).includes('corte') &&
        !n(s).includes('combo') &&
        !n(s).includes('barba') &&
        !n(s).includes('pezinho')
      ) ||
      null
    )
  }
  return (
    services.find((s) => n(s).includes('barba tradicional')) ||
    services.find((s) => n(s).includes('barba') && !n(s).includes('combo') && !n(s).includes('corte')) ||
    null
  )
}

export function resolveMainServiceRows<T extends { id: string; nome: string }>(all: T[]): T[] {
  const corte = matchMainServiceRow('corte', all)
  const barba = matchMainServiceRow('barba', all)
  const combo = matchMainServiceRow('combo', all)
  return [corte, barba, combo].filter((s): s is T => Boolean(s))
}

const MAIN_SERVICE_KIND_LABEL: Record<MainServiceKind, string> = {
  corte: 'Corte de Cabelo',
  barba: 'Barba Tradicional',
  combo: 'Combo Corte e Barba',
}

export function mainServiceDisplayName(kind: MainServiceKind): string {
  return MAIN_SERVICE_KIND_LABEL[kind]
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost)
      prev = cur
    }
  }
  return row[b.length]
}

function foldPhonetic(s: string): string {
  return normalizeMatch(s)
    .replace(/qu/g, 'c')
    .replace(/ph/g, 'f')
    .replace(/lh/g, 'l')
    .replace(/nh/g, 'n')
    .replace(/[kw]/g, 'c')
    .replace(/y/g, 'i')
    .replace(/z/g, 's')
    .replace(/(.)\1+/g, '$1')
}

const BARBER_STOP = new Set([
  'com', 'o', 'a', 'os', 'as', 'de', 'da', 'do', 'dos', 'das', 'um', 'uma',
  'para', 'pra', 'por', 'no', 'na', 'em', 'ao', 'aos', 'que', 'quero', 'queria',
  'agendar', 'marcar', 'agenda', 'horario', 'hora', 'horas', 'hoje', 'amanha',
  'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo',
  'corte', 'cabelo', 'barba', 'combo', 'tradicional', 'qualquer', 'tanto', 'faz',
  'as', 'ate', 'depois', 'antes', 'pelo', 'pela', 'seu', 'sua',
])

export function wantsAnyBarber(text: string): boolean {
  const t = normalizeMatch(text)
  return (
    /\btanto faz\b/.test(t) ||
    /\bqualquer um\b/.test(t) ||
    /\bqualquer barbeiro\b/.test(t) ||
    /\bindiferente\b/.test(t) ||
    /\bsem preferencia\b/.test(t) ||
    t === 'qualquer'
  )
}

function firstName(nome: string): string {
  return normalizeMatch(nome).split(/\s+/)[0] || ''
}

function barberQueryTokens(text: string): string[] {
  const t = normalizeMatch(text).replace(/\d{1,2}[:h]\d{0,2}/g, ' ')
  const raw = t.split(/[^a-z]+/).filter((w) => w.length >= 3 && !BARBER_STOP.has(w))
  return [...new Set(raw)]
}

function scoreBarberName(query: string, nome: string): number {
  const q = foldPhonetic(query)
  const full = foldPhonetic(nome)
  const first = foldPhonetic(firstName(nome))
  if (!q || q.length < 3) return 99
  if (full === q || first === q) return 0
  if (first.startsWith(q) || q.startsWith(first)) return 0.4
  if (full.includes(q) || q.includes(first)) return 0.8
  const dFirst = levenshtein(q, first)
  const dFull = levenshtein(q, full)
  return Math.min(dFirst, dFull)
}

/** Reconhece barbeiro com erro de digitação / fonética. Nunca pergunta "você quis dizer". */
export function matchBarberFuzzy<T extends { nome: string }>(
  text: string,
  barbers: T[],
): T | null {
  if (!barbers.length) return null
  const raw = String(text || '').trim()
  if (!raw) return null
  if (wantsAnyBarber(raw) && barberQueryTokens(raw).length === 0) return null

  const exact = barbers.find((b) => normalizeMatch(b.nome) === normalizeMatch(raw))
  if (exact) return exact

  const tokens = barberQueryTokens(raw)
  if (!tokens.length) return null

  let best: T | null = null
  let bestScore = 99
  for (const b of barbers) {
    let score = 99
    for (const tok of tokens) {
      score = Math.min(score, scoreBarberName(tok, b.nome))
    }
    score = Math.min(score, scoreBarberName(normalizeMatch(raw), b.nome))
    if (score < bestScore) {
      bestScore = score
      best = b
    }
  }
  const qLen = Math.max(...tokens.map((t) => t.length), 3)
  const maxDist = qLen <= 4 ? 1 : 2
  if (best && bestScore <= maxDist) return best
  return null
}

export function looksLikeConfirmationAsk(text: string): boolean {
  const n = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return (
    /voce confirma/.test(n) ||
    /podemos fechar/.test(n) ||
    /posso fechar/.test(n) ||
    /confirma os dados/.test(n) ||
    /posso confirmar/.test(n) ||
    /quer confirmar/.test(n) ||
    /confirma com um/.test(n) ||
    /me confirma/.test(n) ||
    /fechamos (assim|entao|então)/.test(n) ||
    /posso marcar/.test(n) ||
    /quer que eu (marque|agende|feche)/.test(n) ||
    /se tiver certo/.test(n) ||
    /responde \*?sim\*?/.test(n) ||
    /\bconfirma\?/.test(n)
  )
}
export async function runBarberTool(
db: SupabaseClient,
phone: string,
name: string,
argsJson: string,
senderName?: string,
): Promise<string> {
let args: Record<string, unknown> = {}
try {
args = argsJson ? JSON.parse(argsJson) : {}
} catch {
return JSON.stringify({ error: 'arguments JSON inválido' })
}
logDiva('IA chamou ferramenta (não é fallback)', {
  phone: phone.slice(-4),
  ferramenta: name,
  args,
  barbeiro: args.barbeiro_id ?? null,
  data: args.data ?? null,
  horario: args.horario ?? null,
})
try {
switch (name) {
      case 'list_services': {
        const { data, error } = await db
          .from('servicos')
          .select('id, nome, preco, duracao_minutos, ativo')
          .order('nome')
        if (error) return JSON.stringify({ error: error.message })
        const all = (data || [])
          .filter((s: { ativo?: boolean }) => s.ativo !== false)
          .map((s) => ({
            id: s.id,
            nome: s.nome,
            preco: Number(s.preco),
            duracao_minutos: s.duracao_minutos,
          }))
        const principaisRows = resolveMainServiceRows(all)
        const principaisIds = new Set(principaisRows.map((s) => s.id))
        const adicionais = all.filter((s) => !principaisIds.has(s.id))
        const tabela = [
          '• Corte de Cabelo',
          '• Barba Tradicional',
          '• Combo Corte e Barba',
        ].join('\n')
        return JSON.stringify({
          servicos: principaisRows,
          principais: [
            { rotulo: 'Corte de Cabelo', kind: 'corte', ...(matchMainServiceRow('corte', all) || {}) },
            { rotulo: 'Barba Tradicional', kind: 'barba', ...(matchMainServiceRow('barba', all) || {}) },
            { rotulo: 'Combo Corte e Barba', kind: 'combo', ...(matchMainServiceRow('combo', all) || {}) },
          ],
          tabela,
          adicionais,
          tabela_adicionais: adicionais.length ? formatServicePriceList(adicionais) : '',
          dica: 'Para pedir o serviço no agendamento, envie ESTRITAMENTE o campo tabela (só estas 3 linhas: Corte de Cabelo, Barba Tradicional, Combo Corte e Barba). NÃO liste pezinho, sobrancelha, pigmentação, hidratação nem outros. Adicionais SOMENTE se o cliente pedir expressamente (aí use tabela_adicionais). NUNCA escolha um serviço sozinha. Só chame create_appointment depois que o cliente disser uma das 3 opções.',
        })
      }
case 'list_barbers': {
const dataYmd = normalizeDate(String(args.data || '')) || todaySaoPaulo()
logDiva('list_barbers — parâmetros', { barbeiro: null, data: dataYmd, horario: null })
const barbeiros = await listBookableBarbers(db, dataYmd)
logDiva('list_barbers — resultado', { data: dataYmd, total: barbeiros.length, barbeiros })
try {
  const sess = await getSession(db, phone)
  const prev = (sess.context.pending_booking && typeof sess.context.pending_booking === 'object')
    ? sess.context.pending_booking as Record<string, unknown>
    : {}
  await saveSession(db, phone, sess.step || 'chat', {
    last_barbers: barbeiros,
    last_barbers_data: dataYmd,
    pending_booking: { ...prev, data: dataYmd },
    data: dataYmd,
  })
} catch {
  /* ignore */
}
return JSON.stringify({
data: dataYmd,
data_br: formatDateBR(dataYmd),
barbeiros,
dica:
barbeiros.length === 0
? 'Nenhum barbeiro na escala nesta data (folga/bloqueio). Não cite nomes de quem não está nesta lista.'
: 'SÓ mencione estes nomes. Quem está de folga/bloqueio NÃO aparece e NÃO deve ser citado nem sugerido.',
})
}
case 'get_shop_hours': {
const info = await fetchShopPublicInfo(db)
return JSON.stringify({
nome: info.nome,
endereco: info.endereco,
horarios: info.horarios,
resumo: info.resumo,
dica: `Responda em prosa natural usando EXATAMENTE estes horários salvos (não invente 08h00 nem outro horário). Resumo: ${info.resumo}`,
})
}
case 'get_available_slots': {
const data = normalizeDate(String(args.data || ''))
const servico_id = String(args.servico_id || '')
let barbeiro_id = args.barbeiro_id ? String(args.barbeiro_id) : null
if (!data || !servico_id) {
logDivaError('get_available_slots — parâmetros inválidos', { data, servico_id, barbeiro_id })
return JSON.stringify({ error: 'data e servico_id são obrigatórios' })
}
        try {
          const sess = await getSession(db, phone)
          const prev = (sess.context.pending_booking && typeof sess.context.pending_booking === 'object')
            ? sess.context.pending_booking as Record<string, unknown>
            : {}
          if (!barbeiro_id) {
            const kept = String(prev.barbeiro_id || sess.context.barbeiro_id || '').trim()
            if (kept && kept !== 'null') barbeiro_id = kept
          }
logDiva('get_available_slots — parâmetros', { barbeiro: barbeiro_id, data, horario: null, servico_id })
        const { slots: horarios, error, durationMin, lastStart } = await fetchWhatsappAvailableSlots(db, data, servico_id, barbeiro_id)
        if (error) {
          logDivaError('get_available_slots — erro da consulta', { barbeiro: barbeiro_id, data, servico_id, error })
          return JSON.stringify({
            data,
            data_br: formatDateBR(data),
            horarios,
            aviso: `rpc: ${error}`,
            ultimo_inicio: lastStart,
            duracao_minutos: durationMin,
          })
        }
          await saveSession(db, phone, sess.step || 'chat', {
            last_slots: horarios,
            last_slots_data: data,
            last_slots_servico_id: servico_id,
            last_slots_barbeiro_id: barbeiro_id || prev.barbeiro_id || null,
            servico_id,
            barbeiro_id: barbeiro_id || prev.barbeiro_id || null,
            data,
            pending_booking: {
              ...prev,
              data,
              servico_id,
              barbeiro_id: barbeiro_id || prev.barbeiro_id || null,
            },
          })
        const primeiro = horarios[0] || null
        const ultimo = horarios.length ? horarios[horarios.length - 1] : null
logDiva('get_available_slots — horários usados na resposta à IA', {
  barbeiro: barbeiro_id,
  data,
  horario: null,
  total: horarios.length,
  horarios,
  primeiro_horario: primeiro,
  ultimo_horario: ultimo,
})
return JSON.stringify({
data,
data_br: formatDateBR(data),
barbeiro_id,
horarios,
primeiro_horario: primeiro,
ultimo_horario: ultimo,
ultimo_inicio_permitido: lastStart,
duracao_minutos: durationMin,
fechamento: '19:30',
dica:
horarios.length === 0
? `Sem horários livres (ocupados, já passaram, ou não cabem antes das 19h30). Este serviço dura ${durationMin} min — o último início permitido é ${lastStart}. Nunca sugira 19:30. NÃO troque o barbeiro escolhido por rodízio.`
: `SÓ liste horários desta lista. NUNCA sugira 19:30 (fechamento). Último início permitido para este serviço (${durationMin} min) é ${lastStart}. O primeiro disponível é ${primeiro}. Se o cliente já escolheu um horário desta lista, chame create_appointment AGORA com o mesmo barbeiro_id — não pergunte confirmação e não use rodízio.`,
})
        } catch (e) {
          logDivaError('get_available_slots — exceção', { error: e instanceof Error ? e.message : String(e) })
          return JSON.stringify({ error: e instanceof Error ? e.message : String(e), ok: false })
        }
}
case 'create_appointment': {
const servico_id = String(args.servico_id || '')
const data = normalizeDate(String(args.data || ''))
const horario = String(args.horario || '').slice(0, 5)
let barbeiro_id = args.barbeiro_id ? String(args.barbeiro_id) : null
if (!servico_id || !data || !horario) {
logDivaError('create_appointment — parâmetros inválidos', { barbeiro: barbeiro_id, data, horario, servico_id })
return JSON.stringify({ error: 'servico_id, data e horario são obrigatórios' })
}
{
  const closeErr = await whatsappCloseGate(db, servico_id, horario)
  if (closeErr) {
    logDiva('create_appointment — recusado: não cabe antes das 19h30', { barbeiro: barbeiro_id, data, horario, servico_id })
    return JSON.stringify({ ok: false, error: closeErr, mensagem_cliente: closeErr })
  }
}
try {
  const sess = await getSession(db, phone)
  const prev = (sess.context.pending_booking && typeof sess.context.pending_booking === 'object')
    ? sess.context.pending_booking as Record<string, unknown>
    : {}
  if (!barbeiro_id) {
    const kept = String(prev.barbeiro_id || sess.context.barbeiro_id || sess.context.last_slots_barbeiro_id || '').trim()
    if (kept && kept !== 'null') barbeiro_id = kept
  }
logDiva('create_appointment — parâmetros', { barbeiro: barbeiro_id, data, horario, servico_id, rodizio: !barbeiro_id })
  const lastSlots = Array.isArray(sess.context.last_slots)
    ? (sess.context.last_slots as string[]).map((h) => String(h).slice(0, 5))
    : []
  const lastSlotsData = sess.context.last_slots_data ? String(sess.context.last_slots_data) : ''
  if (lastSlots.length && lastSlotsData === data && !lastSlots.includes(horario)) {
    logDiva('create_appointment — horário fora da última lista de vagas', {
      barbeiro: barbeiro_id,
      data,
      horario,
      last_slots: lastSlots,
    })
    return JSON.stringify({
      error: 'Horário fora da última lista de vagas. Chame get_available_slots de novo.',
      horarios: lastSlots,
      ok: false,
    })
  }
} catch {
  /* ignore */
}
const nome =
args.cliente_nome && isKnownLeadName(String(args.cliente_nome))
? String(args.cliente_nome)
: senderName && isKnownLeadName(senderName)
? senderName
: undefined
const client = await findOrCreateClientByPhone(db, phone, nome)
const booked = await createAppointmentAtomic(db, {
clienteId: client.id,
servicoId: servico_id,
data,
horario,
barbeiroId: barbeiro_id,
useRotation: !barbeiro_id,
})
if (!booked.ok) {
logDivaError('create_appointment — falha', { barbeiro: barbeiro_id, data, horario, error: booked.error })
return JSON.stringify({ error: booked.error, ok: false })
}
logDiva('create_appointment — sucesso', {
  barbeiro: booked.barbeiro_id,
  barbeiro_nome: booked.barbeiro_nome,
  data: booked.data,
  horario: booked.horario,
  id: booked.id,
})
const servico = await loadServiceForConfirm(db, servico_id)
const servico_nome = servico?.nome || null
const mensagem_cliente = bookingSuccessText({
  servico: servico_nome,
  barbeiro: booked.barbeiro_nome,
  data: String(booked.data),
  horario: String(booked.horario),
  preco: servico?.preco ?? null,
  duracao_minutos: servico?.duracao_minutos ?? null,
})
return JSON.stringify({
ok: true,
agendamento: {
id: booked.id,
data: booked.data,
data_br: formatDateBR(String(booked.data)),
horario: booked.horario,
status: 'pendente',
barbeiro_id: booked.barbeiro_id,
barbeiro_nome: booked.barbeiro_nome,
servico_id,
servico_nome,
preco: servico?.preco ?? null,
duracao_minutos: servico?.duracao_minutos ?? null,
},
        mensagem: mensagem_cliente,
        mensagem_cliente,
        dica: 'Envie ao cliente APENAS o campo mensagem_cliente, sem alterar uma linha. É o resumo com Serviço, Profissional, Horário, Valor e Duração. Sem aviso de expediente, sem "vamos agendar?", sem avaliação, sem pergunta extra.',
})
}
case 'list_my_appointments': {
const client = await findOrCreateClientByPhone(db, phone, senderName)
const today = todaySaoPaulo()
const { data, error } = await db
.from('agendamentos')
.select('id, data, horario, status, servicos(nome), barbeiros(nome)')
.eq('cliente_id', client.id)
.in('status', ['pendente', 'confirmado'])
.gte('data', today)
.order('data', { ascending: true })
.order('horario', { ascending: true })
if (error) {
logDivaError('list_my_appointments — erro Supabase', {
  phone: phone.slice(-4),
  cliente_id: client.id,
  supabase_error: supabaseErrDump(error),
  supabase_data: data ?? null,
})
return JSON.stringify({ error: error.message })
}
logDiva('list_my_appointments — resposta Supabase', {
  phone: phone.slice(-4),
  cliente_id: client.id,
  supabase_error: null,
  supabase_data: data ?? [],
  total: (data || []).length,
})
const list = (data || []).map((a) => {
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
return JSON.stringify({ agendamentos: list })
}
case 'cancel_appointment': {
const id = String(args.agendamento_id || '')
if (!id) return JSON.stringify({ error: 'agendamento_id obrigatório' })
const client = await findOrCreateClientByPhone(db, phone, senderName)
const { data: existing } = await db
.from('agendamentos')
.select('id, cliente_id, status')
.eq('id', id)
.maybeSingle()
if (!existing) return JSON.stringify({ error: 'Agendamento não encontrado' })
if (existing.cliente_id !== client.id) {
return JSON.stringify({ error: 'Este agendamento não pertence a este telefone' })
}
const { error } = await db.from('agendamentos').update({ status: 'cancelado' }).eq('id', id)
if (error) return JSON.stringify({ error: error.message })
return JSON.stringify({ ok: true, mensagem: 'Agendamento cancelado' })
}
default:
return JSON.stringify({ error: `tool desconhecida: ${name}` })
}
} catch (e) {
logDivaError('runBarberTool — exceção', { ferramenta: name, error: e instanceof Error ? e.message : String(e) })
console.error('[BARBER-TOOL] exceção', name, e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : null)
return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
}
}
export function systemPromptBarber(): string {
  const today = todaySaoPaulo()
  return `Hoje é ${today} (America/Sao_Paulo). Datas nas tools em YYYY-MM-DD.

# PERSONA E PAPEL: DIVA
Você é a Diva, assistente virtual inteligente e recepcionista da Divina Barbearia Varjota.
Seu objetivo é prestar um atendimento ágil, educado, objetivo e humanizado pelo WhatsApp, auxiliando os clientes a agendar, consultar, reagendar ou cancelar serviços.

---

## DIRETRIZES DE COMUNICAÇÃO E TOM
- **Tom:** Simpático, acolhedor, profissional e direto ao ponto.
- **Apresentação:** A Diva sempre se apresenta como a Diva da **Divina Barbearia Varjota**.
- **Estilo:** Linguagem natural brasileira, sem enrolação e sem excesso de gírias.
- **Objetividade Máxima:** Mensagens curtas e claras. Evite textos longos ou redundantes.
- **Sem avaliação:** NUNCA peça nota, feedback, link de avaliação, estrelas ou comentário sobre a experiência — nem após o corte, nem após o agendamento. Depois de confirmar o horário, encerre.
- **Sem confirmação extra:** NUNCA pergunte se o cliente confirma o agendamento. Se os dados estão completos e o horário está livre, chame create_appointment na hora.
- **Nunca chute o serviço:** Se faltar o serviço, PERGUNTE e mostre ESTRITAMENTE estas 3 opções (uma por linha, com bullet):
  - • Corte de Cabelo
  - • Barba Tradicional
  - • Combo Corte e Barba
  NÃO liste pezinho, sobrancelha, pigmentação, hidratação ou outros adicionais. Esses só entram se o cliente pedir expressamente. PROIBIDO escolher qualquer serviço por conta própria.

---

## 1. APRESENTAÇÃO E IDENTIFICAÇÃO (PRIMEIRO CONTATO OU CLIENTE RECORRENTE)
- **Se o cliente for RECORRENTE / CADASTRADO / JÁ IDENTIFICADO:**
  - Apresente-se, chame o cliente pelo nome e faça o convite de ação:
    - *"Olá, [Nome]! Sou a Diva, assistente da Divina Barbearia Varjota. Vamos agendar?"*
- **Se for PRIMEIRO CONTATO (Cliente NÃO cadastrado / sem nome):**
  - **INDEPENDENTE do que o cliente envie na primeira mensagem**, NÃO conclua o agendamento sem antes saber o nome dele.
  - Apresente-se cordialmente e pergunte o nome:
    - *"Olá! Sou a Diva, assistente da Divina Barbearia Varjota. Seja muito bem-vindo(a)! Como posso te chamar?"*
  - Assim que o cliente disser o nome, cumprimente-o chamando pelo nome, convide para a ação (*"Prazer, [Nome]! Vamos agendar?"*) e processe o pedido inicial dele.

---

## 2. RECONHECIMENTO DE AGENDAMENTO EXISTENTE
- Se o cliente já for cadastrado e possuir um agendamento ativo:
  - **Relembre o compromisso logo na abertura:** *"Olá, [Nome]! Sou a Diva da Divina Barbearia Varjota. Vi aqui que você já tem um agendamento marcado para [Dia da semana, DD/MM às HH:MM] com [Profissional] ([Serviço])."*
  - **Pergunte de forma objetiva como ajudar:**
    - Adicionar outro serviço/horário.
    - Reagendar para outro dia/horário.
    - Cancelar o agendamento.
    - Tirar dúvidas gerais.

---

## 3. HORÁRIOS DE EXPEDIENTE E MENSAGENS DINÂMICAS
- **Horário Padrão de Funcionamento:** Segunda a Sábado, das **08:30 às 19:30**.
- **BLOQUEIO DE DOMINGOS (REGRA CRÍTICA):** A Divina Barbearia Varjota **NÃO FUNCIONA AOS DOMINGOS**. **NUNCA** ofereça, sugira ou agende horários em domingos. Se o cliente pedir domingo, informe com gentileza que estamos fechados aos domingos e ofereça opções de segunda a sábado.
- **Fechamento dinâmico no WhatsApp (INEGOCIÁVEL):** O expediente presencial encerra rigorosamente às **19:30**. **NUNCA** sugira ou marque início às 19:30 (é o fechamento das portas). O último horário de início = **19:30 menos a duração do serviço** (Barba 30 min → 19:00; Corte 45 min → 18:45; Combo 60 min → 18:30). Se o cliente pedir um início que terminaria depois das 19:30 (ex.: Corte às 19:00), NÃO agende. Explique exatamente: *"Fechamos às 19h30, e esse serviço tem duração de [X] minutos. O último horário disponível para esse serviço é às [Horário Máximo]."* Use o \`ultimo_inicio_permitido\` e \`duracao_minutos\` de get_available_slots / o erro de create_appointment.
- **Tratamento Fora de Expediente:**
  - **Entre 19h30 e 23h59:** Avise que o expediente de hoje encerrou às 19h30 e convide o cliente a agendar para os próximos dias (ou amanhã a partir das 08h30). Nunca diga que o dia “ainda está começando” nesse intervalo.
  - **Entre 00h00 e 08h29:** Avise que o atendimento inicia às 08h30 e sugira já deixar horário para hoje a partir das 08h30. Nunca diga que o expediente “já encerrado” nesse intervalo.
  - **NUNCA recuse agendar** só porque a loja está fechada agora. Fora do expediente, continue o fluxo normalmente para amanhã ou outra data livre.

---

## 4. SELEÇÃO DE PROFISSIONAL, RODÍZIO E VALIDAÇÃO DE FOLGAS/BLOQUEIOS
- **Reconhecimento de nome (INEGOCIÁVEL):** Se o cliente citar um nome parecido com um barbeiro (Marcos, Markos, Marco, Marques, "Marcos com k", etc.), ASSUMA esse profissional na hora. NUNCA pergunte "Você quis dizer Marcos?". Salve o barbeiro e use nas mensagens seguintes.
- **Prioridade do barbeiro escolhido:** Se um profissional foi citado (mesmo com erro de digitação), o RODÍZIO ESTÁ PROIBIDO. Chame create_appointment com o barbeiro_id dele. Só use rodízio se o cliente disser "tanto faz", "qualquer um" ou se não citar ninguém.
- **Rodízio (só sem preferência):** comece pelo 1º da fila. Se estiver ocupado no horário, passe ao próximo livre da sequência. Nunca troque um barbeiro escolhido por outro da fila.
- **Consulta Obrigatória ao Painel/Sistema:** Antes de apresentar ou confirmar qualquer horário, a Diva DEVE checar o status do barbeiro no sistema:
  - Verificar se o profissional está em **dia de folga**, férias ou ausência programada.
  - Verificar se o profissional possui **horários travados/bloqueados** (ex: almoço, intervalo, compromisso pessoal ou bloqueio manual no painel).
- **Tratamento de Indisponibilidade/Folga:**
  - Se o barbeiro solicitado estiver de folga ou travado no horário pedido, informe educadamente (ex: *"O barbeiro [Nome] está indisponível/de folga nesse horário"*).
  - Ofereça os horários livres mais próximos **daquele mesmo barbeiro**. Não coloque outro profissional no lugar sem o cliente pedir.

---

## 5. CATÁLOGO DE SERVIÇOS, PREÇOS E DURAÇÃO DINÂMICA
- **Consulta Dinâmica de Preços e Serviços:** Valores de serviços e tabela de preços **NÃO** devem ser fixos no texto. Consulte o painel em tempo real.
- **Opções na hora de agendar:** mostre SÓ as 3 principais — Corte de Cabelo, Barba Tradicional, Combo Corte e Barba. NÃO ofereça pezinho, sobrancelha, pigmentação, hidratação ou outros a menos que o cliente peça expressamente.
- **Duração do Atendimento para Agendamento:** O tempo de atendimento (duração em minutos) de cada serviço deve ser buscado dinamicamente no sistema.
  - Ao agendar múltiplos serviços (ex: Corte + Barba), a Diva deve somar as durações cadastradas para reservar a janela de horário exata na agenda do profissional, garantindo que não haja choque de horários.

---

## 6. EXTRAÇÃO DE ENTIDADES (SLOT FILLING) E DATAS RELATIVAS
- **Processamento de Mensagem Única:** Quando o cliente mandar todas as informações de uma vez (ex.: *"Quero corte com o Jeová quarta-feira às 15:30"*), extraia todas as entidades simultaneamente:
  - \`Cliente\` (se já identificado)
  - \`Profissional\` (se especificado ou via fila de rodízio)
  - \`Serviço\` (com duração e valor consultados no sistema)
  - \`Data\` / \`Horário\` (sempre dentro do intervalo das 08:30 às 19:30)
- **Mensagens curtas em sequência (MEMÓRIA OBRIGATÓRIA):** Se o cliente já disse barbeiro/hora (ex.: *"Marcos às 10h"* ou *"Agendamento hoje às 10h com Marcos"*) e depois mandar só o serviço (ex.: *"Corte"*), junte o contexto da sessão e chame \`create_appointment\`. NUNCA responda *"Oi! Me conta o que você precisa"* nem recomece o papo.
- **Serviço obrigatório (não inventar):** Se vier barbeiro + data/hora SEM serviço, pergunte qual ele quer e mostre SÓ:
  • Corte de Cabelo
  • Barba Tradicional
  • Combo Corte e Barba
  Não chame \`create_appointment\` e não escolha um serviço arbitrário. Quando o cliente responder uma dessas 3 (ex.: *"Corte"*, *"Barba"*, *"Combo"*), junte com barbeiro/hora já salvos e chame \`create_appointment\` na hora. Adicionais (pezinho, sobrancelha, pigmentação, hidratação) só se o cliente pedir expressamente.
- **Validação Direta:** Consulte a disponibilidade em tempo real considerando agenda, tempo total de duração dos serviços, folgas e bloqueios. Se o horário estiver liberado E o cliente já tiver dito o serviço, chame create_appointment IMEDIATAMENTE — sem etapa intermediária de checagem com o cliente. Se houver indisponibilidade ou trava, apresente as alternativas imediatas.
- **Interpretação de Datas Relativas:** Converta termos como *"amanhã"*, *"sábado"*, *"próxima terça"* para a data futura real mais próxima do calendário e mencione o dia exato (ex.: *"Para este sábado, dia 05/09, às 14h..."*).
- **Bloqueio de Datas Passadas (Retroativas):** Nunca permita agendar em datas ou horários que já passaram. Avise que o horário é inválido e solicite uma data/hora a partir do momento atual.

---

## 7. AGENDAMENTO DIRETO E MENSAGEM FINAL (REGRA CRÍTICA)
- Assim que tiver serviço, profissional (ou rodízio), data e um horário LIVRE, chame \`create_appointment\` IMEDIATAMENTE.
- **PROIBIDO** perguntar: "Você confirma?", "Podemos fechar?", "Confirma os dados abaixo?", "Posso fechar assim?", "Se tiver certo, me confirma" ou qualquer frase parecida.
- Não faça etapa extra de revisão se o horário já está disponível.
- Depois que \`create_appointment\` retornar ok, envie SOMENTE o campo \`mensagem_cliente\` (resumo com Serviço, Profissional, Horário, Valor e Duração). PROIBIDO concatenar aviso de expediente ("O atendimento presencial começa às 08h30", "Vamos agendar?") na confirmação.
- O valor e a duração vêm do cadastro do serviço no banco. Nunca invente R$ 0,00, undefined ou minutos vazios.
- **FIM DO LOOP:** Encerrar após a confirmação. Se o cliente fizer outras perguntas depois (ex: localização, formas de pagamento), responda apenas à dúvida. **NUNCA mais pergunte se ele deseja confirmar o agendamento já realizado. NUNCA peça avaliação.**
- **AVALIAÇÃO PROIBIDA:** Nunca peça nota de 1 a 5, estrelas, feedback, link ou comentário sobre a experiência.

---

## 8. CANCELAMENTOS, REAGENDAMENTOS E NOTIFICAÇÕES AUTOMÁTICAS
- **Reagendamento:** Verifique nova disponibilidade (bloqueando domingos, início às 19:30, horários cuja duração ultrapasse 19:30, folgas/travas e datas passadas) e chame create_appointment direto, sem pedir confirmação.
- **Notificação Automática de Cancelamento:** Sempre que um agendamento for cancelado (pelo cliente no WhatsApp ou manualmente no painel), envie uma mensagem curta de confirmação:
  - *"Olá, [Nome]. Seu agendamento para [Data às HH:MM] com [Profissional] foi cancelado com sucesso. Quando quiser remarcar, é só chamar!"*
- **Lembrete Automático Pré-Atendimento (1 hora antes):** Disparar mensagem de lembrete com antecedência de 1h:
  - *"Olá, [Nome]! Passando para lembrar do seu horário hoje às [HH:MM] com [Profissional] na Divina Barbearia Varjota. Até logo!"*

---

## 9. DÚVIDAS GERAIS, LOCALIZAÇÃO E FORMAS DE PAGAMENTO
- **Endereço:** Sempre que o cliente perguntar a localização ou onde fica a barbearia, responda:
  - 📍 **Endereço:** Rua Castro Monte 165, Varjota, Fortaleza.
- **Formas de Pagamento e Divisão de Valores:**
  - Aceitamos **Pix, Cartão de Crédito, Cartão de Débito e Dinheiro em espécie**.
  - **Divisão de Pagamentos:** Se o cliente perguntar se pode dividir ou mesclar pagamentos (ex.: pagar parte no dinheiro e parte no cartão, ou metade no Pix e metade no débito/crédito), informe que **SIM, é perfeitamente possível dividir o valor total em duas ou mais formas de pagamento diferentes** diretamente na recepção.

---

## 10. TRATAMENTO DE ABANDONO / NÃO CONCLUSÃO E CONTINGÊNCIA (BOOKSY)
- **Se o cliente parar de responder no meio do atendimento sem concluir ou se houver dificuldade evidente:**
  - **Passo 1 (Diagnóstico Cordial):** A Diva deve tentar entender o motivo com educação e verificar se houve algum impedimento (ex: *"Oi, [Nome]! Percebi que não finalizamos seu agendamento. Ficou alguma dúvida sobre horários, serviços ou valores?"*).
  - **Passo 2 (Fallback via Booksy em Último Caso):** Se o cliente relatar dificuldade na conversa, continuar sem responder ou preferir fazer de forma autônoma:
    - *"Sem problemas! Se preferir escolher seu horário com calma direto pelo aplicativo, você também pode agendar pelo nosso link no Booksy: https://booksy.com/pt-br/301597_divina-barbearia-varjota_barbearias_278919_fortaleza?rwg_token=AE37R_hrXf7HwBMWRhKqJqCkay3rJPBl7v10wdhwi6deGBZpitGpCZNpFtQU7sQ8-u7FVDwRe_ZAgeidv8FE171qt3Gm-Le89Q==#ba_s=seo"*
  - **Atenção:** Priorize sempre o fechamento pelo WhatsApp; o Booksy é apenas uma alternativa de apoio para não perder o cliente.`
}
