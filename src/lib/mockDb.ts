import { SHOP_DEFAULTS } from './shopDefaults'
import { DEMO_BARBER_USER } from './demoAuth'

const STORAGE_KEY = 'barber-ai:mock-db:v2'

export type MockTables = Record<string, Record<string, unknown>[]>

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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function seed(): MockTables {
  const today = todayYmd()
  const yesterday = shiftYmd(today, -1)
  const tomorrow = shiftYmd(today, 1)
  const now = new Date().toISOString()

  const especialidades = 'Corte, barba, sobrancelha, hidratação e pigmentação'
  const barbers = [
    {
      id: 'marcos-correia',
      nome: 'Marcos Correia',
      email: 'mcorreiathalyta@gmail.com',
      telefone: '85986299623',
      percentual_servico: 50,
      percentual_produto: 10,
      comissao_servico_tipo: 'porcentagem',
      comissao_produto_tipo: 'porcentagem',
      especialidades,
      avaliacao: 5,
      avaliacao_count: 0,
      foto_url: null,
      user_id: DEMO_BARBER_USER.id,
      ativo: true,
      ordem_rodizio: 1,
      senha_temporaria: null,
      intervalo_ativo: false,
      intervalo_inicio: null,
      intervalo_fim: null,
      created_at: now,
    },
    {
      id: 'jeova-aguiar',
      nome: 'Jeova Aguiar',
      email: 'barbeariavarjota15+jeova@gmail.com',
      telefone: '85996224754',
      percentual_servico: 50,
      percentual_produto: 50,
      comissao_servico_tipo: 'porcentagem',
      comissao_produto_tipo: 'porcentagem',
      especialidades,
      avaliacao: 5,
      avaliacao_count: 0,
      foto_url: null,
      user_id: null,
      ativo: true,
      ordem_rodizio: 2,
      senha_temporaria: null,
      intervalo_ativo: false,
      intervalo_inicio: null,
      intervalo_fim: null,
      created_at: now,
    },
    {
      id: 'bruno-fernandes',
      nome: 'Bruno Fernandes',
      email: 'brunodomingue79@gmail.com',
      telefone: '85996056998',
      percentual_servico: 45,
      percentual_produto: 10,
      comissao_servico_tipo: 'porcentagem',
      comissao_produto_tipo: 'porcentagem',
      especialidades,
      avaliacao: 5,
      avaliacao_count: 0,
      foto_url: null,
      user_id: null,
      ativo: true,
      ordem_rodizio: 3,
      senha_temporaria: null,
      intervalo_ativo: false,
      intervalo_inicio: null,
      intervalo_fim: null,
      created_at: now,
    },
    {
      id: 'daniel',
      nome: 'Daniel',
      email: 'danielgomes1425@icloud.com',
      telefone: '85982373875',
      percentual_servico: 45,
      percentual_produto: 10,
      comissao_servico_tipo: 'porcentagem',
      comissao_produto_tipo: 'porcentagem',
      especialidades,
      avaliacao: 5,
      avaliacao_count: 0,
      foto_url: null,
      user_id: null,
      ativo: true,
      ordem_rodizio: 4,
      senha_temporaria: null,
      intervalo_ativo: false,
      intervalo_inicio: null,
      intervalo_fim: null,
      created_at: now,
    },
  ]

  const services = [
    {
      id: 'barba-tradicional',
      nome: 'Barba Tradicional',
      descricao: 'Barba feita com toalha quente',
      preco: 40,
      duracao_minutos: 30,
      buffer_minutos: 0,
      ativo: true,
      created_at: now,
    },
    {
      id: 'combo-corte-e-barba',
      nome: 'Combo Corte e Barba',
      descricao: 'Serviço completo de corte e barba',
      preco: 80,
      duracao_minutos: 35,
      buffer_minutos: 0,
      ativo: true,
      created_at: now,
    },
    {
      id: 'corte-de-cabelo',
      nome: 'Corte de Cabelo',
      descricao: 'Corte moderno com máquina e tesoura',
      preco: 40,
      duracao_minutos: 25,
      buffer_minutos: 0,
      ativo: true,
      created_at: now,
    },
    {
      id: 'corte-e-sobrancelha',
      nome: 'Corte e Sobrancelha',
      descricao: '',
      preco: 55,
      duracao_minutos: 35,
      buffer_minutos: 0,
      ativo: true,
      created_at: now,
    },
    {
      id: 'corte-barba-e-sobrancelha',
      nome: 'Corte, Barba e Sobrancelha',
      descricao: '',
      preco: 90,
      duracao_minutos: 45,
      buffer_minutos: 0,
      ativo: true,
      created_at: now,
    },
    {
      id: 'hidratacao',
      nome: 'Hidratação',
      descricao: '',
      preco: 40,
      duracao_minutos: 30,
      buffer_minutos: 0,
      ativo: true,
      created_at: now,
    },
    {
      id: 'pezinho-do-cabelo',
      nome: 'Pezinho do Cabelo',
      descricao: '',
      preco: 15,
      duracao_minutos: 10,
      buffer_minutos: 0,
      ativo: true,
      created_at: now,
    },
    {
      id: 'pigmentacao-de-barba',
      nome: 'pigmentação de barba',
      descricao: '',
      preco: 20,
      duracao_minutos: 15,
      buffer_minutos: 0,
      ativo: true,
      created_at: now,
    },
    {
      id: 'pigmentacao-de-cabelo',
      nome: 'pigmentação de cabelo',
      descricao: '',
      preco: 30,
      duracao_minutos: 30,
      buffer_minutos: 0,
      ativo: true,
      created_at: now,
    },
  ]

  const clients = [
    {
      id: 'demo-cli-1',
      nome: 'João Pedro Lima',
      telefone: '85988880001',
      email: 'joao@demo.local',
      data_nascimento: '1992-03-14',
      whatsapp_opt_in: true,
      created_at: now,
    },
    {
      id: 'demo-cli-2',
      nome: 'Marcos Silva',
      telefone: '85988880002',
      email: 'marcos@demo.local',
      data_nascimento: '1988-11-02',
      whatsapp_opt_in: true,
      created_at: now,
    },
    {
      id: 'demo-cli-3',
      nome: 'André Costa',
      telefone: '85988880003',
      email: 'andre@demo.local',
      data_nascimento: '1996-07-21',
      whatsapp_opt_in: false,
      created_at: now,
    },
    {
      id: 'demo-cli-4',
      nome: 'Bruno Alves',
      telefone: '85988880004',
      email: 'bruno@demo.local',
      data_nascimento: '1990-01-09',
      whatsapp_opt_in: true,
      created_at: now,
    },
    {
      id: 'demo-cli-5',
      nome: 'Felipe Rocha',
      telefone: '85988880005',
      email: 'felipe@demo.local',
      data_nascimento: '1994-09-30',
      whatsapp_opt_in: true,
      created_at: now,
    },
  ]

  const appointments = [
    {
      id: 'demo-apt-1',
      data: today,
      horario: '09:00:00',
      barbeiro_id: 'marcos-correia',
      servico_id: 'corte-de-cabelo',
      cliente_id: 'demo-cli-1',
      status: 'confirmado',
      valor: 40,
      created_at: now,
    },
    {
      id: 'demo-apt-2',
      data: today,
      horario: '10:30:00',
      barbeiro_id: 'jeova-aguiar',
      servico_id: 'combo-corte-e-barba',
      cliente_id: 'demo-cli-2',
      status: 'pendente',
      valor: 80,
      created_at: now,
    },
    {
      id: 'demo-apt-3',
      data: today,
      horario: '11:00:00',
      barbeiro_id: 'marcos-correia',
      servico_id: 'barba-tradicional',
      cliente_id: 'demo-cli-3',
      status: 'confirmado',
      valor: 40,
      created_at: now,
    },
    {
      id: 'demo-apt-4',
      data: today,
      horario: '14:00:00',
      barbeiro_id: 'jeova-aguiar',
      servico_id: 'corte-de-cabelo',
      cliente_id: 'demo-cli-4',
      status: 'concluido',
      valor: 40,
      created_at: now,
    },
    {
      id: 'demo-apt-5',
      data: today,
      horario: '15:30:00',
      barbeiro_id: 'bruno-fernandes',
      servico_id: 'combo-corte-e-barba',
      cliente_id: 'demo-cli-5',
      status: 'pendente',
      valor: 80,
      created_at: now,
    },
    {
      id: 'demo-apt-6',
      data: yesterday,
      horario: '16:00:00',
      barbeiro_id: 'daniel',
      servico_id: 'pigmentacao-de-barba',
      cliente_id: 'demo-cli-1',
      status: 'concluido',
      valor: 20,
      created_at: now,
    },
    {
      id: 'demo-apt-7',
      data: tomorrow,
      horario: '09:30:00',
      barbeiro_id: 'marcos-correia',
      servico_id: 'combo-corte-e-barba',
      cliente_id: 'demo-cli-2',
      status: 'confirmado',
      valor: 80,
      created_at: now,
    },
  ]

  const products = [
    {
      id: 'demo-prod-1',
      nome: 'Pomada modeladora',
      preco_venda: 42,
      estoque_atual: 18,
      estoque_minimo: 5,
      created_at: now,
    },
    {
      id: 'demo-prod-2',
      nome: 'Óleo para barba',
      preco_venda: 38,
      estoque_atual: 9,
      estoque_minimo: 4,
      created_at: now,
    },
    {
      id: 'demo-prod-3',
      nome: 'Shampoo detox',
      preco_venda: 55,
      estoque_atual: 12,
      estoque_minimo: 3,
      created_at: now,
    },
  ]

  const movements = [
    {
      id: 'demo-mov-1',
      produto_id: 'demo-prod-1',
      tipo: 'saida',
      quantidade: 1,
      motivo: 'venda',
      referencia_id: 'demo-apt-4',
      observacao: 'Venda no atendimento',
      created_at: `${today}T14:20:00.000Z`,
      barbeiro_id: 'jeova-aguiar',
      comissao_percentual: 50,
    },
    {
      id: 'demo-mov-2',
      produto_id: 'demo-prod-2',
      tipo: 'entrada',
      quantidade: 10,
      motivo: 'compra',
      referencia_id: null,
      observacao: 'Reposição de estoque',
      created_at: `${yesterday}T11:00:00.000Z`,
      barbeiro_id: null,
      comissao_percentual: null,
    },
  ]

  const payments = [
    {
      id: 'demo-pay-1',
      agendamento_id: 'demo-apt-4',
      cliente_id: 'demo-cli-4',
      valor: 40,
      forma_pagamento: 'Pix',
      status: 'Pago',
      observacao: 'Checkout do corte',
      created_at: `${today}T14:10:00.000Z`,
    },
    {
      id: 'demo-pay-2',
      agendamento_id: 'demo-apt-6',
      cliente_id: 'demo-cli-1',
      valor: 20,
      forma_pagamento: 'Dinheiro',
      status: 'Pago',
      observacao: null,
      created_at: `${yesterday}T16:20:00.000Z`,
    },
  ]

  const hours = barbers.flatMap((barber) =>
    [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
      id: `demo-hours-${barber.id}-${dia}`,
      barbeiro_id: barber.id,
      dia_semana: dia,
      abertura: dia === 0 ? null : '08:30',
      fechamento: dia === 0 ? null : '19:30',
      fechado: dia === 0,
    })),
  )

  return {
    barbeiros: barbers,
    servicos: services,
    clientes: clients,
    agendamentos: appointments,
    produtos: products,
    movimentacoes_estoque: movements,
    pagamentos: payments,
    barbeiro_horarios: hours,
    barbeiro_bloqueios: [],
    barbeiro_disponibilidade: [],
    campanhas: [],
    configuracoes: [
      {
        id: 1,
        nome_barbearia: 'Divina Barbearia Varjota',
        telefone: '85999990000',
        whatsapp: '',
        ...SHOP_DEFAULTS,
        whatsapp_bot_ativo: false,
        uazapi_base_url: '',
        audio_whatsapp_ativo: false,
        audio_whatsapp_mode: 'off',
      },
    ],
  }
}

