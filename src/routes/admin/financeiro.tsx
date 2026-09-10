import { createFileRoute } from '@tanstack/react-router'
import Financeiro from '../../pages/admin/Financeiro'

export type FinanceiroSearch = {
  agendamentoId?: string
}

export const Route = createFileRoute('/admin/financeiro')({
  validateSearch: (search: Record<string, unknown>): FinanceiroSearch => ({
    agendamentoId:
      typeof search.agendamentoId === 'string' && search.agendamentoId
        ? search.agendamentoId
        : undefined,
  }),
  component: FinanceiroPage,
})

function FinanceiroPage() {
  const { agendamentoId } = Route.useSearch()
  return <Financeiro initialAgendamentoId={agendamentoId} />
}
