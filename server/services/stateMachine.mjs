import { adminDb } from '../lib/firebaseAdmin.mjs'
import { calculateAvailableSlots, isBarberAvailableOnDate } from './availability.mjs'
import { getActiveTenantId } from './whatsappBaileysManager.mjs'

/**
 * Retorna a data atual no fuso horário do Brasil (UTC-3)
 */
export function getBrazilToday() {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const brazilDate = new Date(utc - 3 * 3600000)
  const yyyy = brazilDate.getFullYear()
  const mm = String(brazilDate.getMonth() + 1).padStart(2, '0')
  const dd = String(brazilDate.getDate()).padStart(2, '0')
  return {
    dateStr: `${yyyy}-${mm}-${dd}`,
    year: brazilDate.getFullYear(),
    month: brazilDate.getMonth(), // 0-indexed
    day: brazilDate.getDate(),
    hours: brazilDate.getHours(),
    minutes: brazilDate.getMinutes(),
    dateObj: brazilDate,
  }
}

/**
 * Normaliza e valida data a partir de expressões em português.
 * Rejeita estritamente qualquer data que já tenha passado.
 */
export function resolveDateFromText(text, allowBareNumber = false) {
  const t = (text || '').toLowerCase().trim()
  const today = getBrazilToday()
  const todayStr = today.dateStr

  // 1. Termos explicitamente no passado
  const pastTerms = ['ontem', 'anteontem', 'semana passada', 'mês passado', 'mes passado', 'ano passado']
  if (pastTerms.some((p) => t.includes(p))) {
    return {
      dateStr: null,
      displayStr: t,
      isPast: true,
      errorMsg: 'Essa data já passou! Não é possível agendar horários no passado.',
    }
  }

  // 2. "Hoje"
  if (t === 'hoje' || t.includes('hoje')) {
    return {
      dateStr: todayStr,
      displayStr: `hoje (${String(today.day).padStart(2, '0')}/${String(today.month + 1).padStart(2, '0')})`,
      isPast: false,
    }
  }

  // 3. "Amanhã"
  if (t === 'amanhã' || t === 'amanha' || t.includes('amanhã') || t.includes('amanha')) {
    const tmr = new Date(today.dateObj)
    tmr.setDate(tmr.getDate() + 1)
    const yyyy = tmr.getFullYear()
    const mm = String(tmr.getMonth() + 1).padStart(2, '0')
    const dd = String(tmr.getDate()).padStart(2, '0')
    return {
      dateStr: `${yyyy}-${mm}-${dd}`,
      displayStr: `amanhã (${dd}/${mm})`,
      isPast: false,
    }
  }

  // 4. "Depois de amanhã"
  if (t.includes('depois de amanhã') || t.includes('depois de amanha')) {
    const dayAfter = new Date(today.dateObj)
    dayAfter.setDate(dayAfter.getDate() + 2)
    const yyyy = dayAfter.getFullYear()
    const mm = String(dayAfter.getMonth() + 1).padStart(2, '0')
    const dd = String(dayAfter.getDate()).padStart(2, '0')
    return {
      dateStr: `${yyyy}-${mm}-${dd}`,
      displayStr: `depois de amanhã (${dd}/${mm})`,
      isPast: false,
    }
  }

  // 5. Dias da semana (segunda, terça, etc.)
  const weekDays = [
    { names: ['domingo', 'dom'], dayIndex: 0 },
    { names: ['segunda', 'segunda-feira', 'seg'], dayIndex: 1 },
    { names: ['terça', 'terca', 'terça-feira', 'terca-feira', 'ter'], dayIndex: 2 },
    { names: ['quarta', 'quarta-feira', 'qua'], dayIndex: 3 },
    { names: ['quinta', 'quinta-feira', 'qui'], dayIndex: 4 },
    { names: ['sexta', 'sexta-feira', 'sex'], dayIndex: 5 },
    { names: ['sábado', 'sabado', 'sab'], dayIndex: 6 },
  ]

  for (const wd of weekDays) {
    if (wd.names.some((name) => t.includes(name))) {
      const currentDayOfWeek = today.dateObj.getDay()
      let diff = wd.dayIndex - currentDayOfWeek
      if (diff <= 0) diff += 7 // próximo dia correspondente da semana
      const target = new Date(today.dateObj)
      target.setDate(target.getDate() + diff)
      const yyyy = target.getFullYear()
      const mm = String(target.getMonth() + 1).padStart(2, '0')
      const dd = String(target.getDate()).padStart(2, '0')
      return {
        dateStr: `${yyyy}-${mm}-${dd}`,
        displayStr: `${wd.names[0]} (${dd}/${mm})`,
        isPast: false,
      }
    }
  }

  // 6. Data completa formato ISO: YYYY-MM-DD
  const isoMatch = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10)
    const m = parseInt(isoMatch[2], 10)
    const d = parseInt(isoMatch[3], 10)
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (dateStr < todayStr) {
      return {
        dateStr,
        displayStr: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
        isPast: true,
      }
    }
    return {
      dateStr,
      displayStr: `dia ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`,
      isPast: false,
    }
  }

  // 7. Data no formato DD/MM ou DD/MM/YYYY
  const brMatch = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/)
  if (brMatch) {
    const d = parseInt(brMatch[1], 10)
    const m = parseInt(brMatch[2], 10)
    let y = brMatch[3] ? parseInt(brMatch[3], 10) : today.year
    if (y < 100) y += 2000

    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (dateStr < todayStr) {
      return {
        dateStr,
        displayStr: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
        isPast: true,
      }
    }
    return {
      dateStr,
      displayStr: `dia ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`,
      isPast: false,
    }
  }

  // 8. "dia X" ou número isolado de 1 a 31
  // Se allowBareNumber for false, exige a palavra "dia" para não colidir com seleção de opção (1, 2...)
  const dayRegex = allowBareNumber ? /(?:dia\s*)?(\d{1,2})\b/i : /\bdia\s*(\d{1,2})\b/i
  const dayMatch = t.match(dayRegex)
  if (dayMatch) {
    const day = parseInt(dayMatch[1], 10)
    if (day >= 1 && day <= 31) {
      let month = today.month
      let year = today.year

      // Se o dia informado for menor que hoje no mês atual, aponta para o próximo mês
      if (day < today.day) {
        month += 1
        if (month > 11) {
          month = 0
          year += 1
        }
      }

      const targetDate = new Date(year, month, day)
      const yyyy = targetDate.getFullYear()
      const mm = String(targetDate.getMonth() + 1).padStart(2, '0')
      const dd = String(targetDate.getDate()).padStart(2, '0')
      const dateStr = `${yyyy}-${mm}-${dd}`

      return {
        dateStr,
        displayStr: `dia ${day} (${dd}/${mm})`,
        isPast: false,
      }
    }
  }

  return null
}

