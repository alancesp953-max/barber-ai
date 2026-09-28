import { createFileRoute } from '@tanstack/react-router'
import BarberDashboard from '../../pages/barber/Dashboard'

export const Route = createFileRoute('/barber/dashboard')({
  component: BarberDashboard,
})
