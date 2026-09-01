import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import {
  aftercareText,
  afterNameGreeting,
  appointmentsContextLines,
  applyBarberRating,
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
  isAffirmative,
  isBotActive,
  isGreetingOnly,
  isKnownLeadName,
  isNegative,
  isPlausiblePersonName,
  isBookingStep,
  logBotEvent,
  isShopOpenNow,
  closedShopNotice,
  formatServicePriceList,
  punctualityConfirmText,
  askNameAgainText,
  looksLikeBookingUtterance,
  matchByName,
  matchSlot,
  normalizeMatch,
  parseDateBR,
  parseRatingScore,
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
  createAppointmentAtomic,
  fetchAvailableSlots,
  filterPastSlots,
  listBookableBarbers,
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
  const result = await humanReply(phone, out, uaz)
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
    'começar de novo',
    'cancela tudo',
    'reset',
    'limpar',
    '/start',
  ].includes(t)
}

async function handleRateAsk(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  context: Record<string, unknown>,
  leadName?: string | null,
): Promise<string> {
  const barberName = String(context.barbeiro_nome || 'seu barbeiro')

  if (isNegative(text)) {
    await resetSession(db, phone)
    const name =
      leadName && isKnownLeadName(leadName) ? leadName.trim().split(/\s+/)[0] : null
    return name
      ? `Tranquilo, ${name}. Obrigado pela visita — qualquer coisa, me chama por aqui.`
      : 'Tranquilo. Obrigado pela visita — qualquer coisa, me chama por aqui.'
  }

  if (isAffirmative(text)) {
    await saveSession(db, phone, 'rate_score', {
      ...context,
      mode: 'rating',
    })
    return [
      `Fechou! Então me conta: de *1 a 5*, como foi o atendimento com o *${barberName}*?`,
      '',
      'Pode mandar só o número, tipo *5* se foi top.',
    ].join('\n')
  }

  return [
    `Sem problema nenhum se preferir não avaliar — é só falar *não*.`,
    `Se quiser deixar uma notinha do *${barberName}*, responde *sim*.`,
  ].join('\n')
}

async function handleRateScore(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  context: Record<string, unknown>,
  leadName?: string | null,
): Promise<string> {
  if (isNegative(text)) {
    await resetSession(db, phone)
    return 'Beleza, sem avaliação mesmo. Valeu pela visita!'
  }

  const nota = parseRatingScore(text)
  if (nota == null) {
    return 'Me manda uma nota de *1* a *5*? Pode ser só o número.'
  }

  const agendamentoId = String(context.agendamento_id || '')
  const barbeiroId = String(context.barbeiro_id || '')
  if (!agendamentoId || !barbeiroId) {
    await resetSession(db, phone)
    return 'Deu um probleminha pra registrar a nota. Valeu mesmo assim!'
  }

  const result = await applyBarberRating(db, {
    agendamentoId,
    barbeiroId,
    clienteId: (context.cliente_id as string) || null,
    nota,
    origem: 'whatsapp',
  })

  const name =
    leadName && isKnownLeadName(leadName) ? leadName.trim().split(/\s+/)[0] : null
  const barberName = String(context.barbeiro_nome || 'barbeiro')

  if (!result.ok) {
    await resetSession(db, phone)
    if (result.error === 'Já avaliado') {
      return name
        ? `Essa visita já tinha nota, ${name}. Valeu demais!`
        : 'Essa visita já tinha nota. Valeu demais!'
    }
    console.error('applyBarberRating', result.error)
    return 'Não consegui salvar agora, mas obrigado pelo feedback!'
  }

  if (nota <= 2) {
    await saveSession(db, phone, 'rate_comment', {
      ...context,
      nota,
      mode: 'rating',
    })
    return name
      ? `Poxa, ${name}, sinto muito por isso. O que você não gostou especificamente pra gente melhorar?`
      : 'Poxa, sinto muito por isso. O que você não gostou especificamente pra gente melhorar?'
  }

  if (nota === 3) {
    await saveSession(db, phone, 'rate_comment', {
      ...context,
      nota,
      mode: 'rating',
    })
    return 'Obrigada pela nota. Tem alguma sugestão pra gente melhorar o atendimento?'
  }

  await resetSession(db, phone)
  const thanks = name
    ? `Que maravilha que você gostou, ${name}!`
    : 'Que maravilha que você gostou!'
  return [
    thanks,
    `Na próxima vez, se quiser, já agendamos direto com o *${barberName}* pra manter o padrão do seu corte.`,
    '',
    'Qualquer coisa, tô por aqui.',
  ].join('\n')
}

