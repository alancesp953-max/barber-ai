import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import {
  aftercareText,
  afterNameGreeting,
  appointmentsContextLines,
  askNameText,
  fetchShopName,
  fetchShopPublicInfo,
  fetchUpcomingAppointments,
  findOrCreateClientByPhone,
  formatDateBR,
  formatNameList,
  getLeadDisplayName,
  getServiceClient,
  getSession,
  greetingText,
  greetingWithAppointments,
  humanizeOutbound,
  isBotActive,
  isGreetingOnly,
  isKnownLeadName,
  isPlausiblePersonName,
  isBookingStep,
  logBotEvent,
  getShopHoursPhase,
  shopHoursStatusNotice,
  closedShopNotice,
  formatServicePriceList,
  askNameAgainText,
  looksLikeBookingUtterance,
  matchByName,
  matchSlot,
  normalizeMatch,
  parseDateBR,
  resetSession,
  saveLeadName,
  saveSession,
  wantsShopInfo,
} from '../_shared/db.ts'
import {
  BARBER_TOOLS,
  bookingSuccessText,
  looksLikeConfirmationAsk,
  runBarberTool,
  systemPromptBarber,
} from '../_shared/barber-tools.ts'
import { logDiva, logDivaError } from '../_shared/debug-diva.ts'
import { loadMimoConfig, mimoChat, type ChatMessage } from '../_shared/mimo.ts'
import { resolveUazConfig } from '../_shared/resolve-uaz.ts'
import {
  checkSlotAvailability,
  createAppointmentAtomic,
  fetchAvailableSlots,
  filterPastSlots,
  listBookableBarbers,
  todaySaoPaulo,
} from '../_shared/slots.ts'
import { humanReply, normalizePhone, sendPresence, sendText } from '../_shared/uazapi.ts'

type UazMessage = {
  messageid?: string
  messageidHex?: string
  chatid?: string
  fromMe?: boolean | string
  wasSentByApi?: boolean | string
  isGroup?: boolean | string
  sender?: string
  senderName?: string
  sender_pn?: string
  messageType?: string
  text?: string
  content?: string | { text?: string; conversation?: string }
  message?: {
    conversation?: string
    extendedTextMessage?: { text?: string }
    buttonsResponseMessage?: { selectedButtonId?: string; selectedDisplayText?: string }
    listResponseMessage?: { title?: string; singleSelectReply?: { selectedRowId?: string } }
  }
  buttonOrListid?: string
  [key: string]: unknown
}

function asBool(v: unknown): boolean {
  if (v === true || v === 1) return true
  if (typeof v === 'string') return ['true', '1', 'yes'].includes(v.toLowerCase())
  return false
}

/** Saudações puras — bypass de tools / horários antigos (só neste webhook). */
const PURE_GREETING_RE = /^(oi|ol[aá]|bom dia|boa tarde|boa noite)[!.]*$/i

function isPureGreeting(text: string): boolean {
  return PURE_GREETING_RE.test(String(text || '').trim())
}

type DebounceFragment = { text: string; at?: number }

/** Buffer em memória do isolate (complementa o que está na sessão). */
const debounceMemory = new Map<string, string[]>()

function normalizeInboundFragments(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    if (typeof raw === 'string' && raw.trim()) return [raw.trim()]
    return []
  }
  const out: string[] = []
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      out.push(item.trim())
      continue
    }
    if (item && typeof item === 'object') {
      const t = String((item as DebounceFragment).text || '').trim()
      if (t) out.push(t)
    }
  }
  return out
}

function pendingFromSession(context: Record<string, unknown>, phone: string): string[] {
  const fromDb = normalizeInboundFragments(context.pending_inbound)
  const fromMem = debounceMemory.get(phone) || []
  return fromDb.length ? fromDb : fromMem
}

/** Junta o buffer com a mensagem atual, sem anexar texto antigo a uma saudação pura. */
function composeInboundFromBuffer(pending: string[], fresh: string): string {
  const latest = fresh.trim()
  if (!latest) return pending.filter((p) => !isPureGreeting(p)).join('\n').trim()
  if (isPureGreeting(latest)) return latest
  const kept = pending.map((p) => p.trim()).filter((p) => p && !isPureGreeting(p))
  return [...kept, latest].join('\n').trim() || latest
}

async function consumeInboundForProcess(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  fresh: string,
): Promise<string> {
  try {
    const sess = await getSession(db, phone)
    const pending = pendingFromSession(sess.context, phone)
    const composed = composeInboundFromBuffer(pending, fresh)
    const mem = debounceMemory.get(phone) || []
    if (fresh.trim()) mem.push(fresh.trim())
    debounceMemory.set(phone, mem)
    await saveSession(db, phone, sess.step || 'chat', {
      pending_inbound: [
        ...pending.map((text) => ({ text, at: Date.now() })),
        ...(fresh.trim() ? [{ text: fresh.trim(), at: Date.now() }] : []),
      ],
    })
    return composed || fresh.trim() || 'oi'
  } catch (e) {
    console.error('[DEBOUNCE] sessão falhou — processando texto fresco', e)
    return fresh.trim() || 'oi'
  }
}

/** Apaga o buffer de debounce daquele telefone (memória + sessão). */
async function clearDebounceBuffer(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
): Promise<void> {
  debounceMemory.delete(phone)
  try {
    const sess = await getSession(db, phone)
    await saveSession(db, phone, sess.step || 'chat', {
      pending_inbound: [],
      debounce_token: null,
      processing_at: null,
      processing_token: null,
    })
  } catch (e) {
    console.warn('clearDebounceBuffer failed', e)
    debounceMemory.delete(phone)
  }
}

function extractText(msg: UazMessage): string {
  if (typeof msg.text === 'string' && msg.text.trim()) return msg.text.trim()
  if (typeof msg.content === 'string' && msg.content.trim()) return msg.content.trim()
  if (msg.content && typeof msg.content === 'object') {
    const c = msg.content
    if (c.text) return String(c.text).trim()
    if (c.conversation) return String(c.conversation).trim()
  }
  const m = msg.message
  if (m?.conversation) return m.conversation.trim()
  if (m?.extendedTextMessage?.text) return m.extendedTextMessage.text.trim()
  if (m?.buttonsResponseMessage?.selectedDisplayText) {
    return m.buttonsResponseMessage.selectedDisplayText.trim()
  }
  if (m?.listResponseMessage?.title) return m.listResponseMessage.title.trim()
  if (msg.buttonOrListid) return String(msg.buttonOrListid).trim()
  return ''
}

/** Digits only if looks like a real MSISDN (skip long @lid internal ids). */
function jidToPhone(raw: unknown): string {
  if (raw == null) return ''
  const s = String(raw).trim()
  if (!s) return ''
  // Prefer real WhatsApp phone JIDs; pure @lid is not a dialable number for /send/text
  if (s.includes('@lid') && !s.includes('@s.whatsapp.net')) return ''
  const local = s.split('@')[0]
  if (!local || !/\d/.test(local)) return ''
  const phone = normalizePhone(local)
  // LID digit blobs are often 15+ without country structure; keep 10–15
  if (phone.length < 10 || phone.length > 15) return ''
  return phone
}

function collectPhoneCandidates(msg: UazMessage, payload: Record<string, unknown>): unknown[] {
  const chat =
    payload.chat && typeof payload.chat === 'object'
      ? (payload.chat as Record<string, unknown>)
      : {}
  const key =
    msg.key && typeof msg.key === 'object'
      ? (msg.key as Record<string, unknown>)
      : {}
  const data =
    payload.data && typeof payload.data === 'object'
      ? (payload.data as Record<string, unknown>)
      : {}
  const dataKey =
    data.key && typeof data.key === 'object'
      ? (data.key as Record<string, unknown>)
      : {}
  const nested =
    payload.message && typeof payload.message === 'object'
      ? (payload.message as Record<string, unknown>)
      : {}
  return [
    msg.sender_pn,
    (msg as Record<string, unknown>).senderPn,
    (msg as Record<string, unknown>).senderPN,
    (msg as Record<string, unknown>).pn,
    (msg as Record<string, unknown>).wid,
    (msg as Record<string, unknown>).remoteJid,
    payload.sender_pn,
    payload.senderPn,
    chat.sender_pn,
    key.remoteJid,
    dataKey.remoteJid,
    msg.from,
    data.from,
    chat.wa_chatid,
    chat.phone,
    chat.pn,
    chat.id,
    data.sender_pn,
    data.senderPn,
    nested.sender_pn,
    msg.sender,
    msg.chatid,
  ]
}

/**
 * Destino da resposta = conversa. Prefere sender_pn (número real) ao @lid.
 */
function extractPhone(msg: UazMessage, payload: Record<string, unknown>): string {
  for (const c of collectPhoneCandidates(msg, payload)) {
    const phone = jidToPhone(c)
    if (phone) return phone
  }
  for (const c of [msg.chatid, msg.sender, payload.chatid, payload.sender]) {
    if (c == null) continue
    const s = String(c).trim()
    if (s.includes('@lid')) return s.split(':')[0]
  }
  return ''
}

function instanceOwnerPhone(payload: Record<string, unknown>): string {
  const inst =
    payload.instance && typeof payload.instance === 'object'
      ? (payload.instance as Record<string, unknown>)
      : {}
  return (
    jidToPhone(payload.owner) ||
    jidToPhone(payload.ownerJid) ||
    jidToPhone(inst.owner) ||
    jidToPhone(inst.phone) ||
    jidToPhone(inst.wid) ||
    ''
  )
}

function shouldIgnore(msg: UazMessage): boolean {
  if (asBool(msg.fromMe)) return true
  if (asBool(msg.wasSentByApi)) return true
  if (asBool(msg.isGroup)) return true
  const chat = String(msg.chatid || msg.sender || '')
  if (chat.includes('@g.us')) return true
  if (chat.includes('status@broadcast')) return true
  return false
}

