/** Logs de diagnóstico da Diva (disponibilidade / agendamento). Não altera comportamento. */

const PREFIX = '[DEBUG-DIVA]'

export function logDiva(message: string, data?: unknown): void {
  if (data === undefined) console.log(PREFIX, message)
  else console.log(PREFIX, message, data)
}

export function logDivaError(message: string, data?: unknown): void {
  if (data === undefined) console.error(PREFIX, message)
  else console.error(PREFIX, message, data)
}

/** Serializa o erro do PostgREST/Supabase para o log. */
export function supabaseErrDump(error: unknown): unknown {
  if (error == null) return null
  if (typeof error !== 'object') return error
  const e = error as { message?: string; code?: string; details?: string; hint?: string }
  return {
    message: e.message ?? String(error),
    code: e.code ?? null,
    details: e.details ?? null,
    hint: e.hint ?? null,
  }
}
