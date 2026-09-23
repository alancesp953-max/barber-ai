import {
  consultar_disponibilidade,
  criar_agendamento,
  listar_servicos,
  ocupacaoNoHorario,
  obter_proximo_barbeiro_rodizio,
} from '../tools/divaTools.mjs'
import { listCollection } from '../lib/firestoreShop.mjs'
import { isSunday, shiftYmd, todayYmd } from '../lib/time.mjs'
import { assertLocalIsolation } from '../lib/whatsappLock.mjs'

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
  if (!sessions.has(key)) sessions.set(key, { nome: '', history: [] })
  return sessions.get(key)
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

function requestedTime(text) {
  const blob = fold(text)
  const hm = blob.match(/\b(\d{1,2}):(\d{2})\b/)
  if (hm) {
    const h = Number(hm[1])
    const m = Number(hm[2])
    if (h <= 23 && m <= 59) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const hour = blob.match(/\b(?:as|às)?\s*(\d{1,2})\s*h(?:oras)?\b/) || blob.match(/\b(\d{1,2})\s*h\b/)
  if (hour) {
    const h = Number(hour[1])
    if (h <= 23) return `${String(h).padStart(2, '0')}:00`
  }
  return null
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

export async function handleDivaMessage(input) {
  const outbound = assertLocalIsolation()
  const text = String(input.text || '').trim()
  const session = sessionOf(String(input.sessionId || input.telefone || 'teste_local'))
  if (input.nome) session.nome = String(input.nome).trim()
  const nome = session.nome

  const tools = []
  if (!nome) {
    const reply = NEW_CLIENT_GREETING
    session.history.push({ from: 'cliente', text }, { from: 'bot', text: reply })
    return { reply, tools, outbound, gravou: false, sessionId: input.sessionId || null }
  }

  const servicosRes = await listar_servicos()
  tools.push({ name: 'listar_servicos', result: servicosRes })
  const service = matchService(text, servicosRes.servicos) || servicosRes.servicos.find((row) => row.id === 'corte-de-cabelo')
  const date = requestedDate(text)
  const horario = requestedTime(text)

  if (isSunday(date) || /\bdomingo\b/.test(fold(text))) {
    const reply = `${nome}, domingo a Divina Barbearia da Varjota não abre. Posso olhar segunda a sábado, das 08:30 às 19:30.`
    session.history.push({ from: 'cliente', text }, { from: 'bot', text: reply })
    return { reply, tools, outbound, gravou: false }
  }

  const barbeiros = (await listCollection('barbeiros')).filter((row) => row.ativo !== false)
  const wantsAny = /\bqualquer\b/.test(fold(text))
  const preferred = wantsAny ? null : matchBarber(text, barbeiros)
  const duration = service?.duracaoMinutos || 25
  const avail = await consultar_disponibilidade(date, preferred?.id, duration)
  tools.push({
    name: 'consultar_disponibilidade',
    args: { data: date, barbeiroId: preferred?.id || null },
    result: avail,
  })

  let barbeiro = preferred
  if (!barbeiro) {
    const next = await obter_proximo_barbeiro_rodizio({
      data: date,
      horario: horario || undefined,
      durationMin: duration,
    })
    tools.push({ name: 'obter_proximo_barbeiro_rodizio', result: next })
    barbeiro = next.barbeiro
  } else {
    tools.push({
      name: 'obter_proximo_barbeiro_rodizio',
      skipped: true,
      motivo: 'cliente_escolheu_profissional',
    })
  }

  if (horario && preferred && !avail.horarios.includes(horario)) {
    const ocupantes = await ocupacaoNoHorario(date, preferred.id, horario, duration)
    const house = await consultar_disponibilidade(date, null, duration)
    const outros = (house.barbeirosLivres?.[horario] || []).filter((row) => row.id !== String(preferred.id))
    const proximoDele = avail.horarios.find((hm) => hm > horario) || avail.horarios[0]
    const ocupadoPor = ocupantes[0]?.clienteNome || 'outro cliente'
    const partes = [
      `${nome}, ${preferred.nome} já está com ${ocupadoPor} às ${horario} em ${weekdayLabel(date)}.`,
    ]
    if (proximoDele) partes.push(`O próximo horário livre dele é ${proximoDele}.`)
    if (outros[0]) partes.push(`Se quiser manter ${horario}, ${outros[0].nome} está livre.`)
    partes.push('Expediente das 08:30 às 19:30, sem domingo.')
    const reply = partes.join(' ')
    session.history.push({ from: 'cliente', text }, { from: 'bot', text: reply })
    return {
      reply,
      tools,
      outbound,
      gravou: false,
      colisao: { barbeiro: preferred.nome, ocupadoPor, horario, proximoDele, outros },
    }
  }

  if (horario && avail.horarios.includes(horario)) {
    const wantsBook = Boolean(input.gravar) || /\b(confirma|pode marcar|pode agendar|fecha|fechado)\b/.test(fold(text))
    if (wantsBook) {
      const created = await criar_agendamento({
        clienteNome: nome,
        telefone: input.telefone,
        data: date,
        horario,
        servicoId: service?.id,
        barbeiroId: barbeiro?.id,
        status: 'confirmado_teste',
      })
      tools.push({ name: 'criar_agendamento', result: created })
      if (created.ok) {
        const reply = `${nome}, neste teste o horário de ${weekdayLabel(date)} às ${horario} com ${created.agendamento.barbeiro.nome} para ${service.nome} (R$ ${service.preco.toFixed(2)}) está reservado como ${created.agendamento.status}. Nada foi enviado no WhatsApp oficial.`
        session.history.push({ from: 'cliente', text }, { from: 'bot', text: reply })
        return { reply, tools, outbound, gravou: true, agendamento: created.agendamento }
      }
      const reply = `${nome}, não consegui gravar: ${created.error}`
      session.history.push({ from: 'cliente', text }, { from: 'bot', text: reply })
      return { reply, tools, outbound, gravou: false }
    }
    const profissional = barbeiro?.nome || 'o próximo da fila'
    const reply = `${nome}, ${weekdayLabel(date)} às ${horario} está livre com ${profissional} para ${service.nome}, R$ ${Number(service.preco).toFixed(2)}, ${service.duracaoMinutos} minutos. Neste teste nada foi gravado em produção. Quer que eu confirme?`
    session.history.push({ from: 'cliente', text }, { from: 'bot', text: reply })
    return { reply, tools, outbound, gravou: false, slot: { data: date, horario, barbeiro, servico: service } }
  }

  if (horario && !avail.horarios.includes(horario)) {
    const alt = avail.horarios.slice(0, 5).join(', ') || 'nenhum horário livre neste recorte'
    const reply = `${nome}, ${horario} em ${weekdayLabel(date)} não está livre. Alternativas: ${alt}. Expediente das 08:30 às 19:30, sem domingo.`
    session.history.push({ from: 'cliente', text }, { from: 'bot', text: reply })
    return { reply, tools, outbound, gravou: false }
  }

  const sample = avail.horarios.slice(0, 6).join(', ') || 'sem vagas neste dia'
  const reply = `${nome}, para ${service?.nome || 'o serviço'} em ${weekdayLabel(date)} tenho ${sample}. Qual horário prefere?`
  session.history.push({ from: 'cliente', text }, { from: 'bot', text: reply })
  return { reply, tools, outbound, gravou: false }
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
