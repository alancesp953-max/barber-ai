/**
 * Script para popular o banco de dados Firebase com dados reais da barbearia.
 * Roda uma vez para criar: tenant, serviços, barbeiros, settings e aiSettings.
 *
 * Uso: node server/scripts/seedTenantData.mjs
 */
import { adminDb } from '../lib/firebaseAdmin.mjs'

const TENANT_ID = 'I13A9nw5T4IsaojMPLl6'

async function seed() {
  console.log(`🌱 Populando dados para o tenant "${TENANT_ID}"...\n`)

  // 1. Documento raiz do Tenant
  await adminDb.collection('tenants').doc(TENANT_ID).set(
    {
      id: TENANT_ID,
      nome: 'Barbearia Barber AI',
      slug: 'barber-ai',
      status: 'active',
      plano: 'premium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  )
  console.log('✅ Documento do Tenant criado')

  // 2. Settings gerais da barbearia
  await adminDb
    .collection('tenants')
    .doc(TENANT_ID)
    .collection('settings')
    .doc('general')
    .set(
      {
        nome_barbearia: 'Barbearia Barber AI',
        telefone: '5511981058479',
        endereco: 'São Paulo, SP',
        horario_abertura: '08:00',
        horario_fechamento: '20:00',
        intervalo_almoco_inicio: '12:00',
        intervalo_almoco_fim: '13:00',
        dias_funcionamento: [1, 2, 3, 4, 5, 6], // Seg a Sáb
        intervalo_entre_agendamentos: 30, // minutos
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    )
  console.log('✅ Settings gerais criados')

  // 3. Configurações de IA
  await adminDb
    .collection('tenants')
    .doc(TENANT_ID)
    .collection('aiSettings')
    .doc('primary')
    .set(
      {
        tenantId: TENANT_ID,
        enabled: true,
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        geminiApiKey: process.env.GEMINI_API_KEY || '',
        greetingMessage: 'Olá bem-vindo à barbearia, para começarmos qual seu nome?',
        humanHandoffKeyword: 'humano',
        audioEnabled: false,
        elevenlabsApiKey: '',
        elevenlabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
        language: 'pt-BR',
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    )
  console.log('✅ AI Settings criados')

  // 4. Serviços reais da barbearia
  const services = [
    {
      id: 'srv_corte_tradicional',
      nome: 'Corte Tradicional',
      descricao: 'Corte masculino clássico com máquina e tesoura',
      preco: 40,
      duracao_minutos: 30,
      ativo: true,
      ordem: 1,
    },
    {
      id: 'srv_barba',
      nome: 'Barba',
      descricao: 'Barba modelada com navalha e toalha quente',
      preco: 35,
      duracao_minutos: 30,
      ativo: true,
      ordem: 2,
    },
    {
      id: 'srv_corte_barba',
      nome: 'Corte + Barba',
      descricao: 'Combo completo de corte e barba',
      preco: 65,
      duracao_minutos: 50,
      ativo: true,
      ordem: 3,
    },
    {
      id: 'srv_pigmentacao',
      nome: 'Pigmentação',
      descricao: 'Pigmentação capilar para cobertura de fios brancos',
      preco: 50,
      duracao_minutos: 40,
      ativo: true,
      ordem: 4,
    },
  ]

  for (const svc of services) {
    await adminDb
      .collection('tenants')
      .doc(TENANT_ID)
      .collection('services')
      .doc(svc.id)
      .set({ ...svc, createdAt: new Date().toISOString() }, { merge: true })
  }
  console.log(`✅ ${services.length} serviços criados`)

  // 5. Barbeiros reais
  const barbers = [
    {
      id: 'barb_felipe',
      nome: 'Felipe',
      especialidade: 'Corte degradê e barba',
      ativo: true,
      startHour: '08:00',
      endHour: '18:00',
      breakStart: '12:00',
      breakEnd: '13:00',
      workingDays: [1, 2, 3, 4, 5, 6], // Seg a Sáb
      daysOff: [],
      ordem: 1,
    },
    {
      id: 'barb_joao',
      nome: 'João',
      especialidade: 'Corte social e pigmentação',
      ativo: true,
      startHour: '09:00',
      endHour: '19:00',
      breakStart: '12:00',
      breakEnd: '13:00',
      workingDays: [1, 2, 3, 4, 5, 6],
      daysOff: [],
      ordem: 2,
    },
  ]

  for (const barb of barbers) {
    await adminDb
      .collection('tenants')
      .doc(TENANT_ID)
      .collection('barbers')
      .doc(barb.id)
      .set({ ...barb, createdAt: new Date().toISOString() }, { merge: true })
  }
  console.log(`✅ ${barbers.length} barbeiros criados`)

  // Verificação final
  console.log('\n🔍 Verificação final...')
  const svcs = await adminDb.collection('tenants').doc(TENANT_ID).collection('services').where('ativo', '==', true).get()
  const barbs = await adminDb.collection('tenants').doc(TENANT_ID).collection('barbers').where('ativo', '==', true).get()
  const ai = await adminDb.collection('tenants').doc(TENANT_ID).collection('aiSettings').doc('primary').get()

  console.log(`   Serviços ativos: ${svcs.size}`)
  console.log(`   Barbeiros ativos: ${barbs.size}`)
  console.log(`   AI configurada: ${ai.exists ? 'SIM' : 'NÃO'}`)
  console.log(`   Modelo: ${ai.exists ? ai.data().model : '-'}`)
  console.log('\n🎉 Seed concluído com sucesso!')
}

seed().catch((err) => {
  console.error('❌ Erro no seed:', err)
  process.exit(1)
})
