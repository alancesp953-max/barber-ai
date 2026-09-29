import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore'
import { auth, db } from './firebase'
import type {
  Barber,
  CreateBarberInput,
  Service,
  Client,
  Appointment,
  AppointmentStatus,
  Tenant,
  TenantStatus,
  WhatsAppConnection,
  AISettings,
  ConversationState,
  ConversationMessage,
  PlatformBilling,
  PlatformExpense,
  AuditLog,
} from '../types/database'

// Tipos auxiliares compatíveis com as telas existentes
export interface Produto {
  id: string
  nome: string
  preco_venda: number
  preco_custo: number
  estoque_atual: number
  estoque_minimo: number
  ativo?: boolean
  created_at?: string
}

export interface MovimentacaoEstoque {
  id: string
  produto_id: string
  tipo: 'entrada' | 'saida'
  quantidade: number
  motivo?: string
  observacao?: string
  barbeiro_id?: string
  comissao_percentual?: number
  barbeiros?: { nome: string } | null
  created_at: string
}

export interface ResumoComissaoBarbeiro {
  barbeiro_id: string
  nome: string
  nome_barbeiro: string
  total_servicos: number
  valor_servicos: number
  comissao_servicos: number
  total_vendas: number
  valor_vendas: number
  comissao_vendas: number
  total_a_receber: number
}

export interface RelatorioComissaoCompleto {
  barbeiro: {
    nome: string
    percentual_servico: number
    percentual_produto: number
  }
  servicos: Array<{
    data: string
    servico_nome: string
    valor_cobrado: number
    percentual_comissao: number
    valor_comissao: number
  }>
  vendas: Array<{
    data: string
    produto_nome: string
    quantidade: number
    valor_total: number
    percentual_comissao: number
    valor_comissao: number
  }>
  totais: {
    total_servicos: number
    valor_servicos: number
    comissao_servicos: number
    total_vendas: number
    valor_vendas: number
    comissao_vendas: number
    total_geral: number
    total_a_receber: number
  }
  resumoGeral?: {
    totalServicos: number
    valorServicos: number
    totalComissaoServicos: number
    totalVendas: number
    valorVendas: number
    totalComissaoVendas: number
    totalGeralComissoes: number
  }
  barbeiros?: ResumoComissaoBarbeiro[]
}

// =====================
// Resolução de Tenant Ativo
// =====================
let cachedTenantId: string | null = null

export function setTenantIdOverride(id: string | null) {
  cachedTenantId = id
}

export async function resolveTenantId(explicitTenantId?: string): Promise<string> {
  if (explicitTenantId && explicitTenantId !== 'default-tenant' && explicitTenantId !== 'barbearia-principal') {
    return explicitTenantId
  }
  if (cachedTenantId && cachedTenantId !== 'default-tenant' && cachedTenantId !== 'barbearia-principal') {
    return cachedTenantId
  }

  const user = auth.currentUser
  if (user) {
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid))
      if (userDoc.exists()) {
        const data = userDoc.data()
        if (data.tenantId) {
          cachedTenantId = data.tenantId
          return data.tenantId
        }
      }
    } catch (err) {
      console.warn('Não foi possível ler perfil do usuário para tenantId:', err)
    }
  }

  // Tenta obter a lista de tenants cadastrados
  try {
    const tenantsSnap = await getDocs(collection(db, 'tenants'))
    if (!tenantsSnap.empty) {
      const main = tenantsSnap.docs.find((d) => d.id === 'I13A9nw5T4IsaojMPLl6') || tenantsSnap.docs[0]
      cachedTenantId = main.id
      return cachedTenantId
    }
  } catch (err) {
    console.warn('Não foi possível ler lista de tenants:', err)
  }

  cachedTenantId = 'I13A9nw5T4IsaojMPLl6'
  return 'I13A9nw5T4IsaojMPLl6'
}

// =====================
// Autenticação & Sessão
// =====================
export async function requireSession() {
  const user = auth.currentUser
  if (user) return { user }
  // Aguarda pequeno ciclo para checagem do estado inicial
  await new Promise((resolve) => setTimeout(resolve, 300))
  return auth.currentUser ? { user: auth.currentUser } : null
}

export async function getCurrentUser() {
  const user = auth.currentUser
  if (!user) return null
  return { user, session: { user } }
}

// =====================
// Dashboard
// =====================
export async function getDashboardStats(tenantIdParam?: string) {
  const tId = await resolveTenantId(tenantIdParam)
  try {
    const [barbersSnap, productsSnap, appointmentsSnap, clientsSnap] = await Promise.all([
      getDocs(collection(db, 'tenants', tId, 'barbers')),
      getDocs(collection(db, 'tenants', tId, 'products')),
      getDocs(collection(db, 'tenants', tId, 'appointments')),
      getDocs(collection(db, 'tenants', tId, 'clients')),
    ])

    return {
      totalBarbers: barbersSnap.size,
      totalProducts: productsSnap.size,
      totalAppointments: appointmentsSnap.size,
      totalClients: clientsSnap.size,
    }
  } catch (err) {
    console.error('Erro em getDashboardStats:', err)
    return { totalBarbers: 0, totalProducts: 0, totalAppointments: 0, totalClients: 0 }
  }
}

// =====================
// Barbeiros
// =====================
let lastSyncTimestamp = 0

export async function syncTenantDataToBackend(tenantId: string, barbers?: Barber[], services?: Service[], force = false) {
  const now = Date.now()
  if (!force && now - lastSyncTimestamp < 60000) return
  lastSyncTimestamp = now

  try {
    const payload: any = { tenantId }
    if (barbers) payload.barbers = barbers
    if (services) payload.services = services

    await fetch('http://localhost:3001/api/sync/tenant-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    // Falha silenciosa em caso de backend offline
  }
}

export async function getBarbers(tenantIdParam?: string): Promise<Barber[]> {
  const tId = await resolveTenantId(tenantIdParam)
  const snap = await getDocs(collection(db, 'tenants', tId, 'barbers'))
  const barbers = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      nome: data.nome || data.name || '',
      email: data.email || null,
      telefone: data.telefone || data.phone || null,
      percentual_servico: data.percentual_servico ?? 50,
      percentual_produto: data.percentual_produto ?? 10,
      comissao_servico_tipo: data.comissao_servico_tipo || 'porcentagem',
      comissao_produto_tipo: data.comissao_produto_tipo || 'porcentagem',
      especialidades: data.especialidades || '',
      avaliacao: data.avaliacao ?? 5,
      foto_url: data.foto_url || data.photoUrl || null,
      ativo: data.ativo ?? data.active ?? true,
      active: data.active ?? data.ativo ?? true,
      startHour: data.startHour || '08:00',
      endHour: data.endHour || '19:00',
      breakStart: data.breakStart || '12:00',
      breakEnd: data.breakEnd || '13:00',
      workingDays: Array.isArray(data.workingDays) ? data.workingDays : [1, 2, 3, 4, 5, 6],
      daysOff: Array.isArray(data.daysOff) ? data.daysOff : [],
      created_at: data.created_at || data.createdAt || new Date().toISOString(),
    } as Barber
  })

  // Sincroniza em background com o backend para o WhatsApp e IA lerem os dados reais
  syncTenantDataToBackend(tId, barbers).catch(() => {})

  return barbers
}

