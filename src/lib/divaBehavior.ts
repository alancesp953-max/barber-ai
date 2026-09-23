import divaBehaviorSource from '../../DIVA_BEHAVIOR.md?raw'

export const DIVA_BEHAVIOR_SOURCE = String(divaBehaviorSource || '').trim()

export function divaBehaviorRules(): string {
  return DIVA_BEHAVIOR_SOURCE
}
