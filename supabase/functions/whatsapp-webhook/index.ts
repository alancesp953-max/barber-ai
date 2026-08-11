import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import {
  findOrCreateClientByPhone,
  formatDateBR,
  getServiceClient,
  getSession,
  isBotActive,
  menuText,
  parseDateBR,
  resetSession,
  saveSession,
} from '../_shared/db.ts'
import { BARBER_TOOLS, runBarberTool, systemPromptBarber } from '../_shared/barber-tools.ts'
import { loadMimoConfig, mimoChat, type ChatMessage } from '../_shared/mimo.ts'
import { resolveUazConfig } from '../_shared/resolve-uaz.ts'
import { normalizePhone, sendText } from '../_shared/uazapi.ts'

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

async function reply(phone: string, text: string, db: ReturnType<typeof getServiceClient>) {
  const resolved = await resolveUazConfig(db)
  if (!resolved.config) {
    console.error('reply uaz config', resolved.error)
    throw new Error(resolved.error || 'UAZAPI não configurada para enviar mensagens')
  }
  const result = await sendText(phone, text, resolved.config)
  if (!result.ok) {
    console.error('reply send failed', result.error)
    throw new Error(result.error || 'Falha ao enviar WhatsApp')
  }
}

// ─── Flow handlers ───────────────────────────────────────────────────────────

async function handleMenu(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
): Promise<string> {
  const t = text.trim().toLowerCase()

  if (t === '1' || t.includes('agendar')) {
    const { data: services } = await db
      .from('servicos')
      .select('id, nome, preco, duracao_minutos')
      .order('nome')

    const list = (services || []).filter((s: { ativo?: boolean }) => s.ativo !== false)
    if (!list.length) {
      await resetSession(db, phone)
      return 'Nenhum serviço disponível no momento. Tente mais tarde.'
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
      (s: { nome: string; preco: number; duracao_minutos: number }, i: number) =>
        `${i + 1}. ${s.nome} — R$ ${Number(s.preco).toFixed(2)} (${s.duracao_minutos} min)`,
    )
    return ['Qual *serviço*?', '', ...lines, '', 'Responda com o *número*.', '0️⃣ Menu'].join('\n')
  }

  if (t === '2' || t.includes('meus')) {
    return await listAppointments(db, phone)
  }

  if (t === '3' || t.includes('cancel')) {
    return await startCancel(db, phone)
  }

  return menuText()
}

async function listAppointments(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
): Promise<string> {
  const client = await findOrCreateClientByPhone(db, phone)
  const today = new Date().toISOString().slice(0, 10)

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
    return 'Você não tem horários futuros.\n\n' + menuText()
  }

  const lines = data.map((a: {
    data: string
    horario: string
    status: string
    servicos: { nome: string } | { nome: string }[] | null
    barbeiros: { nome: string } | { nome: string }[] | null
  }, i: number) => {
    const serv = Array.isArray(a.servicos) ? a.servicos[0] : a.servicos
    const barb = Array.isArray(a.barbeiros) ? a.barbeiros[0] : a.barbeiros
    return `${i + 1}. ${formatDateBR(a.data)} ${String(a.horario).slice(0, 5)} — ${serv?.nome || 'Serviço'}${barb?.nome ? ` com ${barb.nome}` : ''} (${a.status})`
  })

  return ['*Seus horários:*', '', ...lines, '', menuText()].join('\n')
}

async function startCancel(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
): Promise<string> {
  const client = await findOrCreateClientByPhone(db, phone)
  const today = new Date().toISOString().slice(0, 10)

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
    return 'Nada para cancelar.\n\n' + menuText()
  }

  const items = data.map((a: {
    id: string
    data: string
    horario: string
    servicos: { nome: string } | { nome: string }[] | null
  }) => {
    const serv = Array.isArray(a.servicos) ? a.servicos[0] : a.servicos
    return {
      id: a.id,
      label: `${formatDateBR(a.data)} ${String(a.horario).slice(0, 5)} — ${serv?.nome || 'Serviço'}`,
    }
  })

  await saveSession(db, phone, 'cancel_pick', { cancelItems: items })

  const lines = items.map((it: { label: string }, i: number) => `${i + 1}. ${it.label}`)
  return ['Qual agendamento cancelar?', '', ...lines, '', 'Responda com o *número*.', '0️⃣ Menu'].join('\n')
}

