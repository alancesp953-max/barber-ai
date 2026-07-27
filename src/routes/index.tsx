import { createFileRoute, redirect } from '@tanstack/react-router'
import { requireSession } from '../lib/api'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const session = await requireSession()
    if (session) {
      throw redirect({ to: '/admin/dashboard' })
    }
    throw redirect({ to: '/login' })
  },
})
