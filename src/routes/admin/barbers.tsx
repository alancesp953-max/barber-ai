import { createFileRoute } from '@tanstack/react-router'
import Barbers from '../../pages/admin/Barbers'

export const Route = createFileRoute('/admin/barbers')({
  component: Barbers,
})
