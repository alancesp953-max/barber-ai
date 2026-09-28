import { createFileRoute } from '@tanstack/react-router'
import SuperAdminFinanceiro from '../../pages/superadmin/SuperAdminFinanceiro'

export const Route = createFileRoute('/superadmin/financeiro')({
  component: SuperAdminFinanceiro,
})
