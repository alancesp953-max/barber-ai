import type { FirebaseApp } from 'firebase/app'
import type { Auth } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'

export type FirebaseWebConfig = {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
}

export function readFirebaseWebConfig(): FirebaseWebConfig {
  return {
    apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || '').trim(),
    authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
    projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim(),
    storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim(),
    messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
    appId: String(import.meta.env.VITE_FIREBASE_APP_ID || '').trim(),
  }
}

export function isFirebaseConfigured() {
  const cfg = readFirebaseWebConfig()
  return Boolean(cfg.apiKey && cfg.projectId && cfg.appId)
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

export async function getFirebaseApp(): Promise<FirebaseApp> {
  if (app) return app
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase não configurado. Preencha VITE_FIREBASE_* no .env.local.')
  }
  const { getApps, initializeApp } = await import('firebase/app')
  const existing = getApps()[0]
  app = existing || initializeApp(readFirebaseWebConfig())
  return app
}

export async function getFirebaseAuth(): Promise<Auth> {
  if (!auth) {
    const { getAuth } = await import('firebase/auth')
    auth = getAuth(await getFirebaseApp())
  }
  return auth
}

export async function getFirebaseDb(): Promise<Firestore> {
  if (!db) {
    const { getFirestore } = await import('firebase/firestore')
    db = getFirestore(await getFirebaseApp())
  }
  return db
}
