import { generateAttendantReply, sanitizeSpeechForElevenLabs } from './audioSettings'
import { divaBehaviorRules } from './divaBehavior'
import { isFirebaseConfigured } from './firebase'
import { listFirestoreCollection } from './firestoreShop'
import { mockAvailableSlots } from './mockAvailability'
import { getTable } from './mockDb'

/** Isolated lab session. Never the official WhatsApp production instance. */
export const LOCAL_AUDIO_SESSION_ID = 'teste_local_audio'

type ShopRows = Record<string, Record<string, unknown>[]>

async function loadShopRows(): Promise<ShopRows> {
  if (isFirebaseConfigured()) {
    const [barbeiros, servicos, agendamentos] = await Promise.all([
      listFirestoreCollection('barbeiros'),
      listFirestoreCollection('servicos'),
      listFirestoreCollection('agendamentos'),
    ])
    return { barbeiros, servicos, agendamentos }
  }
  return {
    barbeiros: getTable('barbeiros'),
    servicos: getTable('servicos'),
    agendamentos: getTable('agendamentos'),
  }
}

function todayYmd() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '01'
  return `${get('year')}-${get('month')}-${get('day')}`
}

function shiftYmd(ymd: string, days: number) {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

function weekdayLabel(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

function localBarbers(rows: Record<string, unknown>[]) {
  return rows
    .filter((row) => row.ativo !== false)
    .sort((a, b) => Number(a.ordem_rodizio || 0) - Number(b.ordem_rodizio || 0))
    .map((row) => ({
      id: String(row.id),
      nome: String(row.nome || ''),
      intervalo:
        row.intervalo_ativo === true && row.intervalo_inicio && row.intervalo_fim
          ? `${String(row.intervalo_inicio).slice(0, 5)} às ${String(row.intervalo_fim).slice(0, 5)}`
          : 'sem intervalo cadastrado',
    }))
}

function localServices(rows: Record<string, unknown>[]) {
  return rows
    .filter((row) => row.ativo !== false)
    .map((row) => ({
      id: String(row.id),
      nome: String(row.nome || ''),
      preco: Number(row.preco) || 0,
      duracao: Number(row.duracao_minutos) || 30,
    }))
}

function defaultServiceId(services: ReturnType<typeof localServices>) {
  return services.find((svc) => /corte/i.test(svc.nome))?.id || services[0]?.id || null
}

function slotsLine(ymd: string, tables: ShopRows, barbeiroId?: string | null) {
  const serviceId = defaultServiceId(localServices(tables.servicos || []))
  const slots = mockAvailableSlots({
    p_data: ymd,
    p_servico_id: serviceId,
    p_barbeiro_id: barbeiroId || null,
    p_allow_past: false,
  }, tables).slice(0, 8)
  return slots.length ? slots.join(', ') : 'nenhum horário livre'
}

function matchBarber(text: string, barbers: ReturnType<typeof localBarbers>) {
  const blob = text.toLowerCase()
  return barbers.find((barber) => {
    const first = barber.nome.split(/\s+/)[0]?.toLowerCase()
    return first && blob.includes(first)
  })
}

function requestedDate(text: string) {
  const blob = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const today = todayYmd()
  if (/\bamanha\b/.test(blob)) return shiftYmd(today, 1)
  if (/\bhoje\b/.test(blob)) return today
  const names = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']
  const idx = names.findIndex((name) => blob.includes(name))
  if (idx < 0) return today
  const [y, m, d] = today.split('-').map(Number)
  const current = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  let delta = (idx - current + 7) % 7
  if (delta === 0) delta = 7
  return shiftYmd(today, delta)
}

async function buildLocalSnapshot(userText: string) {
  const today = todayYmd()
  const tomorrow = shiftYmd(today, 1)
  const tables = await loadShopRows()
  const barbers = localBarbers(tables.barbeiros || [])
  const services = localServices(tables.servicos || [])
  const wantedBarber = matchBarber(userText, barbers)
  const wantedDate = requestedDate(userText)
  const shop = getTable('configuracoes')[0] || {}

  const barberLines = barbers
    .map(
      (barber, index) =>
        `${index + 1}. ${barber.nome} (rodízio ${index + 1}, ${barber.intervalo}). Hoje: ${slotsLine(today, tables, barber.id)}. Amanhã: ${slotsLine(tomorrow, tables, barber.id)}.`,
    )
    .join('\n')
  const serviceLines = services
    .map((svc) => `${svc.nome}: ${svc.preco} reais, ${svc.duracao} minutos`)
    .join('; ')

  return `session_id: ${LOCAL_AUDIO_SESSION_ID}
Canal: simulador de áudio local isolado. Proibido WhatsApp oficial, proibido webhook de produção, proibido gravar agendamento real.
Hoje: ${weekdayLabel(today)} (${today}, America/Fortaleza). Amanhã: ${weekdayLabel(tomorrow)}.
Endereço: ${String(shop.endereco || 'Rua Castro Monte 165, Varjota, Fortaleza')}.
Expediente da casa: segunda a sábado 08:30-19:30; domingo fechado.
Serviços do painel local: ${serviceLines || 'nenhum serviço cadastrado'}.
Barbeiros e vagas reais do banco local (somente leitura):
${barberLines || 'nenhum barbeiro ativo'}
Pedido aparente: ${wantedBarber ? `barbeiro ${wantedBarber.nome}` : 'sem barbeiro preferido'}, data ${weekdayLabel(wantedDate)} (${wantedDate}), vagas nesse recorte: ${slotsLine(wantedDate, tables, wantedBarber?.id || null)}.
`
}

function localDivaSystemPrompt() {
  return `Você está no laboratório local isolado da Diva (session_id ${LOCAL_AUDIO_SESSION_ID}).
Leia e siga as regras canônicas abaixo. Use só os barbeiros, serviços e horários do snapshot local.
Não invente profissional. Não ofereça domingo. Não confirme reserva real: se o horário estiver livre, diga que neste teste o horário está disponível e que nada foi gravado em produção.
Se o cliente ainda não tiver nome cadastrado, a primeira resposta DEVE ser exatamente: Olá! Seja bem-vindo à Divina Barbearia da Varjota. Como posso te chamar?
Termine sempre a frase. Não corte no meio. Português natural, sem markdown, sem listas, sem emojis, sem asteriscos e sem dizer que é inteligência artificial.

${divaBehaviorRules()}
`
}

export const NEW_CLIENT_GREETING =
  'Olá! Seja bem-vindo à Divina Barbearia da Varjota. Como posso te chamar?'

export async function generateLocalDivaAudioReply(
  userText: string,
  history: Array<{ from: 'cliente' | 'bot'; text: string }> = [],
  clientName?: string,
) {
  const nome = String(clientName || '').trim()
  if (!nome) {
    return {
      ok: true as const,
      text: NEW_CLIENT_GREETING,
      usedFallback: false,
      sessionId: LOCAL_AUDIO_SESSION_ID,
    }
  }
  const snapshot = await buildLocalSnapshot(userText)
  const result = await generateAttendantReply(userText, history, nome, {
    systemPrompt: `${localDivaSystemPrompt()}\n\nSNAPSHOT LOCAL (somente leitura):\n${snapshot}`,
    sessionId: LOCAL_AUDIO_SESSION_ID,
    maxOutputTokens: 400,
  })
  return {
    ...result,
    text: sanitizeSpeechForElevenLabs(result.text),
    sessionId: LOCAL_AUDIO_SESSION_ID,
  }
}
