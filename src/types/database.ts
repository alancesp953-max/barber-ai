export type UserRole = 'superadmin' | 'tenant_admin' | 'barber'

export interface UserProfile {
  uid: string
  email: string
  role: UserRole
  tenantId?: string
  name?: string
  status: 'active' | 'suspended' | 'blocked'
  createdAt: string
}

export type TenantStatus = 'pending' | 'active' | 'suspended' | 'blocked'

export interface Tenant {
  id: string
  name: string
  slug: string
  contactPhone: string
  contactEmail: string
  ownerName: string
  ownerEmail: string
  status: TenantStatus
  monthlyFee: number
  contractStartDate: string
  billingDueDate: number
  createdAt: string
  updatedAt: string
}

export interface BarberServiceConfig {
  serviceId: string
  customPrice?: number
  customDurationMinutes?: number
}

export interface Barber {
  id: string
  tenantId?: string
  name?: string
  nome: string
  email?: string | null
  telefone?: string | null
  phone?: string | null
  photoUrl?: string | null
  foto_url?: string | null
  percentual_servico?: number
  percentual_produto?: number
  comissao_servico_tipo?: string
  comissao_produto_tipo?: string
  especialidades?: string | string[] | null
  avaliacao?: number | null
  user_id?: string | null
  ativo?: boolean
  active?: boolean
  created_at?: string
  createdAt?: string
  specialties?: string[]
  services?: BarberServiceConfig[]
  workingDays?: number[]
  startHour?: string
  endHour?: string
  breakStart?: string
  breakEnd?: string
  daysOff?: string[]
}

export type CreateBarberInput = {
  nome: string
  name?: string
  email?: string | null
  telefone?: string | null
  phone?: string | null
  especialidades?: string | null
  percentual_servico?: number
  percentual_produto?: number
  comissao_servico_tipo?: string
  comissao_produto_tipo?: string
  avaliacao?: number
  foto_url?: string | null
  photoUrl?: string | null
  ativo?: boolean
  active?: boolean
}

export interface Service {
  id: string
  tenantId?: string
  name?: string
  nome: string
  description?: string | null
  descricao?: string | null
  price?: number
  preco: number
  durationMinutes?: number
  duracao_minutos: number
  enabledBarbers?: string[]
  ativo?: boolean
  active?: boolean
  created_at?: string
  createdAt?: string
}

export interface Client {
  id: string
  tenantId?: string
  nome: string
  name?: string
  telefone?: string | null
  phone?: string | null
  email?: string | null
  notes?: string
  totalAppointments?: number
  created_at?: string
  createdAt?: string
}

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'pendente'
  | 'confirmado'
  | 'concluido'
  | 'cancelado'

export type AppointmentOrigin = 'whatsapp' | 'manual'

export interface Appointment {
  id: string
  tenantId?: string
  clientId?: string | null
  cliente_id?: string | null
  clientName?: string
  clientPhone?: string
  barberId?: string | null
  barbeiro_id?: string | null
  barberName?: string
  serviceId?: string | null
  servico_id?: string | null
  serviceName?: string
  date?: string
  data: string
  time?: string
  horario: string
  durationMinutes?: number
  duracao_minutos?: number
  price?: number
  valor?: number | null
  status: AppointmentStatus
  origin?: AppointmentOrigin
  conversationId?: string
  notes?: string
  created_at?: string
  createdAt?: string
  barbeiros?: Pick<Barber, 'nome'> | { nome: string } | null
  servicos?: Pick<Service, 'nome' | 'duracao_minutos' | 'preco'> | { nome: string; duracao_minutos?: number; preco?: number } | null
  clientes?: Pick<Client, 'nome' | 'email'> | { nome: string; email?: string | null } | null
}

export interface Product {
  id: string
  tenantId?: string
  nome: string
  name?: string
  preco?: number
  price?: number
  cost?: number
  custo?: number
  preco_venda?: number
  preco_custo?: number
  stock?: number
  estoque?: number
  estoque_atual?: number
  estoque_minimo?: number
  active?: boolean
  ativo?: boolean
  created_at?: string
}

export interface WhatsAppConnection {
  id: string
  tenantId: string
  phoneNumberId: string
  wabaId: string
  businessPhoneNumber: string
  webhookVerifyToken: string
  status: 'disconnected' | 'connected' | 'error'
  lastVerifiedAt?: string
  errorDetails?: string
}

export type ConversationStep =
  | 'INITIAL'
  | 'AWAITING_NAME'
  | 'AWAITING_SERVICE'
  | 'AWAITING_BARBER'
  | 'AWAITING_DATE'
  | 'AWAITING_TIME'
  | 'AWAITING_CONFIRMATION'
  | 'BOOKING_CONFIRMED'
  | 'AWAITING_RESCHEDULE'
  | 'AWAITING_CANCELLATION'
  | 'COMPLETED'
  | 'HUMAN_HANDOFF'

export interface ConversationState {
  id: string
  tenantId: string
  clientPhone: string
  clientName?: string
  currentStep: ConversationStep
  selectedServiceId?: string
  selectedServiceName?: string
  selectedPrice?: number
  selectedDuration?: number
  selectedBarberId?: string
  selectedBarberName?: string
  selectedDate?: string
  selectedTime?: string
  lastMessageAt: string
  status: 'active' | 'completed' | 'human_handoff'
  appointmentId?: string
  cachedSlots?: string[]
}

export interface ConversationMessage {
  id: string
  conversationId: string
  tenantId: string
  sender: 'client' | 'bot' | 'human'
  text: string
  audioUrl?: string
  timestamp: string
}

export interface AISettings {
  tenantId: string
  enabled: boolean
  provider: 'gemini'
  model: string
  greetingMessage?: string
  humanHandoffKeyword?: string
  audioEnabled: boolean
  geminiApiKey?: string
  elevenlabsApiKey?: string
  elevenlabsVoiceId?: string
  language: string
}

export interface PlatformBilling {
  id: string
  tenantId: string
  tenantName: string
  amount: number
  dueDate: string
  paidAt?: string
  status: 'pending' | 'paid' | 'overdue'
  notes?: string
}

export interface PlatformExpense {
  id: string
  name: string
  category: string
  amount: number
  dueDate: string
  paymentDate?: string
  status: 'pending' | 'paid'
  description?: string
  receiptUrl?: string
}

export interface APIUsageRecord {
  id: string
  tenantId?: string
  service: 'gemini' | 'elevenlabs' | 'whatsapp'
  operation: string
  timestamp: string
  quantity: number
  estimatedCost: number
  status: 'success' | 'error'
}

export interface AuditLog {
  id: string
  tenantId?: string
  action: string
  performedBy: string
  timestamp: string
  details?: Record<string, any>
}
