import { createFileRoute } from '@tanstack/react-router'
import Financeiro from '../../pages/admin/Financeiro'

export const Route = createFileRoute('/admin/financeiro')({
  component: Financeiro,
})