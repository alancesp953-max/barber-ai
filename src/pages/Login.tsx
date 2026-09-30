import {
  Alert,
  Anchor,
  Box,
  Button,
  Flex,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { BrandLogo } from '../components/BrandLogo'
import { auth } from '../lib/firebase'
import { getBarbeiroByUserId } from '../lib/api'

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1800&q=80'

const fieldStyles = {
  label: {
    color: '#c8c4bc',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderColor: 'rgba(255,255,255,0.14)',
    color: '#f5f5f5',
    height: 44,
  },
}

export default function Login() {
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
    <Flex mih="100vh" w="100%" bg="#0e0e0e">
      <Flex
        direction="column"
        flex={1}
        bg="#121212"
        px={{ base: 'lg', sm: 56 }}
        py="xl"
        mih="100vh"
      >
        <BrandLogo height={46} maw={230} />

        <Flex flex={1} align="center" justify="center">
          <Box maw={420} w="100%">
            <Title
              order={2}
              c="white"
              mb={8}
              style={{
                fontFamily: 'Syne, DM Sans, sans-serif',
                fontWeight: 700,
                letterSpacing: '0.04em',
                lineHeight: 1.15,
                textTransform: 'uppercase',
              }}
            >
              Entre na sua conta
            </Title>
            <Text size="sm" c="#9a9690" mb="lg" maw={380}>
              Admin e barbeiro usam o mesmo login. Barbeiro vai para a agenda; admin para o painel.
            </Text>

            {error && (
              <Alert color="red" variant="light" mb="md">
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
                  required
                  placeholder="seu@email.com"
                  styles={fieldStyles}
                />
                <PasswordInput
                  label="Senha"
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  required
                  placeholder="••••••••"
                  styles={fieldStyles}
                />
                <Button
                  type="submit"
                  fullWidth
                  size="md"
                  loading={loading}
                  mt={4}
                  styles={{
                    root: {
                      backgroundColor: '#d99a26',
                      color: '#121212',
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      border: '1px solid #c59b27',
                      borderRadius: 4,
                    },
                  }}
                >
                  {loading ? 'Entrando...' : 'Entrar na Conta'}
                </Button>
              </Stack>
            </form>

            <Text ta="center" size="sm" c="#9a9690" mt="lg">
              Não tem uma conta?{' '}
              <Anchor component={Link} to="/signup" c="#d99a26" fw={600}>
                Cadastre-se
              </Anchor>
            </Text>
          </Box>
        </Flex>

        <Text size="xs" c="#6d6a64" style={{ letterSpacing: '0.08em' }}>
          © 2026 BARBERIA
        </Text>
      </Flex>

      <Box
        visibleFrom="md"
        flex={1}
        pos="relative"
        style={{
          backgroundImage: `url(${HERO_IMAGE})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <Box
          pos="absolute"
          inset={0}
          style={{
            background:
              'linear-gradient(180deg, rgba(18,18,18,0.12) 0%, rgba(18,18,18,0.2) 42%, rgba(10,10,10,0.88) 100%)',
          }}
        />
        <Stack pos="absolute" bottom={0} left={0} right={0} p={40} gap="sm" maw={520}>
          <Text
            size="xs"
            fw={700}
            w="fit-content"
            px={10}
            py={4}
            style={{
              color: '#121212',
              backgroundColor: '#d99a26',
              borderRadius: 6,
              letterSpacing: '0.14em',
            }}
          >
            WHATSAPP · AGENDAMENTO
          </Text>
          <Title
            order={2}
            c="white"
            style={{
              fontFamily: 'Syne, DM Sans, sans-serif',
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: '0.02em',
            }}
          >
            Agenda cheia, atendimento no WhatsApp.
          </Title>
          <Text c="#d5d0c8" size="sm" maw={420}>
            Conecte o número, ative o bot e confirme horários sem fricção — da conversa ao agendamento.
          </Text>
          <Text size="xs" c="#b7b2aa" mt={4}>
            BARBERIA — gestão e WhatsApp para barbearias
          </Text>
        </Stack>
      </Box>
    </Flex>
  )
}