async function handleCancelPick(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  context: Record<string, unknown>,
): Promise<string> {
  if (text.trim() === '0') {
    await resetSession(db, phone)
    return menuText()
  }

  const items = (context.cancelItems as { id: string; label: string }[]) || []
  const idx = parseInt(text.trim(), 10) - 1
  if (Number.isNaN(idx) || idx < 0 || idx >= items.length) {
    return 'Número inválido. Escolha um da lista ou 0 para o menu.'
  }

  const item = items[idx]
  const { error } = await db
    .from('agendamentos')
    .update({ status: 'cancelado' })
    .eq('id', item.id)

  await resetSession(db, phone)

  if (error) {
    return `Não consegui cancelar: ${error.message}\n\n` + menuText()
  }

  return `✅ Cancelado:\n${item.label}\n\n` + menuText()
}

async function handleChooseService(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  context: Record<string, unknown>,
): Promise<string> {
  if (text.trim() === '0') {
    await resetSession(db, phone)
    return menuText()
  }

  const services = (context.services as { id: string; nome: string; preco: number; duracao: number }[]) || []
  const idx = parseInt(text.trim(), 10) - 1
  if (Number.isNaN(idx) || idx < 0 || idx >= services.length) {
    return 'Número inválido. Escolha o serviço ou 0 para o menu.'
  }

  const service = services[idx]
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
    return [
      `Serviço: *${service.nome}*`,
      '',
      'Envie a *data* (ex: 15/08 ou 15/08/2026)',
      '0️⃣ Menu',
    ].join('\n')
  }

  await saveSession(db, phone, 'choose_barber', {
    ...context,
    servico_id: service.id,
    servico_nome: service.nome,
    barbers: list.map((b: { id: string; nome: string }) => ({ id: b.id, nome: b.nome })),
  })

  const lines = list.map((b: { nome: string }, i: number) => `${i + 1}. ${b.nome}`)
  lines.push(`${list.length + 1}. Qualquer barbeiro`)

  return [
    `Serviço: *${service.nome}*`,
    '',
    'Qual *barbeiro*?',
    '',
    ...lines,
    '',
    'Responda com o *número*.',
    '0️⃣ Menu',
  ].join('\n')
}

async function handleChooseBarber(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  context: Record<string, unknown>,
): Promise<string> {
  if (text.trim() === '0') {
    await resetSession(db, phone)
    return menuText()
  }

  const barbers = (context.barbers as { id: string; nome: string }[]) || []
  const idx = parseInt(text.trim(), 10) - 1
  const anyOption = barbers.length

  if (Number.isNaN(idx) || idx < 0 || idx > anyOption) {
    return 'Número inválido. Escolha o barbeiro ou 0 para o menu.'
  }

  let barbeiro_id: string | null = null
  let barbeiro_nome: string | null = 'Qualquer'

  if (idx < barbers.length) {
    barbeiro_id = barbers[idx].id
    barbeiro_nome = barbers[idx].nome
  }

  await saveSession(db, phone, 'choose_date', {
    ...context,
    barbeiro_id,
    barbeiro_nome,
  })

  return [
    `Barbeiro: *${barbeiro_nome}*`,
    '',
    'Envie a *data* (ex: 15/08 ou 15/08/2026)',
    '0️⃣ Menu',
  ].join('\n')
}

