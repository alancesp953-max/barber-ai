import { createFileRoute, redirect } from '@tanstack/react-router'
import { requireSession } from '../lib/api'
import Login from '../pages/Login'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const session = await requireSession()
    if (session && session.user) {
      if (session.user.email?.toLowerCase() === 'admin@barb.com') {
        throw redirect({ to: '/superadmin/dashboard' })
      }
      throw redirect({ to: '/admin/dashboard' })
    }
  },
  component: Login,
})