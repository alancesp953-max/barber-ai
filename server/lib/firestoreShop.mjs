import { getAdminDb, getFirebaseMode, initFirebaseAdmin, readWebConfig } from './firebaseAdmin.mjs'

let clientDb = null

async function getClientDb() {
  if (clientDb) return clientDb
  const { initializeApp, getApps } = await import('firebase/app')
  const { getFirestore } = await import('firebase/firestore')
  const cfg = readWebConfig()
  if (!cfg.apiKey || !cfg.projectId || !cfg.appId) {
    throw new Error('Sem serviceAccountKey.json e sem VITE_FIREBASE_* no .env.local.')
  }
  const app = getApps()[0] || initializeApp(cfg)
  clientDb = getFirestore(app)
  return clientDb
}

export function normalizeAppointmentStatus(raw) {
  const value = String(raw || 'confirmado').trim().toLowerCase()
  if (value === 'confirmado_teste' || value === 'confirmed') return 'confirmado'
  if (value === 'pending') return 'pendente'
  if (value === 'cancelled' || value === 'canceled') return 'cancelado'
  if (value === 'done' || value === 'completed') return 'concluido'
  if (['pendente', 'confirmado', 'concluido', 'cancelado'].includes(value)) return value
  return 'confirmado'
}

function normalizeRow(name, row) {
  if (name !== 'agendamentos') return row
  return {
    ...row,
    barbeiro_id: row.barbeiro_id || row.barbeiroId || null,
    servico_id: row.servico_id || row.servicoId || null,
    status: normalizeAppointmentStatus(row.status),
  }
}

export async function listCollection(name) {
  initFirebaseAdmin()
  if (getFirebaseMode() === 'admin') {
    const snap = await getAdminDb().collection(name).get()
    return snap.docs.map((item) => normalizeRow(name, { id: item.id, ...item.data() }))
  }
  const { collection, getDocs } = await import('firebase/firestore')
  const snap = await getDocs(collection(await getClientDb(), name))
  return snap.docs.map((item) => normalizeRow(name, { id: item.id, ...item.data() }))
}

export async function addDocument(name, data) {
  initFirebaseAdmin()
  const body = name === 'agendamentos' ? normalizeRow(name, { ...data }) : { ...data }
  if (getFirebaseMode() === 'admin') {
    if (body.id) {
      const id = String(body.id)
      await getAdminDb().collection(name).doc(id).set(body)
      return { ...body, id }
    }
    const ref = await getAdminDb().collection(name).add(body)
    await ref.update({ id: ref.id })
    return { ...body, id: ref.id }
  }
  const { addDoc, collection, doc, setDoc, updateDoc } = await import('firebase/firestore')
  const db = await getClientDb()
  if (body.id) {
    const id = String(body.id)
    await setDoc(doc(db, name, id), body)
    return { ...body, id }
  }
  const ref = await addDoc(collection(db, name), body)
  await updateDoc(ref, { id: ref.id })
  return { ...body, id: ref.id }
}

export function durationOf(service) {
  return Number(service?.duracaoMinutos ?? service?.duracao_minutos) || 30
}

export function priceOf(service) {
  return Number(service?.preco) || 0
}

export function ordemOf(barber) {
  return Number(barber?.ordemRodizio ?? barber?.ordem_rodizio) || 9999
}