/** Normaliza o objeto de mensagem real da UAZAPI (nested em message / data). */
function collectMessages(payload: Record<string, unknown>): UazMessage[] {
  if (Array.isArray(payload.messages)) {
    return payload.messages as UazMessage[]
  }

  const nested = payload.message
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const n = nested as UazMessage
    // Objeto UAZ completo (tem chatid/sender/text/messageType)
    if (n.chatid || n.sender || n.messageid || n.messageType || typeof n.text === 'string') {
      return [n]
    }
    // Baileys-style: payload com chatid no root + message.conversation
    if (n.conversation || n.extendedTextMessage) {
      return [{ ...(payload as UazMessage), message: n as UazMessage['message'] }]
    }
  }

  if (payload.data && typeof payload.data === 'object') {
    const d = payload.data as Record<string, unknown>
    if (Array.isArray(d.messages)) return d.messages as UazMessage[]
    if (d.message && typeof d.message === 'object' && !Array.isArray(d.message)) {
      return collectMessages(d)
    }
    if ((d as UazMessage).chatid || (d as UazMessage).sender || (d as UazMessage).text) {
      return [d as UazMessage]
    }
  }

  if ((payload as UazMessage).chatid || (payload as UazMessage).sender || (payload as UazMessage).text) {
    return [payload as UazMessage]
  }

  return []
}

/** Mostra "digitando…" já no início (durante a IA / processamento). */
async function beginTyping(
  phone: string,
  db: ReturnType<typeof getServiceClient>,
  delayMs = 12000,
) {
  const resolved = await resolveUazConfig(db)
  if (!resolved.config) {
    console.error('beginTyping uaz config', resolved.error)
    return null
  }
  const r = await sendPresence(phone, 'composing', resolved.config, delayMs)
  if (!r.ok) console.warn('beginTyping failed', r.error)
  return resolved.config
}

const FALLBACK_OUTBOUND = 'Olá! Tudo bem? Como posso te ajudar hoje?'

function fortalezaClock(): { weekday: string; hm: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Fortaleza',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const map: Record<string, string> = {}
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  const hour = map.hour === '24' ? '00' : String(map.hour || '00').padStart(2, '0')
  const minute = String(map.minute || '00').padStart(2, '0')
  return { weekday: (map.weekday || '').slice(0, 3).toLowerCase(), hm: `${hour}:${minute}` }
}

/** Relógio local — nunca consulta o banco e nunca silencia. */
function hoursNoticeIfClosed(): string | null {
  const { weekday, hm } = fortalezaClock()
  const isSun = weekday.startsWith('sun') || weekday === 'dom'
  console.log('[SHOP-HOURS] relógio local', { weekday, hm, tz: 'America/Fortaleza' })
  if (isSun) {
    return 'Aos domingos a barbearia não abre. Posso agendar de segunda a sábado, das 08:30 às 19:30.'
  }
  if (hm < '08:30') {
    return 'O expediente começa às 08:30. Posso já deixar seu horário para hoje ou outro dia, se quiser.'
  }
  if (hm >= '19:30') {
    return closedShopNotice()
  }
  return null
}

function withLocalHoursNotice(text: string): string {
  const base = String(text || '').trim() || FALLBACK_OUTBOUND
  const notice = hoursNoticeIfClosed()
  if (!notice) return base
  const n = normalizeMatch(base)
  if (n.includes('expediente') || n.includes('08:30') || n.includes('08h30')) return base
  console.log('[SHOP-HOURS] fora do expediente — anexando aviso (não silenciar)')
  return `${base}\n\n${notice}`
}

async function appendShopHoursNotice(
  db: ReturnType<typeof getServiceClient>,
  text: string,
): Promise<string> {
  try {
    const hours = await getShopHoursPhase(db)
    const notice = shopHoursStatusNotice(hours.phase, hours.open || '08:30')
    if (!notice) return text
    const n = normalizeMatch(text)
    if (n.includes('expediente') || n.includes('08:30') || n.includes('08h30') || n.includes('fechados')) {
      return text
    }
    return `${text}\n\n${notice}`
  } catch {
    return text
  }
}

/** Fora do expediente: avisa e segue o papo — nunca silencia. */
async function withClosedShopNotice(
  db: ReturnType<typeof getServiceClient>,
  text: string,
): Promise<string> {
  const base = String(text || '').trim() || FALLBACK_OUTBOUND
  const withDb = await appendShopHoursNotice(db, base)
  if (withDb !== base) return withDb
  return withLocalHoursNotice(base)
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      console.warn('[TIMEOUT]', { ms })
      resolve(fallback)
    }, ms)
    promise
      .then((v) => {
        clearTimeout(t)
        resolve(v)
      })
      .catch((e) => {
        clearTimeout(t)
        console.warn('[TIMEOUT] promise rejeitada', e)
        resolve(fallback)
      })
  })
}

/** supabase-js rpc() não é Promise nativa — nunca encadear .catch() nele. */
async function rpcTry(
  db: ReturnType<typeof getServiceClient>,
  fn: string,
  args: Record<string, unknown>,
): Promise<boolean> {
  try {
    const { error } = await db.rpc(fn, args)
    if (error) {
      console.warn('[RPC]', fn, error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn('[RPC]', fn, e instanceof Error ? e.message : String(e))
    return false
  }
}

/** Envio imediato via UAZAPI: POST /send/text, header token, body { number, text }. */
async function sendWhatsappMessage(
  phone: string,
  text: string,
  uaz: { baseUrl: string; token: string },
): Promise<boolean> {
  const number = normalizePhone(phone)
  const bodyText = String(text || '').trim() || FALLBACK_OUTBOUND
  const baseUrl = String(uaz.baseUrl || '').replace(/\/$/, '')
  const token = String(uaz.token || '').trim()
  const url = `${baseUrl}/send/text`
  const jsonBody = {
    number,
    text: bodyText,
    readchat: true,
    readmessages: true,
    delay: 0,
  }
  console.log('[UAZ-SEND] antes', {
    url,
    number,
    numberLen: number.length,
    instance: baseUrl,
    hasToken: Boolean(token),
    tokenLen: token.length,
    textLen: bodyText.length,
    textPreview: bodyText.slice(0, 160),
    body: { number, textLen: bodyText.length, readchat: true, readmessages: true, delay: 0 },
  })
  if (!baseUrl || !token) {
    console.error('[UAZ-SEND] instância incompleta', { hasBase: Boolean(baseUrl), hasToken: Boolean(token) })
    return false
  }
  if (number.length < 10) {
    console.error('[UAZ-SEND] número inválido', { number })
    return false
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        token,
      },
      body: JSON.stringify(jsonBody),
    })
    const raw = await res.text()
    console.log('[UAZ-SEND] depois', {
      number,
      status: res.status,
      ok: res.ok,
      raw: raw.slice(0, 400),
    })
    if (res.ok) return true
    console.warn('[UAZ-SEND] HTTP não-OK — tentando sendText', { status: res.status })
    const retry = await sendText(phone, bodyText, uaz, 0)
    console.log('[UAZ-SEND] retry sendText', { ok: retry.ok, error: retry.error ?? null })
    return retry.ok
  } catch (e) {
    console.error('[UAZ-SEND] erro fetch', {
      number,
      instance: baseUrl,
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : null,
    })
    try {
      const retry = await sendText(phone, bodyText, uaz, 0)
      console.log('[UAZ-SEND] retry após exceção', { ok: retry.ok, error: retry.error ?? null })
      return retry.ok
    } catch (e2) {
      console.error('[UAZ-SEND] retry também falhou', e2)
      return false
    }
  }
}

async function reply(
  phone: string,
  text: string,
  db: ReturnType<typeof getServiceClient>,
  config?: { baseUrl: string; token: string } | null,
  opts?: { senderName?: string | null; userText?: string },
) {
  const out = humanizeOutbound(text, { senderName: opts?.senderName, userText: opts?.userText })
  let uaz = config
  if (!uaz) {
    const resolved = await resolveUazConfig(db)
    if (!resolved.config) {
      console.error('reply uaz config', resolved.error)
      throw new Error(resolved.error || 'UAZAPI não configurada para enviar mensagens')
    }
    uaz = resolved.config
  }
  const sent = await sendWhatsappMessage(phone, out, uaz)
  if (sent) return
  console.error('[REPLY] sendWhatsappMessage falhou — tentando humanReply', { phone: phone.slice(-4) })
  const result = await humanReply(phone, out, uaz)
  if (!result.ok) {
    console.error('reply send failed', result.error)
    throw new Error(result.error || 'Falha ao enviar WhatsApp')
  }
}

/**
 * Saudação pura: monta o texto, dispara na UAZAPI, depois grava o histórico.
 * Nunca retorna antes do envio.
 */
