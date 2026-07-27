export interface Barber {
  id: number
  nome: string
  email: string
  telefone: string | null
  percentual_servico: number
  percentual_produto: number
  comissao_servico_tipo: string
  comissao_produto_tipo: string
  especialidades: string | null
  avaliacao: number
  foto_url: string | null
  active: boolean
  created_at: string
}

export interface CreateBarberInput {
  nome: string
  email: string
  telefone?: string | null
  especialidades?: string | null
  percentual_servico?: number
  percentual_produto?: number
  comissao_servico_tipo?: string
  comissao_produto_tipo?: string
  avaliacao?: number
  foto_url?: string | null
}