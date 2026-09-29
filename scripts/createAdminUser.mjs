import { adminAuth, adminDb } from '../server/lib/firebaseAdmin.mjs'

const EMAIL = 'alancesp953@gmail.com'
const PASSWORD = 'Aa230312@#'
const TENANT_ID = 'I13A9nw5T4IsaojMPLl6'

if (!adminAuth) {
  console.error('Firebase Admin Auth indisponível. Coloque serviceAccountKey.json na raiz ou FIREBASE_PRIVATE_KEY e FIREBASE_CLIENT_EMAIL no ambiente.')
  process.exit(1)
}

let user
try {
  const existing = await adminAuth.getUserByEmail(EMAIL)
  user = await adminAuth.updateUser(existing.uid, {
    password: PASSWORD,
    emailVerified: true,
  })
  console.log(`Utilizador atualizado: ${user.uid}`)
} catch (err) {
  if (err?.code !== 'auth/user-not-found') throw err
  user = await adminAuth.createUser({
    email: EMAIL,
    password: PASSWORD,
    emailVerified: true,
  })
  console.log(`Utilizador criado: ${user.uid}`)
}

const now = new Date().toISOString()
await adminDb.doc(`users/${user.uid}`).set(
  {
    uid: user.uid,
    email: EMAIL,
    role: 'tenant_admin',
    tenantId: TENANT_ID,
    name: 'Administrador',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  },
  { merge: true },
)

const saved = await adminDb.doc(`users/${user.uid}`).get()
const profile = saved.exists ? saved.data() : null
console.log(
  JSON.stringify(
    {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      role: profile?.role || null,
      tenantId: profile?.tenantId || null,
      status: profile?.status || null,
    },
    null,
    2,
  ),
)
