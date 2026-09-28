import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const behaviorPath = join(dirname(fileURLToPath(import.meta.url)), '../../DIVA_BEHAVIOR.md')

export function divaSystemPrompt() {
  const rules = readFileSync(behaviorPath, 'utf8').trim()
  if (!rules.includes('AGENDAMENTO DIRETO') || !rules.includes('PROIBIÇÃO DE AVALIAÇÃO')) {
    throw new Error('DIVA_BEHAVIOR.md não contém as regras canônicas de agendamento e avaliação.')
  }
  return rules
}
