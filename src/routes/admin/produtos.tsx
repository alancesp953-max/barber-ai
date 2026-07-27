import { createFileRoute } from '@tanstack/react-router'
import Produtos from '../../pages/admin/Produtos'

export const Route = createFileRoute('/admin/produtos')({
  component: Produtos,
})
