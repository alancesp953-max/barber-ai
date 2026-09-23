import { getFirebaseDb, isFirebaseConfigured } from './firebase'

export const FIRESTORE_SHOP_COLLECTIONS = ['barbeiros', 'agendamentos', 'servicos'] as const
export type FirestoreShopCollection = (typeof FIRESTORE_SHOP_COLLECTIONS)[number]

export function isFirestoreShopCollection(table: string): table is FirestoreShopCollection {
  return (FIRESTORE_SHOP_COLLECTIONS as readonly string[]).includes(table)
}

function stripUndefined(value: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = item
  }
  return out
}

function percentFromOfficial(value: unknown, fallback: unknown) {
  const raw = value ?? fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  return n > 0 && n <= 1 ? Math.round(n * 1000) / 10 : n
}

export function normalizeAppointmentStatus(raw: unknown) {
  const value = String(raw || 'confirmado').trim().toLowerCase()
  if (value === 'confirmado_teste' || value === 'confirmed') return 'confirmado'
  if (value === 'pending') return 'pendente'
  if (value === 'cancelled' || value === 'canceled') return 'cancelado'
  if (value === 'done' || value === 'completed') return 'concluido'
  if (['pendente', 'confirmado', 'concluido', 'cancelado'].includes(value)) return value
  return 'confirmado'
}

function normalizeShopRow(table: FirestoreShopCollection, row: Record<string, unknown>) {
  if (table === 'servicos') {
    return {
      ...row,
      duracao_minutos: Number(row.duracao_minutos ?? row.duracaoMinutos) || 0,
      ativo: row.ativo !== false,
    }
  }
  if (table === 'barbeiros') {
    return {
      ...row,
      ordem_rodizio: Number(row.ordem_rodizio ?? row.ordemRodizio) || 0,
      percentual_servico: percentFromOfficial(row.percentual_servico, row.comissaoServico),
      percentual_produto: percentFromOfficial(row.percentual_produto, row.comissaoProduto),
      ativo: row.ativo !== false,
    }
  }
  if (table === 'agendamentos') {
    return {
      ...row,
      barbeiro_id: row.barbeiro_id || row.barbeiroId || null,
      servico_id: row.servico_id || row.servicoId || null,
      status: normalizeAppointmentStatus(row.status),
      horario: row.horario ? String(row.horario) : row.horario,
    }
  }
  return row
}

async function firestore() {
  return import('firebase/firestore')
}

export async function listFirestoreCollection(table: FirestoreShopCollection) {
  const { collection, getDocs } = await firestore()
  const snap = await getDocs(collection(await getFirebaseDb(), table))
  return snap.docs.map((item) => {
    const data = item.data() as Record<string, unknown>
    return normalizeShopRow(table, { ...data, id: item.id })
  })
}

export async function insertFirestoreRow(table: FirestoreShopCollection, payload: Record<string, unknown>) {
  const { addDoc, collection, doc, setDoc, updateDoc } = await firestore()
  const db = await getFirebaseDb()
  const createdAt = payload.created_at || new Date().toISOString()
  const body = stripUndefined({
    ...payload,
    created_at: createdAt,
    ...(payload.status != null ? { status: normalizeAppointmentStatus(payload.status) } : {}),
  })
  if (payload.id) {
    const id = String(payload.id)
    await setDoc(doc(db, table, id), { ...body, id })
    return { ...body, id }
  }
  const ref = await addDoc(collection(db, table), body)
  await updateDoc(ref, { id: ref.id })
  return { ...body, id: ref.id }
}

export async function updateFirestoreRow(
  table: FirestoreShopCollection,
  id: string,
  patch: Record<string, unknown>,
) {
  const { doc, updateDoc } = await firestore()
  const next = stripUndefined({
    ...patch,
    ...(patch.status != null ? { status: normalizeAppointmentStatus(patch.status) } : {}),
  })
  await updateDoc(doc(await getFirebaseDb(), table, id), next)
  return { id, ...next }
}

export async function deleteFirestoreRow(table: FirestoreShopCollection, id: string) {
  const { deleteDoc, doc } = await firestore()
  await deleteDoc(doc(await getFirebaseDb(), table, id))
}

export async function upsertFirestoreRow(
  table: FirestoreShopCollection,
  row: Record<string, unknown>,
) {
  const id = String(row.id || '')
  if (!id) return insertFirestoreRow(table, row)
  const { doc, setDoc } = await firestore()
  await setDoc(doc(await getFirebaseDb(), table, id), stripUndefined({ ...row, id }), { merge: true })
  return { ...row, id }
}

export { isFirebaseConfigured }
