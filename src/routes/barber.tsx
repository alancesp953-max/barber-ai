import { Box } from '@mantine/core'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getBarbeiroByUserId } from '../lib/api'
import { supabase } from '../services/supabaseClient'

export const Route = createFileRoute('/barber')({
  beforeLoad: async ({ location }) => {
    if (location.pathname === '/barber' || location.pathname === '/barber/') {
      throw redirect({ to: '/barber/agenda' })
    }

    if (location.pathname === '/barber/login') {
      throw redirect({ to: '/login' })
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      throw redirect({ to: '/login' })
    }

    const barbeiro = await getBarbeiroByUserId(session.user.id)
    if (!barbeiro) {
      await supabase.auth.signOut()
      throw redirect({ to: '/login' })
    }
  },
  component: () => (
    <Box mih="100vh" bg="dark.8" p="xl" c="white">
      <Outlet />
    </Box>
  ),
})