async function deliverPureGreeting(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  inbound: string,
  uaz: { baseUrl: string; token: string },
): Promise<string> {
  console.log('[GREETING-REGEX] match', {
    phone: phone.slice(-4),
    inbound,
    normalized: inbound.trim(),
  })

  let out = withLocalHoursNotice(FALLBACK_OUTBOUND)
  let leadName: string | null = null
  let session: { step: string; context: Record<string, unknown> } = { step: 'chat', context: {} }

  const loaded = await withTimeout(
    (async () => {
      await findOrCreateClientByPhone(db, phone).catch((e) => {
        console.warn('[GREETING] findOrCreateClientByPhone falhou — segue envio', e)
      })
      let name: string | null = null
      let shop: string | null = null
      let sess: { step: string; context: Record<string, unknown> } = { step: 'chat', context: {} }
      try {
        name = await getLeadDisplayName(db, phone)
      } catch (e) {
        console.warn('[GREETING] lead não encontrado — segue envio', e)
      }
      try {
        shop = await fetchShopName(db)
      } catch (e) {
        console.warn('[GREETING] shop name falhou — segue envio', e)
      }
      try {
        sess = await getSession(db, phone)
      } catch (e) {
        console.warn('[GREETING] sessão falhou — segue envio sem histórico', e)
      }
      const needsName =
        !isKnownLeadName(name) &&
        !sessionHasBookingContext(sess) &&
        !looksLikeBookingUtterance(inbound)
      const text = needsName ? askNameText(shop) : greetingText(name, shop)
      return { name, sess, text: withLocalHoursNotice(text), needsName }
    })(),
    2500,
    { name: null as string | null, sess: session, text: out, needsName: false },
  )

  leadName = loaded.name
  session = loaded.sess
  out = loaded.text || out
  console.log('[GREETING] texto montado', {
    phone: phone.slice(-4),
    hasLead: Boolean(leadName),
    preview: out.slice(0, 180),
  })

  const sent = await sendWhatsappMessage(phone, out, uaz)
  if (!sent) {
    console.error('[GREETING] envio falhou — tentando fallback curto')
    await sendWhatsappMessage(phone, withLocalHoursNotice(FALLBACK_OUTBOUND), uaz)
  }

  try {
    const prev = Array.isArray(session.context.history)
      ? (session.context.history as ChatMessage[])
      : []
    const history = [
      ...prev.filter((m) => m?.name !== 'get_available_slots'),
      { role: 'user' as const, content: inbound || 'oi' },
      { role: 'assistant' as const, content: out },
    ].slice(-28)
    await saveSession(db, phone, loaded.needsName ? 'ask_name' : 'chat', {
      history,
      mode: 'mimo',
      lead_name: leadName,
      awaiting_name: loaded.needsName || undefined,
      last_slots: [],
      last_slots_data: null,
      last_slots_servico_id: null,
      last_slots_barbeiro_id: null,
      slots: [],
    })
  } catch (e) {
    console.warn('[GREETING] saveSession falhou após envio (ok)', e)
  }

  return out
}

function wantsRestart(text: string): boolean {
  const t = normalizeMatch(text)
  return [
    'recomecar',
    'comecar de novo',
    'começar de novo',
    'cancela tudo',
    'reset',
    'limpar',
    '/start',
  ].includes(t)
}

function isRatingSessionStep(step?: string | null): boolean {
  return step === 'rate_ask' || step === 'rate_score' || step === 'rate_comment'
}

function lastJsonToolResult(messages: ChatMessage[], name: string): Record<string, unknown> | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'tool' && m.name === name && typeof m.content === 'string') {
      try {
        return JSON.parse(m.content) as Record<string, unknown>
      } catch {
        return null
      }
    }
  }
  return null
}

