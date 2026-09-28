import { createFileRoute } from '@tanstack/react-router'
import SuperAdminTenants from '../../pages/superadmin/SuperAdminTenants'

export const Route = createFileRoute('/superadmin/tenants')({
  component: SuperAdminTenants,
})
