import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getBarbeiroByUserId } from '../lib/api'
import { supabase } from '../services/supabaseClient'

export const Route = createFileRoute('/barber')({
  beforeLoad: async ({ location }) => {
    if (location.pathname === '/barber/login') return

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw redirect({ to: '/barber/login' })
    }

    const barbeiro = await getBarbeiroByUserId(session.user.id)
    if (!barbeiro) {
      await supabase.auth.signOut()
      throw redirect({ to: '/barber/login' })
    }
  },
  component: () => (
    <div className="min-h-screen bg-barber-black p-8 text-barber-white">
      <Outlet />
    </div>
  ),
})
