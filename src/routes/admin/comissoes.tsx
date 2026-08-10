import { createFileRoute } from '@tanstack/react-router'
import Comissoes from '../../pages/admin/Comissoes'

export const Route = createFileRoute('/admin/comissoes')({
  component: Comissoes,
})
