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
import { signInWithEmailAndPassword } from 'firebase/auth'
import { AuthCard, AuthShell } from '../components/AuthShell'
import { auth } from '../lib/firebase'
import { getBarbeiroByUserId } from '../lib/api'

export default function Login() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

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

    try {
      const cred = await signInWithEmailAndPassword(auth, emailNorm, password)
      if (emailNorm === 'admin@barb.com') {
        navigate({ to: '/superadmin/dashboard' })
        return
      }
      const barbeiro = await getBarbeiroByUserId(cred.user.uid)
      if (barbeiro) {
        navigate({ to: '/barber/agenda' })
        return
      }
      navigate({ to: '/admin/dashboard' })
    } catch (authError: any) {
      const code = String(authError?.code || '')
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setError('E-mail ou senha inválidos. Se ainda não tem conta, use Cadastre-se.')
      } else if (code === 'auth/too-many-requests') {
        setError('Muitas tentativas. Tente novamente mais tarde.')
      } else {
        setError(authError instanceof Error ? authError.message : 'Falha ao entrar.')
      }
    } finally {
      setLoading(false)
    }
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

          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}

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
        </Stack>
      </AuthCard>
    </AuthShell>
  )
}
