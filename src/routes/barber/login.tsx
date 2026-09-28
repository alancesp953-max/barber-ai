import { createFileRoute } from '@tanstack/react-router'
import BarberLogin from '../../pages/barber/Login'

export const Route = createFileRoute('/barber/login')({
  component: BarberLogin,
})