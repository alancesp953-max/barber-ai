import { createRootRoute, Outlet, useRouter } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'
import { AuthProvider, useAuth } from '../lib/firebaseAuth'

function RootError({ error }: { error: Error }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { logout } = useAuth()

  useEffect(() => {
    const msg = error.message?.toLowerCase() || ''
    if (
      msg.includes('sessão') ||
      msg.includes('session') ||
      msg.includes('jwt') ||
      msg.includes('token') ||
      msg.includes('auth') ||
      msg.includes('not_found') ||
      msg.includes('permission-denied')
    ) {
      logout().catch(() => {})
      router.navigate({ to: '/login' })
    }
  }, [error, router, logout])

  return (
    <div className="flex min-h-screen items-center justify-center bg-barber-black p-8">
      <div className="max-w-md rounded-2xl border border-red-500/30 bg-barber-gray p-6">
        <h1 className="font-serif text-xl font-bold text-red-400">{t('errors.unexpected')}</h1>
        <pre className="mt-3 overflow-auto text-sm text-barber-white/70">{error.message}</pre>
      </div>
    </div>
  )
}

export const Route = createRootRoute({
  errorComponent: ({ error }) => (
    <AuthProvider>
      <RootError error={error} />
    </AuthProvider>
  ),
  component: () => (
    <AuthProvider>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </AuthProvider>
  ),
})