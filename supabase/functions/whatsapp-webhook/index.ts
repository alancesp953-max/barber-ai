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
import { normalizePhone, sendText } from '../_shared/uazapi.ts'

type UazMessage = {
  messageid?: string
  messageidHex?: string
  chatid?: string
  fromMe?: boolean
  wasSentByApi?: boolean
  isGroup?: boolean
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

function extractPhone(msg: UazMessage, payload: Record<string, unknown>): string {
  const candidates = [
    msg.sender_pn,
    msg.sender,
    msg.chatid,
    payload.chatid as string | undefined,
    payload.phone as string | undefined,
  ]
  for (const c of candidates) {
    if (!c) continue
    const raw = String(c).split('@')[0]
    if (raw && /\d/.test(raw)) return normalizePhone(raw)
  }
  return ''
}

function shouldIgnore(msg: UazMessage): boolean {
  if (msg.fromMe === true) return true
  if (msg.wasSentByApi === true) return true
  if (msg.isGroup === true) return true
  const chat = String(msg.chatid || '')
  if (chat.includes('@g.us')) return true
  return false
}

async function reply(phone: string, text: string) {
  await sendText(phone, text)
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

  // Global shortcuts
  if (['0', 'menu', 'oi', 'olá', 'ola', 'help', 'ajuda', 'start', '/start'].includes(trimmed.toLowerCase())) {
    await resetSession(db, phone)
    return menuText()
  }

  const session = await getSession(db, phone)
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
    return jsonResponse({ ok: true, service: 'whatsapp-webhook' })
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
    if (event && !['messages', 'message', 'Messages', ''].includes(event) && payload.message == null && payload.data == null) {
      // Ignore non-message events quietly
      return jsonResponse({ ok: true, ignored: event })
    }

    // Normalize message object from various payload shapes
    let messages: UazMessage[] = []

    if (Array.isArray(payload.messages)) {
      messages = payload.messages as UazMessage[]
    } else if (payload.message && typeof payload.message === 'object' && !Array.isArray(payload.message)) {
      // might be chat message wrapper
      const pm = payload as UazMessage & Record<string, unknown>
      if (pm.text || pm.chatid || pm.sender || (payload.message as UazMessage).conversation) {
        messages = [pm as UazMessage]
      }
    } else if (payload.data && typeof payload.data === 'object') {
      const d = payload.data as Record<string, unknown>
      if (Array.isArray(d.messages)) messages = d.messages as UazMessage[]
      else messages = [d as UazMessage]
    } else {
      messages = [payload as UazMessage]
    }

    const db = getServiceClient()
    const active = await isBotActive(db)
    if (!active) {
      return jsonResponse({ ok: true, bot: 'disabled' })
    }

    const results: { phone: string; ok: boolean }[] = []

    for (const msg of messages) {
      if (shouldIgnore(msg)) continue

      const phone = extractPhone(msg, payload)
      if (!phone) continue

      const text = extractText(msg)
      if (!text) {
        await reply(phone, menuText())
        results.push({ phone, ok: true })
        continue
      }

      const senderName = msg.senderName || undefined
      const answer = await processMessage(db, phone, text, senderName)
      await reply(phone, answer)
      results.push({ phone, ok: true })
    }

    return jsonResponse({ ok: true, processed: results.length, results })
  } catch (err) {
    console.error('whatsapp-webhook error', err)
    const message = err instanceof Error ? err.message : String(err)
    return jsonResponse({ error: message }, 500)
  }
})
