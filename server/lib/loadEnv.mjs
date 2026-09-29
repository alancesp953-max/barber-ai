import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

const root = process.cwd()
const envPath = path.resolve(root, '.env')
const localPath = path.resolve(root, '.env.local')

if (!globalThis.__divaEnvLoaded) {
  globalThis.__divaEnvLoaded = true
  const envLoaded = fs.existsSync(envPath)
  const localLoaded = fs.existsSync(localPath)
  if (envLoaded) dotenv.config({ path: envPath })
  if (localLoaded) dotenv.config({ path: localPath, override: true })

  const present = (name) => Boolean(String(process.env[name] || '').trim())
  console.log(
    `[Env] .env ${envLoaded ? 'lido' : 'ausente'}; .env.local ${localLoaded ? 'lido (sobrepõe .env)' : 'ausente'}; GEMINI_API_KEY ${present('GEMINI_API_KEY') ? 'presente' : 'ausente'}; ELEVENLABS_API_KEY ${present('ELEVENLABS_API_KEY') ? 'presente' : 'ausente'}`,
  )
}
