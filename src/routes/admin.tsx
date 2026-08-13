import { createFileRoute, redirect } from '@tanstack/react-router'
import { AdminLayout } from '../components/AdminLayout'
import { getBarbeiroByUserId, requireSession } from '../lib/api'

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const session = await requireSession()
    if (!session) {
      throw redirect({ to: '/login' })
    }

    // Conta de barbeiro não acessa o painel admin
    const barbeiro = await getBarbeiroByUserId(session.user.id)
    if (barbeiro) {
      throw redirect({ to: '/barber/agenda' })
    }
  },
  component: AdminLayout,
})
