import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config()

const projectId = process.env.FIREBASE_PROJECT_ID || 'barberai-6369a'
const serviceAccountPath = path.resolve(process.cwd(), 'serviceAccountKey.json')

let app = null
let hasCredentials = false

if (!getApps().length) {
  if (fs.existsSync(serviceAccountPath)) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))
      app = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || projectId,
        storageBucket: `${projectId}.firebasestorage.app`,
      })
      hasCredentials = true
      console.log('✅ Firebase Admin inicializado com serviceAccountKey.json!')
    } catch (err) {
      console.warn('⚠️ Falha ao ler serviceAccountKey.json:', err.message)
    }
  } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    try {
      app = initializeApp({
        credential: cert({
          projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
        storageBucket: `${projectId}.firebasestorage.app`,
      })
      hasCredentials = true
      console.log('✅ Firebase Admin inicializado com credenciais de ambiente.')
    } catch (err) {
      console.warn('⚠️ Falha ao inicializar com credenciais de ambiente:', err.message)
    }
  }

  if (!app) {
    // Inicialização sem credenciais nominais (ativa fallback seguro para evitar crash por ADC ausente)
    app = initializeApp({
      projectId,
      storageBucket: `${projectId}.firebasestorage.app`,
    })
    console.log(`ℹ️ Firebase Admin em modo híbrido (projectId: ${projectId})`)
  }
} else {
  app = getApps()[0]
}

const realDb = getFirestore(app)
let realAuth = null
let realStorage = null
try {
  realAuth = getAuth(app)
  realStorage = getStorage(app)
} catch (e) {}

// Armazenamento local em memória / arquivo para fallback quando ADC não estiver configurado
const DATA_DIR = path.resolve(process.cwd(), 'server', 'data')
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}
const LOCAL_STORE_FILE = path.join(DATA_DIR, 'localStore.json')

let memoryStore = {}
function getMemoryStore() {
  if (fs.existsSync(LOCAL_STORE_FILE)) {
    try {
      memoryStore = JSON.parse(fs.readFileSync(LOCAL_STORE_FILE, 'utf8'))
    } catch (e) {}
  }
  return memoryStore
}

function saveMemoryStore() {
  try {
    fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(memoryStore, null, 2), 'utf8')
  } catch (e) {}
}

/**
 * Cria uma referência resiliente para coleções/documentos do Firestore
 */
function createResilientDocRef(docPath) {
  return {
    id: docPath.split('/').pop(),
    path: docPath,
    collection: (subCol) => createResilientCollectionRef(`${docPath}/${subCol}`),
    get: async () => {
      if (hasCredentials) {
        try {
          return await realDb.doc(docPath).get()
        } catch (err) {
          if (err.message?.includes('default credentials') || err.message?.includes('NO_ADC_FOUND')) {
            hasCredentials = false
          } else {
            throw err
          }
        }
      }
      const store = getMemoryStore()
      const data = store[docPath]
      return {
        exists: !!data,
        id: docPath.split('/').pop(),
        data: () => (data ? { ...data } : undefined),
      }
    },
    set: async (data, options = {}) => {
      if (hasCredentials) {
        try {
          return await realDb.doc(docPath).set(data, options)
        } catch (err) {
          if (err.message?.includes('default credentials') || err.message?.includes('NO_ADC_FOUND')) {
            hasCredentials = false
          } else {
            throw err
          }
        }
      }
      const store = getMemoryStore()
      if (options.merge && store[docPath]) {
        store[docPath] = { ...store[docPath], ...data }
      } else {
        store[docPath] = { ...data }
      }
      memoryStore = store
      saveMemoryStore()
      return { writeTime: new Date().toISOString() }
    },
    delete: async () => {
      if (hasCredentials) {
        try {
          return await realDb.doc(docPath).delete()
        } catch (err) {}
      }
      const store = getMemoryStore()
      delete store[docPath]
      memoryStore = store
      saveMemoryStore()
    },
  }
}

function createResilientCollectionRef(colPath) {
  return {
    path: colPath,
    doc: (docId) => createResilientDocRef(`${colPath}/${docId}`),
    add: async (data) => {
      const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const ref = createResilientDocRef(`${colPath}/${docId}`)
      await ref.set(data)
      return ref
    },
    get: async () => {
      if (hasCredentials) {
        try {
          return await realDb.collection(colPath).get()
        } catch (err) {
          if (err.message?.includes('default credentials') || err.message?.includes('NO_ADC_FOUND')) {
            hasCredentials = false
          } else {
            throw err
          }
        }
      }
      // Filtra documentos do memoryStore que pertencem diretamente a esta coleção
      const store = getMemoryStore()
      const prefix = `${colPath}/`
      const docs = Object.keys(store)
        .filter((key) => key.startsWith(prefix) && key.slice(prefix.length).indexOf('/') === -1)
        .map((key) => ({
          id: key.slice(prefix.length),
          exists: true,
          data: () => ({ ...store[key] }),
        }))

      return {
        docs,
        size: docs.length,
        empty: docs.length === 0,
      }
    },
    where: (field, op, value) => ({
      get: async () => {
        if (hasCredentials) {
          try {
            return await realDb.collection(colPath).where(field, op, value).get()
          } catch (err) {
            if (err.message?.includes('default credentials') || err.message?.includes('NO_ADC_FOUND')) {
              hasCredentials = false
            } else {
              throw err
            }
          }
        }
        const store = getMemoryStore()
        const prefix = `${colPath}/`
        const docs = Object.keys(store)
          .filter((key) => key.startsWith(prefix) && key.slice(prefix.length).indexOf('/') === -1)
          .map((key) => ({
            id: key.slice(prefix.length),
            exists: true,
            data: () => ({ ...store[key] }),
          }))
          .filter((d) => {
            const val = d.data()[field]
            if (op === '==') return val === value
            if (op === '!=') return val !== value
            if (op === '>') return val > value
            if (op === '>=') return val >= value
            if (op === '<') return val < value
            if (op === '<=') return val <= value
            return true
          })

        return {
          docs,
          size: docs.length,
          empty: docs.length === 0,
        }
      },
    }),
  }
}

export const adminDb = {
  collection: (colPath) => createResilientCollectionRef(colPath),
  doc: (docPath) => createResilientDocRef(docPath),
}

export const adminAuth = realAuth
export const adminStorage = realStorage
export default app