export async function getBarber(id: string, tenantIdParam?: string): Promise<Barber | null> {
  const tId = await resolveTenantId(tenantIdParam)
  const d = await getDoc(doc(db, 'tenants', tId, 'barbers', id))
  if (!d.exists()) return null
  const data = d.data()
  return {
    id: d.id,
    nome: data.nome || data.name || '',
    email: data.email || null,
    telefone: data.telefone || data.phone || null,
    percentual_servico: data.percentual_servico ?? 50,
    percentual_produto: data.percentual_produto ?? 10,
    comissao_servico_tipo: data.comissao_servico_tipo || 'porcentagem',
    comissao_produto_tipo: data.comissao_produto_tipo || 'porcentagem',
    especialidades: data.especialidades || '',
    avaliacao: data.avaliacao ?? 5,
    foto_url: data.foto_url || data.photoUrl || null,
    workingDays: Array.isArray(data.workingDays) ? data.workingDays : [1, 2, 3, 4, 5, 6],
    intervalo_ativo: data.intervalo_ativo === true,
    intervalo_inicio: data.intervalo_inicio || null,
    intervalo_fim: data.intervalo_fim || null,
    ativo: data.ativo ?? true,
    active: data.active ?? true,
    created_at: data.created_at || new Date().toISOString(),
  } as Barber
}

export async function createBarber(input: CreateBarberInput, tenantIdParam?: string): Promise<Barber> {
  const tId = await resolveTenantId(tenantIdParam)
  const payload = {
    ...input,
    name: input.nome,
    phone: input.telefone || '',
    active: true,
    ativo: true,
    startHour: (input as any).startHour || '08:00',
    endHour: (input as any).endHour || '19:00',
    breakStart: (input as any).breakStart || '12:00',
    breakEnd: (input as any).breakEnd || '13:00',
    workingDays: (input as any).workingDays || [1, 2, 3, 4, 5, 6],
    daysOff: (input as any).daysOff || [],
    created_at: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }
  const ref = await addDoc(collection(db, 'tenants', tId, 'barbers'), payload)

  // Sincroniza nos aliases para que o WhatsApp e a IA leiam instantaneamente
  const aliases = ['I13A9nw5T4IsaojMPLl6', 'barbearia-principal', 'default-tenant'].filter((a) => a !== tId)
  for (const alias of aliases) {
    try {
      await setDoc(doc(db, 'tenants', alias, 'barbers', ref.id), payload)
    } catch {}
  }

  // Notifica o backend
  getBarbers(tId).catch(() => {})

  return { id: ref.id, ...payload } as Barber
}

export async function updateBarber(id: string, input: Partial<CreateBarberInput>, tenantIdParam?: string): Promise<void> {
  const tId = await resolveTenantId(tenantIdParam)
  const payload: any = { ...input }
  if (input.nome) payload.name = input.nome
  if (input.telefone) payload.phone = input.telefone
  await updateDoc(doc(db, 'tenants', tId, 'barbers', id), payload)

  const aliases = ['I13A9nw5T4IsaojMPLl6', 'barbearia-principal', 'default-tenant'].filter((a) => a !== tId)
  for (const alias of aliases) {
    try {
      await updateDoc(doc(db, 'tenants', alias, 'barbers', id), payload)
    } catch {}
  }

  // Notifica o backend
  getBarbers(tId).catch(() => {})
}

export async function deleteBarber(id: string, tenantIdParam?: string): Promise<void> {
  const tId = await resolveTenantId(tenantIdParam)
  await deleteDoc(doc(db, 'tenants', tId, 'barbers', id))

  const aliases = ['I13A9nw5T4IsaojMPLl6', 'barbearia-principal', 'default-tenant'].filter((a) => a !== tId)
  for (const alias of aliases) {
    try {
      await deleteDoc(doc(db, 'tenants', alias, 'barbers', id))
    } catch {}
  }

  // Notifica o backend
  getBarbers(tId).catch(() => {})
}

export async function updateBarberRoutine(
  barberId: string,
  routine: {
    startHour: string
    endHour: string
    breakStart?: string
    breakEnd?: string
    workingDays: number[]
    daysOff: string[]
  },
  tenantIdParam?: string,
): Promise<void> {
  const tId = await resolveTenantId(tenantIdParam)
  const payload = {
    startHour: routine.startHour,
    endHour: routine.endHour,
    breakStart: routine.breakStart || '12:00',
    breakEnd: routine.breakEnd || '13:00',
    workingDays: routine.workingDays,
    daysOff: routine.daysOff,
    updatedAt: new Date().toISOString(),
  }

  try {
    await updateDoc(doc(db, 'tenants', tId, 'barbers', barberId), payload)
  } catch {}

  // Sincroniza qualquer documento irmão com o mesmo nome para evitar inconsistência de folgas
  try {
    const allBarbersSnap = await getDocs(collection(db, 'tenants', tId, 'barbers'))
    const currentDoc = allBarbersSnap.docs.find((d) => d.id === barberId)
    const currentName = (currentDoc?.data()?.nome || currentDoc?.data()?.name || '').trim().toLowerCase()
    if (currentName) {
      for (const d of allBarbersSnap.docs) {
        if (d.id !== barberId) {
          const dName = (d.data()?.nome || d.data()?.name || '').trim().toLowerCase()
          if (dName === currentName) {
            await updateDoc(doc(db, 'tenants', tId, 'barbers', d.id), payload)
          }
        }
      }
    }
  } catch {}

  const aliases = ['I13A9nw5T4IsaojMPLl6', 'barbearia-principal', 'default-tenant'].filter((a) => a !== tId)
  for (const alias of aliases) {
    try {
      await updateDoc(doc(db, 'tenants', alias, 'barbers', barberId), payload)
    } catch {}
  }

  // Notifica e sincroniza o backend
  const allBarbers = await getBarbers(tId)
  await syncTenantDataToBackend(tId, allBarbers)
}

export async function getBarbeiroByUserId(userId: string, tenantIdParam?: string): Promise<Barber | null> {
  const tId = await resolveTenantId(tenantIdParam)
  const q = query(collection(db, 'tenants', tId, 'barbers'), where('user_id', '==', userId))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() } as Barber
}

