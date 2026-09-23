import type { Appointment, Service } from '../types/database'

export type ComandaItem = {
  id: string
  nome: string
  preco: number
  duracao_minutos?: number
}

export function getComandaItems(appt: Appointment | null | undefined): ComandaItem[] {
  if (!appt) return []
  const stored = appt.comanda_itens
  if (Array.isArray(stored) && stored.length > 0) {
    return stored.map((item) => ({
      id: String(item.id || ''),
      nome: String(item.nome || 'Serviço'),
      preco: Number(item.preco) || 0,
      duracao_minutos: Number(item.duracao_minutos) || 0,
    }))
  }
  if (appt.servicos?.nome) {
    return [
      {
        id: appt.servico_id || '',
        nome: appt.servicos.nome,
        preco: Number(appt.servicos.preco ?? appt.valor ?? 0),
        duracao_minutos: Number(appt.servicos.duracao_minutos) || 0,
      },
    ]
  }
  return []
}

export function comandaTotal(items: ComandaItem[]) {
  return items.reduce((sum, item) => sum + Number(item.preco || 0), 0)
}

export function comandaDuration(items: ComandaItem[]) {
  return items.reduce((sum, item) => sum + Number(item.duracao_minutos || 0), 0)
}

export function comandaLabel(items: ComandaItem[]) {
  if (!items.length) return '—'
  return items.map((item) => item.nome).join(' + ')
}

export function itemsFromServiceIds(ids: string[], catalog: Service[]): ComandaItem[] {
  const byId = new Map(catalog.map((svc) => [svc.id, svc]))
  return ids
    .map((id) => byId.get(id))
    .filter((svc): svc is Service => Boolean(svc))
    .map((svc) => ({
      id: svc.id,
      nome: svc.nome,
      preco: Number(svc.preco) || 0,
      duracao_minutos: Number(svc.duracao_minutos) || 0,
    }))
}
