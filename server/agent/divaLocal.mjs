import { divaSystemPrompt } from './divaPrompt.mjs'
import {
  consultar_disponibilidade,
  criar_agendamento,
  listar_servicos,
  ocupacaoNoHorario,
  obter_proximo_barbeiro_rodizio,
} from '../tools/divaTools.mjs'
import { listCollection } from '../lib/firestoreShop.mjs'
import { fitsExpediente, isSunday, shiftYmd, todayYmd } from '../lib/time.mjs'
import { assertLocalIsolation } from '../lib/whatsappLock.mjs'

export const DIVA_SYSTEM_PROMPT = divaSystemPrompt()

export const NEW_CLIENT_GREETING =
  'Olá! Seja bem-vindo à Divina Barbearia da Varjota. Como posso te chamar?'

const sessions = new Map()

function fold(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function sessionOf(key) {
  if (!sessions.has(key)) sessions.set(key, { nome: '', history: [], pedido: {} })
  const session = sessions.get(key)
  if (!session.pedido) session.pedido = {}
  return session
}

function requestedDate(text) {
  const blob = fold(text)
  const today = todayYmd()
  if (/\bamanha\b/.test(blob)) return shiftYmd(today, 1)
  if (/\bhoje\b/.test(blob)) return today
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
  const hour = blob.match(/\b(?:as|às)?\s*(\d{1,2})\s*h(?:oras)?\b/) || blob.match(/\b(\d{1,2})\s*h\b/)
  if (hour) {
    const h = Number(hour[1])
    if (h <= 23) return `${String(h).padStart(2, '0')}:00`
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
  if (missing.length === 1) return `${nome}, para agendar preciso saber ${missing[0]}.`
  const last = missing[missing.length - 1]
  return `${nome}, para agendar preciso saber ${missing.slice(0, -1).join(', ')} e ${last}.`
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
  return { reply, ...extra }
}

export async function handleDivaMessage(input) {
  const outbound = assertLocalIsolation()
  const text = String(input.text || '').trim()
  const session = sessionOf(String(input.sessionId || input.telefone || 'teste_local'))
  if (input.nome) session.nome = String(input.nome).trim()
  const nome = session.nome
  const tools = []
  const base = { tools, outbound, behavior: 'DIVA_BEHAVIOR.md' }

  if (!nome) {
    return finish(session, text, NEW_CLIENT_GREETING, { ...base, gravou: false, sessionId: input.sessionId || null })
  }

  const servicosRes = await listar_servicos()
  tools.push({ name: 'listar_servicos', result: servicosRes })
  const mentionedService = matchService(text, servicosRes.servicos)
  const dateStated = dateWasStated(text)
  const mentionedDate = dateStated ? requestedDate(text) : null

  if ((mentionedDate && isSunday(mentionedDate)) || /\bdomingo\b/.test(fold(text))) {
    const reply = `${nome}, domingo a Divina Barbearia da Varjota não abre. Posso olhar segunda a sábado, das 08:30 às 19:30.`
    return finish(session, text, reply, { ...base, gravou: false })
  }

  const barbeiros = (await listCollection('barbeiros')).filter((row) => row.ativo !== false)
  const { pedido, touched } = applyPedido(session, {
    service: mentionedService,
    dateStated,
    date: mentionedDate,
    horario: requestedTime(text),
    anyBarber: wantsAnyBarber(text),
    preferred: wantsAnyBarber(text) ? null : matchBarber(text, barbeiros),
  })

  const service = servicosRes.servicos.find((row) => row.id === pedido.servicoId) || null
  const date = pedido.data || null
  const horario = pedido.horario || null
  const anyBarber = pedido.barbeiroId === 'rodizio'
  const preferred = !anyBarber && pedido.barbeiroId
    ? barbeiros.find((row) => String(row.id) === String(pedido.barbeiroId)) || null
    : null
  const complete = Boolean(service && date && horario && (preferred || anyBarber))

  if (pedido.agendado && !touched) {
    const reply = `${nome}, seu horário já está confirmado. Se quiser remarcar ou cancelar, é só dizer.`
    return finish(session, text, reply, { ...base, gravou: false })
  }

  if (!complete) {
    const missing = []
    if (!service) missing.push('o serviço')
    if (!preferred && !anyBarber) missing.push('o barbeiro')
    if (!date) missing.push('a data')
    if (!horario) missing.push('o horário')
    let reply = askMissing(nome, missing)
    if (service && date && !horario) {
      const avail = await consultar_disponibilidade(date, preferred?.id || null, service.duracaoMinutos)
      tools.push({
        name: 'consultar_disponibilidade',
        args: { data: date, barbeiroId: preferred?.id || null },
        result: avail,
      })
      const sample = avail.horarios.slice(0, 6).join(', ')
      if (sample) reply += ` Em ${weekdayLabel(date)} tenho ${sample}.`
    }
    reply += ' Expediente de segunda a sábado, das 08:30 às 19:30.'
    return finish(session, text, reply, { ...base, gravou: false })
  }

  const duration = service.duracaoMinutos
  if (!fitsExpediente(horario, duration)) {
    const reply = `${nome}, ${horario} não cabe no expediente. Atendemos de segunda a sábado, das 08:30 às 19:30, e ${service.nome} leva ${duration} minutos.`
    return finish(session, text, reply, { ...base, gravou: false })
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
      return finish(session, text, partes.join(' '), {
        ...base,
        gravou: false,
        colisao: { barbeiro: preferred.nome, ocupadoPor, horario, proximoDele, outros },
      })
    }
    const alt = avail.horarios.filter((hm) => hm !== horario).slice(0, 5).join(', ') || 'nenhum horário livre neste dia'
    const reply = `${nome}, ${horario} em ${weekdayLabel(date)} não está livre. Alternativas: ${alt}. Expediente das 08:30 às 19:30, sem domingo.`
    return finish(session, text, reply, { ...base, gravou: false })
  }

  const created = await criar_agendamento({
    clienteNome: nome,
    telefone: input.telefone,
    data: date,
    horario,
    servicoId: service.id,
    barbeiroId: barbeiro.id,
    status: 'confirmado',
  })
  tools.push({ name: 'criar_agendamento', result: created })
  if (!created.ok) {
    const reply = `${nome}, não consegui gravar: ${created.error}`
    return finish(session, text, reply, { ...base, gravou: false })
  }

  pedido.agendado = true
  const profissional = created.agendamento.barbeiro?.nome || barbeiro.nome
  const reply = `${nome}, agendamento confirmado na Divina Barbearia Varjota: ${service.nome} com ${profissional}, ${weekdayLabel(date)} às ${horario}, R$ ${Number(service.preco).toFixed(2)}.`
  return finish(session, text, reply, { ...base, gravou: true, agendamento: created.agendamento })
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
