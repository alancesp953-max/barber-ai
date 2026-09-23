import {
  addDocument,
  durationOf,
  listCollection,
  normalizeAppointmentStatus,
  ordemOf,
  priceOf,
} from '../lib/firestoreShop.mjs'
import {
  generateDaySlots,
  hmToMin,
  isPastSlotToday,
  isSunday,
  rangesOverlap,
  SHOP_CLOSE,
  SHOP_OPEN,
} from '../lib/time.mjs'

function activeBarbers(rows) {
  return rows
    .filter((row) => row.ativo !== false)
    .sort((a, b) => ordemOf(a) - ordemOf(b) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
}

function barberBreak(barber) {
  if (barber?.intervalo_ativo !== true) return null
  const inicio = String(barber.intervalo_inicio || '').slice(0, 5)
  const fim = String(barber.intervalo_fim || '').slice(0, 5)
  if (!/^\d{2}:\d{2}$/.test(inicio) || !/^\d{2}:\d{2}$/.test(fim)) return null
  if (hmToMin(fim) <= hmToMin(inicio)) return null
  return { inicio, fim }
}

function expedienteOf(barber) {
  const inicio = String(barber?.expediente?.inicio || SHOP_OPEN).slice(0, 5)
  const fim = String(barber?.expediente?.fim || SHOP_CLOSE).slice(0, 5)
  return { inicio, fim }
}

function appointmentBusy(row) {
  const status = String(row.status || '').toLowerCase()
  return !status.includes('cancel') && !status.includes('conclu')
}

export async function listar_servicos() {
  const rows = await listCollection('servicos')
  const servicos = rows
    .filter((row) => row.ativo !== false)
    .map((row) => ({
      id: String(row.id),
      nome: String(row.nome || ''),
      preco: priceOf(row),
      duracaoMinutos: durationOf(row),
      descricao: String(row.descricao || ''),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  return { ok: true, servicos }
}

function barberIdOf(row) {
  return String(row.barbeiro_id || row.barbeiroId || '')
}

function occupantOf(row) {
  return String(row.clienteNome || row.cliente_nome || row.clientes?.nome || 'outro cliente').trim()
}

export async function ocupacaoNoHorario(ymd, barbeiroId, horario, durationMin = 25) {
  const agendamentos = await listCollection('agendamentos')
  const servicos = await listCollection('servicos')
  const durationByService = new Map(servicos.map((svc) => [String(svc.id), durationOf(svc)]))
  const start = hmToMin(horario)
  const end = start + durationMin
  return agendamentos
    .filter((row) => String(row.data) === ymd && appointmentBusy(row) && barberIdOf(row) === String(barbeiroId))
    .filter((row) => {
      const a0 = hmToMin(String(row.horario).slice(0, 5))
      const a1 = a0 + (durationByService.get(String(row.servico_id || row.servicoId)) || 30)
      return rangesOverlap(start, end, a0, a1)
    })
    .map((row) => ({
      id: row.id,
      clienteNome: occupantOf(row),
      horario: String(row.horario).slice(0, 5),
      status: normalizeAppointmentStatus(row.status),
    }))
}

export async function consultar_disponibilidade(data, barbeiroId, durationMin) {
  const ymd = String(data || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return { ok: false, motivo: 'data_invalida', horarios: [], barbeirosLivres: [] }
  }
  if (isSunday(ymd)) {
    return {
      ok: false,
      motivo: 'domingo',
      mensagem: 'A Divina Barbearia da Varjota não funciona aos domingos.',
      horarios: [],
      barbeirosLivres: [],
    }
  }

  const [servicos, barbeiros, agendamentos] = await Promise.all([
    listCollection('servicos'),
    listCollection('barbeiros'),
    listCollection('agendamentos'),
  ])
  const wantedId = barbeiroId ? String(barbeiroId) : ''
  const pool = activeBarbers(barbeiros).filter((row) => !wantedId || String(row.id) === wantedId)
  if (!pool.length) {
    return { ok: false, motivo: 'barbeiro_indisponivel', horarios: [], barbeirosLivres: [] }
  }

  const durationByService = new Map(servicos.map((svc) => [String(svc.id), durationOf(svc)]))
  const dayAppointments = agendamentos.filter((row) => String(row.data) === ymd && appointmentBusy(row))
  const duration = Math.max(Number(durationMin) || 25, 15)
  const union = new Set()
  const livresPorHorario = {}

  for (const barber of pool) {
    const hours = expedienteOf(barber)
    const br = barberBreak(barber)
    const own = dayAppointments.filter((row) => barberIdOf(row) === String(barber.id))
    for (const hm of generateDaySlots(hours.inicio, hours.fim, duration)) {
      if (isPastSlotToday(ymd, hm)) continue
      const start = hmToMin(hm)
      const end = start + duration
      if (br && rangesOverlap(start, end, hmToMin(br.inicio), hmToMin(br.fim))) continue
      const clash = own.some((row) => {
        const a0 = hmToMin(String(row.horario).slice(0, 5))
        const a1 = a0 + (durationByService.get(String(row.servico_id || row.servicoId)) || 30)
        return rangesOverlap(start, end, a0, a1)
      })
      if (clash) continue
      union.add(hm)
      if (!livresPorHorario[hm]) livresPorHorario[hm] = []
      livresPorHorario[hm].push({
        id: String(barber.id),
        nome: String(barber.nome || ''),
        ordemRodizio: ordemOf(barber),
        agendaDoDia: own.length,
      })
    }
  }

  const horarios = [...union].sort()
  return {
    ok: horarios.length > 0,
    data: ymd,
    barbeiroId: wantedId || null,
    horarios,
    barbeirosLivres: livresPorHorario,
    expediente: { inicio: SHOP_OPEN, fim: SHOP_CLOSE },
  }
}

export async function obter_proximo_barbeiro_rodizio(opts = {}) {
  const barbeiros = activeBarbers(await listCollection('barbeiros'))
  if (!barbeiros.length) return { ok: false, barbeiro: null }

  const ymd = opts.data ? String(opts.data).slice(0, 10) : ''
  const horario = opts.horario ? String(opts.horario).slice(0, 5) : ''
  if (ymd && horario) {
    const slots = await consultar_disponibilidade(ymd, null, opts.durationMin)
    const livres = [...(slots.barbeirosLivres?.[horario] || [])].sort((a, b) => {
      const load = (a.agendaDoDia || 0) - (b.agendaDoDia || 0)
      if (load !== 0) return load
      return a.ordemRodizio - b.ordemRodizio
    })
    const picked = livres[0]
    if (picked) {
      const full = barbeiros.find((row) => String(row.id) === picked.id)
      return {
        ok: true,
        barbeiro: full || picked,
        motivo: picked.agendaDoDia > 0 ? 'livre_no_horario' : 'rodizio_menos_carregado',
      }
    }
    return { ok: false, barbeiro: null, motivo: 'horario_ocupado' }
  }

  const first = barbeiros[0]
  return {
    ok: true,
    barbeiro: {
      id: String(first.id),
      nome: String(first.nome || ''),
      ordemRodizio: ordemOf(first),
      email: first.email || null,
      telefone: first.telefone || null,
    },
    motivo: 'primeiro_da_fila',
  }
}

export async function criar_agendamento(dados = {}) {
  const nome = String(dados.clienteNome || dados.nome || '').trim()
  if (!nome) {
    return { ok: false, error: 'Não conclua agendamento sem o nome do cliente.' }
  }
  const ymd = String(dados.data || '').slice(0, 10)
  const horario = String(dados.horario || '').slice(0, 5)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !/^\d{2}:\d{2}$/.test(horario)) {
    return { ok: false, error: 'data e horario são obrigatórios.' }
  }
  if (isSunday(ymd)) {
    return { ok: false, error: 'A casa não funciona aos domingos.' }
  }
  if (isPastSlotToday(ymd, horario)) {
    return { ok: false, error: 'Esse horário já passou.' }
  }

  const servicos = (await listar_servicos()).servicos
  const service =
    servicos.find((row) => row.id === dados.servicoId) ||
    servicos.find((row) => row.nome.toLowerCase() === String(dados.servicoNome || '').toLowerCase())
  if (!service) return { ok: false, error: 'Serviço oficial não encontrado no cadastro.' }

  let barbeiroId = dados.barbeiroId ? String(dados.barbeiroId) : ''
  if (!barbeiroId) {
    const next = await obter_proximo_barbeiro_rodizio({ data: ymd, horario })
    if (!next.ok || !next.barbeiro) {
      return { ok: false, error: 'Nenhum barbeiro livre nesse horário (rodízio).' }
    }
    barbeiroId = String(next.barbeiro.id)
  }

  const avail = await consultar_disponibilidade(ymd, barbeiroId, service.duracaoMinutos)
  const livres = avail.barbeirosLivres?.[horario] || []
  if (!livres.some((row) => row.id === barbeiroId)) {
    return { ok: false, error: 'Horário indisponível na escala deste barbeiro.' }
  }

  const status = normalizeAppointmentStatus(dados.status || 'confirmado')
  const barbeiros = await listCollection('barbeiros')
  const barber = barbeiros.find((row) => String(row.id) === barbeiroId)
  const row = await addDocument('agendamentos', {
    data: ymd,
    horario: `${horario}:00`,
    barbeiro_id: barbeiroId,
    servico_id: service.id,
    cliente_nome: nome,
    cliente_telefone: dados.telefone || null,
    status,
    valor: service.preco,
    origem: 'diva_local',
    created_at: new Date().toISOString(),
  })

  return {
    ok: true,
    agendamento: {
      ...row,
      servico: service,
      barbeiro: barber ? { id: barber.id, nome: barber.nome } : { id: barbeiroId },
    },
  }
}
