import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initializeApp } from 'firebase/app'
import { collection, doc, getDocs, setDoc, getFirestore } from 'firebase/firestore'

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

function tomorrowYmd() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || '1')
  const date = new Date(Date.UTC(get('year'), get('month') - 1, get('day') + 1))
  return date.toISOString().slice(0, 10)
}

const env = loadEnvLocal()
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
})
const db = getFirestore(app)

const [barbeirosSnap, servicosSnap] = await Promise.all([
  getDocs(collection(db, 'barbeiros')),
  getDocs(collection(db, 'servicos')),
])

function asRow(item) {
  return { id: item.id, ...item.data() }
}

const marcos = barbeirosSnap.docs
  .map(asRow)
  .find((row) => String(row.id) === 'marcos-correia' || String(row.nome).toLowerCase() === 'marcos correia')

const corte = servicosSnap.docs
  .map(asRow)
  .find((row) => String(row.id) === 'corte-de-cabelo' || String(row.nome) === 'Corte de Cabelo')

if (!marcos) throw new Error('Marcos Correia não encontrado em barbeiros')
if (!corte) throw new Error('Corte de Cabelo não encontrado em servicos')

const data = tomorrowYmd()
const id = 'teste-alan-marcos-corte'
const docBody = {
  id,
  barbeiroId: marcos.id,
  barbeiro_id: marcos.id,
  barbeiroNome: 'Marcos Correia',
  servicoId: corte.id,
  servico_id: corte.id,
  servicoNome: 'Corte de Cabelo',
  clienteNome: 'Alan Teste',
  cliente_nome: 'Alan Teste',
  clienteTelefone: '85999999999',
  cliente_telefone: '85999999999',
  preco: 40.0,
  valor: 40.0,
  data,
  horario: '10:00:00',
  status: 'confirmado',
  origem: 'painel_teste_visivel',
  created_at: new Date().toISOString(),
}

await setDoc(doc(db, 'agendamentos', id), docBody)
console.log(JSON.stringify({ ok: true, ...docBody }, null, 2))
process.exit(0)
