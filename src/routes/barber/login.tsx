import { createFileRoute, redirect } from '@tanstack/react-router'

/** Login unificado em /login — barbeiro e admin */
export const Route = createFileRoute('/barber/login')({
  beforeLoad: () => {
    throw redirect({ to: '/login' })
  },
})
