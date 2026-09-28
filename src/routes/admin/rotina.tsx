import { createFileRoute } from '@tanstack/react-router'
import Rotina from '../../pages/admin/Rotina'

export const Route = createFileRoute('/admin/rotina')({
  component: Rotina,
})