async function handleChooseDate(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  context: Record<string, unknown>,
): Promise<string> {
  if (text.trim() === '0') {
    await resetSession(db, phone)
    return menuText()
  }

  const data = parseDateBR(text)
  if (!data) {
    return 'Data inválida. Use DD/MM ou DD/MM/AAAA. Ou 0 para o menu.'
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const chosen = new Date(data + 'T12:00:00')
  if (chosen < today) {
    return 'A data não pode ser no passado. Envie outra data.'
  }

  const servico_id = context.servico_id as string
  const barbeiro_id = (context.barbeiro_id as string) || null

  const { data: slots, error } = await db.rpc('get_available_slots', {
    p_data: data,
    p_servico_id: servico_id,
    p_barbeiro_id: barbeiro_id,
  })

  if (error) {
    // Fallback: simple generation if RPC missing
    const fallback = await fallbackSlots(db, data)
    if (!fallback.length) {
      return `Sem horários em ${formatDateBR(data)}. Envie *outra data* ou 0 para menu.`
    }
    await saveSession(db, phone, 'choose_time', {
      ...context,
      data,
      slots: fallback,
    })
    return formatSlotList(data, fallback)
  }

  const list = (slots as { horario: string }[] | null)?.map((s) => s.horario) || []
  if (!list.length) {
    return `Sem horários em ${formatDateBR(data)}. Envie *outra data* ou 0 para menu.`
  }

  await saveSession(db, phone, 'choose_time', {
    ...context,
    data,
    slots: list,
  })

  return formatSlotList(data, list)
}

async function fallbackSlots(
  db: ReturnType<typeof getServiceClient>,
  data: string,
): Promise<string[]> {
  const slotHours = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30']
  const { data: busy } = await db
    .from('agendamentos')
    .select('horario')
    .eq('data', data)
    .in('status', ['pendente', 'confirmado'])

  const taken = new Set(
    (busy || []).map((b: { horario: string }) => String(b.horario).slice(0, 5)),
  )
  return slotHours.filter((h) => !taken.has(h))
}

function formatSlotList(data: string, slots: string[]): string {
  const lines = slots.map((h, i) => `${i + 1}. ${h.slice(0, 5)}`)
  return [
    `Horários livres em *${formatDateBR(data)}*:`,
    '',
    ...lines,
    '',
    'Responda com o *número* do horário.',
    '0️⃣ Menu',
  ].join('\n')
}

async function handleChooseTime(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  context: Record<string, unknown>,
): Promise<string> {
  if (text.trim() === '0') {
    await resetSession(db, phone)
    return menuText()
  }

  const slots = (context.slots as string[]) || []
  const idx = parseInt(text.trim(), 10) - 1
  if (Number.isNaN(idx) || idx < 0 || idx >= slots.length) {
    return 'Número inválido. Escolha o horário ou 0 para o menu.'
  }

  const horario = slots[idx].slice(0, 5)

  await saveSession(db, phone, 'confirm', {
    ...context,
    horario,
  })

  return [
    '*Confirmar agendamento?*',
    '',
    `Serviço: ${context.servico_nome}`,
    `Barbeiro: ${context.barbeiro_nome || 'Qualquer'}`,
    `Data: ${formatDateBR(String(context.data))}`,
    `Horário: ${horario}`,
    '',
    '1️⃣ Sim, confirmar',
    '2️⃣ Não, cancelar',
  ].join('\n')
}

async function handleConfirm(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  context: Record<string, unknown>,
  senderName?: string,
): Promise<string> {
  const t = text.trim().toLowerCase()

  if (t === '2' || t === 'n' || t === 'nao' || t === 'não' || t.includes('cancel')) {
    await resetSession(db, phone)
    return 'Agendamento não criado.\n\n' + menuText()
  }

  if (!(t === '1' || t === 's' || t === 'sim' || t.includes('confirm'))) {
    return 'Responda *1* para confirmar ou *2* para cancelar.'
  }

  const client = await findOrCreateClientByPhone(db, phone, senderName)

  const payload = {
    cliente_id: client.id,
    servico_id: context.servico_id as string,
    barbeiro_id: (context.barbeiro_id as string) || null,
    data: context.data as string,
    horario: context.horario as string,
    status: 'pendente',
  }

  const { data: appt, error } = await db
    .from('agendamentos')
    .insert(payload)
    .select('id')
    .single()

  await resetSession(db, phone)

  if (error) {
    return `Não foi possível agendar: ${error.message}\n\n` + menuText()
  }

  return [
    '✅ *Agendamento confirmado!*',
    '',
    `Serviço: ${context.servico_nome}`,
    `Barbeiro: ${context.barbeiro_nome || 'A definir'}`,
    `Data: ${formatDateBR(String(context.data))}`,
    `Horário: ${String(context.horario).slice(0, 5)}`,
    `Cód: ${String(appt?.id || '').slice(0, 8)}`,
    '',
    menuText(),
  ].join('\n')
}

async function processWithMimo(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  senderName?: string,
): Promise<string | null> {
  const config = await loadMimoConfig(db)
  if (!config) return null

  const session = await getSession(db, phone)
  const prevHistory = Array.isArray(session.context.history)
    ? (session.context.history as ChatMessage[])
    : []

  // Compact prior turns (drop huge reasoning)
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
    .slice(-14)

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPromptBarber() },
    ...prior,
    {
      role: 'user',
      content: senderName ? `[Cliente: ${senderName} | tel: ${phone}] ${text}` : text,
    },
  ]

  for (let round = 0; round < 6; round++) {
    const res = await mimoChat({
      config,
      messages,
      tools: BARBER_TOOLS,
      tool_choice: 'auto',
      temperature: 0.5,
      max_completion_tokens: 900,
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
        const toolResult = await runBarberTool(db, phone, fnName, fnArgs, senderName)
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: fnName,
          content: toolResult,
        })
      }
      continue
    }

    const answer = String(msg.content || '').trim() ||
      'Não entendi bem. Posso agendar, ver seus horários ou cancelar — o que prefere?'

    const toStore = messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        const out: ChatMessage = { role: m.role }
        if (m.content != null) out.content = typeof m.content === 'string' ? m.content.slice(0, 4000) : m.content
        if (m.tool_calls) out.tool_calls = m.tool_calls
        if (m.tool_call_id) out.tool_call_id = m.tool_call_id
        if (m.name) out.name = m.name
        return out
      })
      .slice(-16)

    await saveSession(db, phone, 'menu', { history: toStore, mode: 'mimo' })
    return answer
  }

  return 'Tive muitas etapas nessa conversa. Envie de novo o que precisa (ex: "quero agendar corte amanhã às 15h").'
}