function extractHorarioHint(text: string, slots?: string[]): string | null {
  const list = (slots || []).map((h) => String(h).slice(0, 5))
  if (list.length) {
    const matched = matchSlot(text, list)
    if (matched) return matched.slice(0, 5)
  }
  const withMin = String(text || '').match(/\b(\d{1,2})[:hH](\d{2})\b/)
  if (withMin) return `${withMin[1].padStart(2, '0')}:${withMin[2]}`
  const onlyHour = String(text || '').match(/\b(\d{1,2})h\b/i)
  if (onlyHour) return `${onlyHour[1].padStart(2, '0')}:00`
  return null
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function parseUtteranceDate(text: string): string | null {
  const t = normalizeMatch(text)
  const today = todaySaoPaulo()
  if (/\bhoje\b/.test(t)) return today
  if (/\bamanha\b/.test(t)) return addDaysYmd(today, 1)
  const names = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']
  const hit = names.findIndex((n) => t.includes(n))
  if (hit >= 0) {
    const [y, m, d] = today.split('-').map(Number)
    const current = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay()
    const add = (hit - current + 7) % 7
    return addDaysYmd(today, add)
  }
  return parseDateBR(text)
}

async function pickDefaultService(
  db: ReturnType<typeof getServiceClient>,
  text: string,
): Promise<{ id: string; nome: string } | null> {
  const { data, error } = await db
    .from('servicos')
    .select('id, nome, ativo')
    .order('nome')
  if (error) {
    console.error('[BOOK-DIRECT] listar serviços', error.message)
    return null
  }
  const list = (data || []).filter((s: { ativo?: boolean }) => s.ativo !== false)
  if (!list.length) return null
  const named = matchByName(text, list)
  if (named) return { id: named.id, nome: named.nome }
  const corte = list.find((s: { nome: string }) => normalizeMatch(s.nome).includes('corte'))
  const pick = corte || list[0]
  return { id: pick.id, nome: pick.nome }
}

/** Quando a IA estoura timeout, tenta agendar com o que o cliente já mandou. */
async function tryDirectBookFromUtterance(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  leadName?: string | null,
): Promise<string | null> {
  const fromSession = await tryAutoCreateAppointment(db, phone, text, '', leadName)
  if (fromSession) return fromSession

  const horario = extractHorarioHint(text)
  const data = parseUtteranceDate(text)
  if (!horario || !data) return null

  try {
    const service = await pickDefaultService(db, text)
    if (!service) {
      console.error('[BOOK-DIRECT] sem serviço cadastrado')
      return null
    }
    let barbeiro_id: string | undefined
    try {
      const barbers = await listBookableBarbers(db, data)
      const matched = matchByName(text, barbers)
      if (matched) barbeiro_id = matched.id
    } catch (e) {
      console.warn('[BOOK-DIRECT] barbeiros', e instanceof Error ? e.message : String(e))
    }

    const { slots, error } = await fetchAvailableSlots(db, data, service.id, barbeiro_id || null)
    if (error) console.error('[BOOK-DIRECT] slots', error)
    const hm = horario.slice(0, 5)
    if (!slots.includes(hm)) {
      if (slots.length) {
        return [
          `O horário ${hm} não está livre em ${formatDateBR(data)}.`,
          formatSlotList(data, slots),
        ].join('\n')
      }
      return `Sem horários livres em ${formatDateBR(data)} às ${hm}. Quer tentar outra data?`
    }

    try {
      await saveSession(db, phone, 'chat', {
        last_slots: slots,
        last_slots_data: data,
        last_slots_servico_id: service.id,
        last_slots_barbeiro_id: barbeiro_id || null,
      })
    } catch {
      /* segue o create */
    }

    const raw = await runBarberTool(
      db,
      phone,
      'create_appointment',
      JSON.stringify({
        servico_id: service.id,
        data,
        horario: hm,
        barbeiro_id,
        cliente_nome: leadName || undefined,
      }),
      leadName || undefined,
    )
    const parsed = JSON.parse(raw) as { ok?: boolean; mensagem_cliente?: string; error?: string }
    if (parsed.ok && parsed.mensagem_cliente) {
      await resetSession(db, phone)
      return parsed.mensagem_cliente
    }
    console.error('[BOOK-DIRECT] create_appointment recusou', parsed.error || raw.slice(0, 300))
    if (parsed.error) return `Não consegui agendar: ${parsed.error}`
  } catch (e) {
    console.error('[BOOK-DIRECT] exceção', e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : null)
  }
  return null
}

async function tryAutoCreateAppointment(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  extraHint?: string,
  leadName?: string | null,
): Promise<string | null> {
  try {
    const sess = await getSession(db, phone)
    const c = sess.context
    const servico_id = String(c.last_slots_servico_id || c.servico_id || '').trim()
    const data = String(c.last_slots_data || c.data || '').trim()
    const slots = Array.isArray(c.last_slots)
      ? (c.last_slots as string[])
      : Array.isArray(c.slots)
        ? (c.slots as string[])
        : []
    const horario =
      extractHorarioHint(text, slots) ||
      extractHorarioHint(extraHint || '', slots) ||
      (c.horario ? String(c.horario).slice(0, 5) : '')
    if (!servico_id || !data || !horario) return null
    const barbeiro_id = c.last_slots_barbeiro_id || c.barbeiro_id || null
    const raw = await runBarberTool(
      db,
      phone,
      'create_appointment',
      JSON.stringify({
        servico_id,
        data,
        horario,
        barbeiro_id: barbeiro_id ? String(barbeiro_id) : undefined,
        cliente_nome: leadName || undefined,
      }),
      leadName || undefined,
    )
    const parsed = JSON.parse(raw) as { ok?: boolean; mensagem_cliente?: string }
    if (parsed.ok && parsed.mensagem_cliente) {
      await resetSession(db, phone)
      return parsed.mensagem_cliente
    }
  } catch (e) {
    console.warn('tryAutoCreateAppointment', e)
  }
  return null
}

// ─── Flow handlers (só se a IA estiver indisponível) ─────────────────────────

async function handleFallbackIntent(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
): Promise<string> {
  const t = normalizeMatch(text)

  const bookedNow = await tryDirectBookFromUtterance(db, phone, text)
  if (bookedNow) return bookedNow

  if (
    t.includes('agendar') ||
    t.includes('marcar') ||
    t.includes('agenda') ||
    t === 'vamos' ||
    t.startsWith('vamos ') ||
    t.includes('quero marcar') ||
    (t.includes('horario') && !t.includes('meus') && !t.includes('ver') && !wantsShopInfo(text))
  ) {
    try {
      const appts = await fetchUpcomingAppointments(db, phone)
      if (appts.length === 1) {
        const a = appts[0]
        return `Você já tem ${a.servico || 'horário'} em ${a.data_br} às ${a.horario}${a.barbeiro ? ` com ${a.barbeiro}` : ''}. Quer marcar outro mesmo assim, ou prefere remarcar/cancelar esse?`
      }
      if (appts.length > 1) {
        return `Você já tem ${appts.length} horários marcados (próximo em ${appts[0].data_br} às ${appts[0].horario}). Quer ver, remarcar, cancelar ou marcar mais um?`
      }
    } catch {
      /* segue booking */
    }
    return startBooking(db, phone)
  }

  if (wantsShopInfo(text)) {
    const info = await fetchShopPublicInfo(db)
    return info.resumo
  }

  if (
    t.includes('meus') ||
    t.includes('consult') ||
    t.includes('ver meu') ||
    t.includes('ver todos')
  ) {
    return await listAppointments(db, phone)
  }

  if (t.includes('cancel') || t.includes('desmarcar')) {
    return await startCancel(db, phone)
  }

  if (t.includes('remarc') || t.includes('trocar') || t.includes('mudar horario')) {
    const cancelPrompt = await startCancel(db, phone)
    if (cancelPrompt.includes('Não achei') || cancelPrompt.includes('Nada para') || cancelPrompt.includes('nada pra')) {
      return 'Não achei horário marcado pra remarcar. Quer marcar um novo?'
    }
    return cancelPrompt.replace(
      'Qual desses você quer cancelar?',
      'Pra remarcar, cancelamos o atual primeiro. Qual horário você quer alterar?',
    )
  }

  return 'Oi! Me conta o que você precisa.'
}

async function startBooking(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
): Promise<string> {
  const { data: services } = await db
    .from('servicos')
    .select('id, nome, preco, duracao_minutos, ativo')
    .order('nome')

  const list = (services || []).filter((s: { ativo?: boolean }) => s.ativo !== false)
  if (!list.length) {
    await resetSession(db, phone)
    return 'No momento não tenho serviços disponíveis. Tenta mais tarde?'
  }

  await saveSession(db, phone, 'choose_service', {
    services: list.map((s: { id: string; nome: string; preco: number; duracao_minutos: number }) => ({
      id: s.id,
      nome: s.nome,
      preco: s.preco,
      duracao: s.duracao_minutos,
    })),
  })

  return [
    'Vou lhe enviar as opções de serviços abaixo',
    '',
    formatServicePriceList(list),
    '',
    'Qual você quer?',
  ].join('\n')
}

async function listAppointments(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
): Promise<string> {
  const client = await findOrCreateClientByPhone(db, phone)
  const today = todaySaoPaulo()

  const { data } = await db
    .from('agendamentos')
    .select('id, data, horario, status, servicos(nome), barbeiros(nome)')
    .eq('cliente_id', client.id)
    .in('status', ['pendente', 'confirmado'])
    .gte('data', today)
    .order('data', { ascending: true })
    .order('horario', { ascending: true })

  await resetSession(db, phone)

  if (!data?.length) {
    return 'Você não tem horários futuros marcados.\n\n' + aftercareText()
  }

  const lines = data.map((a: {
    data: string
    horario: string
    status: string
    servicos: { nome: string } | { nome: string }[] | null
    barbeiros: { nome: string } | { nome: string }[] | null
  }) => {
    const serv = Array.isArray(a.servicos) ? a.servicos[0] : a.servicos
    const barb = Array.isArray(a.barbeiros) ? a.barbeiros[0] : a.barbeiros
    return `• ${formatDateBR(a.data)} às ${String(a.horario).slice(0, 5)} — ${serv?.nome || 'Serviço'}${barb?.nome ? ` com ${barb.nome}` : ''} (${a.status})`
  })

  return ['Seus horários:', '', ...lines, '', aftercareText()].join('\n')
}

async function startCancel(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
): Promise<string> {
  const client = await findOrCreateClientByPhone(db, phone)
  const today = todaySaoPaulo()

  const { data } = await db
    .from('agendamentos')
    .select('id, data, horario, status, servicos(nome)')
    .eq('cliente_id', client.id)
    .in('status', ['pendente', 'confirmado'])
    .gte('data', today)
    .order('data', { ascending: true })
    .order('horario', { ascending: true })

  if (!data?.length) {
    await resetSession(db, phone)
    return 'Não achei nada pra cancelar.\n\n' + aftercareText()
  }

  const items = data.map((a: {
    id: string
    data: string
    horario: string
    servicos: { nome: string } | { nome: string }[] | null
  }) => {
    const serv = Array.isArray(a.servicos) ? a.servicos[0] : a.servicos
    const label = `${formatDateBR(a.data)} ${String(a.horario).slice(0, 5)} — ${serv?.nome || 'Serviço'}`
    return {
      id: a.id,
      label,
      nome: label,
    }
  })

  await saveSession(db, phone, 'cancel_pick', { cancelItems: items })

  const lines = items.map((it: { label: string }) => `• ${it.label}`)
  return [
    'Qual desses você quer cancelar?',
    '',
    ...lines,
    '',
    'Me diga a *data*, o *horário* ou o *serviço* do agendamento.',
  ].join('\n')
}

async function handleCancelPick(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  context: Record<string, unknown>,
): Promise<string> {
  if (wantsRestart(text)) {
    await resetSession(db, phone)
    return greetingText()
  }

  const items = (context.cancelItems as { id: string; label: string; nome: string }[]) || []
  const matched = matchByName(text, items)
  if (!matched) {
    const names = items.map((it) => it.label)
    return [
      'Não achei esse agendamento. Temos:',
      '',
      formatNameList(names),
      '',
      'Qual prefere cancelar?',
    ].join('\n')
  }

  const { error } = await db
    .from('agendamentos')
    .update({ status: 'cancelado' })
    .eq('id', matched.id)

  await resetSession(db, phone)

  if (error) {
    return `Não consegui cancelar: ${error.message}\n\n` + aftercareText()
  }

  return `Pronto, cancelei:\n${matched.label}\n\n` + aftercareText()
}

async function proceedAfterService(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  context: Record<string, unknown>,
  service: { id: string; nome: string; preco: number; duracao: number },
): Promise<string> {
  const dateHint = typeof context.data === 'string' ? String(context.data) : todaySaoPaulo()
  const list = await listBookableBarbers(db, dateHint)

  if (!list.length) {
    await saveSession(db, phone, 'choose_date', {
      ...context,
      servico_id: service.id,
      servico_nome: service.nome,
      barbeiro_id: null,
      barbeiro_nome: null,
    })
    return `Beleza, *${service.nome}*. Pra qual data? (ex.: 15/08)`
  }

  // Sempre pergunta preferência de barbeiro (1 ou vários)
  await saveSession(db, phone, 'choose_barber', {
    ...context,
    servico_id: service.id,
    servico_nome: service.nome,
    barbers: list.map((b) => ({ id: b.id, nome: b.nome })),
  })

  if (list.length === 1) {
    return [
      `Beleza, *${service.nome}*.`,
      `Quer ser atendido pelo *${list[0].nome}*? Pode dizer sim, ou "qualquer um" se tanto fizer.`,
    ].join(' ')
  }

  const names = list.map((b) => b.nome).join(', ')
  return [
    `Beleza, *${service.nome}*.`,
    `Quer ser atendido por algum barbeiro em específico? Temos ${names}.`,
    'Pode falar o nome ou "qualquer um" se não tiver preferência.',
  ].join(' ')
}

async function handleChooseService(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  context: Record<string, unknown>,
): Promise<string> {
  if (wantsRestart(text)) {
    await resetSession(db, phone)
    return greetingText()
  }

  const services = (context.services as { id: string; nome: string; preco: number; duracao: number }[]) || []
  const service = matchByName(text, services)
  if (!service) {
    return [
      'Não achei esse serviço. Temos:',
      '',
      formatNameList(services.map((s) => s.nome)),
      '',
      'Qual prefere?',
    ].join('\n')
  }

  return proceedAfterService(db, phone, context, service)
}

async function handleChooseBarber(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  context: Record<string, unknown>,
): Promise<string> {
  if (wantsRestart(text)) {
    await resetSession(db, phone)
    return greetingText()
  }

  const barbers = (context.barbers as { id: string; nome: string }[]) || []
  const t = normalizeMatch(text)

  let barbeiro_id: string | null = null
  let barbeiro_nome: string | null = 'Qualquer'

  const anyPref = [
    'qualquer',
    'tanto faz',
    'sem preferencia',
    'indiferente',
    'qualquer um',
  ].some((k) => t === k || t.includes(k))

  const yes = t === 's' || t === 'sim' || t === 'pode' || t === 'ok' || t === 'pode ser'
  const no = t === 'n' || t === 'nao' || t === 'no'

  if (barbers.length === 1 && yes) {
    barbeiro_id = barbers[0].id
    barbeiro_nome = barbers[0].nome
  } else if (anyPref || no || t === String(barbers.length + 1)) {
    barbeiro_id = null
    barbeiro_nome = 'Qualquer'
  } else {
    const matched = matchByName(text, barbers)
    if (!matched) {
      if (barbers.length === 1) {
        return `Quer com *${barbers[0].nome}*? Responde sim, ou "qualquer um".`
      }
      return `Não achei esse barbeiro. Temos ${barbers.map((b) => b.nome).join(', ')}. Qual prefere, ou "qualquer um"?`
    }
    barbeiro_id = matched.id
    barbeiro_nome = matched.nome
  }

  await saveSession(db, phone, 'choose_date', {
    ...context,
    barbeiro_id,
    barbeiro_nome,
    from_rotation: !barbeiro_id,
  })

  return [
    barbeiro_nome && barbeiro_nome !== 'Qualquer'
      ? `Beleza, *${barbeiro_nome}*.`
      : 'Beleza, qualquer barbeiro disponível.',
    '',
    'Pra qual *data*? (ex.: 15/08 ou 15/08/2026)',
  ].join('\n')
}

async function handleChooseDate(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  context: Record<string, unknown>,
): Promise<string> {
  if (wantsRestart(text)) {
    await resetSession(db, phone)
    return greetingText()
  }

  const data = parseDateBR(text)
  if (!data) {
    return 'Não entendi a data. Manda no formato *15/08* ou *15/08/2026*.'
  }

  const today = todaySaoPaulo()
  if (data < today) {
    return 'Essa data já passou. Me passa outra, por favor?'
  }

  const servico_id = context.servico_id as string
  const barbeiro_id = (context.barbeiro_id as string) || null

  const { slots: list, error } = await fetchAvailableSlots(db, data, servico_id, barbeiro_id)

  if (error) {
    return [
      'Não consegui consultar a agenda agora.',
      'Tenta de novo em instantes, ou me passa *outra data*.',
    ].join('\n')
  }

  if (!list.length) {
    return [
      `Sem horários livres em *${formatDateBR(data)}*`,
      context.barbeiro_nome ? `pra *${context.barbeiro_nome}*.` : '.',
      'Podem estar todos ocupados ou (hoje) já ter passado o horário.',
      '',
      'Quer tentar *outra data*?',
    ].join('\n')
  }

  await saveSession(db, phone, 'choose_time', {
    ...context,
    data,
    slots: list,
  })

  return formatSlotList(data, list, context.barbeiro_nome as string | undefined)
}

function formatSlotList(data: string, slots: string[], barbeiroNome?: string): string {
  const hours = slots.map((h) => h.slice(0, 5)).join(', ')
  const who = barbeiroNome && barbeiroNome !== 'Qualquer'
    ? ` com ${barbeiroNome}`
    : ''
  return [
    `Em *${formatDateBR(data)}*${who} ainda rola:`,
    hours,
    '',
    'Qual horário fica melhor pra você?',
  ].join('\n')
}

async function finalizeWizardBooking(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  context: Record<string, unknown>,
  senderName?: string,
): Promise<string> {
  const check = await checkSlotAvailability(db, {
    data: String(context.data),
    servicoId: String(context.servico_id),
    horario: String(context.horario),
    barbeiroId: (context.barbeiro_id as string) || null,
    barbeiroNome: (context.barbeiro_nome as string) || null,
  })

  if (!check.ok) {
    const { slots: refreshed } = await fetchAvailableSlots(
      db,
      String(context.data),
      String(context.servico_id),
      (context.barbeiro_id as string) || null,
    )
    if (refreshed.length) {
      await saveSession(db, phone, 'choose_time', {
        ...context,
        slots: refreshed,
        horario: undefined,
      })
      return [
        check.message,
        '',
        formatSlotList(String(context.data), refreshed, context.barbeiro_nome as string | undefined),
      ].join('\n')
    }
    await saveSession(db, phone, 'choose_date', {
      ...context,
      horario: undefined,
      slots: undefined,
    })
    return check.message + '\n\nQuer tentar *outra data*?'
  }

  const client = await findOrCreateClientByPhone(db, phone, senderName)
  const booked = await createAppointmentAtomic(db, {
    clienteId: client.id,
    servicoId: String(context.servico_id),
    data: String(context.data),
    horario: String(context.horario),
    barbeiroId: check.barbeiro_id,
    useRotation: Boolean(check.from_rotation || context.from_rotation),
  })

  await resetSession(db, phone)

  if (!booked.ok) {
    return `Não deu pra agendar: ${booked.error}\n\n` + aftercareText()
  }

  return bookingSuccessText({
    servico: context.servico_nome ? String(context.servico_nome) : null,
    barbeiro: booked.barbeiro_nome || check.barbeiro_nome || (context.barbeiro_nome as string) || null,
    data: String(booked.data || context.data),
    horario: String(booked.horario),
  })
}

async function handleChooseTime(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  context: Record<string, unknown>,
  senderName?: string,
): Promise<string> {
  if (wantsRestart(text)) {
    await resetSession(db, phone)
    return greetingText()
  }

  const slots = (context.slots as string[]) || []
  const horario = matchSlot(text, slots)
  if (!horario) {
    return [
      'Não achei esse horário. Disponíveis:',
      '',
      ...slots.map((h) => `• ${h.slice(0, 5)}`),
      '',
      'Qual prefere?',
    ].join('\n')
  }

  const check = await checkSlotAvailability(db, {
    data: String(context.data),
    servicoId: String(context.servico_id),
    horario,
    barbeiroId: (context.barbeiro_id as string) || null,
    barbeiroNome: (context.barbeiro_nome as string) || null,
  })

  if (!check.ok) {
    const { slots: refreshed } = await fetchAvailableSlots(
      db,
      String(context.data),
      String(context.servico_id),
      (context.barbeiro_id as string) || null,
    )
    if (refreshed.length) {
      await saveSession(db, phone, 'choose_time', { ...context, slots: refreshed })
      return [
        check.message,
        '',
        formatSlotList(String(context.data), refreshed, context.barbeiro_nome as string | undefined),
      ].join('\n')
    }
    await saveSession(db, phone, 'choose_date', context)
    return check.message + '\n\nQuer tentar *outra data*?'
  }

  return finalizeWizardBooking(db, phone, {
    ...context,
    horario,
    barbeiro_id: check.barbeiro_id,
    barbeiro_nome: check.barbeiro_nome || context.barbeiro_nome,
    from_rotation: check.from_rotation || Boolean(context.from_rotation),
  }, senderName)
}

async function handleConfirm(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  context: Record<string, unknown>,
  senderName?: string,
): Promise<string> {
  const t = normalizeMatch(text)

  if (
    t === '2' ||
    t === 'n' ||
    t === 'nao' ||
    t === 'no' ||
    t.includes('cancel') ||
    t.includes('nao quero') ||
    t.includes('desisto')
  ) {
    await resetSession(db, phone)
    return 'Beleza, não marquei nada.\n\n' + aftercareText()
  }

  return finalizeWizardBooking(db, phone, context, senderName)
}

async function handlePureGreeting(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  trimmed: string,
  session: { step: string; context: Record<string, unknown> },
  leadName: string | null | undefined,
  shop: string | null,
): Promise<string> {
  let appts: Awaited<ReturnType<typeof fetchUpcomingAppointments>> = []
  try {
    appts = await fetchUpcomingAppointments(db, phone)
  } catch (e) {
    console.warn('greeting appointments', e)
  }
  let hi = greetingWithAppointments(leadName, shop, appts)
  hi = await appendShopHoursNotice(db, hi)
  try {
    const prev = Array.isArray(session.context.history)
      ? (session.context.history as ChatMessage[])
      : []
    const history = [
      ...prev.filter((m) => m?.name !== 'get_available_slots'),
      { role: 'user' as const, content: trimmed || 'oi' },
      { role: 'assistant' as const, content: hi },
    ].slice(-28)
    await saveSession(db, phone, 'chat', {
      history,
      mode: 'mimo',
      lead_name: leadName,
      has_appointments: appts.length > 0,
      upcoming_count: appts.length,
      last_slots: [],
      last_slots_data: null,
      last_slots_servico_id: null,
      last_slots_barbeiro_id: null,
      slots: [],
    })
  } catch {
    /* ignore */
  }
  return hi
}

async function processWithMimo(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  leadName?: string | null,
): Promise<string | null> {
  const config = await loadMimoConfig(db)
  if (!config) {
    console.error('[MIMO] config ausente — sem MIMO_API_KEY / whatsapp_secrets.mimo_api_key. Wizard assume o papo.')
    return null
  }

  const session = await getSession(db, phone)
  const prevHistory = Array.isArray(session.context.history)
    ? (session.context.history as ChatMessage[])
    : []

  // Compact prior turns — keep more history so o contexto da conversa se mantém
  const greetingTurn = isPureGreeting(text)

  const prior = greetingTurn
    ? []
    : prevHistory
      .filter((m) => m && m.role && m.name !== 'get_available_slots')
      .map((m) => {
        const out: ChatMessage = { role: m.role }
        if (m.content != null) out.content = m.content
        if (m.tool_calls) out.tool_calls = m.tool_calls
        if (m.tool_call_id) out.tool_call_id = m.tool_call_id
        if (m.name) out.name = m.name
        return out
      })
      .slice(-24)

  // Resumo do que já foi falado no fallback wizard (se existir), para a IA não “zerar”
  const ctxLines: string[] = []
  const c = session.context
  if (!greetingTurn) {
    if (c.servico_nome) ctxLines.push(`serviço em papo: ${c.servico_nome}`)
    if (c.barbeiro_nome) ctxLines.push(`barbeiro: ${c.barbeiro_nome}`)
    if (c.data) ctxLines.push(`data: ${c.data}`)
    if (c.horario) ctxLines.push(`horário: ${c.horario}`)
    if (session.step && session.step !== 'menu' && session.step !== 'chat' && session.step !== 'ask_name') {
      ctxLines.push(`estava no passo interno: ${session.step}`)
    }
  }
  if (leadName && isKnownLeadName(leadName)) {
    ctxLines.push(`nome do lead (salvo): ${leadName}`)
  }

  // Agenda do lead (agendamentos já marcados) — saudação pura não puxa horários
  let apptCtx = ''
  if (!greetingTurn) {
    try {
      const upcoming = await fetchUpcomingAppointments(db, phone)
      apptCtx = '\nAgenda do lead:\n' + appointmentsContextLines(upcoming).join('\n')
    } catch (e) {
      console.warn('fetchUpcomingAppointments failed', e)
    }
  }

  let shopPhase: Awaited<ReturnType<typeof getShopHoursPhase>>['phase'] = 'open'
  let shopOpenHm = '08:30'
  try {
    const hours = await getShopHoursPhase(db)
    shopPhase = hours.phase
    if (hours.open) shopOpenHm = hours.open
  } catch {
    shopPhase = 'open'
  }

  const offHoursNotice = shopHoursStatusNotice(shopPhase, shopOpenHm)
  const bookingLocked = !greetingTurn && isBookingStep(session.step)
  const system = systemPromptBarber() +
    `\nREGRAS ABSOLUTAS DESTA CONVERSA: se já tiver serviço + data + horário livre, chame create_appointment nesta rodada. PROIBIDO pedir confirmação. PROIBIDO pedir avaliação, nota de 1 a 5, feedback ou comentário sobre a experiência. Depois de agendar, envie só mensagem_cliente (2 a 3 frases). Fora do expediente, AINDA ASSIM agende (para amanhã ou outra data). Nunca recuse só porque a loja está fechada agora.` +
    (bookingLocked
      ? `\nPASSO TRAVADO: ${session.step}. Não peça o nome. Não mude de assunto. Continue este passo.`
      : '') +
    (offHoursNotice
      ? shopPhase === 'before_open'
        ? `\nFORA DO EXPEDIENTE (madrugada/antes de abrir): ${offHoursNotice} NÃO diga que o expediente já encerrou. Convide a agendar para hoje a partir das ${shopOpenHm.replace(':', 'h')}.`
        : `\nFORA DO EXPEDIENTE: ${offHoursNotice} Avise isso e continue o agendamento para ${shopPhase === 'after_close' ? 'amanhã/outras datas' : 'outro dia disponível'}.`
      : '') +
    (ctxLines.length
      ? `\nContexto parcial já conhecido desta conversa (não pergunte de novo se já souber):\n- ${ctxLines.join('\n- ')}`
      : '') +
    apptCtx

  const identity = leadName && isKnownLeadName(leadName)
    ? `[Cliente se chama ${leadName}. Tel ${phone}. Responda só a mensagem:]`
    : `[Tel ${phone}. Nome ainda não confirmado no cadastro. Responda só a mensagem:]`

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...prior,
    {
      role: 'user',
      content: `${identity}\n${text}`,
    },
  ]

  const tChoice = normalizeMatch(text)
  let toolChoice: 'auto' | 'none' | { type: 'function'; function: { name: string } } = 'auto'
  if (greetingTurn) {
    toolChoice = 'none'
  } else if (!isGreetingOnly(text)) {
    if (
      tChoice.includes('endereco') ||
      tChoice.includes('funcionamento') ||
      tChoice.includes('que horas') ||
      (tChoice.includes('abre') && tChoice.includes('fecha'))
    ) {
      toolChoice = { type: 'function', function: { name: 'get_shop_hours' } }
    } else if (tChoice.includes('preco') || tChoice.includes('quanto custa')) {
      toolChoice = { type: 'function', function: { name: 'list_services' } }
    }
  }

  const MIMO_ROUND_MS = 20000
  const MIMO_MAX_ROUNDS = 4
  let usedTools: string[] = []
  for (let round = 0; round < MIMO_MAX_ROUNDS; round++) {
    const res = await withTimeout(
      mimoChat({
        config,
        messages,
        tools: greetingTurn ? undefined : BARBER_TOOLS,
        tool_choice: greetingTurn ? 'none' : (round === 0 ? toolChoice : 'auto'),
        temperature: 0.4,
        max_completion_tokens: 500,
      }),
      MIMO_ROUND_MS,
      { ok: false as const, error: `timeout_mimo_${MIMO_ROUND_MS}ms` },
    )

    if (!res.ok || !res.message) {
      logDivaError('MiMo error — sem resposta da IA (fallback possível)', {
        phone: phone.slice(-4),
        round,
        error: res.error ?? null,
      })
      console.error('[MIMO] falha/timeout', {
        phone: phone.slice(-4),
        round,
        error: res.error ?? null,
        model: config.model,
        baseUrl: config.baseUrl,
        hasKey: Boolean(config.apiKey),
      })
      return null
    }

    const msg = res.message
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: msg.content ?? null,
    }
    if (msg.tool_calls?.length) {
      assistantMsg.tool_calls = msg.tool_calls
    }
    messages.push(assistantMsg)

    if (msg.tool_calls?.length) {
      logDiva('IA chamou ferramenta de consulta (não usou fallback)', {
        phone: phone.slice(-4),
        round,
        ferramentas: msg.tool_calls.map((tc) => ({
          nome: tc.function?.name || '',
          argumentos: tc.function?.arguments || '{}',
        })),
      })
      for (const tc of msg.tool_calls) {
        const fnName = tc.function?.name || ''
        usedTools.push(fnName)
        const fnArgs = tc.function?.arguments || '{}'
        if (greetingTurn) {
          logDiva('saudação pura — tool de horário bloqueada no webhook', {
            phone: phone.slice(-4),
            ferramenta: fnName,
          })
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: fnName,
            content: JSON.stringify({
              skipped: true,
              reason: 'pure_greeting',
              dica: 'Não busque horários. Só cumprimente o cliente.',
            }),
          })
          continue
        }
        // tools usam o nome salvo do lead, não o perfil WhatsApp
        let toolResult = ''
        try {
          toolResult = await withTimeout(
            runBarberTool(db, phone, fnName, fnArgs, leadName || undefined),
            8000,
            JSON.stringify({ error: 'timeout_tool', ferramenta: fnName, ok: false }),
          )
        } catch (e) {
          console.error('[MIMO-TOOL] exceção', {
            phone: phone.slice(-4),
            ferramenta: fnName,
            error: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? e.stack : null,
          })
          toolResult = JSON.stringify({
            error: e instanceof Error ? e.message : String(e),
            ok: false,
          })
        }
        logDiva('resultado da ferramenta devolvido à IA', {
          phone: phone.slice(-4),
          ferramenta: fnName,
          argumentos: fnArgs,
          resultado: toolResult.slice(0, 4000),
        })
        messages.push({
          role: 'tool',
          tool_call_id: tc.id || `tool_${round}_${fnName}`,
          name: fnName,
          content: toolResult,
        })
      }
      continue
    }

    let answer = String(msg.content || '').trim()
    const consultTools = [
      'get_available_slots',
      'list_barbers',
      'create_appointment',
      'list_my_appointments',
      'cancel_appointment',
    ]
    const usedConsult = usedTools.some((t) => consultTools.includes(t))
    if (!usedConsult) {
      logDiva('IA NÃO chamou ferramenta de consulta — respondeu em texto (possível fallback interno da IA)', {
        phone: phone.slice(-4),
        round,
        usedTools,
        resposta_preview: answer.slice(0, 300),
      })
    } else {
      logDiva('IA usou ferramenta de consulta e depois respondeu em texto', {
        phone: phone.slice(-4),
        usedTools,
        resposta_preview: answer.slice(0, 300),
      })
    }
    if (!answer) {
      logDiva('fallback: MiMo devolveu texto vazio — wizard pode assumir', {
        phone: phone.slice(-4),
        tools: usedTools,
      })
      logBotEvent('bot_fallback', { reason: 'empty_mimo', phone: phone.slice(-4), tools: usedTools })
      return null
    }

    const fresh = await getSession(db, phone)
    const lastSlots = greetingTurn
      ? []
      : Array.isArray(fresh.context.last_slots)
        ? (fresh.context.last_slots as string[]).map((h) => String(h).slice(0, 5))
        : []
    if (lastSlots.length) {
      const mentioned = [...answer.matchAll(/\b(\d{1,2})[:hH](\d{2})\b/g)]
      const invented = mentioned.some((m) => {
        const hm = `${m[1].padStart(2, '0')}:${m[2]}`
        return !lastSlots.includes(hm)
      })
      if (invented) {
        logDiva('fallback: IA inventou horário que não está na última consulta get_available_slots', {
          phone: phone.slice(-4),
          last_slots: lastSlots,
          data: fresh.context.last_slots_data ?? null,
          resposta_preview: answer.slice(0, 300),
        })
        logBotEvent('bot_fallback', { reason: 'invented_slot', phone: phone.slice(-4) })
        answer = [
          `Em ${fresh.context.last_slots_data || 'essa data'} ainda rola:`,
          lastSlots.join(', '),
          '',
          'Qual horário fica melhor pra você?',
        ].join('\n')
      }
    }
    if (/08h00|08:00/.test(answer) && usedTools.includes('get_shop_hours')) {
      try {
        const info = await fetchShopPublicInfo(db)
        if (!/08h00|08:00/.test(info.resumo)) {
          answer = answer.replace(/08h00/g, '08h30').replace(/08:00/g, '08:30')
        }
      } catch {
        /* ignore */
      }
    }

    if (usedTools.includes('create_appointment')) {
      const created = lastJsonToolResult(messages, 'create_appointment')
      const forced = created && created.ok && typeof created.mensagem_cliente === 'string'
        ? String(created.mensagem_cliente).trim()
        : ''
      if (forced) answer = forced
    } else if (looksLikeConfirmationAsk(answer)) {
      const booked = await tryAutoCreateAppointment(db, phone, text, answer, leadName)
      if (booked) answer = booked
    }

    const toStore = messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        const out: ChatMessage = { role: m.role }
        if (m === assistantMsg && !m.tool_calls?.length) {
          out.content = answer
        } else if (m.content != null) {
          out.content = typeof m.content === 'string' ? m.content.slice(0, 4000) : m.content
        }
        if (m.tool_calls) out.tool_calls = m.tool_calls
        if (m.tool_call_id) out.tool_call_id = m.tool_call_id
        if (m.name) out.name = m.name
        return out
      })
      .slice(-28)

    const bookedNow = usedTools.includes('create_appointment') &&
      Boolean(lastJsonToolResult(messages, 'create_appointment')?.ok)
    const keepStep = bookedNow ? 'chat' : (isBookingStep(session.step) ? session.step : 'chat')
    await saveSession(db, phone, keepStep, {
      history: toStore,
      mode: 'mimo',
      lead_name: leadName || undefined,
      ...(bookedNow
        ? {
            last_slots: [],
            last_slots_data: null,
            last_slots_servico_id: null,
            last_slots_barbeiro_id: null,
            slots: [],
            horario: null,
          }
        : {}),
    })
    return answer
  }

  logDiva('fallback: MiMo esgotou rodadas de ferramentas — wizard pode assumir', {
    phone: phone.slice(-4),
    usedTools,
  })
  logBotEvent('bot_fallback', { reason: 'mimo_rounds_exhausted', phone: phone.slice(-4) })
  return null
}

