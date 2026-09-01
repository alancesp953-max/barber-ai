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
import type { FormEvent } from 'react'
import { AuthCard, AuthShell } from '../../components/AuthShell'
import { getBarbeiroByUserId } from '../../lib/api'
import { supabase } from '../../services/supabaseClient'

export default function BarberLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError('Informe e-mail e senha.')
      return
    }
    try {
      setLoading(true)
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })
      if (signInError) {
        const msg = signInError.message.toLowerCase()
        if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
          throw new Error('E-mail ou senha inválidos.')
        }
        throw new Error(signInError.message)
      }
      if (!data.user) throw new Error('Não foi possível entrar.')

      const barbeiro = await getBarbeiroByUserId(data.user.id)
      if (!barbeiro) {
        await supabase.auth.signOut()
        throw new Error('Este e-mail não está vinculado a um barbeiro. Peça ao admin para criar seu acesso em Usuários.')
      }

      navigate({ to: '/barber/agenda' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar. Verifique e-mail e senha.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      heroBadge="ÁREA DO BARBEIRO"
      heroTitle="Sua agenda do dia, no celular."
      heroSubtitle="Entre para conferir horários, clientes e o fluxo da cadeira."
    >
      <AuthCard>
        <Stack gap="md">
          <div>
            <Title order={2} mb={6}>
              Conferir agenda
            </Title>
            <Text size="sm" c="dimmed">
              Entre com o e-mail e a senha que o admin cadastrou
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
                label="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                placeholder="seu@email.com"
              />
              <PasswordInput
                label="Senha"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                placeholder="Sua senha"
              />
              <Button type="submit" fullWidth color="gold" size="md" loading={loading} c="dark.9" fw={700}>
                {loading ? 'Entrando...' : 'Entrar'}
              </Button>
            </Stack>
          </form>

          <Text ta="center" size="sm" c="dimmed">
            <Anchor component={Link} to="/login" c="gold.4" fw={600}>
              Entrar como administrador
            </Anchor>
          </Text>
        </Stack>
      </AuthCard>
    </AuthShell>
  )
}
