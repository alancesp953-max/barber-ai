import { supabase } from '../services/supabaseClient'
import type { Appointment, Barber, CreateBarberInput } from '../types/database'

function joinOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

// =====================
// Autenticação
// =====================
export async function requireSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getCurrentUser() {
  const session = await requireSession()
  if (!session) return null
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return { session, user: data.user }
}

// =====================
// Dashboard
// =====================
export async function getDashboardStats() {
  const [barbersResult, productsResult, appointmentsResult, clientsResult] = await Promise.all([
    supabase.from('barbeiros').select('*', { count: 'exact', head: true }),
    supabase.from('produtos').select('*', { count: 'exact', head: true }),
    supabase.from('agendamentos').select('*', { count: 'exact', head: true }),
    supabase.from('clientes').select('*', { count: 'exact', head: true }),
  ])
  return {
    totalBarbers: barbersResult.count ?? 0,
    totalProducts: productsResult.count ?? 0,
    totalAppointments: appointmentsResult.count ?? 0,
    totalClients: clientsResult.count ?? 0,
  }
}

// =====================
// Barbeiros
// =====================
export async function getBarbers(): Promise<Barber[]> {
  const { data, error } = await supabase
    .from('barbeiros')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Erro ao buscar barbeiros: ${error.message}`)
  return data ?? []
}

export async function getBarber(id: string): Promise<Barber> {
  const { data, error } = await supabase
    .from('barbeiros')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw new Error(`Erro ao buscar barbeiro: ${error.message}`)
  return data
}

export async function createBarber(barber: CreateBarberInput): Promise<Barber> {
  const { data, error } = await supabase
    .from('barbeiros')
    .insert({
      nome: barber.nome,
      email: barber.email,
      telefone: barber.telefone ?? null,
      especialidades: barber.especialidades ?? null,
      percentual_servico: barber.percentual_servico ?? 0,
      percentual_produto: barber.percentual_produto ?? 0,
      comissao_servico_tipo: barber.comissao_servico_tipo ?? 'porcentagem',
      comissao_produto_tipo: barber.comissao_produto_tipo ?? 'porcentagem',
      avaliacao: barber.avaliacao ?? 5,
      foto_url: barber.foto_url ?? null,
    })
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar barbeiro: ${error.message}`)
  return data
}

export async function updateBarber(id: string, updates: Partial<Barber>): Promise<Barber> {
  const { data, error } = await supabase
    .from('barbeiros')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`Erro ao atualizar barbeiro: ${error.message}`)
  return data
}

export async function deleteBarber(id: string) {
  // 1º: remove as disponibilidades ligadas ao barbeiro
  await supabase
    .from('barbeiro_disponibilidade')
    .delete()
    .eq('barbeiro_id', id)

  // 2º: remove os agendamentos ligados ao barbeiro
  await supabase
    .from('agendamentos')
    .delete()
    .eq('barbeiro_id', id)

  // 3º: remove as movimentações de estoque ligadas ao barbeiro
  await supabase
    .from('movimentacoes_estoque')
    .delete()
    .eq('barbeiro_id', id)

  // 4º: agora sim, remove o barbeiro
  const { error } = await supabase
    .from('barbeiros')
    .delete()
    .eq('id', id)

  if (error) throw new Error(`Erro ao excluir barbeiro: ${error.message}`)
}

// =====================
// Usuários (barbeiros com login)
// =====================
export async function createBarberUser(params: {
  nome: string
  email: string
  senha: string
  avaliacao?: number
  foto_url?: string | null
}) {
  // 1. Cria a conta de login (auth do Supabase)
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: params.email,
    password: params.senha,
  })
  if (authError) throw new Error(`Erro ao criar usuário: ${authError.message}`)
  const userId = authData.user?.id
  if (!userId) throw new Error('Não foi possível criar a conta de login. Verifique se o e-mail já não está cadastrado.')

  // 2. Cria o barbeiro ligado à conta de login
  const { data, error } = await supabase
    .from('barbeiros')
    .insert({
      nome: params.nome,
      email: params.email,
      telefone: null,
      especialidades: null,
      percentual_servico: 0,
      percentual_produto: 0,
      comissao_servico_tipo: 'porcentagem',
      comissao_produto_tipo: 'porcentagem',
      avaliacao: params.avaliacao ?? 5,
      foto_url: params.foto_url || null,
      user_id: userId,
    })
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar barbeiro: ${error.message}`)
  return data
}

export async function getUsers() {
  // Barbeiros que têm conta de login
  const { data, error } = await supabase
    .from('barbeiros')
    .select('*')
    .not('user_id', 'is', null)
    .order('nome')
  if (error) throw new Error(`Erro ao buscar usuários: ${error.message}`)
  return data ?? []
}

export async function getBarbeiroByUserId(userId: string) {
  const { data, error } = await supabase
    .from('barbeiros')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`Erro ao buscar barbeiro: ${error.message}`)
  return data
}

// =====================
// Produtos (antigo)
// =====================
export async function getProducts() {
  const { data, error } = await supabase
    .from('produtos')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Erro ao buscar produtos: ${error.message}`)
  return data ?? []
}

