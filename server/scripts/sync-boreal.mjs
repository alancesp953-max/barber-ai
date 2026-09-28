import fs from 'fs'
import path from 'path'

const file = path.resolve('server', 'data', 'localStore.json')
let data = {}
if (fs.existsSync(file)) {
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {}
}

// Limpa qualquer dado mock legado de felipe ou joao
for (const key of Object.keys(data)) {
  if (
    key.includes('barb_felipe') ||
    key.includes('barb_joao') ||
    data[key]?.name === 'Felipe' ||
    data[key]?.nome === 'Felipe' ||
    data[key]?.name === 'João' ||
    data[key]?.nome === 'João'
  ) {
    delete data[key]
  }
}

const tenantIds = ['I13A9nw5T4IsaojMPLl6', 'barbearia-principal', 'default-tenant']

for (const tId of tenantIds) {
  // Tenant Doc
  data['tenants/' + tId] = {
    name: 'Barbearia boreal',
    nome: 'Barbearia boreal',
    slug: 'barbearia-boreal',
    status: 'active',
    monthlyFee: 150,
    ownerName: 'carlos',
    ownerEmail: 'carlos@barbeariaboreal.com',
    contactPhone: '11988949106',
    billingDueDate: 10,
    createdAt: '2026-09-26T00:00:00.000Z',
    updatedAt: new Date().toISOString(),
  }

  // Barbeiro Real: feliciano
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
    startHour: '08:00',
    endHour: '19:00',
    breakStart: '12:00',
    breakEnd: '13:00',
    workingDays: [1, 2, 3, 4, 5, 6],
    daysOff: [],
    createdAt: '2026-09-26T00:22:32.705Z',
    created_at: '2026-09-26T00:22:32.705Z',
  }

  // Serviços Reais
  data['tenants/' + tId + '/services/serv_corte'] = {
    id: 'serv_corte',
    name: 'Corte Tradicional',
    nome: 'Corte Tradicional',
    preco: 35,
    price: 35,
    duracao: 30,
    durationMinutes: 30,
    active: true,
    ativo: true,
  }
  data['tenants/' + tId + '/services/serv_barba'] = {
    id: 'serv_barba',
    name: 'Barba Completa',
    nome: 'Barba Completa',
    preco: 30,
    price: 30,
    duracao: 30,
    durationMinutes: 30,
    active: true,
    ativo: true,
  }

  // Configurações
  data['tenants/' + tId + '/settings/general'] = {
    nome_barbearia: 'Barbearia boreal',
    name: 'Barbearia boreal',
    telefone: '11988949106',
    horario_abertura: '08:00',
    horario_fechamento: '19:00',
    dias_funcionamento: [1, 2, 3, 4, 5, 6],
  }

  data['tenants/' + tId + '/aiSettings/primary'] = {
    enabled: true,
    audioEnabled: false,
    humanHandoffKeyword: 'humano',
  }

  // Reseta estado da conversa do cliente de teste para começar do início
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
console.log('✅ localStore.json atualizado com Barbearia boreal e barbeiro feliciano com sucesso!')
