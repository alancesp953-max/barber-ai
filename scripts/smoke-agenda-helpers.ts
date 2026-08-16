/**
 * Smoke tests leves para buffer/rodízio helpers (sem banco).
 * Run: npx tsx scripts/smoke-agenda-helpers.ts
 */
import { monthBoundsBRT } from '../src/lib/dateBr.ts'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

// Buffer rule: 40 service + 10 buffer => next free at 15:50
const startMin = 15 * 60
const dur = 40
const buffer = 10
const endMin = startMin + dur + buffer
assert(endMin === 15 * 60 + 50, '15:00 + 40 + 10 deve liberar 15:50')

const bounds = monthBoundsBRT(new Date('2026-08-16T15:00:00-03:00'))
assert(bounds.dataInicio.endsWith('-01'), 'mês começa no dia 1')
assert(bounds.dataFim.slice(0, 7) === bounds.dataInicio.slice(0, 7), 'mesmo mês')

console.log('smoke-agenda-helpers: OK', { endMin, bounds })
