import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import {
  getPlatformBilling,
  createPlatformBilling,
  updatePlatformBillingStatus,
  getPlatformExpenses,
  createPlatformExpense,
  getTenants,
} from '../../lib/api'
import type { PlatformBilling, PlatformExpense, Tenant } from '../../types/database'

export default function SuperAdminFinanceiro() {
  const [billings, setBillings] = useState<PlatformBilling[]>([])
  const [expenses, setExpenses] = useState<PlatformExpense[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [activeTab, setActiveTab] = useState<'receitas' | 'despesas'>('receitas')

  // Modais
  const [modalBillingOpen, setModalBillingOpen] = useState(false)
  const [modalExpenseOpen, setModalExpenseOpen] = useState(false)

  // Form Billing
  const [formBilling, setFormBilling] = useState({
    tenantId: '',
    tenantName: '',
    amount: 150,
    dueDate: new Date().toISOString().split('T')[0],
    status: 'pending' as 'pending' | 'paid' | 'overdue',
    notes: '',
  })

  // Form Expense
  const [formExpense, setFormExpense] = useState({
    name: '',
    category: 'API Gemini / ElevenLabs',
    amount: 50,
    dueDate: new Date().toISOString().split('T')[0],
    status: 'pending' as 'pending' | 'paid',
    description: '',
  })

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const [bData, eData, tData] = await Promise.all([
        getPlatformBilling(),
        getPlatformExpenses(),
        getTenants(),
      ])
      setBillings(bData)
      setExpenses(eData)
      setTenants(tData)
    } catch (e) {
      console.error(e)
    }
  }

  const handleCreateBilling = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const selectedTenant = tenants.find((t) => t.id === formBilling.tenantId)
      await createPlatformBilling({
        ...formBilling,
        tenantName: selectedTenant ? selectedTenant.name : formBilling.tenantName || 'Barbearia',
      })
      setModalBillingOpen(false)
      await load()
    } catch (err) {
      console.error(err)
    }
  }

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createPlatformExpense(formExpense)
      setModalExpenseOpen(false)
      await load()
    } catch (err) {
      console.error(err)
    }
  }

  const handleToggleBillingStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'paid' ? 'pending' : 'paid'
    await updatePlatformBillingStatus(id, nextStatus as any)
    await load()
  }

  // Cálculos financeiros
  const faturamentoPrevisto = tenants
    .filter((t) => t.status === 'active')
    .reduce((sum, t) => sum + (Number(t.monthlyFee) || 0), 0)

  const totalRecebido = billings
    .filter((b) => b.status === 'paid')
    .reduce((sum, b) => sum + (Number(b.amount) || 0), 0)

  const totalPendente = billings
    .filter((b) => b.status === 'pending')
    .reduce((sum, b) => sum + (Number(b.amount) || 0), 0)

  const totalDespesas = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-amber-400">
          Gestão Financeira da Plataforma SaaS
        </h1>
        <p className="text-xs text-barber-white/60 mt-1">
          Controle de faturamento manual, recebimentos, mensalidades pendentes e contas a pagar operacionais.
        </p>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-amber-500/20 bg-[#121212] p-4 space-y-1">
          <div className="text-xs text-barber-white/60">Faturamento Previsto/Mês</div>
          <div className="text-xl font-bold text-amber-300">
            R$ {faturamentoPrevisto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-barber-white/40">Baseado nas mensalidades ativas</div>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-[#121212] p-4 space-y-1">
          <div className="text-xs text-barber-white/60">Total Recebido Registrado</div>
          <div className="text-xl font-bold text-emerald-400">
            R$ {totalRecebido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-emerald-400/80">Pagamentos confirmados</div>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-[#121212] p-4 space-y-1">
          <div className="text-xs text-barber-white/60">Valores Pendentes / Atrasados</div>
          <div className="text-xl font-bold text-red-400">
            R$ {totalPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-red-400/80">Mensalidades a cobrar</div>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-[#121212] p-4 space-y-1">
          <div className="text-xs text-barber-white/60">Contas a Pagar / Despesas</div>
          <div className="text-xl font-bold text-barber-white">
            R$ {totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-barber-white/40">APIs, hospedagem e infra</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-amber-500/20 pb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('receitas')}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'receitas'
                ? 'bg-amber-500 text-black'
                : 'text-barber-white/70 hover:bg-amber-500/10 hover:text-amber-300'
            }`}
          >
            Mensalidades de Barbearias ({billings.length})
          </button>
          <button
            onClick={() => setActiveTab('despesas')}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'despesas'
                ? 'bg-amber-500 text-black'
                : 'text-barber-white/70 hover:bg-amber-500/10 hover:text-amber-300'
            }`}
          >
            Contas a Pagar & Despesas ({expenses.length})
          </button>
        </div>

        {activeTab === 'receitas' ? (
          <button
            type="button"
            onClick={() => setModalBillingOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-semibold text-black hover:opacity-90 shadow-md shadow-amber-500/10"
          >
            <Plus className="h-3.5 w-3.5" />
            Lançar Mensalidade
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setModalExpenseOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-semibold text-black hover:opacity-90 shadow-md shadow-amber-500/10"
          >
            <Plus className="h-3.5 w-3.5" />
            Registrar Despesa
          </button>
        )}
      </div>

      {/* TAB RECEITAS */}
      {activeTab === 'receitas' && (
        <div className="rounded-2xl border border-amber-500/20 bg-[#121212] overflow-hidden">
          {billings.length === 0 ? (
            <div className="p-12 text-center text-xs text-barber-white/50">
              Nenhuma mensalidade lançada manualmente ainda. Clique em "Lançar Mensalidade" para registrar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-amber-500/10 bg-amber-500/[0.03] text-barber-white/60 font-semibold">
                  <tr>
                    <th className="p-4">Barbearia</th>
                    <th className="p-4">Valor</th>
                    <th className="p-4">Vencimento</th>
                    <th className="p-4">Data Pagamento</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-500/10 text-barber-white/80">
                  {billings.map((b) => (
                    <tr key={b.id} className="hover:bg-white/[0.02]">
                      <td className="p-4 font-semibold text-barber-white">{b.tenantName}</td>
                      <td className="p-4 text-emerald-400 font-bold">R$ {b.amount?.toFixed(2)}</td>
                      <td className="p-4">{b.dueDate}</td>
                      <td className="p-4">{b.paidAt ? new Date(b.paidAt).toLocaleDateString('pt-BR') : '-'}</td>
                      <td className="p-4">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                            b.status === 'paid'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {b.status === 'paid' ? 'PAGO' : 'PENDENTE'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleBillingStatus(b.id, b.status)}
                          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-300 hover:bg-amber-500/20"
                        >
                          {b.status === 'paid' ? 'Marcar Pendente' : 'Confirmar Recebimento'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB DESPESAS */}
      {activeTab === 'despesas' && (
        <div className="rounded-2xl border border-amber-500/20 bg-[#121212] overflow-hidden">
          {expenses.length === 0 ? (
            <div className="p-12 text-center text-xs text-barber-white/50">
              Nenhuma despesa ou conta a pagar registrada ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-amber-500/10 bg-amber-500/[0.03] text-barber-white/60 font-semibold">
                  <tr>
                    <th className="p-4">Nome da Despesa</th>
                    <th className="p-4">Categoria</th>
                    <th className="p-4">Valor</th>
                    <th className="p-4">Vencimento</th>
                    <th className="p-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-500/10 text-barber-white/80">
                  {expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-white/[0.02]">
                      <td className="p-4 font-semibold text-barber-white">{e.name}</td>
                      <td className="p-4 text-barber-white/60">{e.category}</td>
                      <td className="p-4 font-bold text-red-400">R$ {e.amount?.toFixed(2)}</td>
                      <td className="p-4">{e.dueDate}</td>
                      <td className="p-4">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                            e.status === 'paid'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {e.status === 'paid' ? 'PAGO' : 'A PAGAR'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal Lançar Mensalidade */}
      {modalBillingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-[#141414] p-6 shadow-2xl space-y-4">
            <h3 className="font-serif text-lg font-bold text-amber-400">Lançar Mensalidade de Barbearia</h3>
            <form onSubmit={handleCreateBilling} className="space-y-4">
              <div>
                <label className="block text-xs text-barber-white/80 mb-1">Selecione a Barbearia</label>
                <select
                  required
                  value={formBilling.tenantId}
                  onChange={(e) => {
                    const sel = tenants.find((t) => t.id === e.target.value)
                    setFormBilling({
                      ...formBilling,
                      tenantId: e.target.value,
                      tenantName: sel ? sel.name : '',
                      amount: sel ? sel.monthlyFee : 150,
                    })
                  }}
                  className="w-full rounded-xl border border-amber-500/20 bg-[#0a0a0a] px-3.5 py-2 text-xs text-barber-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="">Selecione uma barbearia...</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (R$ {t.monthlyFee}/mês)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-barber-white/80 mb-1">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formBilling.amount}
                    onChange={(e) => setFormBilling({ ...formBilling, amount: Number(e.target.value) })}
                    className="w-full rounded-xl border border-amber-500/20 bg-[#0a0a0a] px-3.5 py-2 text-xs text-barber-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-barber-white/80 mb-1">Data de Vencimento</label>
                  <input
                    type="date"
                    required
                    value={formBilling.dueDate}
                    onChange={(e) => setFormBilling({ ...formBilling, dueDate: e.target.value })}
                    className="w-full rounded-xl border border-amber-500/20 bg-[#0a0a0a] px-3.5 py-2 text-xs text-barber-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalBillingOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs text-barber-white/60 hover:text-barber-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-semibold text-black hover:opacity-90"
                >
                  Salvar Lançamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Registrar Despesa */}
      {modalExpenseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-[#141414] p-6 shadow-2xl space-y-4">
            <h3 className="font-serif text-lg font-bold text-amber-400">Registrar Conta a Pagar / Despesa</h3>
            <form onSubmit={handleCreateExpense} className="space-y-4">
              <div>
                <label className="block text-xs text-barber-white/80 mb-1">Nome da Despesa</label>
                <input
                  type="text"
                  required
                  value={formExpense.name}
                  onChange={(e) => setFormExpense({ ...formExpense, name: e.target.value })}
                  placeholder="Ex: Fatura API Gemini / WhatsApp Cloud"
                  className="w-full rounded-xl border border-amber-500/20 bg-[#0a0a0a] px-3.5 py-2 text-xs text-barber-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-barber-white/80 mb-1">Categoria</label>
                  <select
                    value={formExpense.category}
                    onChange={(e) => setFormExpense({ ...formExpense, category: e.target.value })}
                    className="w-full rounded-xl border border-amber-500/20 bg-[#0a0a0a] px-3.5 py-2 text-xs text-barber-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="APIs & IA">APIs & IA</option>
                    <option value="Hospedagem & Servidores">Hospedagem & Servidores</option>
                    <option value="WhatsApp Business">WhatsApp Business</option>
                    <option value="Operacional">Operacional</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-barber-white/80 mb-1">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formExpense.amount}
                    onChange={(e) => setFormExpense({ ...formExpense, amount: Number(e.target.value) })}
                    className="w-full rounded-xl border border-amber-500/20 bg-[#0a0a0a] px-3.5 py-2 text-xs text-barber-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-barber-white/80 mb-1">Data de Vencimento</label>
                <input
                  type="date"
                  required
                  value={formExpense.dueDate}
                  onChange={(e) => setFormExpense({ ...formExpense, dueDate: e.target.value })}
                  className="w-full rounded-xl border border-amber-500/20 bg-[#0a0a0a] px-3.5 py-2 text-xs text-barber-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalExpenseOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs text-barber-white/60 hover:text-barber-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-semibold text-black hover:opacity-90"
                >
                  Registrar Despesa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