async function processMessage(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  text: string,
  senderName?: string,
): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed) {
    return menuText()
  }

  // Clear conversation
  if (['menu', 'ajuda', 'help', 'start', '/start', 'reset', 'limpar'].includes(trimmed.toLowerCase())) {
    await resetSession(db, phone)
    // tenta resposta com IA + menu como âncora
    const withAi = await processWithMimo(db, phone, 'Oi, me mostre o que você pode fazer na barbearia.', senderName)
    return withAi || menuText()
  }

  const session = await getSession(db, phone)
  const { step, context } = session

  // Continua fluxo numérico legado se estiver no meio de um wizard
  const wizardSteps = [
    'choose_service',
    'choose_barber',
    'choose_date',
    'choose_time',
    'confirm',
    'cancel_pick',
  ]
  if (wizardSteps.includes(step) && context.mode !== 'mimo') {
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
        return handleConfirm(db, phone, trimmed, context, senderName)
      case 'cancel_pick':
        return handleCancelPick(db, phone, trimmed, context)
    }
  }

  // MiMo (IA) primeiro
  try {
    const ai = await processWithMimo(db, phone, trimmed, senderName)
    if (ai) return ai
  } catch (e) {
    console.error('processWithMimo failed', e)
  }

  // Fallback menu numérico clássico
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
      return handleConfirm(db, phone, trimmed, context, senderName)
    case 'cancel_pick':
      return handleCancelPick(db, phone, trimmed, context)
    case 'menu':
    default:
      return handleMenu(db, phone, trimmed)
  }
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
      if (!text) {
        await reply(phone, menuText(), db)
        results.push({ phone, ok: true })
        continue
      }

      const senderName = typeof msg.senderName === 'string' ? msg.senderName : undefined
      const answer = await processMessage(db, phone, text, senderName)
      await reply(phone, answer, db)
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
