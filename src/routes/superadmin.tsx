import { createFileRoute, redirect } from '@tanstack/react-router'
import { SuperAdminLayout } from '../components/SuperAdminLayout'
import { requireSession } from '../lib/api'

export const Route = createFileRoute('/superadmin')({
  beforeLoad: async () => {
    const session = await requireSession()
    if (!session || !session.user) {
      throw redirect({ to: '/login' })
    }
    // Proteção de acesso: Apenas o superadministrador oficial pode acessar
    const email = session.user.email?.toLowerCase().trim()
    if (email !== 'admin@barb.com') {
      throw redirect({ to: '/admin/dashboard' })
    }
  },
  component: SuperAdminLayout,
})