function sessionHasBookingContext(session: { step?: string; context: Record<string, unknown> }): boolean {
  if (isBookingStep(session.step)) return true
  const hist = session.context?.history
  if (!Array.isArray(hist) || !hist.length) return false
  const blob = hist
    .map((m: { content?: unknown; name?: string }) => `${m.name || ''} ${typeof m.content === 'string' ? m.content : ''}`)
    .join(' ')
  const n = normalizeMatch(blob)
  return (
    n.includes('horario') ||
    n.includes('barbeiro') ||
    n.includes('servico') ||
    n.includes('list_barbers') ||
    n.includes('get_available') ||
    n.includes('list_services') ||
    n.includes('create_appointment')
  )
}

async function processMessage(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  _whatsappProfileName?: string,
): Promise<string> {
  const trimmed = text.trim()
  let leadName: string | null = null
  let session: { step: string; context: Record<string, unknown> } = { step: 'chat', context: {} }
  let shop: string | null = null

  try {
    await findOrCreateClientByPhone(db, phone).catch(() => null)
  } catch {
    /* segue mesmo sem cadastro */
  }
  try {
    leadName = await getLeadDisplayName(db, phone)
  } catch (e) {
    console.warn('[PROCESS] lead não encontrado — segue sem nome', e)
  }
  try {
    session = await getSession(db, phone)
  } catch (e) {
    console.warn('[PROCESS] sessão falhou — segue sem histórico', e)
    session = { step: 'chat', context: {} }
  }
  try {
    shop = await fetchShopName(db)
  } catch (e) {
    console.warn('[PROCESS] shop name falhou', e)
  }

  // Avaliação desativada: não continua pedido de nota/feedback
  if (isRatingSessionStep(session.step)) {
    await resetSession(db, phone)
    session = { step: 'chat', context: {} }
  }

  // ── Saudação pura: nunca wizard, nunca get_available_slots, nunca last_slots ─
  if (isPureGreeting(trimmed)) {
    logDiva('saudação pura — bypass de tools de horário', {
      phone: phone.slice(-4),
      texto: trimmed,
    })
    if (
      !isKnownLeadName(leadName) &&
      !sessionHasBookingContext(session) &&
      !looksLikeBookingUtterance(trimmed)
    ) {
      await saveSession(db, phone, 'ask_name', {
        ...session.context,
        awaiting_name: true,
        last_slots: [],
        last_slots_data: null,
        last_slots_servico_id: null,
        last_slots_barbeiro_id: null,
        slots: [],
      })
      return askNameText(shop)
    }
    return handlePureGreeting(db, phone, trimmed, session, leadName, shop)
  }

  if (isBookingStep(session.step)) {
    logDiva('fallback: sessão no wizard (não passou por ferramenta da IA nesta mensagem)', {
      phone: phone.slice(-4),
      step: session.step,
      barbeiro: session.context.barbeiro_id ?? session.context.barbeiro_nome ?? null,
      data: session.context.data ?? null,
      horario: session.context.horario ?? null,
    })
    try {
      return await withTimeout(
        dispatchWizard(db, phone, trimmed, session, leadName),
        8000,
        FALLBACK_OUTBOUND,
      )
    } catch (e) {
      console.error('[WIZARD] passo travado falhou', {
        phone: phone.slice(-4),
        step: session.step,
        error: e instanceof Error ? e.message : String(e),
      })
      return FALLBACK_OUTBOUND
    }
  }

  let namedBarber = false
  try {
    namedBarber = await withTimeout(
      (async () => {
        const cached = Array.isArray(session.context.last_barbers)
          ? (session.context.last_barbers as { nome: string }[])
          : []
        const barbers = cached.length ? cached : await listBookableBarbers(db)
        return Boolean(matchByName(trimmed, barbers))
      })(),
      2500,
      false,
    )
  } catch {
    namedBarber = false
  }
  const lastSlots = Array.isArray(session.context.last_slots)
    ? (session.context.last_slots as string[])
    : Array.isArray(session.context.slots)
      ? (session.context.slots as string[])
      : []
  const namedSlot = Boolean(lastSlots.length && matchSlot(trimmed, lastSlots))

  if (session.step === 'ask_name') {
    const midBooking =
      sessionHasBookingContext(session) ||
      looksLikeBookingUtterance(trimmed) ||
      namedBarber ||
      namedSlot
    if (
      trimmed &&
      isPlausiblePersonName(trimmed) &&
      !looksLikeBookingUtterance(trimmed) &&
      !namedBarber &&
      !namedSlot
    ) {
      try {
        leadName = await saveLeadName(db, phone, trimmed)
      } catch (e) {
        console.error('saveLeadName', e)
      }
      let appts: Awaited<ReturnType<typeof fetchUpcomingAppointments>> = []
      try {
        appts = await fetchUpcomingAppointments(db, phone)
      } catch {
        /* ignore */
      }
      let hi = afterNameGreeting(leadName, shop, appts)
      hi = await appendShopHoursNotice(db, hi)
      const prev = Array.isArray(session.context.history)
        ? (session.context.history as ChatMessage[])
        : []
      await saveSession(db, phone, 'chat', {
        history: [
          ...prev,
          { role: 'user', content: trimmed },
          { role: 'assistant', content: hi },
        ].slice(-28),
        mode: 'mimo',
        lead_name: leadName,
      })
      return hi
    }
    if (!midBooking) {
      await saveSession(db, phone, 'ask_name', { ...session.context, awaiting_name: true })
      return trimmed && !isGreetingOnly(trimmed) ? askNameAgainText() : askNameText(shop)
    }
    // Horário / serviço / barbeiro no meio do pedido do nome: segue o agendamento
  }

  // Números novos: pede o nome ANTES da IA, salvo se o papo de agenda já começou
  if (
    !isKnownLeadName(leadName) &&
    !sessionHasBookingContext(session) &&
    !looksLikeBookingUtterance(trimmed) &&
    !namedBarber &&
    !namedSlot
  ) {
    if (trimmed && isPlausiblePersonName(trimmed) && !isGreetingOnly(trimmed)) {
      try {
        leadName = await saveLeadName(db, phone, trimmed)
      } catch {
        /* ignore */
      }
      if (isKnownLeadName(leadName)) {
        let appts: Awaited<ReturnType<typeof fetchUpcomingAppointments>> = []
        try {
          appts = await fetchUpcomingAppointments(db, phone)
        } catch {
          /* ignore */
        }
        let hi = afterNameGreeting(leadName, shop, appts)
        hi = await appendShopHoursNotice(db, hi)
        await saveSession(db, phone, 'chat', {
          history: [
            { role: 'user', content: trimmed },
            { role: 'assistant', content: hi },
          ],
          mode: 'mimo',
          lead_name: leadName,
        })
        return hi
      }
    }
    await saveSession(db, phone, 'ask_name', { ...session.context, awaiting_name: true })
    return askNameText(shop)
  }

  // ── Cumprimento puro ───────────────────────────────────────────────────────
  if (!trimmed || isGreetingOnly(trimmed)) {
    return handlePureGreeting(db, phone, trimmed || 'oi', session, leadName, shop)
  }

  // Endereço / funcionamento
  if (wantsShopInfo(trimmed)) {
    const info = await fetchShopPublicInfo(db)
    const answer = info.resumo
    try {
      const prev = Array.isArray(session.context.history)
        ? (session.context.history as ChatMessage[])
        : []
      await saveSession(db, phone, 'chat', {
        history: [...prev, { role: 'user', content: trimmed }, { role: 'assistant', content: answer }].slice(
          -28,
        ),
        mode: 'mimo',
        lead_name: leadName,
      })
    } catch {
      /* ignore */
    }
    return answer
  }

  // Cliente pediu pra zerar o papo
  if (wantsRestart(trimmed) || ['reset', 'limpar', '/start'].includes(trimmed.toLowerCase())) {
    await resetSession(db, phone)
    // mantém o nome no cadastro (clientes); só zera a sessão
    if (!leadName) {
      await saveSession(db, phone, 'ask_name', { awaiting_name: true })
      return askNameText(shop)
    }
    let appts: Awaited<ReturnType<typeof fetchUpcomingAppointments>> = []
    try {
      appts = await fetchUpcomingAppointments(db, phone)
    } catch {
      /* ignore */
    }
    return greetingWithAppointments(leadName, shop, appts)
  }

  const { step, context } = session

  if (!isBookingStep(step)) {
    try {
      const ai = await withTimeout(
        processWithMimo(db, phone, trimmed, leadName),
        32000,
        null,
      )
      if (ai) return ai
      const direct = await tryDirectBookFromUtterance(db, phone, trimmed, leadName)
      if (direct) {
        logDiva('fallback inteligente — agendou sem MiMo', {
          phone: phone.slice(-4),
          texto: trimmed.slice(0, 120),
        })
        return direct
      }
      logDiva('fallback: IA não devolveu resposta — usando wizard', {
        phone: phone.slice(-4),
        step,
        barbeiro: context.barbeiro_id ?? context.barbeiro_nome ?? null,
        data: context.data ?? null,
        horario: context.horario ?? null,
      })
    } catch (e) {
      logDivaError('fallback: processWithMimo falhou — usando wizard', {
        phone: phone.slice(-4),
        error: e instanceof Error ? e.message : String(e),
      })
      console.error('processWithMimo failed', e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : null)
    }
  }

  let fallback = ''
  try {
    fallback = await withTimeout(
      dispatchWizard(db, phone, trimmed, session, leadName),
      8000,
      FALLBACK_OUTBOUND,
    )
  } catch (e) {
    console.error('[WIZARD] falhou — fallback', {
      phone: phone.slice(-4),
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : null,
    })
  }
  if (!fallback) {
    logDiva('fallback: wizard também sem resposta', { phone: phone.slice(-4), step })
    logBotEvent('bot_fallback', { reason: 'fallback_intent', phone: phone.slice(-4), step })
  }
  return fallback?.trim() || FALLBACK_OUTBOUND
}

