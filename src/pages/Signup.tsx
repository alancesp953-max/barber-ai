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
import { isSupabaseConfigured, supabase } from '../integrations/supabase/client'

export default function Signup() {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    if (formData.password !== formData.confirmPassword) {
      setMessage({ text: t('signup.passwordMismatch'), type: 'error' })
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email: formData.email.trim().toLowerCase(),
      password: formData.password,
      options: { data: { full_name: formData.name } },
    })

    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('already') || msg.includes('registered')) {
        setMessage({
          text: 'Este e-mail já está cadastrado. Vá em Entrar ou redefina a senha no Supabase.',
          type: 'error',
        })
      } else {
        setMessage({ text: error.message, type: 'error' })
      }
      setLoading(false)
      return
    }

    setMessage({ text: t('signup.success'), type: 'success' })
    setLoading(false)
    setTimeout(() => navigate({ to: '/login' }), 3000)
  }

  return (
    <AuthShell
      heroTitle="Sua barbearia no controle, do caixa ao WhatsApp."
      heroSubtitle="Crie a conta, configure serviços e deixe o atendimento fluir."
    >
      <AuthCard>
        <Stack gap="md">
          <div>
            <Title order={2} mb={6}>
              {t('signup.createTitle')}
            </Title>
            <Text size="sm" c="dimmed">
              {t('signup.subtitle')}
            </Text>
          </div>

          {!isSupabaseConfigured && (
            <Alert color="yellow" variant="light">
              {t('login.supabaseNotConfigured')}
            </Alert>
          )}

          {message && (
            <Alert color={message.type === 'error' ? 'red' : 'teal'} variant="light">
              {message.text}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <TextInput
                label={t('signup.name')}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
                required
              />
              <TextInput
                label={t('signup.email')}
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.currentTarget.value })}
                required
                placeholder="admin@barberai.com"
              />
              <PasswordInput
                label={t('signup.password')}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.currentTarget.value })}
                required
                minLength={6}
              />
              <PasswordInput
                label={t('signup.confirmPassword')}
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.currentTarget.value })}
                required
                minLength={6}
              />
              <Button type="submit" fullWidth color="gold" size="md" loading={loading} c="dark.9" fw={700}>
                {loading ? t('signup.signingUp') : t('signup.signUp')}
              </Button>
            </Stack>
          </form>

          <Text ta="center" size="sm" c="dimmed">
            {t('signup.hasAccount')}{' '}
            <Anchor component={Link} to="/login" c="gold.4" fw={600}>
              {t('signup.signIn')}
            </Anchor>
          </Text>
        </Stack>
      </AuthCard>
    </AuthShell>
  )
}
