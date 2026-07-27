import { createFileRoute } from '@tanstack/react-router'
import Configuracoes from '../../pages/admin/Configuracoes'

export const Route = createFileRoute('/admin/configuracoes')({
  component: Configuracoes,
})