async function dispatchWizard(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  trimmed: string,
  session: { step: string; context: Record<string, unknown> },
  leadName?: string | null,
): Promise<string> {
  const { step, context } = session
  logDiva('wizard (fallback) — passo', {
    phone: phone.slice(-4),
    step,
    barbeiro: context.barbeiro_id ?? context.barbeiro_nome ?? null,
    data: context.data ?? null,
    horario: context.horario ?? null,
  })
  switch (step) {
    case 'choose_service':
      return handleChooseService(db, phone, trimmed, context)
    case 'choose_barber':
      return handleChooseBarber(db, phone, trimmed, context)
    case 'choose_date':
      return handleChooseDate(db, phone, trimmed, context)
    case 'choose_time':
      return handleChooseTime(db, phone, trimmed, context, leadName || undefined)
    case 'confirm':
      return handleConfirm(db, phone, trimmed, context, leadName || undefined)
    case 'cancel_pick':
      return handleCancelPick(db, phone, trimmed, context)
    default:
      return handleFallbackIntent(db, phone, trimmed)
  }
}

// ─── HTTP entry ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Health check
  if (req.method === 'GET') {
    const db = getServiceClient()
    const uaz = await resolveUazConfig(db)
    return jsonResponse({ ok: true, service: 'whatsapp-webhook', ai: 'mimo', uaz_ok: Boolean(uaz.config) })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    // Auth: WEBHOOK_SECRET via query ?secret= or header x-webhook-secret
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET') || ''
    const url = new URL(req.url)
    const querySecret = url.searchParams.get('secret') || ''
    const headerSecret = req.headers.get('x-webhook-secret') || ''

    if (webhookSecret) {
      if (querySecret !== webhookSecret && headerSecret !== webhookSecret) {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }
    }

    const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>

    // UAZAPI may wrap event
    const event = String(payload.EventType || payload.event || payload.type || 'messages')
    if (
      event &&
      !['messages', 'message', 'Messages', ''].includes(event) &&
      payload.message == null &&
      payload.data == null &&
      !Array.isArray(payload.messages)
    ) {
      // Ignore non-message events quietly
      console.log('[UAZAPI-INBOUND] evento ignorado', { event })
      return jsonResponse({ ok: true, ignored: event })
    }

    const messages = collectMessages(payload)
    const ownerPhone = instanceOwnerPhone(payload)

    const db = getServiceClient()
    const uazReady = await resolveUazConfig(db)
    if (!uazReady.config) {
      console.error('[WEBHOOK] UAZAPI inválida', uazReady.error)
      return jsonResponse({ ok: false, error: uazReady.error || 'UAZAPI inválida' }, 503)
    }
    let active = true
    try {
      active = await isBotActive(db)
    } catch (e) {
      console.error('[BOT] falha ao ler whatsapp_bot_ativo — seguindo ativo', e)
      active = true
    }
    if (!active) {
      console.warn('[BOT] whatsapp_bot_ativo=false — NÃO silenciar; seguindo atendimento (expediente noturno incluso)')
    }

    console.log('[UAZAPI-INBOUND] payload', {
      event,
      messageCount: messages.length,
      hasData: payload.data != null,
      hasMessage: payload.message != null,
    })

    const results: { phone: string; ok: boolean; note?: string }[] = []
    const grouped = new Map<string, string[]>()

    for (const msg of messages) {
      if (shouldIgnore(msg)) {
        console.log('[UAZAPI-INBOUND] ignorada fromMe/grupo', {
          fromMe: msg.fromMe,
          isGroup: msg.isGroup,
        })
        results.push({ phone: '', ok: true, note: 'ignored_fromMe_or_group' })
        continue
      }

      const mid = String(msg.messageid || msg.messageidHex || '').trim()
      if (mid) {
        const { error: dupErr } = await db.from('whatsapp_processed_messages').insert({ messageid: mid })
        if (dupErr && (dupErr.code === '23505' || /duplicate|unique/i.test(dupErr.message || ''))) {
          results.push({ phone: '', ok: true, note: 'duplicate' })
          continue
        }
      }

      const phone = extractPhone(msg, payload)
      if (!phone) {
        console.warn('whatsapp-webhook: no customer phone', {
          chatid: msg.chatid,
          sender: msg.sender,
          sender_pn: msg.sender_pn,
          keyRemoteJid: (msg.key as { remoteJid?: string } | undefined)?.remoteJid ?? null,
          owner: ownerPhone,
        })
        results.push({ phone: '', ok: false, note: 'no_phone' })
        continue
      }

      const text = extractText(msg)
      console.log('[UAZAPI-INBOUND] mensagem', {
        phone: phone.slice(-4),
        text,
        normalized: text.trim(),
        isGreeting: isPureGreeting(text),
        messageid: mid || null,
      })
      const prev = grouped.get(phone) || []
      prev.push(text)
      grouped.set(phone, prev)
    }

    for (const [phone, texts] of grouped) {
      const uazCfg = uazReady.config
      const payloadText = texts.map((t) => t.trim()).filter(Boolean).join('\n')
      const inboundRaw = payloadText || 'oi'
      console.log('[WEBHOOK] texto normalizado', {
        phone: phone.slice(-4),
        inboundRaw,
        isGreeting: isPureGreeting(inboundRaw),
      })

      // Saudação: envia ANTES do lock de banco (trava noturna / lock preso = silêncio).
      if (uazCfg && isPureGreeting(inboundRaw)) {
        console.log('[GREETING-REGEX] match HTTP', { phone: phone.slice(-4), inboundRaw })
        try {
          await deliverPureGreeting(db, phone, inboundRaw, uazCfg)
          await clearDebounceBuffer(db, phone)
          results.push({ phone, ok: true, note: 'greeting_sent' })
        } catch (err) {
          console.error('[GREETING] erro', {
            phone: phone.slice(-4),
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : null,
          })
          const rescue = withLocalHoursNotice(FALLBACK_OUTBOUND)
          const sent = await sendWhatsappMessage(phone, rescue, uazCfg)
          results.push({ phone, ok: sent, note: sent ? 'greeting_rescue' : 'greeting_failed' })
        }
        continue
      }

      // Lock com timeout: lock preso não pode silenciar agendamento (saudação já pulava isso).
      const locked = await withTimeout(
        rpcTry(db, 'lock_whatsapp_phone', { p_phone: phone }),
        1500,
        false,
      )
      if (!locked) {
        console.warn('[WEBHOOK] lock_whatsapp_phone timeout/falha — seguindo sem lock', {
          phone: phone.slice(-4),
        })
      }
      let shouldFlushBuffer = false
      try {
        if (ownerPhone && phone === ownerPhone) {
          console.info('whatsapp-webhook: reply to instance owner (self-test or same number)', phone)
        }

        if (!uazCfg) {
          results.push({ phone, ok: false, note: 'uaz_unavailable' })
          continue
        }

        if (!payloadText) {
          let hist: unknown[] = []
          try {
            const sess = await getSession(db, phone)
            hist = Array.isArray(sess.context.history) ? sess.context.history : []
          } catch (e) {
            console.warn('[WEBHOOK] empty payload, sessão falhou — não silenciar lead novo', e)
          }
          if (hist.length) {
            console.log('[WEBHOOK] empty_ignored', { phone: phone.slice(-4) })
            results.push({ phone, ok: true, note: 'empty_ignored' })
            continue
          }
        }

        await beginTyping(phone, db, 8000)
        const inbound = await withTimeout(
          consumeInboundForProcess(db, phone, inboundRaw),
          2500,
          inboundRaw,
        )
        console.log('[WEBHOOK] após debounce', {
          phone: phone.slice(-4),
          inbound,
          isGreeting: isPureGreeting(inbound),
        })
        if (isPureGreeting(inbound)) {
          console.log('[GREETING-REGEX] match pós-buffer', { phone: phone.slice(-4), inbound })
          shouldFlushBuffer = true
          await deliverPureGreeting(db, phone, inbound, uazCfg)
          results.push({ phone, ok: true, note: 'greeting_sent' })
          continue
        }

        shouldFlushBuffer = true
        let leadName: string | null = null
        try {
          leadName = await getLeadDisplayName(db, phone)
        } catch (e) {
          console.warn('[WEBHOOK] lead não encontrado — segue envio', e)
        }
        let answer = FALLBACK_OUTBOUND
        try {
          answer = String(
            await withTimeout(
              processMessage(db, phone, inbound),
              40000,
              FALLBACK_OUTBOUND,
            ) || '',
          ).trim() || FALLBACK_OUTBOUND
        } catch (e) {
          console.error('[WEBHOOK] processMessage falhou — enviando fallback', {
            phone: phone.slice(-4),
            inbound: inbound.slice(0, 120),
            error: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? e.stack : null,
          })
          answer = FALLBACK_OUTBOUND
        }
        answer = await withTimeout(withClosedShopNotice(db, answer), 2500, answer)
        try {
          await reply(phone, answer, db, uazCfg, { senderName: leadName, userText: inbound })
        } catch (sendErr) {
          console.error('[WEBHOOK] reply falhou — sendWhatsappMessage direto', sendErr)
          const rescue = withLocalHoursNotice(answer || FALLBACK_OUTBOUND)
          const sent = await sendWhatsappMessage(phone, rescue, uazCfg)
          if (!sent) throw sendErr
        }
        results.push({ phone, ok: true, note: 'replied' })
      } catch (err) {
        console.error('[WEBHOOK] deliver error', {
          phone: phone.slice(-4),
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : null,
        })
        if (uazCfg) {
          const rescue = withLocalHoursNotice(FALLBACK_OUTBOUND)
          const sent = await sendWhatsappMessage(phone, rescue, uazCfg)
          results.push({
            phone,
            ok: sent,
            note: sent ? 'fallback_sent' : (err instanceof Error ? err.message : String(err)),
          })
        } else {
          results.push({
            phone,
            ok: false,
            note: err instanceof Error ? err.message : String(err),
          })
        }
      } finally {
        if (shouldFlushBuffer) await clearDebounceBuffer(db, phone)
        await rpcTry(db, 'unlock_whatsapp_phone', { p_phone: phone })
      }
    }

    return jsonResponse({
      ok: true,
      processed: results.filter((r) => r.ok && r.phone).length,
      owner: ownerPhone || null,
      results,
    })
  } catch (err) {
    console.error('whatsapp-webhook error', err)
    const message = err instanceof Error ? err.message : String(err)
    return jsonResponse({ error: message }, 500)
  }
})
