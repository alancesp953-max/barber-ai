import { divaSystemPrompt } from './divaPrompt.mjs'
import {
  consultar_disponibilidade,
  criar_agendamento,
  listar_servicos,
  ocupacaoNoHorario,
  obter_proximo_barbeiro_rodizio,
} from '../tools/divaTools.mjs'
import { listCollection } from '../lib/firestoreShop.mjs'
import { adminDb } from '../lib/firebaseAdmin.mjs'
import { appointmentReleaseMin, fitsExpediente, hmToMin, isPastSlotToday, isSunday, rangesOverlap, shiftYmd, todayYmd } from '../lib/time.mjs'
import { assertLocalIsolation } from '../lib/whatsappLock.mjs'

export const DIVA_SYSTEM_PROMPT = divaSystemPrompt()

export const NEW_CLIENT_GREETING =
  'Olá! Seja bem-vindo à Divina Barbearia da Varjota. Como posso te chamar?'

const GENERIC_FALLBACK = 'Oi! Me conta o que você precisa.'

const sessions = new Map()

function fold(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function sessionOf(key, memory) {
  const session = {
    nome: String(memory?.nome || '').trim(),
    history: Array.isArray(memory?.history) ? memory.history.slice(-12) : [],
    pedido: memory?.pedido ? { ...memory.pedido } : {},
  }
  if (!session.pedido) session.pedido = {}
  sessions.set(key, session)
  return session
}

function padTime(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function looksLikeBooking(text) {
  const blob = fold(text)
  if (/\b(agend\w*|marcar\w*|remarcar\w*|horario\w*|corte\w*|barba\w*|cabelo\w*|barbeiro\w*|amanha|hoje)\b/.test(blob)) return true
  return Boolean(requestedTime(text) || dateWasStated(text))
}

function usableClientName(name, phone) {
  const value = String(name || '').trim()
  if (!value || value.length < 2 || value.length > 40) return ''
  if (value.replace(/\D/g, '') === String(phone || '').replace(/\D/g, '')) return ''
  if (looksLikeBooking(value)) return ''
  return value
}

function requestedDate(text) {
  const blob = fold(text)
  const today = todayYmd()
  if (/\bamanha\b/.test(blob)) return shiftYmd(today, 1)
  if (/\bhoje\b/.test(blob)) return today
  const slash = blob.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (slash) {
    const day = Number(slash[1])
    const month = Number(slash[2])
    let year = slash[3] ? Number(slash[3]) : Number(today.slice(0, 4))
    if (year < 100) year += 2000
    const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const parsed = new Date(`${ymd}T12:00:00-03:00`)
    if (!Number.isNaN(parsed.getTime())) return ymd
  }
  const dia = blob.match(/\bdia\s+(\d{1,2})\b/)
  if (dia) {
    const day = Number(dia[1])
    return `${today.slice(0, 4)}-${today.slice(5, 7)}-${String(day).padStart(2, '0')}`
  }
  const names = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']
  const idx = names.findIndex((name) => blob.includes(name))
  if (idx < 0) return today
  const current = new Date(`${today}T12:00:00-03:00`).getDay()
  let delta = (idx - current + 7) % 7
  if (delta === 0) delta = 7
  return shiftYmd(today, delta)
}

function dateWasStated(text) {
  const blob = fold(text)
  if (/\b(hoje|amanha)\b/.test(blob)) return true
  if (/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(blob)) return true
  if (/\bdia\s+\d{1,2}\b/.test(blob)) return true
  return ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'].some((name) => blob.includes(name))
}

function requestedTime(text) {
  const blob = fold(text)
  const hm = blob.match(/\b(\d{1,2}):(\d{2})\b/)
  if (hm) {
    const h = Number(hm[1])
    const m = Number(hm[2])
    if (h <= 23 && m <= 59) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const compact = blob.match(/\b(\d{1,2})\s*h\s*(\d{2})\b/)
  if (compact) {
    const h = Number(compact[1])
    const m = Number(compact[2])
    if (h <= 23 && m <= 59) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const hour = blob.match(/\b(\d{1,2})\s*h(?:oras)?\b/)
  if (hour) {
    const h = Number(hour[1])
    if (h <= 23) return padTime(h, 0)
  }
  const spoken = blob.match(/\bas\s+(\d{1,2})(?::(\d{2}))?\b/)
  if (spoken) {
    const h = Number(spoken[1])
    const m = Number(spoken[2] || 0)
    if (h <= 23 && m <= 59) return padTime(h, m)
  }
  return null
}

function wantsAnyBarber(text) {
  return /\b(qualquer|tanto faz|sem preferencia|quem estiver livre|nao tenho preferencia)\b/.test(fold(text))
}

function applyPedido(session, patch) {
  const pedido = session.pedido
  let touched = false
  if (patch.service && pedido.servicoId !== patch.service.id) {
    pedido.servicoId = patch.service.id
    touched = true
  }
  if (patch.dateStated && patch.date && pedido.data !== patch.date) {
    pedido.data = patch.date
    touched = true
  }
  if (patch.horario && pedido.horario !== patch.horario) {
    pedido.horario = patch.horario
    touched = true
  }
  if (patch.anyBarber && pedido.barbeiroId !== 'rodizio') {
    pedido.barbeiroId = 'rodizio'
    touched = true
  } else if (patch.preferred && pedido.barbeiroId !== String(patch.preferred.id)) {
    pedido.barbeiroId = String(patch.preferred.id)
    touched = true
  }
  if (touched) pedido.agendado = false
  return { pedido, touched }
}

function askMissing(nome, missing) {
  const who = nome ? `${nome}, para agendar preciso saber` : 'Para agendar preciso saber'
  if (missing.length === 1) return `${who} ${missing[0]}.`
  const last = missing[missing.length - 1]
  return `${who} ${missing.slice(0, -1).join(', ')} e ${last}.`
}

function matchService(text, servicos) {
  const blob = fold(text)
  const scored = servicos
    .map((svc) => {
      const nome = fold(svc.nome)
      let score = 0
      if (blob.includes(nome)) score += 10
      if (/combo/.test(blob) && /combo/.test(nome)) score += 8
      if ((/fazer a barba|uma barba|so a barba|so barba/.test(blob) || (/\bbarba\b/.test(blob) && !/corte|pigment/.test(blob))) && nome === 'barba tradicional') score += 12
      if (/barba/.test(blob) && /barba/.test(nome) && !/corte/.test(blob) && !/corte/.test(nome) && !/pigment/.test(nome)) score += 6
      if ((/cortar o cabelo|corte de cabelo|corte/.test(blob)) && /corte/.test(nome) && !/barba/.test(nome)) score += 7
      if ((/cortar o cabelo|corte de cabelo|corte/.test(blob)) && nome === 'corte de cabelo') score += 7
      if (/pezinho/.test(blob) && /pezinho/.test(nome)) score += 8
      if (/hidrat/.test(blob) && /hidrat/.test(nome)) score += 8
      if (/sobrancelha/.test(blob) && /sobrancelha/.test(nome)) score += 5
      if (/pigmentacao de barba/.test(blob) && /pigmentacao de barba/.test(nome)) score += 9
      if (/pigmentacao de cabelo/.test(blob) && /pigmentacao de cabelo/.test(nome)) score += 9
      return { svc, score }
    })
    .sort((a, b) => b.score - a.score)
  return scored[0]?.score > 0 ? scored[0].svc : null
}

function matchBarber(text, barbeiros) {
  const blob = fold(text)
  return barbeiros.find((barber) => {
    const first = fold(barber.nome).split(/\s+/)[0]
    return first && blob.includes(first)
  })
}

function mentionedUnknownBarber(text, barbeiros) {
  const blob = fold(text)
  const found = blob.match(/\bcom\s+(?:o\s+|a\s+)?([a-z]{3,})/)
  if (!found) return null
  const name = found[1]
  if (['corte', 'barba', 'cabelo', 'amanha', 'hoje', 'voce', 'horario'].includes(name)) return null
  if (matchBarber(text, barbeiros)) return null
  return name
}

function draftFromText(text, servicos, barbeiros) {
  const dateStated = dateWasStated(text)
  return {
    service: matchService(text, servicos),
    dateStated,
    date: dateStated ? requestedDate(text) : null,
    horario: requestedTime(text),
    anyBarber: wantsAnyBarber(text),
    preferred: wantsAnyBarber(text) ? null : matchBarber(text, barbeiros),
    unknownBarber: mentionedUnknownBarber(text, barbeiros),
    bookingTalk: looksLikeBooking(text),
  }
}

function priceListText(servicos) {
  return servicos.map((svc) => `• ${svc.nome} — R$ ${Number(svc.preco).toFixed(2)}`).join('\n')
}

async function loadTenantCatalog(tenantId) {
  const [servicesSnap, barbersSnap] = await Promise.all([
    adminDb.collection('tenants').doc(tenantId).collection('services').get(),
    adminDb.collection('tenants').doc(tenantId).collection('barbers').get(),
  ])
  const servicos = servicesSnap.docs
    .map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        nome: String(data.nome || data.name || ''),
        preco: Number(data.preco ?? data.price ?? 0),
        duracaoMinutos: Number(data.duracao_minutos ?? data.duracaoMinutos ?? data.durationMinutes ?? 30),
        ativo: data.ativo !== false && data.active !== false,
      }
    })
    .filter((row) => row.ativo && row.nome)
  const seen = new Set()
  const barbeiros = []
  for (const doc of barbersSnap.docs) {
    const data = doc.data()
    if (data.ativo === false || data.active === false) continue
    const nome = String(data.nome || data.name || '').trim()
    const key = fold(nome)
    if (!nome || seen.has(key)) continue
    seen.add(key)
    barbeiros.push({
      id: doc.id,
      nome,
      startHour: data.startHour || data.expediente?.inicio || null,
      endHour: data.endHour || data.expediente?.fim || null,
    })
  }
  return { servicos, barbeiros }
}

async function tenantSlotFree(tenantId, date, barberId, horario, duration) {
  const ref = adminDb.collection('tenants').doc(tenantId).collection('appointments')
  const [byDate, byData] = await Promise.all([
    ref.where('date', '==', date).get(),
    ref.where('data', '==', date).get(),
  ])
  const rows = new Map()
  for (const doc of [...byDate.docs, ...byData.docs]) rows.set(doc.id, doc.data())
  const start = hmToMin(horario)
  const end = appointmentReleaseMin(horario, duration)
  for (const row of rows.values()) {
    const status = String(row.status || '').toLowerCase()
    if (status.includes('cancel')) continue
    const owner = String(row.barberId || row.barbeiro_id || '')
    if (owner !== String(barberId)) continue
    const rowStart = hmToMin(String(row.time || row.horario || '').slice(0, 5))
    const rowDuration = Number(row.duracao_minutos || row.durationMinutes || 30)
    if (rangesOverlap(start, end, rowStart, rowStart + rowDuration)) return false
  }
  return true
}

async function bookTenantAppointment({ tenantId, nome, telefone, date, horario, service, barbeiro }) {
  const createdAt = new Date().toISOString()
  const appointmentId = `wa_${Date.now()}`
  const payload = {
    id: appointmentId,
    barbeiro_id: barbeiro.id,
    barbeiros: { nome: barbeiro.nome },
    barberId: barbeiro.id,
    barberName: barbeiro.nome,
    clientName: nome,
    cliente_nome: nome,
    clientes: { nome, email: '' },
    created_at: createdAt,
    createdAt,
    data: date,
    date,
    horario,
    time: horario,
    origin: 'whatsapp',
    price: Number(service.preco || 0),
    valor: Number(service.preco || 0),
    serviceId: service.id,
    serviceName: service.nome,
    servico_id: service.id,
    servicos: {
      duracao_minutos: service.duracaoMinutos,
      nome: service.nome,
      preco: Number(service.preco || 0),
    },
    status: 'confirmado',
    durationMinutes: service.duracaoMinutos,
    duracao_minutos: service.duracaoMinutos,
    clientPhone: telefone || null,
    cliente_telefone: telefone || null,
    tenantId,
    cloudSynced: false,
  }
  await adminDb.collection('tenants').doc(tenantId).collection('appointments').doc(appointmentId).set(payload)
  return payload
}

function weekdayLabel(ymd) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(`${ymd}T12:00:00.000Z`))
}