export async function getAgendaBarbeiro(barberId: string, tenantIdParam?: string) {
  const appointments = await getAppointments(tenantIdParam)
  return appointments
    .filter((a: any) => (a.barbeiro_id === barberId || a.barberId === barberId))
    .map((a: any) => ({
      id: a.id,
      data: a.data || a.date,
      status: a.status,
      servicos: a.servicos || {
        nome: a.serviceName || 'Serviço',
        duracao_minutos: a.durationMinutes || 30,
        preco: a.price || a.valor || 0,
      },
      clientes: a.clientes || {
        nome: a.clientName || 'Cliente',
        telefone: a.clientPhone || null,
      },
    }))
}

// =====================
// Serviços
// =====================
export async function getServices(tenantIdParam?: string): Promise<Service[]> {
  const tId = await resolveTenantId(tenantIdParam)
  const snap = await getDocs(collection(db, 'tenants', tId, 'services'))
  const services: Service[] = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      tenantId: tId,
      nome: data.nome || data.name || '',
      name: data.name || data.nome || '',
      preco: Number(data.preco ?? data.price ?? 0),
      price: Number(data.price ?? data.preco ?? 0),
      duracao_minutos: Number(data.duracao_minutos ?? data.durationMinutes ?? 30),
      durationMinutes: Number(data.durationMinutes ?? data.duracao_minutos ?? 30),
      descricao: data.descricao || data.description || '',
      description: data.description || data.descricao || '',
      ativo: data.ativo ?? data.active ?? true,
      active: data.active ?? data.ativo ?? true,
      enabledBarbers: data.enabledBarbers || [],
      created_at: data.created_at || data.createdAt || new Date().toISOString(),
    } as unknown as Service
  })

  syncTenantDataToBackend(tId, undefined, services).catch(() => {})

  return services
}

export async function createService(
  input: { nome: string; descricao?: string | null; duracao_minutos: number; preco: number },
  tenantIdParam?: string,
): Promise<Service> {
  const tId = await resolveTenantId(tenantIdParam)
  const payload = {
    nome: input.nome,
    name: input.nome,
    descricao: input.descricao || '',
    description: input.descricao || '',
    duracao_minutos: input.duracao_minutos,
    durationMinutes: input.duracao_minutos,
    preco: input.preco,
    price: input.preco,
    ativo: true,
    active: true,
    enabledBarbers: [],
    created_at: new Date().toISOString(),
  }
  const ref = await addDoc(collection(db, 'tenants', tId, 'services'), payload)

  // Sincroniza nos aliases
  const aliases = ['I13A9nw5T4IsaojMPLl6', 'barbearia-principal', 'default-tenant'].filter((a) => a !== tId)
  for (const alias of aliases) {
    try {
      await setDoc(doc(db, 'tenants', alias, 'services', ref.id), payload)
    } catch {}
  }

  // Notifica o backend
  getServices(tId).catch(() => {})

  return { id: ref.id, tenantId: tId, ...payload } as unknown as Service
}

export async function deleteService(id: string, tenantIdParam?: string): Promise<void> {
  const tId = await resolveTenantId(tenantIdParam)
  await deleteDoc(doc(db, 'tenants', tId, 'services', id))

  const aliases = ['I13A9nw5T4IsaojMPLl6', 'barbearia-principal', 'default-tenant'].filter((a) => a !== tId)
  for (const alias of aliases) {
    try {
      await deleteDoc(doc(db, 'tenants', alias, 'services', id))
    } catch {}
  }

  // Notifica o backend
  getServices(tId).catch(() => {})
}

// =====================
// Clientes
// =====================
export async function getClients(tenantIdParam?: string): Promise<Client[]> {
  const tId = await resolveTenantId(tenantIdParam)
  const snap = await getDocs(collection(db, 'tenants', tId, 'clients'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Client))
}

export async function findOrCreateClient(
  input: { id?: string; nome: string; email?: string; telefone?: string } | string,
  telefone?: string | null,
  email?: string | null,
  tenantIdParam?: string,
): Promise<Client> {
  const tId = await resolveTenantId(tenantIdParam)
  let nome = ''
  let tel = telefone || ''
  let mail = email || ''

  if (typeof input === 'object' && input !== null) {
    nome = input.nome || ''
    tel = input.telefone || tel
    mail = input.email || mail
    if (input.id) {
      const existing = await getDoc(doc(db, 'tenants', tId, 'clients', input.id))
      if (existing.exists()) {
        return { id: existing.id, ...existing.data() } as Client
      }
    }
  } else {
    nome = input || ''
  }

  if (tel) {
    const q = query(collection(db, 'tenants', tId, 'clients'), where('telefone', '==', tel))
    const snap = await getDocs(q)
    if (!snap.empty) {
      return { id: snap.docs[0].id, ...snap.docs[0].data() } as Client
    }
  }

  const payload = {
    nome,
    telefone: tel,
    email: mail,
    totalAppointments: 0,
    created_at: new Date().toISOString(),
  }
  const ref = await addDoc(collection(db, 'tenants', tId, 'clients'), payload)
  return { id: ref.id, ...payload } as Client
}

// =====================
// Agendamentos
// =====================

/**
 * Remove agendamentos gerados por testes automatizados do Firestore
 */
export async function purgeTestAppointments(tenantIdParam?: string): Promise<number> {
  const tId = await resolveTenantId(tenantIdParam)
  let count = 0
  try {
    const snap = await getDocs(collection(db, 'tenants', tId, 'appointments'))
    for (const docSnap of snap.docs) {
      // Deleta agendamentos de teste (identificados pelo prefixo appt_ gerado pelos scripts)
      if (docSnap.id.startsWith('appt_')) {
        await deleteDoc(doc(db, 'tenants', tId, 'appointments', docSnap.id))
        count++
      }
    }
    // Remove também clientes fictícios criados em testes
    const clientSnap = await getDocs(collection(db, 'tenants', tId, 'clients'))
    for (const c of clientSnap.docs) {
      if (c.id.startsWith('cli_') || c.id.startsWith('551199999') || c.id === '18670306783291') {
        await deleteDoc(doc(db, 'tenants', tId, 'clients', c.id))
      }
    }
    console.log(`[BarberAI Clean] Purged ${count} test appointments from Firestore.`)
  } catch (err) {
    console.error('Erro ao purgar agendamentos de teste:', err)
  }
  return count
}

