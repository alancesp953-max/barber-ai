import { createFileRoute } from '@tanstack/react-router'
import SuperAdminDashboard from '../../pages/superadmin/SuperAdminDashboard'

export const Route = createFileRoute('/superadmin/dashboard')({
  component: SuperAdminDashboard,
})
