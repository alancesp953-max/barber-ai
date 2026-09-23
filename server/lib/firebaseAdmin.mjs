import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const KEY_PATH = resolve(process.cwd(), 'serviceAccountKey.json')

let db = null
let mode = 'none'

function loadDotEnvLocal() {
  const file = resolve(process.cwd(), '.env.local')
  if (!existsSync(file)) return {}
  const env = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return env
}

export function initFirebaseAdmin() {
  if (db) return { db, mode }

  if (existsSync(KEY_PATH)) {
    const serviceAccount = JSON.parse(readFileSync(KEY_PATH, 'utf8'))
    const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) })
    db = getFirestore(app)
    mode = 'admin'
    console.info('Firebase Admin ativo via serviceAccountKey.json')
    return { db, mode }
  }

  console.warn(
    'serviceAccountKey.json ausente na raiz. Laboratório local usa o SDK Web só para ler/gravar Firestore. Coloque a chave Admin para o modo oficial.',
  )
  mode = 'web-fallback'
  db = null
  return { db, mode }
}

export function getAdminDb() {
  if (!db && mode !== 'web-fallback') initFirebaseAdmin()
  return db
}

export function getFirebaseMode() {
  if (mode === 'none') initFirebaseAdmin()
  return mode
}

export function readWebConfig() {
  const env = { ...loadDotEnvLocal(), ...process.env }
  return {
    apiKey: String(env.VITE_FIREBASE_API_KEY || '').trim(),
    authDomain: String(env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
    projectId: String(env.VITE_FIREBASE_PROJECT_ID || '').trim(),
    storageBucket: String(env.VITE_FIREBASE_STORAGE_BUCKET || '').trim(),
    messagingSenderId: String(env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
    appId: String(env.VITE_FIREBASE_APP_ID || '').trim(),
  }
}

export { KEY_PATH }