export async function createProduct(product: any) {
  const { data, error } = await supabase
    .from('produtos')
    .insert(product)
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar produto: ${error.message}`)
  return data
}

export async function deleteProduct(id: string) {
  const { error } = await supabase
    .from('produtos')
    .delete()
    .eq('id', id)
  if (error) throw new Error(`Erro ao excluir produto: ${error.message}`)
}

// =====================
// Agendamentos
// =====================
export async function getAppointments() {
  const { data, error } = await supabase
    .from('agendamentos')
    .select('*, barbeiros(nome), servicos(nome, duracao_minutos, preco), clientes(nome, email)')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Erro ao buscar agendamentos: ${error.message}`)
  return data ?? []
}

export async function createAppointment(appointment: any) {
  const { data, error } = await supabase
    .from('agendamentos')
    .insert(appointment)
    .select('*, barbeiros(nome), servicos(nome), clientes(nome, telefone)')
    .single()
  if (error) throw new Error(`Erro ao criar agendamento: ${error.message}`)
  return data
}

/** Envia confirmação via Edge Function whatsapp-send (UAZAPI). Falhas não bloqueiam o fluxo. */
export async function notifyAppointmentWhatsApp(params: {
  phone: string
  clientName?: string
  serviceName?: string
  barberName?: string
  date: string
  time: string
}): Promise<{ ok: boolean; error?: string }> {
  const phone = params.phone?.replace(/\D/g, '')
  if (!phone) return { ok: false, error: 'Telefone vazio' }

  const time = String(params.time || '').slice(0, 5)
  const dateParts = params.date?.split('-')
  const dateBr =
    dateParts?.length === 3
      ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`
      : params.date

  const text = [
    '✅ *Agendamento confirmado!*',
    '',
    params.clientName ? `Cliente: ${params.clientName}` : null,
    params.serviceName ? `Serviço: ${params.serviceName}` : null,
    params.barberName ? `Barbeiro: ${params.barberName}` : null,
    `Data: ${dateBr}`,
    `Horário: ${time}`,
    '',
    'Envie *0* no WhatsApp da barbearia para o menu do bot.',
  ]
    .filter(Boolean)
    .join('\n')

  const { data, error } = await supabase.functions.invoke('whatsapp-send', {
    body: { number: phone, text },
  })

  if (error) {
    console.warn('WhatsApp notify failed:', error.message)
    return { ok: false, error: error.message }
  }
  if (data?.error) {
    console.warn('WhatsApp notify error:', data.error)
    return { ok: false, error: String(data.error) }
  }
  return { ok: true }
}

export async function updateAppointmentStatus(id: string, status: string): Promise<Appointment> {
  const { data, error } = await supabase
    .from('agendamentos')
    .update({ status })
    .eq('id', id)
    .select('*, barbeiros(nome), servicos(nome, duracao_minutos, preco), clientes(nome, email)')
    .single()
  if (error) throw new Error(`Erro ao atualizar status do agendamento: ${error.message}`)
  return data as Appointment
}

export async function deleteAppointment(id: string) {
  const { error } = await supabase
    .from('agendamentos')
    .delete()
    .eq('id', id)
  if (error) throw new Error(`Erro ao excluir agendamento: ${error.message}`)
}

export async function getAgendaBarbeiro(barbeiroId: string) {
  // Agendamentos de HOJE em diante (amanhã e próximos dias)
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const dataInicial = hoje.toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('agendamentos')
    .select('*, servicos(nome, duracao_minutos, preco), clientes(nome, telefone)')
    .eq('barbeiro_id', barbeiroId)
    .gte('data', dataInicial)
    .order('data', { ascending: true })
  if (error) throw new Error(`Erro ao buscar agenda: ${error.message}`)
  return data ?? []
}

// =====================
// Serviços
// =====================
export async function getServices() {
  const { data, error } = await supabase
    .from('servicos')
    .select('*')
  if (error) throw new Error(`Erro ao buscar serviços: ${error.message}`)
  return data ?? []
}

export async function createService(service: any) {
  const { data, error } = await supabase
    .from('servicos')
    .insert(service)
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar serviço: ${error.message}`)
  return data
}