function finish(session, text, reply, extra) {
  session.history.push({ from: 'cliente', text }, { from: 'bot', text: reply })
  if (session.history.length > 12) session.history = session.history.slice(-12)
  return {
    reply,
    replyText: reply,
    nome: session.nome,
    pedido: session.pedido,
    history: session.history,
    ...extra,
  }
}

function logTurn(text, entities, action) {
  console.log(`[Mensagem Recebida] ${JSON.stringify(text)}`)
  console.log(
    `[Entidades Extraídas: data=${entities.data || '-'}, hora=${entities.hora || '-'}, barbeiro=${entities.barbeiro || '-'}, servico=${entities.servico || '-'}]`,
  )
  console.log(`[Ação Executada] ${action}`)
}

export async function handleDivaMessage(input) {
  const outbound = assertLocalIsolation()
  const text = String(input.text || '').trim()
  const session = sessionOf(String(input.sessionId || input.telefone || 'teste_local'), input.memory)
  const profileName = usableClientName(input.nome, input.telefone)
  if (profileName && !session.nome) session.nome = profileName
  const tools = []
  const base = { tools, outbound, behavior: 'DIVA_BEHAVIOR.md' }

  const tenantId = String(input.tenantId || '').trim()
  let servicos = []
  let barbeiros = []
  if (tenantId) {
    const catalog = await loadTenantCatalog(tenantId)
    servicos = catalog.servicos
    barbeiros = catalog.barbeiros
    tools.push({ name: 'catalogo_tenant', result: { servicos: servicos.length, barbeiros: barbeiros.length } })
  } else {
    const servicosRes = await listar_servicos()
    tools.push({ name: 'listar_servicos', result: servicosRes })
    servicos = servicosRes.servicos
    barbeiros = (await listCollection('barbeiros')).filter((row) => row.ativo !== false)
  }

  const current = draftFromText(text, servicos, barbeiros)
  if (current.unknownBarber) session.pedido.barbeiroId = null
  applyPedido(session, current)

  const older = [...session.history]
    .filter((item) => (item.from === 'cliente' || item.sender === 'client') && item.text && item.text !== text)
    .reverse()
  for (const item of older) {
    const past = draftFromText(item.text, servicos, barbeiros)
    applyPedido(session, {
      service: session.pedido.servicoId ? null : past.service,
      dateStated: session.pedido.data ? false : past.dateStated,
      date: session.pedido.data ? null : past.date,
      horario: session.pedido.horario ? null : past.horario,
      anyBarber: session.pedido.barbeiroId ? false : past.anyBarber,
      preferred: session.pedido.barbeiroId ? null : past.preferred,
    })
  }

  if (current.bookingTalk || current.service || current.horario || current.date) session.pedido.emAgendamento = true

  const nome = session.nome
  const { pedido } = session
  const service = servicos.find((row) => row.id === pedido.servicoId) || null
  const date = pedido.data || null
  const horario = pedido.horario || null
  const anyBarber = pedido.barbeiroId === 'rodizio'
  const preferred = !anyBarber && pedido.barbeiroId
    ? barbeiros.find((row) => String(row.id) === String(pedido.barbeiroId)) || null
    : null
  const entities = {
    data: date,
    hora: horario,
    barbeiro: current.unknownBarber || preferred?.nome || (anyBarber ? 'rodizio' : null),
    servico: service?.nome || null,
  }

  if ((date && isSunday(date)) || /\bdomingo\b/.test(fold(text))) {
    logTurn(text, entities, 'recusar_domingo')
    const reply = `${nome ? `${nome}, ` : ''}domingo a Divina Barbearia da Varjota não abre. Posso olhar segunda a sábado, das 08:30 às 19:30.`
    return finish(session, text, reply, { ...base, gravou: false, action: 'recusar_domingo' })
  }

  if (current.unknownBarber) {
    const nomes = barbeiros.map((row) => row.nome).join(', ') || 'nenhum profissional cadastrado'
    logTurn(text, entities, 'pedir_barbeiro')
    const reply = `${nome ? `${nome}, ` : ''}não encontrei o barbeiro ${current.unknownBarber}. Os profissionais são: ${nomes}. Com quem você prefere?`
    return finish(session, text, reply, { ...base, gravou: false, action: 'pedir_barbeiro' })
  }

  const complete = Boolean(service && date && horario && (preferred || anyBarber))
  const bookingContext = Boolean(pedido.emAgendamento || current.bookingTalk || service || date || horario || preferred)

  if (pedido.agendado && !current.bookingTalk && !current.service && !current.horario && !current.date) {
    logTurn(text, entities, 'ja_confirmado')
    const reply = `${nome || 'Oi'}, seu horário já está confirmado. Se quiser remarcar ou cancelar, é só dizer.`
    return finish(session, text, reply, { ...base, gravou: false, action: 'ja_confirmado' })
  }

  if (!complete) {
    if (!bookingContext) {
      const greeting = /^(oi|ola|oie|bom dia|boa tarde|boa noite|opa|salve)$/.test(fold(text))
      const action = greeting && !nome ? 'saudacao' : 'fallback'
      logTurn(text, entities, action)
      const reply = greeting && !nome ? NEW_CLIENT_GREETING : GENERIC_FALLBACK
      return finish(session, text, reply, { ...base, gravou: false, action })
    }
    const missing = []
    if (!service) missing.push('o serviço')
    if (!preferred && !anyBarber) missing.push('o barbeiro')
    if (!date) missing.push('a data')
    if (!horario) missing.push('o horário')
    let reply = askMissing(nome, missing)
    if (!service && servicos.length) {
      reply = `Posso agendar. Estes são os serviços:\n${priceListText(servicos)}\n\n${reply}`
    } else if (service && date && !horario && !tenantId) {
      const avail = await consultar_disponibilidade(date, preferred?.id || null, service.duracaoMinutos)
      tools.push({
        name: 'consultar_disponibilidade',
        args: { data: date, barbeiroId: preferred?.id || null },
        result: avail,
      })
      const sample = avail.horarios.slice(0, 6).join(', ')
      if (sample) reply += ` Em ${weekdayLabel(date)} tenho ${sample}.`
    }
    if (preferred || anyBarber) {
      const quem = barbeiros.map((row) => row.nome).filter(Boolean)
      if (!preferred && !anyBarber && quem.length) reply += ` Profissionais: ${quem.join(', ')}.`
    } else if (barbeiros.length) {
      reply += ` Profissionais: ${barbeiros.map((row) => row.nome).join(', ')}.`
    }
    reply += ' Expediente de segunda a sábado, das 08:30 às 19:30.'
    logTurn(text, entities, 'pedir_dados')
    return finish(session, text, reply, { ...base, gravou: false, action: 'pedir_dados' })
  }

  const duration = service.duracaoMinutos
  const cliente = nome || 'Cliente'
  if (!session.nome) session.nome = cliente
  if (!fitsExpediente(horario, duration) || (preferred && !fitsExpediente(horario, duration, preferred.startHour || '08:30', preferred.endHour || '19:30'))) {
    logTurn(text, entities, 'fora_do_expediente')
    const reply = `${cliente}, ${horario} não cabe no expediente. Atendemos de segunda a sábado, das 08:30 às 19:30, e ${service.nome} leva ${duration} minutos.`
    return finish(session, text, reply, { ...base, gravou: false, action: 'fora_do_expediente' })
  }
  if (isPastSlotToday(date, horario)) {
    logTurn(text, entities, 'horario_passado')
    const reply = `${cliente}, ${horario} em ${weekdayLabel(date)} já passou. Me diga outro horário.`
    return finish(session, text, reply, { ...base, gravou: false, action: 'horario_passado' })
  }

  if (tenantId) {
    let barbeiro = preferred
    if (!barbeiro) {
      for (const candidate of barbeiros) {
        if (await tenantSlotFree(tenantId, date, candidate.id, horario, duration)) {
          barbeiro = candidate
          break
        }
      }
    }
    const livre = Boolean(barbeiro && await tenantSlotFree(tenantId, date, barbeiro.id, horario, duration))
    if (!livre) {
      logTurn(text, entities, 'horario_ocupado')
      const reply = `${cliente}, ${horario} em ${weekdayLabel(date)} não está livre${preferred ? ` para ${preferred.nome}` : ''}. Quer outro horário ou outro profissional?`
      return finish(session, text, reply, { ...base, gravou: false, action: 'horario_ocupado' })
    }
    const agendamento = await bookTenantAppointment({
      tenantId,
      nome: cliente,
      telefone: input.telefone,
      date,
      horario,
      service,
      barbeiro,
    })
    pedido.agendado = true
    pedido.emAgendamento = false
    logTurn(text, { ...entities, barbeiro: barbeiro.nome }, 'agendar')
    const reply = `${cliente}, agendamento confirmado: ${service.nome} com ${barbeiro.nome}, ${weekdayLabel(date)} às ${horario}, R$ ${Number(service.preco).toFixed(2)}.`
    return finish(session, text, reply, { ...base, gravou: true, action: 'agendar', agendamento })
  }

  const avail = await consultar_disponibilidade(date, preferred?.id || null, duration, horario)
  tools.push({
    name: 'consultar_disponibilidade',
    args: { data: date, barbeiroId: preferred?.id || null, horario },
    result: avail,
  })

  let barbeiro = preferred
  if (!barbeiro) {
    const next = await obter_proximo_barbeiro_rodizio({ data: date, horario, durationMin: duration })
    tools.push({ name: 'obter_proximo_barbeiro_rodizio', result: next })
    barbeiro = next.barbeiro
  } else {
    tools.push({
      name: 'obter_proximo_barbeiro_rodizio',
      skipped: true,
      motivo: 'cliente_escolheu_profissional',
    })
  }

  const livres = avail.barbeirosLivres?.[horario] || []
  const livre = Boolean(barbeiro && livres.some((row) => row.id === String(barbeiro.id)))
  if (!livre) {
    if (preferred) {
      const ocupantes = await ocupacaoNoHorario(date, preferred.id, horario, duration)
      const house = await consultar_disponibilidade(date, null, duration, horario)
      const outros = (house.barbeirosLivres?.[horario] || []).filter((row) => row.id !== String(preferred.id))
      const proximoDele = avail.horarios.find((hm) => hm > horario) || avail.horarios[0]
      const ocupadoPor = ocupantes[0]?.clienteNome || 'outro cliente'
      const partes = [
        `${nome}, ${preferred.nome} não está livre às ${horario} em ${weekdayLabel(date)}.`,
      ]
      if (ocupantes[0]) partes[0] = `${nome}, ${preferred.nome} já está com ${ocupadoPor} às ${horario} em ${weekdayLabel(date)}.`
      if (proximoDele) partes.push(`O próximo horário livre dele é ${proximoDele}.`)
      if (outros[0]) partes.push(`Se quiser manter ${horario}, ${outros[0].nome} está livre.`)
      partes.push('Expediente das 08:30 às 19:30, sem domingo.')
      logTurn(text, entities, 'horario_ocupado')
      return finish(session, text, partes.join(' '), {
        ...base,
        gravou: false,
        colisao: { barbeiro: preferred.nome, ocupadoPor, horario, proximoDele, outros },
      })
    }
    const alt = avail.horarios.filter((hm) => hm !== horario).slice(0, 5).join(', ') || 'nenhum horário livre neste dia'
    logTurn(text, entities, 'horario_ocupado')
    const reply = `${cliente}, ${horario} em ${weekdayLabel(date)} não está livre. Alternativas: ${alt}. Expediente das 08:30 às 19:30, sem domingo.`
    return finish(session, text, reply, { ...base, gravou: false, action: 'horario_ocupado' })
  }

  const created = await criar_agendamento({
    clienteNome: cliente,
    telefone: input.telefone,
    data: date,
    horario,
    servicoId: service.id,
    barbeiroId: barbeiro.id,
    status: 'confirmado',
  })
  tools.push({ name: 'criar_agendamento', result: created })
  if (!created.ok) {
    logTurn(text, entities, 'falha_gravacao')
    const reply = `${cliente}, não consegui gravar: ${created.error}`
    return finish(session, text, reply, { ...base, gravou: false, action: 'falha_gravacao' })
  }

  pedido.agendado = true
  pedido.emAgendamento = false
  const profissional = created.agendamento.barbeiro?.nome || barbeiro.nome
  logTurn(text, { ...entities, barbeiro: profissional }, 'agendar')
  const reply = `${cliente}, agendamento confirmado na Divina Barbearia Varjota: ${service.nome} com ${profissional}, ${weekdayLabel(date)} às ${horario}, R$ ${Number(service.preco).toFixed(2)}.`
  return finish(session, text, reply, { ...base, gravou: true, action: 'agendar', agendamento: created.agendamento })
}

export function extractUazapiInbound(payload = {}) {
  const nested = payload.message && typeof payload.message === 'object' ? payload.message : {}
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {}
  const text =
    payload.text ||
    nested.text ||
    nested.conversation ||
    nested?.extendedTextMessage?.text ||
    data.text ||
    payload.body ||
    ''
  const telefone = String(
    payload.chatid || payload.sender || nested.chatid || nested.sender || data.chatid || payload.phone || '',
  ).replace(/\D/g, '')
  const nome = String(payload.pushName || nested.pushName || payload.nome || '').trim()
  const fromMe = Boolean(payload.fromMe || nested.fromMe)
  return { text: String(text).trim(), telefone, nome, fromMe }
}