/**
 * Normaliza horário informado pelo cliente a partir de texto
 */
export function resolveTimeFromText(text, availableSlots = []) {
  const t = (text || '').toLowerCase().trim()

  // Procura correspondência exata nos horários disponíveis
  for (const slot of availableSlots) {
    const slotWithoutLeadingZero = slot.replace(/^0/, '')
    if (t.includes(slot) || t.includes(slotWithoutLeadingZero)) {
      return slot
    }
  }

  // Se o cliente digitou algo como "9h", "9", "às 9", "14:30"
  const hourMatch = t.match(/(\d{1,2})(?::(\d{2})|h)?/)
  if (hourMatch) {
    const hour = parseInt(hourMatch[1], 10)
    const min = hourMatch[2] ? parseInt(hourMatch[2], 10) : 0
    const formatted = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`

    if (availableSlots.includes(formatted)) {
      return formatted
    }
    // Procura por aproximação na mesma hora
    const found = availableSlots.find((s) => s.startsWith(`${String(hour).padStart(2, '0')}:`))
    if (found) return found
  }

  return null
}

/**
 * Remove acentos e normaliza para correspondência insensível a acentuação e caixa
 */
export function cleanString(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Normaliza forma de pagamento — aceita números e nomes com ou sem acento
 */
export function resolvePaymentMethod(text) {
  const t = cleanString(text)
  if (t.includes('pix') || t === '1' || t.includes('opcao 1') || t.includes('chave')) return 'Pix'
  if (t.includes('dinheiro') || t === '2' || t.includes('opcao 2') || t.includes('especie') || t.includes('cedula')) return 'Dinheiro'
  if (t.includes('debito') || t.includes('credito') || t.includes('cartao') || t === '3' || t.includes('opcao 3')) {
    return 'Cartão / Débito'
  }
  return null
}

/**
 * Formata lista em português ("Felipe e João" ou "Felipe, Marcos e João")
 */
function formatListInPortuguese(items) {
  if (!items || items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} e ${items[1]}`
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
}

/**
 * Resolve o tenantId real do banco garantindo que nunca consulte coleções vazias.
 */
async function resolveSafeTenantId(tenantId) {
  if (tenantId && tenantId !== 'barbearia-principal' && tenantId !== 'default-tenant') {
    const doc = await adminDb.collection('tenants').doc(tenantId).get()
    if (doc.exists) return tenantId
  }

  // Tenta tenant com sessão ativa no WhatsApp Baileys
  const activeBaileysId = getActiveTenantId()
  if (activeBaileysId) return activeBaileysId

  // Busca o primeiro tenant com serviços cadastrados
  const tenantsSnap = await adminDb.collection('tenants').get()
  for (const doc of tenantsSnap.docs) {
    const sSnap = await adminDb.collection('tenants').doc(doc.id).collection('services').limit(1).get()
    if (!sSnap.empty) return doc.id
  }

  return tenantId || 'I13A9nw5T4IsaojMPLl6'
}

/**
 * Busca dados REAIS da barbearia do Firebase Firestore.
 */
async function loadTenantData(tenantId) {
  const safeId = await resolveSafeTenantId(tenantId)

  const [tenantSnap, settingsSnap, aiSnap, servicesSnap, barbersSnap] = await Promise.all([
    adminDb.collection('tenants').doc(safeId).get(),
    adminDb.collection('tenants').doc(safeId).collection('settings').doc('general').get(),
    adminDb.collection('tenants').doc(safeId).collection('aiSettings').doc('primary').get(),
    adminDb.collection('tenants').doc(safeId).collection('services').get(),
    adminDb.collection('tenants').doc(safeId).collection('barbers').get(),
  ])

  const tenantData = tenantSnap.exists ? tenantSnap.data() : {}
  const settingsData = settingsSnap.exists ? settingsSnap.data() : {}
  const shopName =
    tenantData.name ||
    tenantData.nome ||
    settingsData.nome_barbearia ||
    settingsData.name ||
    'Barbearia boreal'

  const aiConfig = aiSnap.exists
    ? aiSnap.data()
    : { enabled: true, audioEnabled: false, humanHandoffKeyword: 'humano' }

  // Filtra apenas serviços ativos e desduplica por nome
  const allServices = servicesSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const activeServicesRaw = allServices.filter((s) => s.ativo !== false && s.active !== false)
  const seenServiceNames = new Set()
  const activeServices = activeServicesRaw.filter((s) => {
    const key = cleanString(s.nome || s.name || '')
    if (!key || seenServiceNames.has(key)) return false
    seenServiceNames.add(key)
    return true
  })

  // Filtra apenas barbeiros ativos e desduplica por nome com fusão inteligente de folgas e escala
  const allBarbers = barbersSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const activeBarbersRaw = allBarbers.filter((b) => b.ativo !== false && b.active !== false)
  const seenBarbersMap = new Map()

  for (const b of activeBarbersRaw) {
    const key = cleanString(b.nome || b.name || '')
    if (!key) continue

    if (!seenBarbersMap.has(key)) {
      seenBarbersMap.set(key, { ...b })
    } else {
      const existing = seenBarbersMap.get(key)
      // Combina todas as folgas cadastradas (daysOff)
      const mergedDaysOff = Array.from(new Set([
        ...(Array.isArray(existing.daysOff) ? existing.daysOff : []),
        ...(Array.isArray(b.daysOff) ? b.daysOff : []),
      ]))

      // Escolhe o documento com alteração mais recente para as demais propriedades
      const existingTime = new Date(existing.updatedAt || existing.created_at || existing.createdAt || 0).getTime()
      const bTime = new Date(b.updatedAt || b.created_at || b.createdAt || 0).getTime()
      const primary = bTime >= existingTime ? b : existing

      seenBarbersMap.set(key, {
        ...primary,
        daysOff: mergedDaysOff,
      })
    }
  }

  const activeBarbers = Array.from(seenBarbersMap.values())

  console.log(`[Barber AI Data] Barbearia: "${shopName}" (ID: ${safeId})`)
  console.log(`[Barber AI Data] Barbeiros ativos encontrados no banco:`, activeBarbers.map((b) => b.nome || b.name))
  console.log(`[Barber AI Data] Serviços ativos encontrados:`, activeServices.map((s) => `${s.nome || s.name} (R$ ${s.preco || s.price})`))

  return {
    safeId,
    shopName,
    settings: settingsData,
    aiConfig,
    activeServices: activeServices.length > 0 ? activeServices : allServices,
    activeBarbers: activeBarbers.length > 0 ? activeBarbers : allBarbers,
    hasRealServices: activeServices.length > 0 || allServices.length > 0,
    hasRealBarbers: activeBarbers.length > 0 || allBarbers.length > 0,
  }
}

/**
 * Busca agendamentos existentes no Firestore para evitar conflito de horários.
 */
async function loadExistingAppointments(tenantId, dateStr, barberId) {
  try {
    let query = adminDb.collection('tenants').doc(tenantId).collection('appointments').where('date', '==', dateStr)
    if (barberId) {
      query = query.where('barberId', '==', barberId)
    }
    const snap = await query.get()
    return snap.docs.map((d) => d.data()).filter((a) => a.status !== 'cancelado' && a.status !== 'cancelled')
  } catch {
    return []
  }
}

// =========================================================================
// MÁQUINA DE ESTADOS DO ATENDIMENTO — 7 ETAPAS RIGOROSAS E INFALÍVEIS
//
// 1. INITIAL          -> Saudação e pergunta o nome
// 2. AWAITING_NAME    -> Valida nome e pergunta a data
// 3. AWAITING_DATE    -> Bloqueia datas passadas, consulta barbeiros reais do banco
// 4. AWAITING_BARBER  -> Bloqueia barbeiro inexistente, calcula horários livres reais
// 5. AWAITING_TIME    -> Bloqueia horários indisponíveis/passados, consulta serviços reais com preços
// 6. AWAITING_SERVICE -> Bloqueia produtos/serviços que não estão no banco, fecha carrinho
// 7. AWAITING_PAYMENT -> Valida pagamento, grava no Firestore atômico e finaliza
// =========================================================================

export async function processConversationMessage({ tenantId, clientPhone, messageText, phoneNumberId, accessToken }) {
  const safeTenantId = await resolveSafeTenantId(tenantId)
  const convRef = adminDb.collection('tenants').doc(safeTenantId).collection('conversations').doc(clientPhone)
  const convSnap = await convRef.get()

  let state = convSnap.exists
    ? convSnap.data()
    : {
        id: clientPhone,
        tenantId: safeTenantId,
        clientPhone,
        currentStep: 'INITIAL',
        lastMessageAt: new Date().toISOString(),
        status: 'active',
      }

  // Verifica status da barbearia
  const tenantDoc = await adminDb.collection('tenants').doc(safeTenantId).get()
  if (tenantDoc.exists) {
    const tenantStatus = tenantDoc.data().status
    if (tenantStatus === 'suspended' || tenantStatus === 'blocked') {
      return {
        replyText: 'O atendimento automatizado desta barbearia está temporariamente indisponível. Por favor, tente novamente mais tarde.',
        state,
      }
    }
  }

  // Carrega dados REAIS do Firestore
  const { shopName, settings, aiConfig, activeServices, activeBarbers, hasRealServices, hasRealBarbers } =
    await loadTenantData(safeTenantId)

  const textTrimmed = (messageText || '').trim()
  const textLower = textTrimmed.toLowerCase()

  // 1. Verificação de transferência para atendimento humano
  const humanKeyword = (aiConfig.humanHandoffKeyword || 'humano').toLowerCase()
  if (textLower.includes(humanKeyword) || textLower.includes('atendente') || textLower.includes('falar com pessoa')) {
    state.currentStep = 'HUMAN_HANDOFF'
    state.status = 'human_handoff'
    state.assignedTo = 'human'
    state.aiEnabled = false
    state.lastMessageAt = new Date().toISOString()
    await convRef.set(state, { merge: true })
    return {
      replyText: 'Entendido! Estou transferindo seu atendimento para nossa equipe humana. Em instantes um de nossos profissionais vai te responder por aqui. ✂️',
      state,
    }
  }

  // Se já está em handoff humano, não responde automaticamente a menos que reinicie
  if (state.currentStep === 'HUMAN_HANDOFF' && !textLower.includes('reiniciar') && !textLower.includes('menu') && !textLower.includes('início')) {
    return { replyText: null, state }
  }

  // Verificação universal de cancelamento / reinício
  const cancelKeywords = ['cancelar', 'cancela', 'cancelar atendimento', 'sair', 'parar', 'encerrar', 'recomeçar', 'reiniciar', 'inicio', 'início']
  if (cancelKeywords.some((ck) => textLower === ck || textLower === `${ck} atendimento` || textLower === `quero ${ck}`)) {
    state = {
      ...state,
      currentStep: 'INITIAL',
      status: 'active',
      selectedDate: null,
      selectedDateDisplay: null,
      selectedBarberId: null,
      selectedBarberName: null,
      selectedTime: null,
      selectedServiceId: null,
      selectedServiceName: null,
      selectedPrice: null,
      cachedSlots: null,
      paymentMethod: null,
    }
    await convRef.set(state, { merge: true })
    return {
      replyText: 'Atendimento cancelado! ✂️\n\nQuando quiser agendar um novo horário, basta enviar uma mensagem que estarei pronto para te atender. Tenha um ótimo dia!',
      state,
    }
  }

  // Se o agendamento anterior foi concluído ou o cliente pedir recomeçar
  if (state.currentStep === 'BOOKING_CONFIRMED' || state.status === 'completed') {
    state = {
      ...state,
      currentStep: 'INITIAL',
      status: 'active',
      selectedDate: null,
      selectedDateDisplay: null,
      selectedBarberId: null,
      selectedBarberName: null,
      selectedTime: null,
      selectedServiceId: null,
      selectedServiceName: null,
      selectedPrice: null,
      cachedSlots: null,
      paymentMethod: null,
    }
  }

  let replyText = ''

  // ======================================================================
  // ETAPA 1 — SAUDAÇÃO: Apresenta a barbearia e solicita o nome
  // ======================================================================
  if (state.currentStep === 'INITIAL') {
    replyText = `Olá, seja bem-vindo à ${shopName}! ✂️\nPara começarmos o seu agendamento, qual o seu nome?`
    state.currentStep = 'AWAITING_NAME'
  }

  // ======================================================================
  // ETAPA 2 — NOME: Recebe o nome e solicita a data
  // ======================================================================
  else if (state.currentStep === 'AWAITING_NAME') {
    const rawName = textTrimmed
      .replace(/^(meu nome é|me chamo|sou o|sou a|é o|é a|me chamo de|nome:)\s+/i, '')
      .trim()

    const commonGreetings = ['ola', 'olá', 'oi', 'oie', 'e ai', 'e aí', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'salve', 'tudo bem']
    if (commonGreetings.includes(rawName.toLowerCase()) || rawName.length < 2) {
      replyText = 'Olá! Para podermos registrar seu atendimento, qual o seu nome ou como você gostaria de ser chamado?'
    } else {
      state.clientName = rawName.charAt(0).toUpperCase() + rawName.slice(1)
      state.currentStep = 'AWAITING_DATE'
      replyText = `Perfeito, ${state.clientName}! Para qual dia você gostaria de agendar? (Exemplo: "hoje", "amanhã", ou uma data específica)`
    }
  }

  // ======================================================================
  // ETAPA 3 — DATA: Valida folgas e disponibilidade de profissionais
  // ======================================================================
  else if (state.currentStep === 'AWAITING_DATE') {
    const dateResult = resolveDateFromText(textTrimmed, true)

    if (!dateResult) {
      replyText = `Desculpe, ${state.clientName}, não consegui identificar a data. Poderia informar de outra forma? Exemplos: "hoje", "amanhã", "dia 28" ou "28/09".`
    } else if (dateResult.isPast) {
      // ⚠️ BLOQUEIO RIGOROSO: DATA NO PASSADO
      replyText = `⚠️ A data informada (${dateResult.displayStr}) já passou! Não é possível agendar horários no passado.\n\nPor favor, informe uma data a partir de hoje ou nos próximos dias (exemplo: "hoje", "amanhã", "dia 28").`
    } else {
      state.selectedDate = dateResult.dateStr
      state.selectedDateDisplay = dateResult.displayStr

      if (!hasRealBarbers) {
        replyText = `Desculpe, ${state.clientName}, no momento não temos profissionais cadastrados no sistema. Por favor, entre em contato diretamente com a barbearia.`
        state.currentStep = 'HUMAN_HANDOFF'
        state.assignedTo = 'human'
      } else {
        const shopOperatingDays = settings?.dias_funcionamento || [1, 2, 3, 4, 5, 6]
        const availableBarbers = activeBarbers.filter((b) => isBarberAvailableOnDate(b, dateResult.dateStr, shopOperatingDays))
        const offBarbers = activeBarbers.filter((b) => !isBarberAvailableOnDate(b, dateResult.dateStr, shopOperatingDays))

        // Verifica se o cliente já mencionou o nome de um barbeiro específico nesta mensagem (ex: "segunda com o feliciano")
        const mentionedBarber = activeBarbers.find((b) => {
          const bName = cleanString(b.nome || b.name || '')
          return bName && cleanString(textTrimmed).includes(bName)
        })

        // REGRA 1: SE TODOS OS PROFISSIONAIS (OU OS DOIS) FOLGAM NO MESMO DIA = LOJA FECHADA
        if (availableBarbers.length === 0) {
          replyText = `⚠️ Em ${dateResult.displayStr}, a barbearia estará fechada (todos os profissionais estarão de folga). 💈\n\nPor favor, informe outra data para o seu agendamento (exemplo: "amanhã" ou outra data).`
          // Permanece em AWAITING_DATE para nova escolha de data
        } else if (mentionedBarber) {
          // O cliente citou um profissional diretamente junto com a data
          const isMentionedAvailable = isBarberAvailableOnDate(mentionedBarber, dateResult.dateStr, shopOperatingDays)
          if (!isMentionedAvailable) {
            // O profissional pedido está de folga, mas há outro(s) disponível(is)
            state.currentStep = 'AWAITING_BARBER'
            state.availableBarberIds = availableBarbers.map((b) => b.id)
            const availOptions = availableBarbers.map((b, idx) => `${idx + 1}. ${b.nome || b.name}`).join('\n')

            replyText = `⚠️ O profissional ${mentionedBarber.nome || mentionedBarber.name} estará de folga em ${dateResult.displayStr}. 💈\n\nNosso profissional disponível para essa data é:\n${availOptions}\n\nVocê gostaria de agendar com ${availableBarbers.map((b) => b.nome || b.name).join(' ou ')}? (Ou digite outra data para cortar com o ${mentionedBarber.nome || mentionedBarber.name})`
          } else {
            // O profissional pedido está disponível! Segue direto para os horários
            state.selectedBarberId = mentionedBarber.id
            state.selectedBarberName = mentionedBarber.nome || mentionedBarber.name

            const existingAppointments = await loadExistingAppointments(safeTenantId, state.selectedDate, mentionedBarber.id)
            const shopStartHour = settings?.horario_abertura || '09:00'
            const shopEndHour = settings?.horario_fechamento || '19:00'
            const barberStartHour = mentionedBarber.startHour || shopStartHour
            const barberEndHour = mentionedBarber.endHour || shopEndHour
            const effectiveStartHour = barberStartHour < shopStartHour ? shopStartHour : barberStartHour
            const effectiveEndHour = barberEndHour > shopEndHour ? shopEndHour : barberEndHour

            const calculatedSlots = calculateAvailableSlots({
              dateStr: state.selectedDate,
              durationMinutes: 30,
              barber: {
                ...mentionedBarber,
                startHour: effectiveStartHour,
                endHour: effectiveEndHour,
                workingDays: Array.isArray(mentionedBarber.workingDays) && mentionedBarber.workingDays.length > 0
                  ? mentionedBarber.workingDays
                  : shopOperatingDays,
              },
              existingAppointments,
              shopOperatingDays,
            })

            if (calculatedSlots.length === 0) {
              replyText = `Infelizmente o profissional ${state.selectedBarberName} não possui horários disponíveis para ${state.selectedDateDisplay}.\n\nGostaria de agendar com outro profissional ou escolher outra data?`
              state.currentStep = 'AWAITING_DATE'
              state.selectedBarberId = null
              state.selectedBarberName = null
            } else {
              state.cachedSlots = calculatedSlots
              state.currentStep = 'AWAITING_TIME'

              const morningSlots = calculatedSlots.filter((s) => s < '12:00')
              const afternoonSlots = calculatedSlots.filter((s) => s >= '12:00')
              let slotsFormatted = ''
              if (morningSlots.length > 0) slotsFormatted += `🌅 Manhã: ${morningSlots.join(', ')}\n`
              if (afternoonSlots.length > 0) slotsFormatted += `🌇 Tarde: ${afternoonSlots.join(', ')}`
              if (!slotsFormatted) slotsFormatted = calculatedSlots.join(', ')

              replyText = `Perfeito! O profissional ${state.selectedBarberName} está disponível em ${dateResult.displayStr}! 💈\n\nHorários livres:\n${slotsFormatted}\n\nQual horário seria melhor para você?`
            }
          }
        } else {
          // REGRA 2: SE UM PROFISSIONAL FOLGA E O OUTRO ESTÁ DISPONÍVEL, O OUTRO APARECE DISPONÍVEL!
          state.currentStep = 'AWAITING_BARBER'
          state.availableBarberIds = availableBarbers.map((b) => b.id)

          const barberListOptions = availableBarbers.map((b, idx) => `${idx + 1}. ${b.nome || b.name}`).join('\n')

          if (offBarbers.length > 0 && availableBarbers.length === 1) {
            const offNames = offBarbers.map((b) => b.nome || b.name).join(', ')
            const availName = availableBarbers[0].nome || availableBarbers[0].name
            replyText = `Para ${dateResult.displayStr}, o profissional ${offNames} está de folga, mas temos o profissional ${availName} disponível! 💈\n\n1. ${availName}\n\nVocê gostaria de agendar com o ${availName}? (Digite 1 ou confirme com "sim")`
          } else if (offBarbers.length > 0) {
            const offNames = offBarbers.map((b) => b.nome || b.name).join(', ')
            replyText = `Para ${dateResult.displayStr}, temos os seguintes profissionais disponíveis:\n\n${barberListOptions}\n\n(Obs: ${offNames} estará de folga nessa data)\n\nCom quem você gostaria de agendar? (Digite o nome ou o número)`
          } else {
            replyText = `Perfeito! Para ${dateResult.displayStr} temos os seguintes profissionais disponíveis:\n\n${barberListOptions}\n\nCom quem você gostaria de agendar? (Digite o nome ou o número)`
          }
        }
      }
    }
  }

  // ======================================================================
  // ETAPA 4 — BARBEIRO: Identifica profissional e calcula horários reais
  // ======================================================================
  else if (state.currentStep === 'AWAITING_BARBER') {
    const cleanedText = cleanString(textTrimmed)
    const shopOperatingDays = settings?.dias_funcionamento || [1, 2, 3, 4, 5, 6]

    // Recalcula barbeiros disponíveis e de folga na data previamente selecionada
    const availableBarbers = activeBarbers.filter((b) => isBarberAvailableOnDate(b, state.selectedDate, shopOperatingDays))
    const offBarbers = activeBarbers.filter((b) => !isBarberAvailableOnDate(b, state.selectedDate, shopOperatingDays))

    // Se o cliente digitou uma data (ex: "dia 29", "amanhã") para alterar a data:
    const reDate = resolveDateFromText(textTrimmed)
    if (reDate && !reDate.isPast && reDate.dateStr && reDate.dateStr !== state.selectedDate) {
      state.selectedDate = reDate.dateStr
      state.selectedDateDisplay = reDate.displayStr

      const newAvailable = activeBarbers.filter((b) => isBarberAvailableOnDate(b, reDate.dateStr, shopOperatingDays))
      const newOff = activeBarbers.filter((b) => !isBarberAvailableOnDate(b, reDate.dateStr, shopOperatingDays))

      if (newAvailable.length === 0) {
        replyText = `Data atualizada para ${reDate.displayStr}! 📅\n\n⚠️ Porém, nessa data a barbearia estará fechada (todos os profissionais estarão de folga). 💈\n\nPor favor, informe outra data para o seu agendamento.`
        state.currentStep = 'AWAITING_DATE'
      } else {
        const barberListOptions = newAvailable.map((b, idx) => `${idx + 1}. ${b.nome || b.name}`).join('\n')
        replyText = `Data atualizada para ${reDate.displayStr}! 📅\n\nPara essa data, nossos profissionais disponíveis são:\n\n${barberListOptions}\n\nCom quem você gostaria de agendar? (Digite o nome ou o número)`
      }
      await convRef.set(state, { merge: true })
      return { replyText, state }
    }

    let chosenBarber = null

    // 1. Se apenas 1 barbeiro está disponível e o cliente confirma ("sim", "pode ser", "ok", "confirmo", "quero", "bora", "com ele")
    const confirmWords = ['sim', 'ok', 'pode ser', 'confirmo', 'quero', 'bora', 'com ele', 'com ela', 'com ele mesmo', 'pode agendar', 'isso', 'exato', 'claro', 'fechado']
    if (availableBarbers.length === 1 && confirmWords.some((cw) => cleanedText === cw || cleanedText.startsWith(cw))) {
      chosenBarber = availableBarbers[0]
    }

    // 2. Seleção por número (1, 2, "opção 1", "o 1", "com o 1", "1.")
    // O número refere-se à lista de barbeiros DISPONÍVEIS mostrada ao cliente!
    if (!chosenBarber) {
      const numMatch = textTrimmed.match(/(?:opção|opcao|o|numero|número)?\s*(\d{1,2})\b/i)
      if (numMatch) {
        const idx = parseInt(numMatch[1], 10) - 1
        if (idx >= 0 && idx < availableBarbers.length) {
          chosenBarber = availableBarbers[idx]
        } else if (idx >= 0 && idx < activeBarbers.length) {
          chosenBarber = activeBarbers[idx]
        }
      }
    }

    // 3. Seleção por nome no texto (sem acento, case-insensitive)
    if (!chosenBarber) {
      // Primeiro busca entre os disponíveis
      for (const b of availableBarbers) {
        const bName = cleanString(b.nome || b.name || '')
        if (bName && (cleanedText.includes(bName) || bName.includes(cleanedText))) {
          chosenBarber = b
          break
        }
      }
      // Se não encontrou, busca entre os que estão de folga para dar a resposta correta
      if (!chosenBarber) {
        for (const b of offBarbers) {
          const bName = cleanString(b.nome || b.name || '')
          if (bName && (cleanedText.includes(bName) || bName.includes(cleanedText))) {
            chosenBarber = b
            break
          }
        }
      }
    }

    // 4. Opção sem preferência / qualquer
    const noPrefKeywords = ['sem preferencia', 'sem preferência', 'qualquer', 'tanto faz', 'primeiro', 'qualquer um']
    if (!chosenBarber && noPrefKeywords.some((kw) => cleanedText.includes(cleanString(kw)))) {
      chosenBarber = availableBarbers[0] || activeBarbers[0]
    }

    // ⚠️ BLOQUEIO RIGOROSO: BARBEIRO NÃO EXISTE NO BANCO DE DADOS
    if (!chosenBarber) {
      const barberListOptions = availableBarbers.length > 0
        ? availableBarbers.map((b, idx) => `${idx + 1}. ${b.nome || b.name}`).join('\n')
        : activeBarbers.map((b, idx) => `${idx + 1}. ${b.nome || b.name}`).join('\n')
      replyText = `⚠️ Desculpe, não identifiquei o profissional "${textTrimmed}". ✂️\n\nNossos barbeiros disponíveis para ${state.selectedDateDisplay} são:\n\n${barberListOptions}\n\nPor favor, escolha um dos nomes acima ou digite o número correspondente.`
    } else {
      // ⚠️ BLOQUEIO RIGOROSO: BARBEIRO ESTÁ DE FOLGA NA DATA
      const isAvailable = isBarberAvailableOnDate(chosenBarber, state.selectedDate, shopOperatingDays)
      if (!isAvailable) {
        if (availableBarbers.length > 0) {
          const options = availableBarbers.map((b, idx) => `${idx + 1}. ${b.nome || b.name}`).join('\n')
          replyText = `⚠️ O profissional ${chosenBarber.nome || chosenBarber.name} está de folga em ${state.selectedDateDisplay}. 💈\n\nNossos profissionais disponíveis para essa data são:\n\n${options}\n\nCom quem você gostaria de agendar? (Ou se preferir cortar com o ${chosenBarber.nome || chosenBarber.name}, digite outra data!)`
        } else {
          replyText = `⚠️ O profissional ${chosenBarber.nome || chosenBarber.name} está de folga em ${state.selectedDateDisplay} e a barbearia estará fechada nessa data. 💈\n\nPor favor, informe outra data para o seu agendamento (exemplo: "amanhã" ou outra data).`
          state.currentStep = 'AWAITING_DATE'
        }
        await convRef.set(state, { merge: true })
        return { replyText, state }
      }

      state.selectedBarberId = chosenBarber.id
      state.selectedBarberName = chosenBarber.nome || chosenBarber.name

      // Consulta agendamentos REAIS no Firestore
      const existingAppointments = await loadExistingAppointments(safeTenantId, state.selectedDate, chosenBarber.id)

      // Respeita estritamente o horário comercial da barbearia do Firebase
      const shopStartHour = settings?.horario_abertura || '09:00'
      const shopEndHour = settings?.horario_fechamento || '19:00'
      const barberStartHour = chosenBarber.startHour || shopStartHour
      const barberEndHour = chosenBarber.endHour || shopEndHour

      // Garante que o horário não começa antes da abertura da barbearia nem fecha depois
      const effectiveStartHour = barberStartHour < shopStartHour ? shopStartHour : barberStartHour
      const effectiveEndHour = barberEndHour > shopEndHour ? shopEndHour : barberEndHour

      // Calcula horários livres reais
      const calculatedSlots = calculateAvailableSlots({
        dateStr: state.selectedDate,
        durationMinutes: 30,
        barber: {
          ...chosenBarber,
          startHour: effectiveStartHour,
          endHour: effectiveEndHour,
          workingDays: Array.isArray(chosenBarber.workingDays) && chosenBarber.workingDays.length > 0
            ? chosenBarber.workingDays
            : shopOperatingDays,
        },
        existingAppointments,
        shopOperatingDays,
      })

      if (calculatedSlots.length === 0) {
        replyText = `Infelizmente o profissional ${state.selectedBarberName} não possui horários disponíveis para ${state.selectedDateDisplay} (todos os horários já foram reservados ou o horário de expediente encerrou).\n\nGostaria de agendar com outro barbeiro ou tentar outra data?`
        state.currentStep = 'AWAITING_DATE'
        state.selectedBarberId = null
        state.selectedBarberName = null
      } else {
        state.cachedSlots = calculatedSlots
        state.currentStep = 'AWAITING_TIME'

        // Apresenta os horários divididos por períodos para clareza
        const morningSlots = calculatedSlots.filter((s) => s < '12:00')
        const afternoonSlots = calculatedSlots.filter((s) => s >= '12:00')

        let slotsFormatted = ''
        if (morningSlots.length > 0) {
          slotsFormatted += `🌅 Manhã: ${morningSlots.join(', ')}\n`
        }
        if (afternoonSlots.length > 0) {
          slotsFormatted += `🌇 Tarde: ${afternoonSlots.join(', ')}`
        }
        if (!slotsFormatted) {
          slotsFormatted = calculatedSlots.join(', ')
        }

        replyText = `Certo! O profissional ${state.selectedBarberName} tem os seguintes horários disponíveis:\n\n${slotsFormatted}\n\nQual seria o melhor horário pra você?`
      }
    }
  }

  // ======================================================================
  // ETAPA 5 — HORÁRIO: Bloqueia horários indisponíveis e consulta serviços reais
  // ======================================================================
  else if (state.currentStep === 'AWAITING_TIME') {
    const chosenTime = resolveTimeFromText(textTrimmed, state.cachedSlots || [])

    // ⚠️ BLOQUEIO RIGOROSO: HORÁRIO INDISPONÍVEL OU NÃO PERMITIDO
    if (!chosenTime || !(state.cachedSlots || []).includes(chosenTime)) {
      const displaySlots = (state.cachedSlots || []).slice(0, 8)
      const slotsFormatted = displaySlots.join(', ')
      replyText = `⚠️ Desculpe, o horário "${textTrimmed}" não está disponível para o ${state.selectedBarberName}.\n\nOs horários livres para ${state.selectedDateDisplay} são:\n👉 ${slotsFormatted}\n\nPor favor, escolha um dos horários listados acima.`
    } else {
      state.selectedTime = chosenTime

      if (!hasRealServices) {
        replyText = `Desculpe, não há serviços cadastrados no momento. Por favor, entre em contato com nossa equipe.`
        state.currentStep = 'HUMAN_HANDOFF'
        state.assignedTo = 'human'
      } else {
        state.currentStep = 'AWAITING_SERVICE'

        // Formata lista numerada de serviços REAIS do banco com preços e duração
        const servicesListFormatted = activeServices
          .map((s, idx) => `${idx + 1}. ${s.nome || s.name} — R$ ${Number(s.preco || s.price || 0).toFixed(0)},00 (${Number(s.duracao_minutos || s.durationMinutes || 30)} min)`)
          .join('\n')

        replyText = `Perfeito! Horário das ${chosenTime} selecionado. ✂️\n\nNossos serviços disponíveis são:\n\n${servicesListFormatted}\n\nQual serviço você gostaria? Você pode escolher 1 ou mais (exemplo: "1 e 2" ou "corte e barba")!`
      }
    }
  }

  // ======================================================================
  // ETAPA 6 — SERVIÇO: Suporta 1 OU MAIS SERVIÇOS com soma de tempo e preço
  // ======================================================================
  else if (state.currentStep === 'AWAITING_SERVICE') {
    const cleanedText = cleanString(textTrimmed)
    const selectedServices = []

    // 1. Procura por múltiplos números no texto: ex "1 e 2", "1, 2", "1 + 2", "1 e 3", ou apenas "1"
    const numbersFound = Array.from(textTrimmed.matchAll(/\b(\d{1,2})\b/g)).map((m) => parseInt(m[1], 10))
    if (numbersFound.length > 0) {
      for (const num of numbersFound) {
        const idx = num - 1
        if (idx >= 0 && idx < activeServices.length) {
          const s = activeServices[idx]
          if (!selectedServices.some((x) => x.id === s.id)) {
            selectedServices.push(s)
          }
        }
      }
    }

    // 2. Se não encontrou por número (ou além dos números), procura correspondência pelos nomes dos serviços
    for (const s of activeServices) {
      const sName = cleanString(s.nome || s.name || '')
      if (sName) {
        if (cleanedText.includes(sName)) {
          if (!selectedServices.some((x) => x.id === s.id)) {
            selectedServices.push(s)
          }
        }
      }
    }

    // 3. Casos comuns em português: "corte e barba", "cabelo e barba", "corte", "barba"
    if (selectedServices.length === 0) {
      const hasCorte = cleanedText.includes('corte') || cleanedText.includes('cabelo')
      const hasBarba = cleanedText.includes('barba')

      if (hasCorte && hasBarba) {
        const combo = activeServices.find((s) => {
          const n = cleanString(s.nome || s.name)
          return (n.includes('corte') && n.includes('barba')) || n.includes('combo')
        })
        if (combo) {
          selectedServices.push(combo)
        } else {
          const corte = activeServices.find((s) => cleanString(s.nome || s.name).includes('corte'))
          const barba = activeServices.find((s) => cleanString(s.nome || s.name).includes('barba'))
          if (corte) selectedServices.push(corte)
          if (barba && (!corte || barba.id !== corte.id)) selectedServices.push(barba)
        }
      } else if (hasCorte) {
        const corte = activeServices.find((s) => cleanString(s.nome || s.name).includes('corte'))
        if (corte) selectedServices.push(corte)
      } else if (hasBarba) {
        const barba = activeServices.find((s) => cleanString(s.nome || s.name).includes('barba'))
        if (barba) selectedServices.push(barba)
      }
    }

    // ⚠️ BLOQUEIO RIGOROSO: NENHUM SERVIÇO VÁLIDO ENCONTRADO
    if (selectedServices.length === 0) {
      const servicesListFormatted = activeServices
        .map((s, idx) => `${idx + 1}. ${s.nome || s.name} — R$ ${Number(s.preco || s.price || 0).toFixed(0)},00 (${Number(s.duracao_minutos || s.durationMinutes || 30)} min)`)
        .join('\n')

      replyText = `⚠️ Desculpe, não identifiquei esse serviço em nosso catálogo. 💈\n\nNossos serviços disponíveis são:\n\n${servicesListFormatted}\n\nVocê pode escolher 1 ou mais serviços! Exemplos: "1 e 2", "corte e barba" ou digite o número correspondente.`
    } else {
      // SOMA DE VALOR E TEMPO DOS SERVIÇOS SELECIONADOS
      const totalPrice = selectedServices.reduce((sum, s) => sum + Number(s.preco || s.price || 0), 0)
      const totalDuration = selectedServices.reduce((sum, s) => sum + Number(s.duracao_minutos || s.durationMinutes || 30), 0)
      const serviceNames = selectedServices.map((s) => s.nome || s.name).join(' + ')

      state.selectedServices = selectedServices.map((s) => ({
        id: s.id,
        nome: s.nome || s.name,
        preco: Number(s.preco || s.price || 0),
        duracao: Number(s.duracao_minutos || s.durationMinutes || 30),
      }))
      state.selectedServiceId = selectedServices.map((s) => s.id).join(',')
      state.selectedServiceName = serviceNames
      state.selectedPrice = totalPrice
      state.selectedDuration = totalDuration
      state.currentStep = 'AWAITING_PAYMENT'

      const serviceBullets = selectedServices
        .map((s) => `  • ${s.nome || s.name} (R$ ${Number(s.preco || s.price || 0).toFixed(0)},00)`)
        .join('\n')

      // FECHAMENTO DE CARRINHO (RESUMO PRÉVIO COM TEMPO E VALOR TOTAL)
      replyText = `Então está combinado! 🛒\n\n*Fechamento do pedido:*\n${serviceBullets}\n⏱️ *Tempo total:* ${totalDuration} minutos\n💰 *Valor total:* R$ ${totalPrice},00\n\nPara confirmarmos seu agendamento, qual seria a forma de pagamento?\n1. Pix 💠\n2. Dinheiro 💵\n3. Cartão / Débito 💳`
    }
  }

  // ======================================================================
  // ETAPA 7 — PAGAMENTO: Valida método, grava no Firestore e finaliza
  // ======================================================================
  else if (state.currentStep === 'AWAITING_PAYMENT') {
    const paymentMethod = resolvePaymentMethod(textTrimmed)

    // ⚠️ BLOQUEIO RIGOROSO: FORMA DE PAGAMENTO INVÁLIDA
    if (!paymentMethod) {
      replyText = `⚠️ Forma de pagamento não reconhecida.\n\nPara confirmar seu agendamento, aceitamos:\n1. Pix 💠\n2. Dinheiro 💵\n3. Cartão / Débito 💳\n\nQual delas você prefere?`
    } else {
      state.paymentMethod = paymentMethod
      state.currentStep = 'BOOKING_CONFIRMED'
      state.status = 'completed'

      // =============== GRAVAÇÃO ATÔMICA NO FIRESTORE ===============
      const appointmentId = `appt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const createdAt = new Date().toISOString()

      // 1. Resolve ou cadastra o cliente na coleção 'clients'
      let resolvedClientId = null
      let resolvedClientEmail = ''
      try {
        const clientsSnap = await adminDb.collection('tenants').doc(safeTenantId).collection('clients').get()
        const matchedClient = clientsSnap.docs.find((d) => {
          const cData = d.data() || {}
          const phoneMatch = cData.telefone && (cData.telefone === clientPhone || clientPhone.endsWith(cData.telefone) || cData.telefone.endsWith(clientPhone))
          const nameMatch = cData.nome && cleanString(cData.nome) === cleanString(state.clientName)
          return phoneMatch || nameMatch
        })
        if (matchedClient) {
          resolvedClientId = matchedClient.id
          resolvedClientEmail = matchedClient.data().email || ''
        }
      } catch (err) {}

      if (!resolvedClientId) {
        resolvedClientId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        try {
          await adminDb.collection('tenants').doc(safeTenantId).collection('clients').doc(resolvedClientId).set({
            nome: state.clientName,
            telefone: clientPhone,
            email: '',
            created_at: createdAt,
            updatedAt: createdAt,
          })
        } catch (e) {}
      }

      // 2. Monta o documento com o schema idêntico ao Firestore da Barbearia
      const apptPayload = {
        id: appointmentId,
        barbeiro_id: state.selectedBarberId || '',
        barbeiros: {
          nome: state.selectedBarberName || '',
        },
        barberId: state.selectedBarberId || '',
        barberName: state.selectedBarberName || '',
        clientId: resolvedClientId,
        clientName: state.clientName || 'Cliente',
        cliente_id: resolvedClientId,
        clientes: {
          email: resolvedClientEmail || '',
          nome: state.clientName || 'Cliente',
        },
        created_at: createdAt,
        createdAt,
        data: state.selectedDate,
        date: state.selectedDate,
        horario: state.selectedTime,
        origin: 'whatsapp',
        price: Number(state.selectedPrice || 0),
        serviceId: state.selectedServiceId || '',
        serviceName: state.selectedServiceName || '',
        servico_id: state.selectedServiceId || '',
        servicos: {
          duracao_minutos: Number(state.selectedDuration || 30),
          nome: state.selectedServiceName || '',
          preco: Number(state.selectedPrice || 0),
        },
        services: state.selectedServices || [],
        status: 'pendente',
        time: state.selectedTime,
        valor: Number(state.selectedPrice || 0),
        forma_pagamento: paymentMethod,
        paymentMethod,
        durationMinutes: Number(state.selectedDuration || 30),
        duracao_minutos: Number(state.selectedDuration || 30),
        clientPhone,
        tenantId: safeTenantId,
        cloudSynced: false,
      }

      const protocol = `${appointmentId.slice(-4).toUpperCase()}`

      replyText = `🎉 *AGENDAMENTO CONFIRMADO COM SUCESSO!* ✂️\n\n📋 *Resumo do Fechamento:*\n──────────────────────────\n👤 *Cliente:* ${state.clientName}\n💈 *Profissional:* ${state.selectedBarberName}\n✂️ *Serviço(s):* ${state.selectedServiceName}\n⏱️ *Tempo Total:* ${state.selectedDuration} minutos\n📅 *Data:* ${state.selectedDateDisplay}\n⏰ *Horário:* ${state.selectedTime} horas\n💰 *Valor Total:* R$ ${Number(state.selectedPrice).toFixed(0)},00\n💳 *Pagamento:* ${paymentMethod}\n🔖 *Protocolo:* #${protocol}\n──────────────────────────\n\nEstamos te esperando no dia e horário combinado! Caso precise cancelar ou reagendar, por favor avise com antecedência. Tenha um ótimo atendimento! 💈`

      try {
        // Grava no tenant seguro
        await adminDb.collection('tenants').doc(safeTenantId).collection('appointments').doc(appointmentId).set(apptPayload)

        // Se o safeTenantId for diferente dos aliases padrão, espelha nos aliases para visibilidade total
        const mirrorTenants = ['I13A9nw5T4IsaojMPLl6', 'barbearia-principal'].filter((t) => t !== safeTenantId)
        for (const mirrorId of mirrorTenants) {
          try {
            await adminDb.collection('tenants').doc(mirrorId).collection('appointments').doc(appointmentId).set({ ...apptPayload, tenantId: mirrorId })
          } catch {}
        }

        // Atualiza ou cadastra o cliente
        await adminDb
          .collection('tenants')
          .doc(safeTenantId)
          .collection('clients')
          .doc(resolvedClientId)
          .set(
            {
              id: resolvedClientId,
              tenantId: safeTenantId,
              nome: state.clientName,
              telefone: clientPhone,
              lastAppointmentAt: createdAt,
              updatedAt: createdAt,
            },
            { merge: true },
          )

        console.log(
          `[IA Barber] ✅ AGENDAMENTO CONFIRMADO E GRAVADO: ${state.clientName} | ${state.selectedDate} às ${state.selectedTime} | ${state.selectedBarberName} | ${state.selectedServiceName} (R$${state.selectedPrice}) | ${paymentMethod}`,
        )
      } catch (dbErr) {
        console.error('[IA Barber] ❌ Erro ao persistir agendamento no Firestore:', dbErr)
        replyText = `Desculpe, ${state.clientName}, ocorreu uma falha ao registrar o agendamento no banco de dados. Por favor, tente novamente ou fale com nossa equipe.`
        state.currentStep = 'AWAITING_PAYMENT'
        state.status = 'active'
        await convRef.set(state, { merge: true })
        return { replyText, state }
      }

      // RESUMO COMPLETO DE FECHAMENTO DE CARRINHO
      const dateDisplay = state.selectedDateDisplay || state.selectedDate

      replyText = `🎉 *AGENDAMENTO CONFIRMADO COM SUCESSO!* ✂️\n\n📋 *Resumo do Fechamento:*\n──────────────────────────\n👤 *Cliente:* ${state.clientName}\n💈 *Profissional:* ${state.selectedBarberName}\n✂️ *Serviço:* ${state.selectedServiceName} (${state.selectedDuration} min)\n📅 *Data:* ${dateDisplay}\n⏰ *Horário:* ${state.selectedTime} horas\n💰 *Valor Total:* R$ ${state.selectedPrice},00\n💳 *Pagamento:* ${paymentMethod}\n🔖 *Protocolo:* #${appointmentId.slice(-6).toUpperCase()}\n──────────────────────────\n\nEstamos te esperando no dia e horário combinado! Caso precise cancelar ou reagendar, por favor avise com antecedência. Tenha um ótimo atendimento! 💈`
    }
  }

  // ======================================================================
  // FALLBACK — Mensagem não reconhecida fora do fluxo
  // ======================================================================
  else {
    replyText = `Olá, ${state.clientName || 'amigo'}! Para agendar seu atendimento, me informe para qual dia você gostaria.`
    state.currentStep = 'AWAITING_DATE'
  }

  state.lastMessageAt = new Date().toISOString()
  state.assignedTo = state.assignedTo || 'ai'
  state.aiEnabled = state.aiEnabled !== false

  // Persiste o estado da conversa atualizado no Firestore
  await convRef.set(state, { merge: true })

  return { replyText, state }
}
