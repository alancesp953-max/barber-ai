import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAn6gmGd0Rq31PQjrjnpuPfFgqHJvDvFOA',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'barberai-6369a.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'barberai-6369a',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'barberai-6369a.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '158166037194',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:158166037194:web:3e79c9bd8f82d97cfc7a33',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-Q71KTFSYPP',
}

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)
}

export async function getFirebaseDb() {
  return db
}

export async function getFirebaseAuth() {
  return auth
}