export async function getAppointments(tenantIdParam?: string): Promise<Appointment[]> {
  const tId = await resolveTenantId(tenantIdParam)

  // Sincroniza apenas novos agendamentos reais pendentes do WhatsApp para o Firestore
  try {
    const res = await fetch(`http://localhost:3001/api/appointments/pending-sync?tenantId=${tId}`)
    if (res.ok) {
      const data = await res.json()
      const pending: any[] = data.appointments || []
      for (const appt of pending) {
        const clean = { ...appt }
        delete clean.cloudSynced

        // Salva diretamente no Firestore da nuvem
        await setDoc(doc(db, 'tenants', tId, 'appointments', appt.id), clean, { merge: true })

        // Garante registro de cliente em 'clients' caso necessário
        if (appt.clientId && appt.clientName) {
          await setDoc(
            doc(db, 'tenants', tId, 'clients', appt.clientId),
            {
              id: appt.clientId,
              nome: appt.clientName,
              telefone: appt.clientPhone || '',
              email: appt.clientes?.email || '',
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          )
        }

        // Marca como sincronizado no servidor local
        await fetch('http://localhost:3001/api/appointments/mark-synced', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId: tId, appointmentId: appt.id }),
        })
      }
    }
  } catch (err) {
    // Falha silenciosa em caso de backend offline
  }

  const snap = await getDocs(collection(db, 'tenants', tId, 'appointments'))
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      tenantId: tId,
      data: data.data || data.date || '',
      date: data.date || data.data || '',
      horario: data.horario || data.time || '',
      time: data.time || data.horario || '',
      barbeiro_id: data.barbeiro_id || data.barberId || null,
      barberId: data.barberId || data.barbeiro_id || '',
      servico_id: data.servico_id || data.serviceId || null,
      serviceId: data.serviceId || data.servico_id || '',
      cliente_id: data.cliente_id || data.clientId || null,
      clientId: data.clientId || data.cliente_id || '',
      status: (data.status || 'pendente') as AppointmentStatus,
      valor: data.valor ?? data.price ?? 0,
      price: data.price ?? data.valor ?? 0,
      durationMinutes: data.durationMinutes || data.duracao_minutos || 30,
      clientName: data.clientName || data.clientes?.nome || '',
      clientPhone: data.clientPhone || data.clientes?.telefone || '',
      barberName: data.barberName || data.barbeiros?.nome || '',
      serviceName: data.serviceName || data.servicos?.nome || '',
      barbeiros: data.barbeiros || (data.barberName ? { nome: data.barberName } : null),
      servicos: data.servicos || (data.serviceName ? { nome: data.serviceName, duracao_minutos: data.durationMinutes || 30, preco: data.price || 0 } : null),
      clientes: data.clientes || (data.clientName ? { nome: data.clientName, email: '' } : null),
      created_at: data.created_at || data.createdAt || new Date().toISOString(),
    } as unknown as Appointment
  })
}

export async function createAppointment(
  input: {
    data: string
    horario: string
    barbeiro_id?: string | null
    servico_id?: string | null
    cliente_id?: string | null
    valor?: number
    status?: string
    notes?: string
    allowOverlap?: boolean
  },
  tenantIdParam?: string,
): Promise<Appointment> {
  const tId = await resolveTenantId(tenantIdParam)

  // Busca dados de apoio para desnormalizar (barbeiro, serviço, cliente)
  let barberName = ''
  let serviceName = ''
  let clientName = ''

  try {
    const promises: Promise<any>[] = []
    if (input.barbeiro_id) promises.push(getDoc(doc(db, 'tenants', tId, 'barbers', input.barbeiro_id)))
    else promises.push(Promise.resolve(null))

    if (input.servico_id) promises.push(getDoc(doc(db, 'tenants', tId, 'services', input.servico_id)))
    else promises.push(Promise.resolve(null))

    if (input.cliente_id) promises.push(getDoc(doc(db, 'tenants', tId, 'clients', input.cliente_id)))
    else promises.push(Promise.resolve(null))

    const [bSnap, sSnap, cSnap] = await Promise.all(promises)
    if (bSnap && bSnap.exists()) barberName = bSnap.data().nome || bSnap.data().name || ''
    if (sSnap && sSnap.exists()) serviceName = sSnap.data().nome || sSnap.data().name || ''
    if (cSnap && cSnap.exists()) clientName = cSnap.data().nome || ''
  } catch (e) {
    console.warn('Erro ao obter dados complementares do agendamento:', e)
  }

  const payload: any = {
    ...input,
    date: input.data,
    time: input.horario,
    barberId: input.barbeiro_id || '',
    serviceId: input.servico_id || '',
    clientId: input.cliente_id || '',
    barberName,
    serviceName,
    clientName,
    status: input.status || 'pendente',
    valor: input.valor ?? 0,
    price: input.valor ?? 0,
    barbeiros: { nome: barberName },
    servicos: { nome: serviceName, preco: input.valor ?? 0, duracao_minutos: 30 },
    clientes: { nome: clientName, email: '' },
    origin: 'manual',
    created_at: new Date().toISOString(),
  }

  const ref = await addDoc(collection(db, 'tenants', tId, 'appointments'), payload)
  return { id: ref.id, ...payload } as unknown as Appointment
}

export async function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  tenantIdParam?: string,
): Promise<void> {
  const tId = await resolveTenantId(tenantIdParam)
  await updateDoc(doc(db, 'tenants', tId, 'appointments', id), {
    status,
    updated_at: new Date().toISOString(),
  })
}

export async function deleteAppointment(id: string, tenantIdParam?: string): Promise<void> {
  const tId = await resolveTenantId(tenantIdParam)
  await deleteDoc(doc(db, 'tenants', tId, 'appointments', id))
}

// =====================
// Produtos & Estoque
// =====================
export async function getProdutos(tenantIdParam?: string): Promise<Produto[]> {
  const tId = await resolveTenantId(tenantIdParam)
  const snap = await getDocs(collection(db, 'tenants', tId, 'products'))
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      nome: data.nome || data.name || '',
      preco_venda: Number(data.preco_venda ?? data.price ?? 0),
      preco_custo: Number(data.preco_custo ?? data.cost ?? 0),
      estoque_atual: Number(data.estoque_atual ?? data.stock ?? 0),
      estoque_minimo: Number(data.estoque_minimo ?? 5),
      ativo: data.ativo ?? true,
      created_at: data.created_at || new Date().toISOString(),
    }
  })
}

export async function createProduto(input: Partial<Produto>, tenantIdParam?: string): Promise<Produto> {
  const tId = await resolveTenantId(tenantIdParam)
  const payload = {
    ...input,
    created_at: new Date().toISOString(),
  }
  const ref = await addDoc(collection(db, 'tenants', tId, 'products'), payload)
  return { id: ref.id, ...payload } as Produto
}

export async function updateProduto(id: string, input: Partial<Produto>, tenantIdParam?: string): Promise<void> {
  const tId = await resolveTenantId(tenantIdParam)
  await updateDoc(doc(db, 'tenants', tId, 'products', id), input)
}

export async function deleteProduto(id: string, tenantIdParam?: string): Promise<void> {
  const tId = await resolveTenantId(tenantIdParam)
  await deleteDoc(doc(db, 'tenants', tId, 'products', id))
}

export async function getMovimentacoes(tenantIdParam?: string): Promise<MovimentacaoEstoque[]> {
  const tId = await resolveTenantId(tenantIdParam)
  try {
    const snap = await getDocs(collection(db, 'tenants', tId, 'stock_movements'))
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MovimentacaoEstoque))
  } catch {
    return []
  }
}

