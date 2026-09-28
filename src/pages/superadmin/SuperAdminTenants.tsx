import { useState, useEffect } from 'react'
import {
  Plus,
  Search,
  CheckCircle2,
  PauseCircle,
  Ban,
  Edit2,
  User,
  AlertCircle,
} from 'lucide-react'
import { getTenants, createTenant, updateTenant, updateTenantStatus } from '../../lib/api'
import type { Tenant, TenantStatus } from '../../types/database'

export default function SuperAdminTenants() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // Formulário de Cadastro/Edição
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    ownerName: '',
    ownerEmail: '',
    contactPhone: '',
    contactEmail: '',
    monthlyFee: 150,
    billingDueDate: 10,
    status: 'active' as TenantStatus,
  })

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const data = await getTenants()
      setTenants(data)
    } catch (e) {
      console.error(e)
    }
  }

  const handleOpenModal = (tenant?: Tenant) => {
    if (tenant) {
      setEditingTenant(tenant)
      setFormData({
        name: tenant.name,
        slug: tenant.slug,
        ownerName: tenant.ownerName,
        ownerEmail: tenant.ownerEmail,
        contactPhone: tenant.contactPhone,
        contactEmail: tenant.contactEmail,
        monthlyFee: tenant.monthlyFee,
        billingDueDate: tenant.billingDueDate,
        status: tenant.status,
      })
    } else {
      setEditingTenant(null)
      setFormData({
        name: '',
        slug: '',
        ownerName: '',
        ownerEmail: '',
        contactPhone: '',
        contactEmail: '',
        monthlyFee: 150,
        billingDueDate: 10,
        status: 'active',
      })
    }
    setModalOpen(true)
    setFeedback(null)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)
    try {
      if (editingTenant) {
        await updateTenant(editingTenant.id, formData)
        setFeedback({ text: 'Barbearia atualizada com sucesso!', type: 'success' })
      } else {
        await createTenant({
          ...formData,
          contractStartDate: new Date().toISOString().split('T')[0],
        })
        setFeedback({ text: 'Barbearia cadastrada com sucesso!', type: 'success' })
      }
      setModalOpen(false)
      await load()
    } catch (err: any) {
      setFeedback({ text: err.message || 'Erro ao salvar barbearia.', type: 'error' })
    }
  }

  const handleStatusChange = async (tenantId: string, newStatus: TenantStatus) => {
    try {
      await updateTenantStatus(tenantId, newStatus)
      setFeedback({
        text: `Status da barbearia alterado para ${newStatus.toUpperCase()} com sucesso!`,
        type: 'success',
      })
      await load()
    } catch (err: any) {
      setFeedback({ text: err.message || 'Erro ao alterar status.', type: 'error' })
    }
  }

  const filteredTenants = tenants.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.ownerName.toLowerCase().includes(search.toLowerCase()) ||
      t.contactEmail.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-amber-400">
            Gestão de Barbearias (Multi-tenancy)
          </h1>
          <p className="text-xs text-barber-white/60 mt-1">
            Controle de acesso, mensalidades definidas manualmente, ativação, suspensão e isolamento de dados.
          </p>
        </div>
        <button
          type="button"
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 self-start rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-semibold text-black transition-opacity hover:opacity-90 shadow-md shadow-amber-500/10"
        >
          <Plus className="h-4 w-4" />
          Nova Barbearia
        </button>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-xl border p-4 text-xs ${
            feedback.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-400'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Barra de Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-barber-white/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome da barbearia, responsável ou e-mail..."
            className="w-full rounded-xl border border-amber-500/20 bg-[#121212] pl-10 pr-4 py-2.5 text-xs text-barber-white placeholder:text-barber-white/30 focus:border-amber-500 focus:outline-none"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-amber-500/20 bg-[#121212] px-3 py-2.5 text-xs text-barber-white focus:border-amber-500 focus:outline-none"
        >
          <option value="all">Todos os Status</option>
          <option value="active">Ativas</option>
          <option value="pending">Pendentes</option>
          <option value="suspended">Suspensas</option>
          <option value="blocked">Bloqueadas</option>
        </select>
      </div>

      {/* Lista / Tabela de Barbearias */}
      <div className="rounded-2xl border border-amber-500/20 bg-[#121212] overflow-hidden">
        {filteredTenants.length === 0 ? (
          <div className="p-12 text-center text-xs text-barber-white/50">
            Nenhuma barbearia encontrada com os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-amber-500/10 bg-amber-500/[0.03] text-barber-white/60 font-semibold">
                <tr>
                  <th className="p-4">Barbearia & ID</th>
                  <th className="p-4">Responsável</th>
                  <th className="p-4">Contato</th>
                  <th className="p-4">Mensalidade Manual</th>
                  <th className="p-4">Vencimento</th>
                  <th className="p-4">WhatsApp</th>
                  <th className="p-4">Status de Acesso</th>
                  <th className="p-4 text-right">Ações do Administrador</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-500/10 text-barber-white/80">
                {filteredTenants.map((t) => (
                  <tr key={t.id} className="hover:bg-white/[0.02]">
                    <td className="p-4">
                      <div className="font-semibold text-barber-white">{t.name}</div>
                      <div className="text-[10px] text-barber-white/40 font-mono mt-0.5">ID: {t.id}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 text-barber-white/90">
                        <User className="h-3.5 w-3.5 text-amber-400" />
                        <span>{t.ownerName || 'Não informado'}</span>
                      </div>
                      <div className="text-[11px] text-barber-white/50">{t.ownerEmail}</div>
                    </td>
                    <td className="p-4">
                      <div className="font-mono">{t.contactPhone || '-'}</div>
                      <div className="text-[11px] text-barber-white/50">{t.contactEmail}</div>
                    </td>
                    <td className="p-4">
                      <span className="font-semibold text-emerald-400 text-sm">
                        R$ {Number(t.monthlyFee || 0).toFixed(2)}
                      </span>
                      <span className="text-[10px] text-barber-white/40 block">/mês</span>
                    </td>
                    <td className="p-4">
                      <span className="font-medium text-barber-white/90">Dia {t.billingDueDate || 10}</span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                        <span className="text-[11px] text-barber-white/70">Ativo (QR Code)</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold inline-block ${
                          t.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : t.status === 'suspended'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : t.status === 'blocked'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        }`}
                      >
                        {t.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenModal(t)}
                          className="rounded-lg p-1.5 text-barber-white/70 hover:bg-amber-500/10 hover:text-amber-400"
                          title="Editar Dados / Mensalidade"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>

                        {t.status !== 'active' && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(t.id, 'active')}
                            className="rounded-lg p-1.5 text-emerald-400 hover:bg-emerald-500/10"
                            title="Ativar / Reativar Acesso"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        )}

                        {t.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(t.id, 'suspended')}
                            className="rounded-lg p-1.5 text-amber-300 hover:bg-amber-500/10"
                            title="Suspender Temporariamente"
                          >
                            <PauseCircle className="h-4 w-4" />
                          </button>
                        )}

                        {t.status !== 'blocked' && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(t.id, 'blocked')}
                            className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10"
                            title="Bloquear Acesso"
                          >
                            <Ban className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Cadastro / Edição */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-amber-500/30 bg-[#141414] p-6 shadow-2xl">
            <h3 className="font-serif text-lg font-bold text-amber-400 mb-1">
              {editingTenant ? 'Editar Barbearia' : 'Cadastrar Nova Barbearia'}
            </h3>
            <p className="text-xs text-barber-white/60 mb-4">
              Configure as credenciais cadastrais e o valor mensal cobrado manualmente.
            </p>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs text-barber-white/80 mb-1">Nome Comercial da Barbearia</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Barbearia Varjota"
                  className="w-full rounded-xl border border-amber-500/20 bg-[#0a0a0a] px-3.5 py-2 text-xs text-barber-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-barber-white/80 mb-1">Nome do Responsável</label>
                  <input
                    type="text"
                    required
                    value={formData.ownerName}
                    onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                    placeholder="Ex: Marcos Souza"
                    className="w-full rounded-xl border border-amber-500/20 bg-[#0a0a0a] px-3.5 py-2 text-xs text-barber-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-barber-white/80 mb-1">E-mail do Responsável</label>
                  <input
                    type="email"
                    required
                    value={formData.ownerEmail}
                    onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                    placeholder="marcos@barbearia.com"
                    className="w-full rounded-xl border border-amber-500/20 bg-[#0a0a0a] px-3.5 py-2 text-xs text-barber-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-barber-white/80 mb-1">WhatsApp de Contato</label>
                  <input
                    type="tel"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    placeholder="(85) 99999-9999"
                    className="w-full rounded-xl border border-amber-500/20 bg-[#0a0a0a] px-3.5 py-2 text-xs text-barber-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-barber-white/80 mb-1">Status Inicial</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as TenantStatus })}
                    className="w-full rounded-xl border border-amber-500/20 bg-[#0a0a0a] px-3.5 py-2 text-xs text-barber-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="active">Ativa</option>
                    <option value="pending">Pendente</option>
                    <option value="suspended">Suspensa</option>
                    <option value="blocked">Bloqueada</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
                <div>
                  <label className="block text-xs font-semibold text-amber-300 mb-1">
                    Valor Mensal Cobrado (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.monthlyFee}
                    onChange={(e) => setFormData({ ...formData, monthlyFee: Number(e.target.value) })}
                    className="w-full rounded-xl border border-amber-500/30 bg-[#0a0a0a] px-3.5 py-2 text-xs font-bold text-emerald-400 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-amber-300 mb-1">
                    Dia de Vencimento
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    value={formData.billingDueDate}
                    onChange={(e) => setFormData({ ...formData, billingDueDate: Number(e.target.value) })}
                    className="w-full rounded-xl border border-amber-500/30 bg-[#0a0a0a] px-3.5 py-2 text-xs text-barber-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs text-barber-white/60 hover:text-barber-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-semibold text-black hover:opacity-90 shadow-md shadow-amber-500/20"
                >
                  {editingTenant ? 'Salvar Alterações' : 'Cadastrar Barbearia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