export async function deleteService(id: string) {
  const { error } = await supabase
    .from('servicos')
    .delete()
    .eq('id', id)
  if (error) throw new Error(`Erro ao excluir serviço: ${error.message}`)
}

// =====================
// Clientes
// =====================
export async function getClients() {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Erro ao buscar clientes: ${error.message}`)
  return data ?? []
}

export async function findOrCreateClient(cliente: { nome: string; telefone?: string; email?: string }) {
  let query = supabase.from('clientes').select('*')
  if (cliente.telefone)
    query = query.eq('telefone', cliente.telefone)
  else if (cliente.email)
    query = query.eq('email', cliente.email)
  else
    query = query.eq('nome', cliente.nome)
  const { data: existing } = await query.limit(1).single()
  if (existing) return existing
  const { data, error } = await supabase
    .from('clientes')
    .insert({
      nome: cliente.nome,
      telefone: cliente.telefone || null,
      email: cliente.email || null,
    })
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar cliente: ${error.message}`)
  return data
}

// =====================
// Configurações
// =====================
export async function getConfiguracoes() {
  const { data, error } = await supabase
    .from('configuracoes')
    .select('*')
    .single()
  if (error) throw new Error(`Erro ao buscar configurações: ${error.message}`)
  return data
}

export async function updateConfiguracoes(config: Record<string, any>) {
  // Never persist API tokens from the browser; Edge secrets hold UAZAPI_INSTANCE_TOKEN
  const {
    uazapi_token: _token,
    instance_token: _instanceToken,
    ...safe
  } = config

  const { data, error } = await supabase
    .from('configuracoes')
    .update(safe)
    .eq('id', 1)
    .select()
    .single()
  if (error) throw new Error(`Erro ao atualizar configurações: ${error.message}`)
  return data
}

// =====================
// Pagamentos
// =====================
export async function getPagamentos() {
  const { data, error } = await supabase
    .from('pagamentos')
    .select('*, agendamentos(*)')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Erro ao buscar pagamentos: ${error.message}`)
  return data ?? []
}

export async function createPagamento(pagamento: {
  agendamento_id: string
  cliente_id: string
  valor: number
  forma_pagamento: string
  status?: string
  observacao?: string
}) {
  const { data, error } = await supabase
    .from('pagamentos')
    .insert(pagamento)
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar pagamento: ${error.message}`)
  return data
}

export async function updatePagamentoStatus(id: string, status: string) {
  const { error } = await supabase
    .from('pagamentos')
    .update({ status })
    .eq('id', id)
  if (error) throw new Error(`Erro ao atualizar pagamento: ${error.message}`)
}

export async function deletePagamento(id: string) {
  const { error } = await supabase
    .from('pagamentos')
    .delete()
    .eq('id', id)
  if (error) throw new Error(`Erro ao excluir pagamento: ${error.message}`)
}

export async function getPagamentosDoDia() {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('pagamentos')
    .select('*, agendamentos(*)')
    .gte('created_at', hoje.toISOString())
    .eq('status', 'Pago')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Erro ao buscar pagamentos do dia: ${error.message}`)
  return data ?? []
}

export async function getResumoFinanceiro() {
  const { data, error } = await supabase
    .from('pagamentos')
    .select('valor, forma_pagamento, status')
    .eq('status', 'Pago')
  if (error) throw new Error(`Erro ao buscar resumo financeiro: ${error.message}`)
  const total = data?.reduce((acc, p) => acc + Number(p.valor), 0) ?? 0
  const porForma: Record<string, number> = {}
  data?.forEach(p => {
    porForma[p.forma_pagamento] = (porForma[p.forma_pagamento] || 0) + Number(p.valor)
  })
  return { total, porForma, quantidade: data?.length ?? 0 }
}

// =====================
// Produtos (completas)
// =====================
export type Produto = {
  id: string
  nome: string
  preco_venda: number
  estoque_atual: number
  estoque_minimo: number
  created_at: string
}

export async function getProdutos(): Promise<Produto[]> {
  const { data, error } = await supabase
    .from('produtos')
    .select('*')
    .order('nome')
  if (error) throw new Error(`Erro ao buscar produtos: ${error.message}`)
  return data ?? []
}

export async function getProduto(id: string): Promise<Produto> {
  const { data, error } = await supabase
    .from('produtos')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw new Error(`Erro ao buscar produto: ${error.message}`)
  return data
}

export async function createProduto(produto: {
  nome: string
  preco_venda?: number
  estoque_atual?: number
  estoque_minimo?: number
}): Promise<Produto> {
  const { data, error } = await supabase
    .from('produtos')
    .insert(produto)
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar produto: ${error.message}`)
  return data
}