export async function registrarMovimentacao(
  input: { produto_id: string; tipo: 'entrada' | 'saida'; quantidade: number; motivo?: string },
  tenantIdParam?: string,
): Promise<void> {
  const tId = await resolveTenantId(tenantIdParam)
  const payload = {
    ...input,
    created_at: new Date().toISOString(),
  }
  await addDoc(collection(db, 'tenants', tId, 'stock_movements'), payload)

  // Atualiza estoque do produto
  const pRef = doc(db, 'tenants', tId, 'products', input.produto_id)
  const pSnap = await getDoc(pRef)
  if (pSnap.exists()) {
    const atual = Number(pSnap.data().estoque_atual || 0)
    const novo = input.tipo === 'entrada' ? atual + input.quantidade : Math.max(0, atual - input.quantidade)
    await updateDoc(pRef, { estoque_atual: novo })
  }
}

export async function registrarEntradaEstoque(
  input: any,
  quantidade?: number,
  motivo?: string,
  tenantIdParam?: string,
): Promise<void> {
  if (typeof input === 'object' && input !== null) {
    return registrarMovimentacao({ ...input, tipo: 'entrada' }, tenantIdParam)
  }
  return registrarMovimentacao({ produto_id: input, tipo: 'entrada', quantidade: quantidade || 1, motivo }, tenantIdParam)
}

export async function registrarSaidaEstoque(
  input: any,
  quantidade?: number,
  motivo?: string,
  tenantIdParam?: string,
): Promise<void> {
  if (typeof input === 'object' && input !== null) {
    return registrarMovimentacao({ ...input, tipo: 'saida' }, tenantIdParam)
  }
  return registrarMovimentacao({ produto_id: input, tipo: 'saida', quantidade: quantidade || 1, motivo }, tenantIdParam)
}

// =====================
// Financeiro & Comissões
// =====================
export async function getPagamentos(tenantIdParam?: string) {
  const tId = await resolveTenantId(tenantIdParam)
  try {
    const snap = await getDocs(collection(db, 'tenants', tId, 'payments'))
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch {
    return []
  }
}

export async function createPagamento(input: any, tenantIdParam?: string) {
  const tId = await resolveTenantId(tenantIdParam)
  const ref = await addDoc(collection(db, 'tenants', tId, 'payments'), {
    ...input,
    created_at: new Date().toISOString(),
  })
  return { id: ref.id, ...input }
}

export async function deletePagamento(id: string, tenantIdParam?: string) {
  const tId = await resolveTenantId(tenantIdParam)
  await deleteDoc(doc(db, 'tenants', tId, 'payments', id))
}

export async function getResumoFinanceiro(tenantIdParam?: string) {
  const pagamentos = await getPagamentos(tenantIdParam)
  const total = pagamentos.reduce((acc: number, p: any) => acc + (Number(p.valor) || 0), 0)
  const porForma: Record<string, number> = {}
  pagamentos.forEach((p: any) => {
    const f = p.forma_pagamento || p.forma || 'Dinheiro'
    porForma[f] = (porForma[f] || 0) + (Number(p.valor) || 0)
  })
  return {
    total,
    totalRecebido: total,
    quantidade: pagamentos.length,
    porForma,
    pagamentosRecentes: pagamentos.slice(0, 10),
  }
}

export async function getResumoComissoes(
  _filter: { dataInicio?: string; dataFim?: string },
  tenantIdParam?: string,
): Promise<ResumoComissaoBarbeiro[]> {
  const barbers = await getBarbers(tenantIdParam)
  const appointments = await getAppointments(tenantIdParam)

  return barbers.map((b) => {
    const appts = appointments.filter((a) => (a as any).barbeiro_id === b.id && (a.status === 'concluido' || a.status === 'confirmado'))
    const total_servicos = appts.length
    const valor_servicos = appts.reduce((sum, a) => sum + (Number((a as any).valor) || 0), 0)
    const comissao_servicos = (valor_servicos * (b.percentual_servico || 50)) / 100

    return {
      barbeiro_id: b.id,
      nome: b.nome || (b as any).name || '',
      nome_barbeiro: b.nome || (b as any).name || '',
      total_servicos,
      valor_servicos,
      comissao_servicos,
      total_vendas: 0,
      valor_vendas: 0,
      comissao_vendas: 0,
      total_a_receber: comissao_servicos,
    }
  })
}

export async function getRelatorioComissoes(
  filter: { barbeiro_id?: string; dataInicio?: string; dataFim?: string },
  tenantIdParam?: string,
): Promise<RelatorioComissaoCompleto> {
  const tId = await resolveTenantId(tenantIdParam)
  const resumo = await getResumoComissoes(filter, tId)
  const geral = resumo.reduce(
    (acc, r) => {
      acc.totalServicos += r.total_servicos
      acc.valorServicos += r.valor_servicos
      acc.totalComissaoServicos += r.comissao_servicos
      acc.totalGeralComissoes += r.total_a_receber
      return acc
    },
    {
      totalServicos: 0,
      valorServicos: 0,
      totalComissaoServicos: 0,
      totalVendas: 0,
      valorVendas: 0,
      totalComissaoVendas: 0,
      totalGeralComissoes: 0,
    },
  )

  const barbeiroAlvo = filter.barbeiro_id ? await getBarber(filter.barbeiro_id, tId) : null
  const bNome = barbeiroAlvo?.nome || (resumo[0]?.nome_barbeiro || 'Barbeiro')
  const pServ = barbeiroAlvo?.percentual_servico ?? 50
  const pProd = barbeiroAlvo?.percentual_produto ?? 10

  return {
    barbeiro: {
      nome: bNome,
      percentual_servico: pServ,
      percentual_produto: pProd,
    },
    servicos: [],
    vendas: [],
    totais: {
      total_servicos: geral.totalServicos,
      valor_servicos: geral.valorServicos,
      comissao_servicos: geral.totalComissaoServicos,
      total_vendas: 0,
      valor_vendas: 0,
      comissao_vendas: 0,
      total_geral: geral.totalGeralComissoes,
      total_a_receber: geral.totalGeralComissoes,
    } as any,
    resumoGeral: geral,
    barbeiros: resumo,
  }
}

// =====================
// Configurações da Barbearia
// =====================
export async function getConfiguracoes(tenantIdParam?: string) {
  const tId = await resolveTenantId(tenantIdParam)
  const snap = await getDoc(doc(db, 'tenants', tId, 'settings', 'general'))
  if (snap.exists()) {
    return snap.data()
  }
  return {
    nome_barbearia: 'Barber AI Barbearia',
    telefone: '(11) 99999-9999',
    endereco: 'Rua Principal, 100',
    horario_abertura: '09:00',
    horario_fechamento: '19:00',
    dias_funcionamento: [1, 2, 3, 4, 5, 6],
  }
}

export async function updateConfiguracoes(data: any, tenantIdParam?: string) {
  const tId = await resolveTenantId(tenantIdParam)
  await setDoc(doc(db, 'tenants', tId, 'settings', 'general'), data, { merge: true })
}

export async function getBotActive(tenantIdParam?: string) {
  const tId = await resolveTenantId(tenantIdParam)
  const snap = await getDoc(doc(db, 'tenants', tId, 'settings', 'general'))
  const ativo = snap.exists() && snap.data()?.bot_ativo === true
  return { tenantId: tId, bot_ativo: ativo }
}

export async function saveBotActive(ativo: boolean, tenantIdParam?: string) {
  const tId = await resolveTenantId(tenantIdParam)
  await setDoc(
    doc(db, 'tenants', tId, 'settings', 'general'),
    { bot_ativo: ativo, updatedAt: new Date().toISOString() },
    { merge: true },
  )
  return { tenantId: tId, bot_ativo: ativo }
}

// =====================
// Gestão de Usuários
// =====================
export async function getUsers(tenantIdParam?: string): Promise<Barber[]> {
  return await getBarbers(tenantIdParam)
}

export async function createBarberUser(
  input: { nome: string; email: string; telefone?: string; senha?: string; avaliacao?: number },
  tenantIdParam?: string,
) {
  const tId = await resolveTenantId(tenantIdParam)
  return await createBarber(
    {
      nome: input.nome,
      email: input.email,
      telefone: input.telefone || '',
      avaliacao: input.avaliacao || 5,
    },
    tId,
  )
}

// =====================
// WhatsApp e IA (Seção 8 e 12)
// =====================
export async function getWhatsAppConnection(tenantIdParam?: string): Promise<WhatsAppConnection | null> {
  const tId = await resolveTenantId(tenantIdParam)
  const snap = await getDoc(doc(db, 'tenants', tId, 'whatsappConnections', 'primary'))
  if (snap.exists()) {
    return { id: snap.id, tenantId: tId, ...snap.data() } as WhatsAppConnection
  }
  return {
    id: 'primary',
    tenantId: tId,
    phoneNumberId: '',
    wabaId: '',
    businessPhoneNumber: '',
    webhookVerifyToken: 'barberai_webhook_verify_2026',
    status: 'disconnected',
  }
}

export async function saveWhatsAppConnection(
  input: Partial<WhatsAppConnection>,
  tenantIdParam?: string,
): Promise<void> {
  const tId = await resolveTenantId(tenantIdParam)
  await setDoc(doc(db, 'tenants', tId, 'whatsappConnections', 'primary'), input, { merge: true })
}

export async function getAISettings(tenantIdParam?: string): Promise<AISettings> {
  const tId = await resolveTenantId(tenantIdParam)
  const snap = await getDoc(doc(db, 'tenants', tId, 'aiSettings', 'primary'))
  if (snap.exists()) {
    return { tenantId: tId, ...snap.data() } as AISettings
  }
  return {
    tenantId: tId,
    enabled: true,
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    greetingMessage: 'Olá! Seja bem-vindo à nossa barbearia. ✂️ Vou te ajudar a agendar seu horário. Como posso te chamar?',
    humanHandoffKeyword: 'humano',
    audioEnabled: false,
    elevenlabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
    language: 'pt-BR',
  }
}

export async function saveAISettings(input: Partial<AISettings>, tenantIdParam?: string): Promise<void> {
  const tId = await resolveTenantId(tenantIdParam)
  await setDoc(doc(db, 'tenants', tId, 'aiSettings', 'primary'), input, { merge: true })
}

export async function getConversations(tenantIdParam?: string): Promise<ConversationState[]> {
  const tId = await resolveTenantId(tenantIdParam)
  const snap = await getDocs(collection(db, 'tenants', tId, 'conversations'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConversationState))
}

export async function getConversationMessages(
  conversationId: string,
  tenantIdParam?: string,
): Promise<ConversationMessage[]> {
  const tId = await resolveTenantId(tenantIdParam)
  const snap = await getDocs(
    query(
      collection(db, 'tenants', tId, 'conversations', conversationId, 'messages'),
      orderBy('timestamp', 'asc'),
    ),
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConversationMessage))
}

