import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initializeApp } from 'firebase/app'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  setDoc,
} from 'firebase/firestore'

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return env
}

const env = loadEnvLocal()
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
}

if (!config.apiKey || !config.projectId || !config.appId) {
  throw new Error('VITE_FIREBASE_* ausente no .env.local')
}

const createdAt = new Date().toISOString()
const expediente = { inicio: '08:30', fim: '19:30' }

const SERVICOS = [
  {
    id: 'barba-tradicional',
    nome: 'Barba Tradicional',
    preco: 40.0,
    duracaoMinutos: 30,
    descricao: 'Barba feita com toalha quente',
  },
  {
    id: 'combo-corte-e-barba',
    nome: 'Combo Corte e Barba',
    preco: 80.0,
    duracaoMinutos: 35,
    descricao: 'Serviço completo de corte e barba',
  },
  {
    id: 'corte-de-cabelo',
    nome: 'Corte de Cabelo',
    preco: 40.0,
    duracaoMinutos: 25,
    descricao: 'Corte moderno com máquina e tesoura',
  },
  {
    id: 'corte-e-sobrancelha',
    nome: 'Corte e Sobrancelha',
    preco: 55.0,
    duracaoMinutos: 35,
  },
  {
    id: 'corte-barba-e-sobrancelha',
    nome: 'Corte, Barba e Sobrancelha',
    preco: 90.0,
    duracaoMinutos: 45,
  },
  {
    id: 'hidratacao',
    nome: 'Hidratação',
    preco: 40.0,
    duracaoMinutos: 30,
  },
  {
    id: 'pezinho-do-cabelo',
    nome: 'Pezinho do Cabelo',
    preco: 15.0,
    duracaoMinutos: 10,
  },
  {
    id: 'pigmentacao-de-barba',
    nome: 'pigmentação de barba',
    preco: 20.0,
    duracaoMinutos: 15,
  },
  {
    id: 'pigmentacao-de-cabelo',
    nome: 'pigmentação de cabelo',
    preco: 30.0,
    duracaoMinutos: 30,
  },
]

const BARBEIROS = [
  {
    id: 'marcos-correia',
    nome: 'Marcos Correia',
    email: 'mcorreiathalyta@gmail.com',
    telefone: '85986299623',
    ordemRodizio: 1,
    ativo: true,
    comissaoServico: 0.5,
    comissaoProduto: 0.1,
    avaliacao: 5.0,
    expediente,
  },
  {
    id: 'jeova-aguiar',
    nome: 'Jeova Aguiar',
    email: 'barbeariavarjota15+jeova@gmail.com',
    telefone: '85996224754',
    ordemRodizio: 2,
    ativo: true,
    comissaoServico: 0.5,
    comissaoProduto: 0.5,
    avaliacao: 5.0,
    expediente,
  },
  {
    id: 'bruno-fernandes',
    nome: 'Bruno Fernandes',
    email: 'brunodomingue79@gmail.com',
    telefone: '85996056998',
    ordemRodizio: 3,
    ativo: true,
    comissaoServico: 0.45,
    comissaoProduto: 0.1,
    avaliacao: 5.0,
    expediente,
  },
  {
    id: 'daniel',
    nome: 'Daniel',
    email: 'danielgomes1425@icloud.com',
    telefone: '85982373875',
    ordemRodizio: 4,
    ativo: true,
    comissaoServico: 0.45,
    comissaoProduto: 0.1,
    avaliacao: 5.0,
    expediente,
  },
]

function serviceDoc(row) {
  return {
    id: row.id,
    nome: row.nome,
    preco: row.preco,
    duracaoMinutos: row.duracaoMinutos,
    duracao_minutos: row.duracaoMinutos,
    descricao: row.descricao ?? '',
    ativo: true,
    buffer_minutos: 0,
    created_at: createdAt,
  }
}

function barberDoc(row) {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    telefone: row.telefone,
    ordemRodizio: row.ordemRodizio,
    ordem_rodizio: row.ordemRodizio,
    ativo: row.ativo,
    comissaoServico: row.comissaoServico,
    comissaoProduto: row.comissaoProduto,
    percentual_servico: Math.round(row.comissaoServico * 100),
    percentual_produto: Math.round(row.comissaoProduto * 100),
    comissao_servico_tipo: 'porcentagem',
    comissao_produto_tipo: 'porcentagem',
    avaliacao: row.avaliacao,
    expediente: row.expediente,
    created_at: createdAt,
  }
}

async function replaceCollection(db, name, rows, toDoc) {
  const snap = await getDocs(collection(db, name))
  const keep = new Set(rows.map((row) => row.id))
  for (const item of snap.docs) {
    if (!keep.has(item.id)) await deleteDoc(item.ref)
  }
  for (const row of rows) {
    await setDoc(doc(db, name, row.id), toDoc(row))
  }
}

const app = initializeApp(config)
const db = getFirestore(app)

await replaceCollection(db, 'servicos', SERVICOS, serviceDoc)
await replaceCollection(db, 'barbeiros', BARBEIROS, barberDoc)

const [servicosSnap, barbeirosSnap] = await Promise.all([
  getDocs(collection(db, 'servicos')),
  getDocs(collection(db, 'barbeiros')),
])

const servicos = servicosSnap.docs
  .map((item) => item.data())
  .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
const barbeiros = barbeirosSnap.docs
  .map((item) => item.data())
  .sort((a, b) => Number(a.ordemRodizio) - Number(b.ordemRodizio))

console.log(`projeto=${config.projectId}`)
console.log(`servicos=${servicos.length}`)
for (const row of servicos) {
  console.log(`- ${row.nome} | R$ ${Number(row.preco).toFixed(2)} | ${row.duracaoMinutos}min`)
}
console.log(`barbeiros=${barbeiros.length}`)
for (const row of barbeiros) {
  console.log(`- #${row.ordemRodizio} ${row.nome} | ${row.email} | ${row.expediente.inicio}-${row.expediente.fim}`)
}

process.exit(0)
