import { createFileRoute, redirect } from '@tanstack/react-router'
import { getBarbeiroByUserId } from '../lib/api'
import { supabase } from '../services/supabaseClient'
import Login from '../pages/Login'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user) return

    const barbeiro = await getBarbeiroByUserId(session.user.id)
    throw redirect({ to: barbeiro ? '/barber/agenda' : '/admin/dashboard' })
  },
  component: Login,
})
