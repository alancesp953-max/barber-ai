import { createFileRoute } from '@tanstack/react-router'
import SuperAdminLogs from '../../pages/superadmin/SuperAdminLogs'

export const Route = createFileRoute('/superadmin/logs')({
  component: SuperAdminLogs,
})
