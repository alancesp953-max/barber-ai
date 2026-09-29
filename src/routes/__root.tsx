import { Alert, Button, Paper, Stack, Text, Title } from '@mantine/core'
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
    <Stack mih="100vh" align="center" justify="center" p="xl" bg="#0A0A0A">
      <Paper
        p="xl"
        radius="lg"
        maw={440}
        w="100%"
        withBorder
        style={{ borderColor: 'rgba(239,68,68,0.35)', background: '#1A1A1A' }}
      >
        <Title order={3} c="red.4" mb="sm">
          {t('errors.unexpected')}
        </Title>
        <Alert color="red" variant="light" mb="md">
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {error.message}
          </Text>
        </Alert>
        <Button color="gold" c="#0A0A0A" onClick={() => router.navigate({ to: '/login' })}>
          Ir para login
        </Button>
      </Paper>
    </Stack>
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