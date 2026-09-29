import { adminAuth, adminDb } from '../server/lib/firebaseAdmin.mjs'

const EMAIL = 'alancesp953@gmail.com'
const PASSWORD = 'Aa230312@#'
const TENANT_ID = 'I13A9nw5T4IsaojMPLl6'

if (!adminAuth) {
  console.error('Firebase Admin Auth indisponível.')
  process.exit(1)
}

let user
try {
  try {
    const existing = await adminAuth.getUserByEmail(EMAIL)
    user = await adminAuth.updateUser(existing.uid, {
      email: EMAIL,
      password: PASSWORD,
      emailVerified: true,
    })
    console.log(`Auth atualizado: ${user.uid}`)
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') throw err
    user = await adminAuth.createUser({
      email: EMAIL,
      password: PASSWORD,
      emailVerified: true,
    })
    console.log(`Auth criado: ${user.uid}`)
  }
} catch (err) {
  const code = err?.code || err?.errorInfo?.code || 'unknown'
  console.error(`Falha no Firebase Authentication (${code}).`)
  if (code === 'app/invalid-credential' || String(err?.message || '').includes('default credentials')) {
    console.error('O Admin SDK está sem credenciais de serviço. Coloque serviceAccountKey.json na raiz do projeto, ou FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY no ambiente.')
  } else {
    console.error(err?.message || err)
  }
  process.exit(1)
}

const now = new Date().toISOString()
const profile = {
  uid: user.uid,
  email: EMAIL,
  role: 'admin',
  tenantId: TENANT_ID,
  ativo: true,
  status: 'active',
  createdAt: now,
  updatedAt: now,
}

await adminDb.doc(`users/${user.uid}`).set(profile, { merge: true })

const saved = await adminDb.doc(`users/${user.uid}`).get()
const data = saved.exists ? saved.data() : null
if (!data?.email) {
  console.error('Auth ok, mas o documento users não foi lido de volta.')
  process.exit(1)
}

console.log(
  JSON.stringify(
    {
      ok: true,
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      role: data.role,
      tenantId: data.tenantId,
      ativo: data.ativo,
      createdAt: data.createdAt,
    },
    null,
    2,
  ),
)
