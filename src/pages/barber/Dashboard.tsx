import { Button, Loader, Stack, Text, Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { Calendar } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getBarbeiroByUserId } from '../../lib/api'
import { getCurrentUser, signOut } from '../../integrations/supabase/client'
import type { Barber } from '../../types/database'

export default function BarberDashboard() {
  const [barbeiro, setBarbeiro] = useState<Barber | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const user = await getCurrentUser()
        if (!user) return
        const data = await getBarbeiroByUserId(user.id)
        setBarbeiro(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <Stack align="center" py="xl">
        <Loader color="gold" />
        <Text c="dimmed">Carregando...</Text>
      </Stack>
    )
  }

  return (
    <Stack maw={640} mx="auto" gap="md">
      <Title order={1} c="gold" style={{ fontFamily: 'Syne, DM Sans, sans-serif' }}>
        Olá, {barbeiro?.nome ?? 'Barbeiro'}
      </Title>
      <Text c="dimmed">Acompanhe seus agendamentos e atualize o status dos atendimentos.</Text>

      <Button
        component={Link}
        to="/barber/agenda"
        color="gold"
        c="#0A0A0A"
        leftSection={<Calendar size={16} />}
        w="fit-content"
      >
        Ver minha agenda
      </Button>

      <Button variant="outline" color="gold" w="fit-content" mt="md" onClick={() => signOut()}>
        Sair
      </Button>
    </Stack>
  )
}
