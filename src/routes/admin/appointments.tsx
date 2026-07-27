import { createFileRoute } from '@tanstack/react-router'
import Agendamentos from '../../pages/admin/Agendamentos'

export const Route = createFileRoute('/admin/appointments')({
  component: Agendamentos,
})