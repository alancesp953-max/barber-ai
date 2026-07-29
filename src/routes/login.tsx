import { createFileRoute, redirect } from '@tanstack/react-router'
import { supabase } from '../services/supabaseClient'
import Login from '../pages/Login'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      throw redirect({ to: '/admin/dashboard' })
    }
  },
  component: Login,
})