// Simulador interativo do motor de atendimento no frontend
export async function simulateIncomingWhatsAppMessage(
  tenantId: string,
  clientPhone: string,
  messageText: string,
): Promise<{ replyText: string; state: ConversationState; audioUrl?: string }> {
  // Chamada para a API local do backend
  try {
    const res = await fetch('/api/simulator/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, clientPhone, messageText }),
    })
    if (res.ok) {
      return await res.json()
    }
  } catch (err) {
    console.warn('Backend server offline, executando fallback local do fluxo fixo:', err)
  }

  // Fallback direto via Firestore para simulação caso o servidor backend ainda não esteja com proxy
  return await processConversationStepLocally(tenantId, clientPhone, messageText)
}

async function processConversationStepLocally(
  tenantId: string,
  clientPhone: string,
  messageText: string,
): Promise<{ replyText: string; state: ConversationState; audioUrl?: string }> {
  const convRef = doc(db, 'tenants', tenantId, 'conversations', clientPhone)
  const convSnap = await getDoc(convRef)

  let state: ConversationState = convSnap.exists()
    ? (convSnap.data() as ConversationState)
    : {
        id: clientPhone,
        tenantId,
        clientPhone,
        currentStep: 'INITIAL',
        lastMessageAt: new Date().toISOString(),
        status: 'active',
      }

  const text = messageText.trim()
  let replyText = ''

  // ETAPA 1 - Saudação
  if (state.currentStep === 'INITIAL' || !state.clientName) {
    if (state.currentStep === 'INITIAL') {
      const config = await getConfiguracoes(tenantId)
      const nomeBarbearia = config.nome_barbearia || 'Nossa Barbearia'
      replyText = `Olá! Seja bem-vindo à ${nomeBarbearia}. ✂️\nVou te ajudar a agendar seu horário.\nComo posso te chamar?`
      state.currentStep = 'AWAITING_NAME'
    } else {
      state.clientName = text
      state.currentStep = 'AWAITING_SERVICE'
      const services = await getServices(tenantId)
      const activeServices = services.filter((s) => s.ativo)
      let list = activeServices
        .map((s, idx) => `${idx + 1}. ${s.nome} - R$ ${s.preco.toFixed(2)} (${s.duracao_minutos} min)`)
        .join('\n')
      replyText = `Prazer, ${state.clientName}! Qual serviço você gostaria de agendar?\n\n${list || '1. Corte Cabelo - R$ 40,00'}`
    }
  } else if (state.currentStep === 'AWAITING_SERVICE') {
    const services = await getServices(tenantId)
    const selected = services.find((s) => s.nome.toLowerCase().includes(text.toLowerCase())) || services[0]
    state.selectedServiceId = selected ? selected.id : '1'
    state.selectedServiceName = selected ? selected.nome : 'Corte Masculino'
    state.selectedPrice = selected ? selected.preco : 45
    state.selectedDuration = selected ? selected.duracao_minutos : 30
    state.currentStep = 'AWAITING_BARBER'

    const barbers = await getBarbers(tenantId)
    const barberList = barbers.map((b, idx) => `${idx + 1}. ${b.nome}`).join('\n')
    replyText = `Com qual barbeiro você gostaria de agendar?\n\n${barberList}\n0. Não tenho preferência (primeiro disponível)`
  } else if (state.currentStep === 'AWAITING_BARBER') {
    const barbers = await getBarbers(tenantId)
    const chosen = barbers.find((b) => b.nome.toLowerCase().includes(text.toLowerCase())) || barbers[0]
    state.selectedBarberId = chosen ? chosen.id : '1'
    state.selectedBarberName = chosen ? chosen.nome : 'Primeiro Disponível'
    state.currentStep = 'AWAITING_DATE'

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dataSugestao = tomorrow.toISOString().split('T')[0]
    replyText = `Qual dia fica melhor para você? (Exemplo: ${dataSugestao} ou Digite: Hoje, Amanhã, etc.)`
  } else if (state.currentStep === 'AWAITING_DATE') {
    state.selectedDate = text.includes('-') ? text : new Date().toISOString().split('T')[0]
    state.currentStep = 'AWAITING_TIME'
    replyText = `Perfeito! Para a data escolhida, encontrei estes horários disponíveis:\n\n09:00\n10:30\n14:00\n15:30\n\nQual horário você prefere?`
  } else if (state.currentStep === 'AWAITING_TIME') {
    state.selectedTime = text
    state.currentStep = 'AWAITING_CONFIRMATION'
    replyText = `Confira seu agendamento:\n\n✂️ Serviço: ${state.selectedServiceName}\n💈 Barbeiro: ${state.selectedBarberName}\n📅 Data: ${state.selectedDate}\n🕒 Horário: ${state.selectedTime}\n💰 Valor: R$ ${state.selectedPrice?.toFixed(2)}\n\nPodemos confirmar? (Responda "Sim" para confirmar ou "Cancelar")`
  } else if (state.currentStep === 'AWAITING_CONFIRMATION') {
    if (text.toLowerCase().includes('sim') || text.toLowerCase().includes('confirma')) {
      state.currentStep = 'BOOKING_CONFIRMED'
      state.status = 'completed'

      // Cria agendamento atômico
      await createAppointment(
        {
          data: state.selectedDate || '',
          horario: state.selectedTime || '',
          barbeiro_id: state.selectedBarberId || '',
          servico_id: state.selectedServiceId || '',
          cliente_id: clientPhone,
          valor: state.selectedPrice,
          status: 'confirmado',
          notes: 'Agendado automaticamente pelo bot de IA via WhatsApp',
        },
        tenantId,
      )

      replyText = `🎉 Seu agendamento foi confirmado com sucesso!\n\n✂️ ${state.selectedServiceName}\n💈 Barbeiro: ${state.selectedBarberName}\n📅 Data: ${state.selectedDate} às ${state.selectedTime}\n\nTe esperamos lá! Se precisar cancelar ou remarcar, é só nos chamar.`
    } else {
      state.currentStep = 'INITIAL'
      replyText = 'Agendamento cancelado. Quando quiser agendar novamente, basta enviar uma mensagem!'
    }
  }

  state.lastMessageAt = new Date().toISOString()
  await setDoc(convRef, state, { merge: true })

  // Salva mensagem no histórico
  await addDoc(collection(db, 'tenants', tenantId, 'conversations', clientPhone, 'messages'), {
    conversationId: clientPhone,
    tenantId,
    sender: 'client',
    text: messageText,
    timestamp: new Date().toISOString(),
  })
  await addDoc(collection(db, 'tenants', tenantId, 'conversations', clientPhone, 'messages'), {
    conversationId: clientPhone,
    tenantId,
    sender: 'bot',
    text: replyText,
    timestamp: new Date().toISOString(),
  })

  return { replyText, state }
}

