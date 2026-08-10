export type AppointmentStatus = 'pendente' | 'confirmado' | 'cancelado' | 'concluido'

export interface Barber {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  percentual_servico: number
  percentual_produto: number
  comissao_servico_tipo: string
  comissao_produto_tipo: string
  especialidades: string | null
  avaliacao: number
  foto_url: string | null
  user_id?: string | null
  ativo?: boolean
  active?: boolean
  created_at: string
}

export type CreateBarberInput = {
  nome: string
  email?: string | null
  telefone?: string | null
  especialidades?: string | null
  percentual_servico?: number
  percentual_produto?: number
  comissao_servico_tipo?: string
  comissao_produto_tipo?: string
  avaliacao?: number
  foto_url?: string | null
}

export interface Service {
  id: string
  nome: string
  preco: number
  duracao_minutos: number
  descricao?: string | null
  ativo?: boolean
  created_at?: string
}

export interface Client {
  id: string
  nome: string
  telefone?: string | null
  email?: string | null
  created_at?: string
}

export interface Appointment {
  id: string
  data: string
  horario: string
  barbeiro_id: string | null
  servico_id: string | null
  cliente_id: string | null
  status: AppointmentStatus
  valor?: number | null
  created_at: string
  barbeiros?: Pick<Barber, 'nome'> | null
  servicos?: Pick<Service, 'nome' | 'duracao_minutos' | 'preco'> | null
  clientes?: Pick<Client, 'nome' | 'email'> | null
}

export interface Agendamento extends Appointment {}

export interface Cliente extends Client {}
