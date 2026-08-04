import { createFileRoute } from '@tanstack/react-router'
import BarberAgenda from '../../pages/barber/Agenda'

export const Route = createFileRoute('/barber/agenda')({
  component: BarberAgenda,
})