async function handleRateComment(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  context: Record<string, unknown>,
  leadName?: string | null,
): Promise<string> {
  const comentario = text.trim().slice(0, 800)
  const agendamentoId = String(context.agendamento_id || '')
  if (agendamentoId && comentario) {
    await db.from('avaliacoes').update({ comentario }).eq('agendamento_id', agendamentoId)
  }
  await resetSession(db, phone)
  const name =
    leadName && isKnownLeadName(leadName) ? leadName.trim().split(/\s+/)[0] : null
  const nota = Number(context.nota || 0)
  if (nota <= 2) {
    return name
      ? `Obrigada por contar, ${name}. Vou levar isso pra equipe. Qualquer coisa, me chama.`
      : 'Obrigada por contar. Vou levar isso pra equipe. Qualquer coisa, me chama.'
  }
  return name
    ? `Anotei, ${name}. Valeu demais pelo retorno!`
    : 'Anotei. Valeu demais pelo retorno!'
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

  return [
    `Serviço: ${context.servico_nome}`,
    `Barbeiro: ${booked.barbeiro_nome || check.barbeiro_nome || context.barbeiro_nome || 'A definir'}`,
    `Data: ${formatDateBR(String(context.data))}`,
    `Horário: ${booked.horario}`,
    '',
    punctualityConfirmText(),
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

  let shopOpen = true
  try {
    shopOpen = await isShopOpenNow(db)
  } catch {
    shopOpen = true
  }

  const bookingLocked = isBookingStep(session.step)
  const system = systemPromptBarber() +
    (bookingLocked
      ? `\nPASSO TRAVADO: ${session.step}. Não peça o nome. Não mude de assunto. Continue este passo.`
      : '') +
    (shopOpen
      ? ''
      : `\nLOJA FECHADA AGORA: ${closedShopNotice()} Avise isso e continue o agendamento para amanhã/outras datas.`) +
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
  let toolChoice: 'auto' | { type: 'function'; function: { name: string } } = 'auto'
  if (!isGreetingOnly(text)) {
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

  let usedTools: string[] = []
  for (let round = 0; round < 8; round++) {
    const res = await mimoChat({
      config,
      messages,
      tools: BARBER_TOOLS,
      tool_choice: round === 0 ? toolChoice : 'auto',
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
        usedTools.push(fnName)
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
      logBotEvent('bot_fallback', { reason: 'empty_mimo', phone: phone.slice(-4), tools: usedTools })
      return null
    }

    const fresh = await getSession(db, phone)
    const lastSlots = Array.isArray(fresh.context.last_slots)
      ? (fresh.context.last_slots as string[]).map((h) => String(h).slice(0, 5))
      : []
    if (lastSlots.length) {
      const mentioned = [...answer.matchAll(/\b(\d{1,2})[:hH](\d{2})\b/g)]
      const invented = mentioned.some((m) => {
        const hm = `${m[1].padStart(2, '0')}:${m[2]}`
        return !lastSlots.includes(hm)
      })
      if (invented) {
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

    const keepStep = isBookingStep(session.step) ? session.step : 'chat'
    await saveSession(db, phone, keepStep, {
      history: toStore,
      mode: 'mimo',
      lead_name: leadName || undefined,
    })
    return answer
  }

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
  // Nome do perfil WhatsApp NÃO é usado — só o que o lead informou e está em clientes.nome
  let leadName = await getLeadDisplayName(db, phone)
  const session = await getSession(db, phone)
  const shop = await fetchShopName(db)

  // ── Captura de contato + nome (não bloqueia a conversa) ────────────────────
  await findOrCreateClientByPhone(db, phone).catch(() => null)
  leadName = await getLeadDisplayName(db, phone)

  // ── Avaliação pós-corte (antes da captura de nome / IA) ────────────────────
  if (session.step === 'rate_ask') {
    return handleRateAsk(db, phone, trimmed, session.context, leadName)
  }
  if (session.step === 'rate_score') {
    return handleRateScore(db, phone, trimmed, session.context, leadName)
  }
  if (session.step === 'rate_comment') {
    return handleRateComment(db, phone, trimmed, session.context, leadName)
  }

  if (isBookingStep(session.step)) {
    return dispatchWizard(db, phone, trimmed, session, leadName)
  }

  let namedBarber = false
  try {
    const cached = Array.isArray(session.context.last_barbers)
      ? (session.context.last_barbers as { nome: string }[])
      : []
    const barbers = cached.length ? cached : await listBookableBarbers(db)
    namedBarber = Boolean(matchByName(trimmed, barbers))
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
      try {
        if (!(await isShopOpenNow(db))) hi = `${hi}\n\n${closedShopNotice()}`
      } catch {
        /* ignore */
      }
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
        try {
          if (!(await isShopOpenNow(db))) hi = `${hi}\n\n${closedShopNotice()}`
        } catch {
          /* ignore */
        }
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
    let appts: Awaited<ReturnType<typeof fetchUpcomingAppointments>> = []
    try {
      appts = await fetchUpcomingAppointments(db, phone)
    } catch (e) {
      console.warn('greeting appointments', e)
    }
    let hi = greetingWithAppointments(leadName, shop, appts)
    try {
      if (!(await isShopOpenNow(db))) hi = `${hi}\n\n${closedShopNotice()}`
    } catch {
      /* ignore */
    }
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

  if (!isBookingStep(step)) {
    try {
      const ai = await processWithMimo(db, phone, trimmed, leadName)
      if (ai) return ai
    } catch (e) {
      console.error('processWithMimo failed', e)
    }
  }

  const fallback = await dispatchWizard(db, phone, trimmed, session, leadName)
  if (!fallback) {
    logBotEvent('bot_fallback', { reason: 'fallback_intent', phone: phone.slice(-4), step })
  }
  return fallback || 'Me conta o que você precisa.'
}

async function dispatchWizard(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  trimmed: string,
  session: { step: string; context: Record<string, unknown> },
  leadName?: string | null,
): Promise<string> {
  const { step, context } = session
  switch (step) {
    case 'choose_service':
      return handleChooseService(db, phone, trimmed, context)
    case 'choose_barber':
      return handleChooseBarber(db, phone, trimmed, context)
    case 'choose_date':
      return handleChooseDate(db, phone, trimmed, context)
    case 'choose_time':
      return handleChooseTime(db, phone, trimmed, context)
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
      return jsonResponse({ ok: true, ignored: event })
    }

    const messages = collectMessages(payload)
    const ownerPhone = instanceOwnerPhone(payload)

    const db = getServiceClient()
    const uazReady = await resolveUazConfig(db)
    if (!uazReady.config) {
      return jsonResponse({ ok: false, error: uazReady.error || 'UAZAPI inválida' }, 503)
    }
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
          owner: ownerPhone,
        })
        results.push({ phone: '', ok: false, note: 'no_phone' })
        continue
      }

      await db.rpc('lock_whatsapp_phone', { p_phone: phone }).catch(() => null)
      try {
        if (ownerPhone && phone === ownerPhone) {
          console.info('whatsapp-webhook: reply to instance owner (self-test or same number)', phone)
        }

        const text = extractText(msg)
        const uazCfg = await beginTyping(phone, db, 15000)
        if (!uazCfg) {
          results.push({ phone, ok: false, note: 'uaz_unavailable' })
          continue
        }

        if (!text) {
          const sess = await getSession(db, phone)
          const hist = Array.isArray(sess.context.history) ? sess.context.history : []
          if (hist.length) {
            results.push({ phone, ok: true, note: 'empty_ignored' })
            continue
          }
          const leadName = await getLeadDisplayName(db, phone)
          const answer = await processMessage(db, phone, 'oi')
          await reply(phone, answer, db, uazCfg, { senderName: leadName, userText: 'oi' })
          results.push({ phone, ok: true })
          continue
        }

        const leadName = await getLeadDisplayName(db, phone)
        const answer = await processMessage(db, phone, text)
        await reply(phone, answer, db, uazCfg, { senderName: leadName, userText: text })
        results.push({ phone, ok: true })
      } finally {
        await db.rpc('unlock_whatsapp_phone', { p_phone: phone }).catch(() => null)
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
