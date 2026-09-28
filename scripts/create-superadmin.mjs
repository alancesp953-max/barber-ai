import { adminAuth, adminDb } from '../server/lib/firebaseAdmin.mjs'

const SUPERADMIN_EMAIL = 'admin@barb.com'
// Permite passar a senha via argumento CLI: node scripts/create-superadmin.mjs <senha>
// ou via variável de ambiente SUPERADMIN_PASSWORD
const password = process.argv[2] || process.env.SUPERADMIN_PASSWORD

if (!password || password.length < 6) {
  console.error('❌ Por favor, informe uma senha segura com no mínimo 6 caracteres:')
  console.error('Exemplo: node scripts/create-superadmin.mjs SuaSenhaForte123#')
  process.exit(1)
}

async function setupSuperadmin() {
  console.log(`🔐 Configurando Superadministrador (${SUPERADMIN_EMAIL})...`)

  let userRecord
  try {
    userRecord = await adminAuth.getUserByEmail(SUPERADMIN_EMAIL)
    console.log(`ℹ️ Usuário ${SUPERADMIN_EMAIL} já existe no Firebase Auth (UID: ${userRecord.uid}). Atualizando credenciais...`)
    await adminAuth.updateUser(userRecord.uid, {
      password,
      emailVerified: true,
      displayName: 'Super Administrador',
    })
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.log(`✨ Criando novo usuário ${SUPERADMIN_EMAIL} no Firebase Auth...`)
      userRecord = await adminAuth.createUser({
        email: SUPERADMIN_EMAIL,
        password,
        emailVerified: true,
        displayName: 'Super Administrador',
      })
    } else {
      throw error
    }
  }

  // Define Custom Claims para superadmin
  await adminAuth.setCustomUserClaims(userRecord.uid, {
    role: 'superadmin',
  })
  console.log('✅ Custom Claims "role: superadmin" atribuída com sucesso!')

  // Grava perfil no Firestore na coleção "users"
  await adminDb.collection('users').doc(userRecord.uid).set(
    {
      uid: userRecord.uid,
      email: SUPERADMIN_EMAIL,
      name: 'Super Administrador',
      role: 'superadmin',
      status: 'active',
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  )
  console.log('✅ Documento no Firestore collection "users" criado/atualizado com sucesso!')

  console.log('\n🎉 SUPERADMINISTRADOR CONFIGURADO COM SUCESSO!')
  console.log(`E-mail: ${SUPERADMIN_EMAIL}`)
  console.log(`Acesse o painel em: http://localhost:5173/login\n`)
  process.exit(0)
}

setupSuperadmin().catch((err) => {
  console.error('❌ Falha ao configurar superadministrador:', err)
  process.exit(1)
})
