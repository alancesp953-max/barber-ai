import { createFileRoute } from '@tanstack/react-router'
import DashboardPage from '../../pages/admin/Dashboard'

export const Route = createFileRoute('/admin/dashboard')({
  component: DashboardPage,
})