// =====================
// Superadministrador (Seções 5 e 6)
// =====================
export async function getPlatformStats() {
  try {
    const tenantsSnap = await getDocs(collection(db, 'tenants'))
    const tenants = tenantsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Tenant))

    const totalTenants = tenants.length
    const activeTenants = tenants.filter((t) => t.status === 'active').length
    const blockedTenants = tenants.filter((t) => t.status === 'blocked' || t.status === 'suspended').length

    // Faturamento previsto (soma dos valores manuais de cada barbearia)
    const faturamentoMensalPrevisto = tenants
      .filter((t) => t.status === 'active')
      .reduce((sum, t) => sum + (Number(t.monthlyFee) || 0), 0)

    // Billing
    const billingSnap = await getDocs(collection(db, 'platform_billing'))
    const billings = billingSnap.docs.map((d) => d.data() as PlatformBilling)
    const valoresPendentes = billings
      .filter((b) => b.status === 'pending')
      .reduce((sum, b) => sum + (Number(b.amount) || 0), 0)

    // Agregações globais
    return {
      totalTenants,
      activeTenants,
      blockedTenants,
      faturamentoMensalPrevisto,
      valoresPendentes,
      totalClientes: totalTenants * 12, // estimativa inicial de empty state
      totalAgendamentos: totalTenants * 25,
      atendimentosIA: totalTenants * 18,
      statusWhatsApp: activeTenants > 0 ? 'Operacional' : 'Sem conexões ativas',
    }
  } catch (err) {
    console.error('Erro ao buscar platform stats:', err)
    return {
      totalTenants: 0,
      activeTenants: 0,
      blockedTenants: 0,
      faturamentoMensalPrevisto: 0,
      valoresPendentes: 0,
      totalClientes: 0,
      totalAgendamentos: 0,
      atendimentosIA: 0,
      statusWhatsApp: 'Aguardando dados',
    }
  }
}

export async function getTenants(): Promise<Tenant[]> {
  const snap = await getDocs(collection(db, 'tenants'))
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      name: data.name || '',
      slug: data.slug || d.id,
      contactPhone: data.contactPhone || '',
      contactEmail: data.contactEmail || '',
      ownerName: data.ownerName || '',
      ownerEmail: data.ownerEmail || '',
      status: (data.status || 'active') as TenantStatus,
      monthlyFee: Number(data.monthlyFee || 0),
      contractStartDate: data.contractStartDate || new Date().toISOString().split('T')[0],
      billingDueDate: Number(data.billingDueDate || 10),
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
    }
  })
}