function hmOf(barber: Record<string, unknown>, key: string) {
  return String(barber[key] || '').trim().slice(0, 5)
}

function isGlobalDefaultBreak(barber: Record<string, unknown>) {
  return (
    barber.intervalo_ativo !== false &&
    hmOf(barber, 'intervalo_inicio') === '12:00' &&
    hmOf(barber, 'intervalo_fim') === '14:00'
  )
}

/** Keep each barber's own break. Never invent a global 12:00–14:00. */
function sanitizeBarberBreaks(tables: MockTables): MockTables {
  const barbers = tables.barbeiros || []
  const clonedGlobal =
    barbers.length > 1 && barbers.every((barber) => isGlobalDefaultBreak(barber))

  for (const barber of barbers) {
    if (clonedGlobal) {
      barber.intervalo_ativo = false
      barber.intervalo_inicio = null
      barber.intervalo_fim = null
      continue
    }
    if (barber.intervalo_ativo !== true) {
      barber.intervalo_ativo = false
    }
  }
  return tables
}

function load(): MockTables {
  if (typeof window === 'undefined') return sanitizeBarberBreaks(seed())
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const initial = sanitizeBarberBreaks(seed())
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial))
      return initial
    }
    const parsed = JSON.parse(raw) as MockTables
    if (!parsed?.barbeiros?.length) {
      const initial = sanitizeBarberBreaks(seed())
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial))
      return initial
    }
    const migrated = sanitizeBarberBreaks(parsed)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
    return migrated
  } catch {
    return sanitizeBarberBreaks(seed())
  }
}

let db = load()
let barberBreaksReady = false

function persist() {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

export function getTable(name: string) {
  if (!db[name]) db[name] = []
  if (name === 'barbeiros' && !barberBreaksReady) {
    sanitizeBarberBreaks(db)
    persist()
    barberBreaksReady = true
  }
  return db[name]
}

export function setTable(name: string, rows: Record<string, unknown>[]) {
  db[name] = rows
  persist()
}

export function newId(prefix = 'demo') {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${rand}`
}

export function cloneRow<T>(row: T): T {
  return clone(row)
}
