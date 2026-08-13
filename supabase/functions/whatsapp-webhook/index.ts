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
  matchByName,
  matchSlot,
  normalizeMatch,
  parseDateBR,
  resetSession,
  saveLeadName,
  saveSession,
  wantsShopInfo,
} from '../_shared/db.ts'
import { BARBER_TOOLS, runBarberTool, systemPromptBarber } from '../_shared/barber-tools.ts'
import { loadMimoConfig, mimoChat, type ChatMessage } from '../_shared/mimo.ts'
import { resolveUazConfig } from '../_shared/resolve-uaz.ts'
import {
  checkSlotAvailability,
  fetchAvailableSlots,
  filterPastSlots,
  rotateBarberQueue,
  todaySaoPaulo,
} from '../_shared/slots.ts'
import { humanReply, normalizePhone, sendPresence } from '../_shared/uazapi.ts'

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

/**
 * Destino da resposta = conversa (chatid), NUNCA owner da instância.
 * payload.phone / payload.owner costumam ser o número conectado (você) — não o cliente.
 */
function extractPhone(msg: UazMessage, payload: Record<string, unknown>): string {
  const chat =
    payload.chat && typeof payload.chat === 'object'
      ? (payload.chat as Record<string, unknown>)
      : {}

  // chatid = conversa com quem deve receber a resposta
  const candidates: unknown[] = [
    msg.chatid,
    msg.sender_pn,
    msg.sender,
    chat.wa_chatid,
    chat.phone,
    chat.id,
    // NÃO usar payload.owner / payload.phone / instance phone
  ]

  for (const c of candidates) {
    const phone = jidToPhone(c)
    if (phone) return phone
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

async function reply(
  phone: string,
  text: string,
  db: ReturnType<typeof getServiceClient>,
  config?: { baseUrl: string; token: string } | null,
) {
  let uaz = config
  if (!uaz) {
    const resolved = await resolveUazConfig(db)
    if (!resolved.config) {
      console.error('reply uaz config', resolved.error)
      throw new Error(resolved.error || 'UAZAPI não configurada para enviar mensagens')
    }
    uaz = resolved.config
  }
  const result = await humanReply(phone, text, uaz)
  if (!result.ok) {
    console.error('reply send failed', result.error)
    throw new Error(result.error || 'Falha ao enviar WhatsApp')
  }
}

function wantsRestart(text: string): boolean {
  const t = normalizeMatch(text)
  return [
    'recomecar',
    'comecar de novo',
    'esquece',
    'deixa pra la',
    'deixa pra la',
    'voltar',
    'cancela tudo',
  ].includes(t)
}

// ─── Flow handlers (só se a IA estiver indisponível) ─────────────────────────

async function handleFallbackIntent(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
): Promise<string> {
  const t = normalizeMatch(text)

  if (
    t.includes('agendar') ||
    t.includes('marcar') ||
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

  const lines = list.map(
    (s: { nome: string; preco: number; duracao_minutos: number }) =>
      `• *${s.nome}* — R$ ${Number(s.preco).toFixed(2)} (${s.duracao_minutos} min)`,
  )
  return [
    'Beleza. Qual serviço você quer?',
    '',
    ...lines,
    '',
    'Pode falar o nome (tipo "corte").',
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
  const { data: barbers } = await db
    .from('barbeiros')
    .select('id, nome')
    .order('nome')

  const list = (barbers || []).filter((b: { ativo?: boolean; active?: boolean }) =>
    b.ativo !== false && b.active !== false
  )

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
    barbers: list.map((b: { id: string; nome: string }) => ({ id: b.id, nome: b.nome })),
  })

  if (list.length === 1) {
    return [
      `Beleza, *${service.nome}*.`,
      `Quer ser atendido pelo *${list[0].nome}*? Pode dizer sim, ou "qualquer um" se tanto fizer.`,
    ].join(' ')
  }

  const names = list.map((b: { nome: string }) => b.nome).join(', ')
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
    const fallback = filterPastSlots(data, await fallbackSlots(db, data, barbeiro_id))
    if (!fallback.length) {
      return [
        `Sem horários livres em *${formatDateBR(data)}*`,
        barbeiro_id && context.barbeiro_nome
          ? `(com *${context.barbeiro_nome}*)`
          : '',
        '',
        'Quer tentar *outra data*?',
      ].filter(Boolean).join('\n')
    }
    await saveSession(db, phone, 'choose_time', {
      ...context,
      data,
      slots: fallback,
    })
    return formatSlotList(data, fallback, context.barbeiro_nome as string | undefined)
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

async function fallbackSlots(
  db: ReturnType<typeof getServiceClient>,
  data: string,
  barbeiroId?: string | null,
): Promise<string[]> {
  const slotHours = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  ]
  let q = db
    .from('agendamentos')
    .select('horario, barbeiro_id')
    .eq('data', data)
    .in('status', ['pendente', 'confirmado'])
  const { data: busy } = await q

  const taken = new Set<string>()
  for (const b of busy || []) {
    if (barbeiroId && b.barbeiro_id && b.barbeiro_id !== barbeiroId) continue
    taken.add(String(b.horario).slice(0, 5))
  }
  return slotHours.filter((h) => !taken.has(h))
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

async function handleChooseTime(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  context: Record<string, unknown>,
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

  await saveSession(db, phone, 'confirm', {
    ...context,
    horario,
    barbeiro_id: check.barbeiro_id,
    barbeiro_nome: check.barbeiro_nome || context.barbeiro_nome,
    from_rotation: check.from_rotation || Boolean(context.from_rotation),
  })

  return [
    'Posso fechar assim?',
    '',
    `Serviço: ${context.servico_nome}`,
    `Barbeiro: ${check.barbeiro_nome || context.barbeiro_nome || 'A definir'}`,
    `Data: ${formatDateBR(String(context.data))}`,
    `Horário: ${horario}`,
    '',
    'Se tiver certo, me confirma com um *sim*.',
  ].join('\n')
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

  const yes =
    t === '1' ||
    t === 's' ||
    t === 'sim' ||
    t === 'yes' ||
    t === 'ok' ||
    t === 'pode' ||
    t === 'fechado' ||
    t === 'confirmo' ||
    t.includes('confirm') ||
    t.includes('pode sim') ||
    t.includes('pode marcar')

  if (!yes) {
    return 'Posso confirmar? Responde *sim* ou *não*.'
  }

  // Revalida no momento do commit (evita corrida / horário que encheu)
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
        'Que tal outro horário?',
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

  const payload = {
    cliente_id: client.id,
    servico_id: context.servico_id as string,
    barbeiro_id: check.barbeiro_id,
    data: context.data as string,
    horario: context.horario as string,
    status: 'pendente',
  }

  const { data: appt, error } = await db
    .from('agendamentos')
    .insert(payload)
    .select('id')
    .single()

  if (!error && (context.from_rotation || check.from_rotation) && check.barbeiro_id) {
    try {
      await rotateBarberQueue(db, check.barbeiro_id)
    } catch (e) {
      console.warn('rotateBarberQueue', e)
    }
  }

  await resetSession(db, phone)

  if (error) {
    return `Não deu pra agendar: ${error.message}\n\n` + aftercareText()
  }

  return [
    '✅ *Agendamento confirmado!*',
    '',
    `Serviço: ${context.servico_nome}`,
    `Barbeiro: ${check.barbeiro_nome || context.barbeiro_nome || 'A definir'}`,
    `Data: ${formatDateBR(String(context.data))}`,
    `Horário: ${String(context.horario).slice(0, 5)}`,
    `Cód: ${String(appt?.id || '').slice(0, 8)}`,
    '',
    aftercareText(),
  ].join('\n')
}

async function processWithMimo(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  leadName?: string | null,
): Promise<string | null> {
  const config = await loadMimoConfig(db)
  if (!config) return null

  const session = await getSession(db, phone)
  const prevHistory = Array.isArray(session.context.history)
    ? (session.context.history as ChatMessage[])
    : []

  // Compact prior turns — keep more history so o contexto da conversa se mantém
  const prior = prevHistory
    .filter((m) => m && m.role)
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
  if (c.servico_nome) ctxLines.push(`serviço em papo: ${c.servico_nome}`)
  if (c.barbeiro_nome) ctxLines.push(`barbeiro: ${c.barbeiro_nome}`)
  if (c.data) ctxLines.push(`data: ${c.data}`)
  if (c.horario) ctxLines.push(`horário: ${c.horario}`)
  if (session.step && session.step !== 'menu' && session.step !== 'chat' && session.step !== 'ask_name') {
    ctxLines.push(`estava no passo interno: ${session.step}`)
  }
  if (leadName && isKnownLeadName(leadName)) {
    ctxLines.push(`nome do lead (salvo): ${leadName}`)
  }

  // Agenda do lead (agendamentos já marcados)
  let apptCtx = ''
  try {
    const upcoming = await fetchUpcomingAppointments(db, phone)
    apptCtx = '\nAgenda do lead:\n' + appointmentsContextLines(upcoming).join('\n')
  } catch (e) {
    console.warn('fetchUpcomingAppointments failed', e)
  }

  const system = systemPromptBarber() +
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

  for (let round = 0; round < 8; round++) {
    const res = await mimoChat({
      config,
      messages,
      tools: BARBER_TOOLS,
      tool_choice: 'auto',
      temperature: 0.4,
      max_completion_tokens: 500,
    })

    if (!res.ok || !res.message) {
      console.error('MiMo error', res.error)
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
      for (const tc of msg.tool_calls) {
        const fnName = tc.function?.name || ''
        const fnArgs = tc.function?.arguments || '{}'
        // tools usam o nome salvo do lead, não o perfil WhatsApp
        const toolResult = await runBarberTool(db, phone, fnName, fnArgs, leadName || undefined)
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: fnName,
          content: toolResult,
        })
      }
      continue
    }

    let answer = String(msg.content || '').trim()
    if (!answer) {
      answer = 'Não entendi direito. Pode repetir?'
    }
    answer = humanizeOutbound(answer, { senderName: leadName, userText: text })

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

    await saveSession(db, phone, 'chat', {
      history: toStore,
      mode: 'mimo',
      lead_name: leadName || undefined,
    })
    return answer
  }

  return 'Me confundi um pouco. Pode me dizer de novo o que você precisa?'
}

async function processMessage(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  _whatsappProfileName?: string,
): Promise<string> {
  const trimmed = text.trim()
  // Nome do perfil WhatsApp NÃO é usado — só o que o lead informou e está em clientes.nome
  let leadName = await getLeadDisplayName(db, phone)
  const session = await getSession(db, phone)
  const shop = await fetchShopName(db)

  // ── Lead ainda não informou o nome ────────────────────────────────────────
  if (session.step === 'ask_name' || !leadName) {
    // Já está responder o nome
    if (session.step === 'ask_name' && trimmed && isPlausiblePersonName(trimmed)) {
      try {
        leadName = await saveLeadName(db, phone, trimmed)
      } catch (e) {
        console.error('saveLeadName', e)
        return 'Não consegui salvar o nome. Pode digitar de novo só o nome?'
      }
      let appts: Awaited<ReturnType<typeof fetchUpcomingAppointments>> = []
      try {
        appts = await fetchUpcomingAppointments(db, phone)
      } catch {
        /* ignore */
      }
      const hi = afterNameGreeting(leadName, shop, appts)
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

    // Ainda sem nome válido: pede
    if (!leadName) {
      // se mandou cumprimento + já vamos pedir nome
      if (session.step === 'ask_name' && trimmed && !isPlausiblePersonName(trimmed) && !isGreetingOnly(trimmed)) {
        return 'Pode me falar só o seu *nome*? Assim te chamo direito nas próximas conversas.'
      }
      const ask = askNameText(shop)
      await saveSession(db, phone, 'ask_name', {
        mode: 'mimo',
        awaiting_name: true,
      })
      return ask
    }
  }

  // ── Cumprimento puro com nome já salvo ────────────────────────────────────
  if (!trimmed || isGreetingOnly(trimmed)) {
    let appts: Awaited<ReturnType<typeof fetchUpcomingAppointments>> = []
    try {
      appts = await fetchUpcomingAppointments(db, phone)
    } catch (e) {
      console.warn('greeting appointments', e)
    }
    const hi = greetingWithAppointments(leadName, shop, appts)
    try {
      const prev = Array.isArray(session.context.history)
        ? (session.context.history as ChatMessage[])
        : []
      const history = [
        ...prev,
        { role: 'user' as const, content: trimmed || 'oi' },
        { role: 'assistant' as const, content: hi },
      ].slice(-28)
      await saveSession(db, phone, 'chat', {
        history,
        mode: 'mimo',
        lead_name: leadName,
        has_appointments: appts.length > 0,
        upcoming_count: appts.length,
      })
    } catch {
      /* ignore */
    }
    return hi
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

  // SEMPRE tenta a IA primeiro — contexto e memória do chat
  try {
    const ai = await processWithMimo(db, phone, trimmed, leadName)
    if (ai) return humanizeOutbound(ai, { senderName: leadName, userText: trimmed })
  } catch (e) {
    console.error('processWithMimo failed', e)
  }

  // Sem IA: só então usa fluxo guiado por intent / passo (ainda em prosa)
  const wizardSteps = [
    'choose_service',
    'choose_barber',
    'choose_date',
    'choose_time',
    'confirm',
    'cancel_pick',
  ]

  let fallback = ''
  if (wizardSteps.includes(step) && context.mode !== 'mimo') {
    switch (step) {
      case 'choose_service':
        fallback = await handleChooseService(db, phone, trimmed, context)
        break
      case 'choose_barber':
        fallback = await handleChooseBarber(db, phone, trimmed, context)
        break
      case 'choose_date':
        fallback = await handleChooseDate(db, phone, trimmed, context)
        break
      case 'choose_time':
        fallback = await handleChooseTime(db, phone, trimmed, context)
        break
      case 'confirm':
        fallback = await handleConfirm(db, phone, trimmed, context, leadName || undefined)
        break
      case 'cancel_pick':
        fallback = await handleCancelPick(db, phone, trimmed, context)
        break
    }
  } else {
    switch (step) {
      case 'choose_service':
        fallback = await handleChooseService(db, phone, trimmed, context)
        break
      case 'choose_barber':
        fallback = await handleChooseBarber(db, phone, trimmed, context)
        break
      case 'choose_date':
        fallback = await handleChooseDate(db, phone, trimmed, context)
        break
      case 'choose_time':
        fallback = await handleChooseTime(db, phone, trimmed, context)
        break
      case 'confirm':
        fallback = await handleConfirm(db, phone, trimmed, context, leadName || undefined)
        break
      case 'cancel_pick':
        fallback = await handleCancelPick(db, phone, trimmed, context)
        break
      default:
        fallback = await handleFallbackIntent(db, phone, trimmed)
    }
  }

  return humanizeOutbound(fallback || 'Me conta o que você precisa.', {
    senderName: leadName,
    userText: trimmed,
  })
}

// ─── HTTP entry ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Health check
  if (req.method === 'GET') {
    return jsonResponse({ ok: true, service: 'whatsapp-webhook', ai: 'mimo' })
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
      return jsonResponse({ ok: true, ignored: event })
    }

    const messages = collectMessages(payload)
    const ownerPhone = instanceOwnerPhone(payload)

    const db = getServiceClient()
    const active = await isBotActive(db)
    if (!active) {
      return jsonResponse({ ok: true, bot: 'disabled' })
    }

    const results: { phone: string; ok: boolean; note?: string }[] = []

    for (const msg of messages) {
      if (shouldIgnore(msg)) {
        results.push({ phone: '', ok: true, note: 'ignored_fromMe_or_group' })
        continue
      }

      const phone = extractPhone(msg, payload)
      if (!phone) {
        console.warn('whatsapp-webhook: no customer phone', {
          chatid: msg.chatid,
          sender: msg.sender,
          sender_pn: msg.sender_pn,
          owner: ownerPhone,
        })
        results.push({ phone: '', ok: false, note: 'no_phone' })
        continue
      }

      // Só responder no número da instância se a conversa for realmente com ele
      // (teste do dono). Nunca usar owner só porque veio no root do payload.
      if (ownerPhone && phone === ownerPhone) {
        console.info('whatsapp-webhook: reply to instance owner (self-test or same number)', phone)
      }

      const text = extractText(msg)
      // Perfil WhatsApp NÃO é mais usado para chamar o lead
      const uazCfg = await beginTyping(phone, db, 15000)

      if (!text) {
        const answer = await processMessage(db, phone, 'oi')
        await reply(phone, answer, db, uazCfg)
        results.push({ phone, ok: true })
        continue
      }

      const answer = await processMessage(db, phone, text)
      await reply(phone, answer, db, uazCfg)
      results.push({ phone, ok: true })
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
