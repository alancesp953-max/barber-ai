import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getBarbeiroByUserId, requireSession } from '../lib/api'
import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'

export const Route = createFileRoute('/barber')({
  beforeLoad: async ({ location }) => {
    if (location.pathname === '/barber/login') return

    const session = await requireSession()
    if (!session || !session.user) {
      throw redirect({ to: '/barber/login' })
    }

    const barbeiro = await getBarbeiroByUserId(session.user.uid)
    if (!barbeiro) {
      await signOut(auth)
      throw redirect({ to: '/barber/login' })
    }
  },
  component: () => (
    <div className="min-h-screen bg-barber-black p-8 text-barber-white">
      <Outlet />
    </div>
  ),
})
