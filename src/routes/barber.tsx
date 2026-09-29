import { Box } from '@mantine/core'
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
    <Box mih="100vh" bg="dark.8" p="xl" c="white">
      <Outlet />
    </Box>
  ),
})