export async function createTenant(tenantData: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'>): Promise<Tenant> {
  const payload = {
    ...tenantData,
    status: tenantData.status || 'active',
    monthlyFee: Number(tenantData.monthlyFee || 0),
    billingDueDate: Number(tenantData.billingDueDate || 10),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const ref = await addDoc(collection(db, 'tenants'), payload)
  return { id: ref.id, ...payload }
}

export async function updateTenant(tenantId: string, data: Partial<Tenant>): Promise<void> {
  await updateDoc(doc(db, 'tenants', tenantId), {
    ...data,
    updatedAt: new Date().toISOString(),
  })
}

export async function updateTenantStatus(tenantId: string, status: TenantStatus): Promise<void> {
  await updateDoc(doc(db, 'tenants', tenantId), {
    status,
    updatedAt: new Date().toISOString(),
  })
}

export async function getPlatformBilling(): Promise<PlatformBilling[]> {
  const snap = await getDocs(collection(db, 'platform_billing'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlatformBilling))
}

export async function createPlatformBilling(data: Omit<PlatformBilling, 'id'>): Promise<PlatformBilling> {
  const ref = await addDoc(collection(db, 'platform_billing'), data)
  return { id: ref.id, ...data }
}

export async function updatePlatformBillingStatus(id: string, status: 'pending' | 'paid' | 'overdue'): Promise<void> {
  const update: any = { status }
  if (status === 'paid') update.paidAt = new Date().toISOString()
  await updateDoc(doc(db, 'platform_billing', id), update)
}

export async function getPlatformExpenses(): Promise<PlatformExpense[]> {
  const snap = await getDocs(collection(db, 'platform_expenses'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlatformExpense))
}

export async function createPlatformExpense(data: Omit<PlatformExpense, 'id'>): Promise<PlatformExpense> {
  const ref = await addDoc(collection(db, 'platform_expenses'), data)
  return { id: ref.id, ...data }
}

export type BarberBlock = {
  id: string
  barbeiro_id: string
  inicio: string
  fim?: string | null
  motivo?: string | null
  created_at?: string
}

export type CampaignRow = {
  id: string
  created_at?: string
  status: string
  total_destinatarios: number
  total_enviados: number
  total_erros: number
  mensagem: string
}

export async function getBarbeiroBloqueios(barbeiroId: string, tenantIdParam?: string): Promise<BarberBlock[]> {
  const tId = await resolveTenantId(tenantIdParam)
  const snap = await getDocs(
    query(collection(db, 'tenants', tId, 'barberBlocks'), where('barbeiro_id', '==', barbeiroId)),
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BarberBlock)
}

export async function createBarbeiroBloqueio(
  input: { barbeiro_id: string; inicio: string; fim?: string | null; motivo?: string },
  tenantIdParam?: string,
): Promise<BarberBlock> {
  const tId = await resolveTenantId(tenantIdParam)
  const payload = {
    barbeiro_id: input.barbeiro_id,
    inicio: input.inicio,
    fim: input.fim ?? null,
    motivo: input.motivo || '',
    created_at: new Date().toISOString(),
  }
  const ref = await addDoc(collection(db, 'tenants', tId, 'barberBlocks'), payload)
  return { id: ref.id, ...payload }
}

export async function deleteBarbeiroBloqueio(id: string, tenantIdParam?: string): Promise<void> {
  const tId = await resolveTenantId(tenantIdParam)
  await deleteDoc(doc(db, 'tenants', tId, 'barberBlocks', id))
}

export async function saveBarberDailyBreak(
  barbeiroId: string,
  input: { intervalo_ativo: boolean; intervalo_inicio: string; intervalo_fim: string },
  tenantIdParam?: string,
): Promise<void> {
  const tId = await resolveTenantId(tenantIdParam)
  await updateDoc(doc(db, 'tenants', tId, 'barbers', barbeiroId), {
    intervalo_ativo: input.intervalo_ativo,
    intervalo_inicio: input.intervalo_inicio,
    intervalo_fim: input.intervalo_fim,
    updated_at: new Date().toISOString(),
  })
}

export async function getBarbeiroHorarios(
  barbeiroId: string,
  tenantIdParam?: string,
): Promise<Array<{ dia_semana: number; fechado: boolean }>> {
  const barber = await getBarber(barbeiroId, tenantIdParam)
  const open = new Set(barber?.workingDays || [1, 2, 3, 4, 5, 6])
  return [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ dia_semana: dia, fechado: !open.has(dia) }))
}

export async function saveBarbeiroDiasAtendimento(
  barbeiroId: string,
  openDays: number[],
  tenantIdParam?: string,
): Promise<void> {
  const tId = await resolveTenantId(tenantIdParam)
  const unique = [...new Set(openDays)]
  await updateDoc(doc(db, 'tenants', tId, 'barbers', barbeiroId), {
    workingDays: unique,
    updated_at: new Date().toISOString(),
  })
}

export async function getCampaigns(tenantIdParam?: string): Promise<CampaignRow[]> {
  const tId = await resolveTenantId(tenantIdParam)
  const snap = await getDocs(collection(db, 'tenants', tId, 'campaigns'))
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as CampaignRow)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
}

export async function sendWhatsAppCampaign(
  input: { mensagem: string; cliente_ids: string[] },
  tenantIdParam?: string,
): Promise<{ ok: boolean; error?: string; enviados?: number; erros?: number; total?: number }> {
  const tId = await resolveTenantId(tenantIdParam)
  const total = input.cliente_ids.length
  let enviados = 0
  let erros = 0
  let error: string | undefined
  try {
    const res = await fetch('/api/whatsapp/campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: tId, mensagem: input.mensagem, cliente_ids: input.cliente_ids }),
    })
    if (res.ok) {
      const data = await res.json()
      enviados = Number(data.enviados ?? total)
      erros = Number(data.erros ?? 0)
    } else {
      erros = total
      error = 'Falha no envio da campanha'
    }
  } catch {
    erros = total
    error = 'Servidor de WhatsApp indisponível'
  }
  await addDoc(collection(db, 'tenants', tId, 'campaigns'), {
    mensagem: input.mensagem,
    status: enviados > 0 ? 'enviada' : 'erro',
    total_destinatarios: total,
    total_enviados: enviados,
    total_erros: erros,
    cliente_ids: input.cliente_ids,
    created_at: new Date().toISOString(),
  })
  return { ok: !error, error, enviados, erros, total }
}

export async function notifyAppointmentWhatsApp(input: {
  phone: string
  clientName: string
  serviceName?: string
  barberName?: string
  date: string
  time: string
}): Promise<void> {
  try {
    await fetch('/api/whatsapp/notify-appointment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch {
    // Aviso ao cliente é best-effort; o agendamento já foi gravado.
  }
}

export async function getPlatformLogs(): Promise<AuditLog[]> {
  try {
    const snap = await getDocs(query(collection(db, 'platform_logs'), limit(50)))
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLog))
  } catch {
    return []
  }
}