export async function updateProduto(id: string, updates: Partial<Produto>): Promise<Produto> {
  const { data, error } = await supabase
    .from('produtos')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`Erro ao atualizar produto: ${error.message}`)
  return data
}

export async function deleteProduto(id: string) {
  const { error } = await supabase
    .from('produtos')
    .delete()
    .eq('id', id)
  if (error) throw new Error(`Erro ao excluir produto: ${error.message}`)
}

// =====================
// Movimentações de Estoque
// =====================
export type MovimentacaoEstoque = {
  id: string
  produto_id: string
  tipo: 'entrada' | 'saida'
  quantidade: number
  motivo: 'venda' | 'compra' | 'ajuste' | 'perda'
  referencia_id: string | null
  observacao: string | null
  created_at: string
  barbeiro_id: string | null
  comissao_percentual: number | null
  produtos?: { nome: string }
  barbeiros?: { nome: string; percentual_produto: number }
}

export async function getMovimentacoes(produtoId?: string): Promise<MovimentacaoEstoque[]> {
  let query = supabase
    .from('movimentacoes_estoque')
    .select('*, produtos(nome), barbeiros(nome, percentual_produto)')
    .order('created_at', { ascending: false })
  if (produtoId) query = query.eq('produto_id', produtoId)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao buscar movimentações: ${error.message}`)
  return data ?? []
}

export async function registrarSaidaEstoque(params: {
  produto_id: string
  quantidade: number
  motivo: 'venda' | 'ajuste' | 'perda'
  referencia_id?: string
  observacao?: string
  barbeiro_id?: string
}): Promise<MovimentacaoEstoque> {
  const { data: produto, error: errProduto } = await supabase
    .from('produtos')
    .select('estoque_atual, preco_venda')
    .eq('id', params.produto_id)
    .single()
  if (errProduto) throw new Error(`Produto não encontrado: ${errProduto.message}`)
  if (produto.estoque_atual < params.quantidade) {
    throw new Error(`Estoque insuficiente. Disponível: ${produto.estoque_atual}, solicitado: ${params.quantidade}`)
  }
  let comissaoPercentual: number | null = null
  if (params.barbeiro_id) {
    const { data: barbeiro, error: errBarbeiro } = await supabase
      .from('barbeiros')
      .select('percentual_produto')
      .eq('id', params.barbeiro_id)
      .single()
    if (errBarbeiro) throw new Error(`Barbeiro não encontrado: ${errBarbeiro.message}`)
    comissaoPercentual = barbeiro.percentual_produto ?? 0
  }
  const { data: mov, error: errMov } = await supabase
    .from('movimentacoes_estoque')
    .insert({
      produto_id: params.produto_id,
      tipo: 'saida',
      quantidade: params.quantidade,
      motivo: params.motivo,
      referencia_id: params.referencia_id || null,
      observacao: params.observacao || null,
      barbeiro_id: params.barbeiro_id || null,
      comissao_percentual: comissaoPercentual,
    })
    .select()
    .single()
  if (errMov) throw new Error(`Erro ao registrar saída: ${errMov.message}`)
  const { error: errUpdate } = await supabase
    .from('produtos')
    .update({ estoque_atual: produto.estoque_atual - params.quantidade })
    .eq('id', params.produto_id)
  if (errUpdate) throw new Error(`Erro ao atualizar estoque: ${errUpdate.message}`)
  return mov
}

export async function registrarEntradaEstoque(params: {
  produto_id: string
  quantidade: number
  motivo: 'compra' | 'ajuste'
  observacao?: string
}): Promise<MovimentacaoEstoque> {
  const { data: produto, error: errProduto } = await supabase
    .from('produtos')
    .select('estoque_atual')
    .eq('id', params.produto_id)
    .single()
  if (errProduto && errProduto.code !== 'PGRST116')
    throw new Error(`Erro ao buscar produto: ${errProduto.message}`)
  const estoqueAtual = produto?.estoque_atual ?? 0
  const { data: mov, error: errMov } = await supabase
    .from('movimentacoes_estoque')
    .insert({
      produto_id: params.produto_id,
      tipo: 'entrada',
      quantidade: params.quantidade,
      motivo: params.motivo,
      observacao: params.observacao || null,
    })
    .select()
    .single()
  if (errMov) throw new Error(`Erro ao registrar entrada: ${errMov.message}`)
  const { error: errUpdate } = await supabase
    .from('produtos')
    .update({ estoque_atual: estoqueAtual + params.quantidade })
    .eq('id', params.produto_id)
  if (errUpdate) throw new Error(`Erro ao atualizar estoque: ${errUpdate.message}`)
  return mov
}

// =====================
// TIPOS DE COMISSÕES (exportados)
// =====================
export type ResumoComissaoBarbeiro = {
  barbeiro_id: string
  nome: string
  total_servicos: number
  valor_servicos: number
  comissao_servicos: number
  total_vendas: number
  valor_vendas: number
  comissao_vendas: number
  total_a_receber: number
}

export type DetalheServicoComissao = {
  data: string
  servico_nome: string
  valor_cobrado: number
  percentual_comissao: number
  valor_comissao: number
}

export type DetalheVendaComissao = {
  data: string
  produto_nome: string
  quantidade: number
  valor_total: number
  percentual_comissao: number
  valor_comissao: number
}

export type RelatorioComissaoCompleto = {
  barbeiro: {
    id: string
    nome: string
    percentual_servico: number
    percentual_produto: number
  }
  servicos: DetalheServicoComissao[]
  vendas: DetalheVendaComissao[]
  totais: {
    total_servicos: number
    valor_servicos: number
    comissao_servicos: number
    total_vendas: number
    valor_vendas: number
    comissao_vendas: number
    total_a_receber: number
  }
}

// =====================
// Comissões e Relatórios
// =====================
export async function getResumoComissoes(params: {
  dataInicio: string
  dataFim: string
}): Promise<ResumoComissaoBarbeiro[]> {
  const { dataInicio, dataFim } = params
  const { data: barbeiros, error: errBarbeiros } = await supabase
    .from('barbeiros')
    .select('id, nome, percentual_servico, percentual_produto')
    .order('nome')
  if (errBarbeiros) throw new Error(`Erro ao buscar barbeiros: ${errBarbeiros.message}`)
  const resultado: ResumoComissaoBarbeiro[] = []
  for (const barbeiro of barbeiros ?? []) {
    const { data: servicos, error: errServicos } = await supabase
      .from('agendamentos')
      .select('valor')
      .eq('barbeiro_id', barbeiro.id)
      .gte('data', dataInicio)
      .lte('data', dataFim)
    if (errServicos) throw new Error(`Erro ao buscar serviços: ${errServicos.message}`)
    const servicosComValor = (servicos ?? []).filter(s => s.valor !== null && Number(s.valor) > 0)
    const totalServicos = servicosComValor.length
    const valorServicos = servicosComValor.reduce((acc, s) => acc + Number(s.valor || 0), 0)
    const comissaoServicos = valorServicos * (barbeiro.percentual_servico / 100)
    const { data: vendas, error: errVendas } = await supabase
      .from('movimentacoes_estoque')
      .select('quantidade, comissao_percentual, produtos!inner(preco_venda)')
      .eq('barbeiro_id', barbeiro.id)
      .eq('motivo', 'venda')
      .gte('created_at', `${dataInicio}T00:00:00`)
      .lte('created_at', `${dataFim}T23:59:59`)
    if (errVendas) throw new Error(`Erro ao buscar vendas: ${errVendas.message}`)
    const totalVendas = vendas?.length ?? 0
    const valorVendas = vendas?.reduce((acc, v) => {
      const produto = joinOne<{ preco_venda: number }>(
        v.produtos as { preco_venda: number } | { preco_venda: number }[] | null,
      )
      return acc + (Number(produto?.preco_venda || 0) * v.quantidade)
    }, 0) ?? 0
    const comissaoVendas = vendas?.reduce((acc, v) => {
      const produto = joinOne<{ preco_venda: number }>(
        v.produtos as { preco_venda: number } | { preco_venda: number }[] | null,
      )
      const valorItem = Number(produto?.preco_venda || 0) * v.quantidade
      return acc + (valorItem * (v.comissao_percentual ?? barbeiro.percentual_produto) / 100)
    }, 0) ?? 0
    resultado.push({
      barbeiro_id: barbeiro.id,
      nome: barbeiro.nome,
      total_servicos: totalServicos,
      valor_servicos: valorServicos,
      comissao_servicos: comissaoServicos,
      total_vendas: totalVendas,
      valor_vendas: valorVendas,
      comissao_vendas: comissaoVendas,
      total_a_receber: comissaoServicos + comissaoVendas,
    })
  }
  return resultado
}

export async function getRelatorioComissoes(params: {
  barbeiro_id: string
  dataInicio: string
  dataFim: string
}): Promise<RelatorioComissaoCompleto> {
  const { barbeiro_id, dataInicio, dataFim } = params
  const { data: barbeiro, error: errBarbeiro } = await supabase
    .from('barbeiros')
    .select('id, nome, percentual_servico, percentual_produto')
    .eq('id', barbeiro_id)
    .single()
  if (errBarbeiro) throw new Error(`Barbeiro não encontrado: ${errBarbeiro.message}`)
  const { data: servicos, error: errServicos } = await supabase
    .from('agendamentos')
    .select('data, valor, servicos!inner(nome, preco)')
    .eq('barbeiro_id', barbeiro_id)
    .gte('data', dataInicio)
    .lte('data', dataFim)
    .order('data', { ascending: false })
  if (errServicos) throw new Error(`Erro ao buscar serviços: ${errServicos.message}`)
  const detalheServicos: DetalheServicoComissao[] = (servicos ?? []).map(s => {
    const servico = joinOne<{ nome: string; preco: number }>(
      s.servicos as { nome: string; preco: number } | { nome: string; preco: number }[] | null,
    )
    const valor = Number(s.valor || servico?.preco || 0)
    return {
      data: s.data,
      servico_nome: servico?.nome || 'Serviço',
      valor_cobrado: valor,
      percentual_comissao: barbeiro.percentual_servico,
      valor_comissao: valor * (barbeiro.percentual_servico / 100),
    }
  })
  const { data: vendas, error: errVendas } = await supabase
    .from('movimentacoes_estoque')
    .select('created_at, quantidade, comissao_percentual, produtos!inner(nome, preco_venda)')
    .eq('barbeiro_id', barbeiro_id)
    .eq('motivo', 'venda')
    .gte('created_at', `${dataInicio}T00:00:00`)
    .lte('created_at', `${dataFim}T23:59:59`)
    .order('created_at', { ascending: false })
  if (errVendas) throw new Error(`Erro ao buscar vendas: ${errVendas.message}`)
  const detalheVendas: DetalheVendaComissao[] = (vendas ?? []).map(v => {
    const produto = joinOne<{ nome: string; preco_venda: number }>(
      v.produtos as { nome: string; preco_venda: number } | { nome: string; preco_venda: number }[] | null,
    )
    const valorTotal = Number(produto?.preco_venda || 0) * v.quantidade
    const perc = v.comissao_percentual ?? barbeiro.percentual_produto
    return {
      data: v.created_at,
      produto_nome: produto?.nome || 'Produto',
      quantidade: v.quantidade,
      valor_total: valorTotal,
      percentual_comissao: perc,
      valor_comissao: valorTotal * (perc / 100),
    }
  })

  return {
    barbeiro: {
      id: barbeiro.id,
      nome: barbeiro.nome,
      percentual_servico: barbeiro.percentual_servico,
      percentual_produto: barbeiro.percentual_produto,
    },
    servicos: detalheServicos,
    vendas: detalheVendas,
    totais: {
      total_servicos: detalheServicos.length,
      valor_servicos: detalheServicos.reduce((acc, s) => acc + s.valor_cobrado, 0),
      comissao_servicos: detalheServicos.reduce((acc, s) => acc + s.valor_comissao, 0),
      total_vendas: detalheVendas.length,
      valor_vendas: detalheVendas.reduce((acc, v) => acc + v.valor_total, 0),
      comissao_vendas: detalheVendas.reduce((acc, v) => acc + v.valor_comissao, 0),
      total_a_receber:
        detalheServicos.reduce((acc, s) => acc + s.valor_comissao, 0) +
        detalheVendas.reduce((acc, v) => acc + v.valor_comissao, 0),
    },
  }
}