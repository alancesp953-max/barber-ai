import { createFileRoute, redirect } from '@tanstack/react-router'
import { AdminLayout } from '../components/AdminLayout'
import { requireSession } from '../lib/api'

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const session = await requireSession()
    if (!session) {
      throw redirect({ to: '/login' })
    }
  },
  component: AdminLayout,
})
