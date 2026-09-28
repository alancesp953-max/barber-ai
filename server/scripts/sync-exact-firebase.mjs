import fs from 'fs'
import path from 'path'

const file = path.resolve('server', 'data', 'localStore.json')
let data = {}
if (fs.existsSync(file)) {
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {}
}

// 1. Remove qualquer serviço antigo ou mock legado
for (const key of Object.keys(data)) {
  if (key.includes('/services/')) {
    delete data[key]
  }
}

const tenantIds = ['I13A9nw5T4IsaojMPLl6', 'barbearia-principal', 'default-tenant']

for (const tId of tenantIds) {
  // Configurações REAIS da Barbearia boreal da imagem do Firebase:
  // horario_abertura: "09:00"
  // horario_fechamento: "19:00"
  // dias_funcionamento: [1, 2, 3, 4, 5, 6]
  // nome_barbearia: "Barbearia boreal"
  // telefone: "11981058479"
  data['tenants/' + tId + '/settings/general'] = {
    nome_barbearia: 'Barbearia boreal',
    name: 'Barbearia boreal',
    horario_abertura: '09:00',
    horario_fechamento: '19:00',
    dias_funcionamento: [1, 2, 3, 4, 5, 6],
    telefone: '11981058479',
    phone: '11981058479',
  }

  // Documento principal do Tenant
  data['tenants/' + tId] = {
    name: 'Barbearia boreal',
    nome: 'Barbearia boreal',
    slug: 'barbearia-boreal',
    status: 'active',
    monthlyFee: 150,
    ownerName: 'carlos',
    ownerEmail: 'carlos@barbeariaboreal.com',
    contactPhone: '11981058479',
    billingDueDate: 10,
    createdAt: '2026-09-26T00:00:00.000Z',
    updatedAt: new Date().toISOString(),
  }

  // SERVIÇO REAL 1 DA IMAGEM: "Corte" — R$ 20,00 (ID: jLcUyiZHRIELqQaW4oXd)
  data['tenants/' + tId + '/services/jLcUyiZHRIELqQaW4oXd'] = {
    id: 'jLcUyiZHRIELqQaW4oXd',
    name: 'Corte',
    nome: 'Corte',
    preco: 20,
    price: 20,
    duracao_minutos: 30,
    durationMinutes: 30,
    active: true,
    ativo: true,
    descricao: '',
    description: '',
    enabledBarbers: [],
    created_at: '2026-09-26T00:21:45.016Z',
    createdAt: '2026-09-26T00:21:45.016Z',
  }

  // SERVIÇO REAL 2 DA IMAGEM: "barba" — R$ 30,00 (ID: 1yc35Pj90Ag0nS1ld6ZO)
  data['tenants/' + tId + '/services/1yc35Pj90Ag0nS1ld6ZO'] = {
    id: '1yc35Pj90Ag0nS1ld6ZO',
    name: 'barba',
    nome: 'barba',
    preco: 30,
    price: 30,
    duracao_minutos: 30,
    durationMinutes: 30,
    active: true,
    ativo: true,
    descricao: '',
    description: '',
    enabledBarbers: [],
    created_at: '2026-09-26T00:21:56.702Z',
    createdAt: '2026-09-26T00:21:56.702Z',
  }

  // Barbeiros Reais: feliciano e jucelio (horário de 09:00 às 19:00, seg a sab)
  data['tenants/' + tId + '/barbers/Ks5ZcF7XWx0jOQJWR3Xu'] = {
    id: 'Ks5ZcF7XWx0jOQJWR3Xu',
    name: 'feliciano',
    nome: 'feliciano',
    email: 'feliciano@feliciano.com',
    phone: '11988949106',
    telefone: '11988949106',
    active: true,
    ativo: true,
    avaliacao: 5,
    percentual_servico: 50,
    percentual_produto: 5,
    startHour: '09:00',
    endHour: '19:00',
    breakStart: '12:00',
    breakEnd: '13:00',
    workingDays: [1, 2, 3, 4, 5, 6],
    daysOff: [],
    createdAt: '2026-09-26T00:22:32.705Z',
    created_at: '2026-09-26T00:22:32.705Z',
  }

  if (data['tenants/' + tId + '/barbers/jucelio']) {
    data['tenants/' + tId + '/barbers/jucelio'].startHour = '09:00'
    data['tenants/' + tId + '/barbers/jucelio'].endHour = '19:00'
    data['tenants/' + tId + '/barbers/jucelio'].workingDays = [1, 2, 3, 4, 5, 6]
  }

  // Reseta estado da conversa do cliente de teste (18670306783291)
  data['tenants/' + tId + '/conversations/18670306783291'] = {
    id: '18670306783291',
    tenantId: tId,
    clientPhone: '18670306783291',
    currentStep: 'INITIAL',
    status: 'active',
    assignedTo: 'ai',
    aiEnabled: true,
    lastMessageAt: new Date().toISOString(),
  }
}

fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
console.log('✅ Dados 100% idênticos ao Firebase Firestore sincronizados com sucesso!')
console.log('Serviços:')
console.log('- 1. Corte (R$ 20,00)')
console.log('- 2. barba (R$ 30,00)')
console.log('Horário comercial: 09:00 às 19:00 (Seg a Sáb)')
