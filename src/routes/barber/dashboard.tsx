import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/barber/dashboard')({
  beforeLoad: () => {
    throw redirect({ to: '/barber/agenda' })
  },
  component: () => null,
})
