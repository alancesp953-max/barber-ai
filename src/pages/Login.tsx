import {
  Alert,
  Anchor,
  Button,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthCard, AuthShell } from '../components/AuthShell'
import { getBarbeiroByUserId } from '../lib/api'
import { enterDemo } from '../lib/mockSupabase'
import { isSupabaseConfigured, supabase } from '../integrations/supabase/client'

export default function Login() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState<'admin' | 'barber' | null>(null)
  const navigate = useNavigate()

  const goAfterAuth = async (userId?: string | null) => {
    if (userId) {
      try {
        const barbeiro = await getBarbeiroByUserId(userId)
        if (barbeiro) {
          navigate({ to: '/barber/agenda' })
          return
        }
      } catch {
        /* segue para admin */
      }
    }
    navigate({ to: '/admin/dashboard' })
  }

  const handleDemoEnter = async (role: 'admin' | 'barber') => {
    setError(null)
    setDemoLoading(role)
    try {
      const session = enterDemo(role)
      await goAfterAuth(session.user.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar no modo demo.')
    } finally {
      setDemoLoading(null)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const emailNorm = email.trim().toLowerCase()
    if (!emailNorm || !password) {
      setError('Informe e-mail e senha.')
      setLoading(false)
      return
    }

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: emailNorm,
      password,
    })

    if (authError) {
      const msg = authError.message.toLowerCase()
      if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
        setError('Confirme seu e-mail pelo link que enviamos antes de entrar.')
      } else if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
        setError('E-mail ou senha inválidos. Se ainda não tem conta, use Cadastre-se.')
      } else {
        setError(authError.message)
      }
      setLoading(false)
      return
    }

    await goAfterAuth(data.user?.id)
    setLoading(false)
  }

  return (
    <AuthShell>
      <AuthCard>
        <Stack gap="md">
          <div>
            <Title order={2} mb={6}>
              {t('login.enterTitle')}
            </Title>
            <Text size="sm" c="dimmed">
              Admin e barbeiro usam o mesmo login. Barbeiro vai para a agenda; admin para o painel.
            </Text>
          </div>

          {!isSupabaseConfigured && (
            <Alert color="gold" variant="light" title={t('login.demoModeTitle')}>
              {t('login.demoModeHint')}
            </Alert>
          )}

          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}

          {!isSupabaseConfigured && (
            <Stack gap="sm">
              <Button
                fullWidth
                color="gold"
                size="md"
                c="dark.9"
                fw={700}
                loading={demoLoading === 'admin'}
                disabled={demoLoading !== null}
                onClick={() => void handleDemoEnter('admin')}
              >
                {t('login.enterAsAdminDemo')}
              </Button>
              <Button
                fullWidth
                variant="outline"
                color="gold"
                size="md"
                loading={demoLoading === 'barber'}
                disabled={demoLoading !== null}
                onClick={() => void handleDemoEnter('barber')}
              >
                {t('login.enterAsBarberDemo')}
              </Button>
            </Stack>
          )}

          {isSupabaseConfigured && (
            <>
              <form onSubmit={handleLogin}>
                <Stack gap="md">
                  <TextInput
                    label={t('login.email')}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.currentTarget.value)}
                    required
                    placeholder="seu@email.com"
                  />
                  <PasswordInput
                    label={t('login.password')}
                    value={password}
                    onChange={(e) => setPassword(e.currentTarget.value)}
                    required
                    placeholder="••••••••"
                  />
                  <Button type="submit" fullWidth color="gold" size="md" loading={loading} c="dark.9" fw={700}>
                    {loading ? t('login.signingIn') : t('login.signIn')}
                  </Button>
                </Stack>
              </form>

              <Text ta="center" size="sm" c="dimmed">
                {t('login.noAccount')}{' '}
                <Anchor component={Link} to="/signup" c="gold.4" fw={600}>
                  {t('login.signUp')}
                </Anchor>
              </Text>
            </>
          )}
        </Stack>
      </AuthCard>
    </AuthShell>
  )
}
