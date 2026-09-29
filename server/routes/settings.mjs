import { getFirestore } from 'firebase-admin/firestore'
import { adminDb } from '../lib/firebaseAdmin.mjs'

const DEFAULT_TENANT = 'I13A9nw5T4IsaojMPLl6'

function isOn(value) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

async function readSettingsDoc(tenantId) {
  try {
    const snap = await getFirestore().doc(`tenants/${tenantId}/settings/general`).get()
    if (snap.exists) return snap.data() || {}
  } catch (err) {
    console.warn(`[Settings] Firestore admin indisponível (${err.message}). Usando o documento local do tenant.`)
  }
  const snap = await adminDb.collection('tenants').doc(tenantId).collection('settings').doc('general').get()
  return snap.exists ? snap.data() || {} : {}
}

export async function readBotActive(tenantId = DEFAULT_TENANT) {
  const data = await readSettingsDoc(tenantId)
  return {
    tenantId,
    botAtivo: isOn(data.bot_ativo),
  }
}
