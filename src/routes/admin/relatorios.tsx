import { createFileRoute } from '@tanstack/react-router'
import Relatorios from '../../pages/Relatorios'

export const Route = createFileRoute('/admin/relatorios')({
  component: Relatorios,
})
