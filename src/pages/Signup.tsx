import { Link, useNavigate } from '@tanstack/react-router'
import { Scissors, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc, addDoc, collection } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

export default function Signup() {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    name: '',
    barbershopName: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    if (formData.password !== formData.confirmPassword) {
      setMessage({ text: 'As senhas não coincidem.', type: 'error' })
      setLoading(false)
      return
    }

    if (formData.email.toLowerCase().trim() === 'admin@barb.com') {
      setMessage({
        text: 'O e-mail admin@barb.com é reservado exclusivamente para o Superadministrador da plataforma e deve ser criado via script administrativo.',
        type: 'error',
      })
      setLoading(false)
      return
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, formData.email, formData.password)
      const uid = cred.user.uid

      // Cria a nova Barbearia (Tenant)
      const tenantRef = await addDoc(collection(db, 'tenants'), {
        name: formData.barbershopName || `Barbearia de ${formData.name}`,
        slug: (formData.barbershopName || formData.name).toLowerCase().replace(/[^a-z0-9]/g, '-'),
        contactPhone: formData.phone || '',
        contactEmail: formData.email,
        ownerName: formData.name,
        ownerEmail: formData.email,
        status: 'active',
        monthlyFee: 150,
        contractStartDate: new Date().toISOString().split('T')[0],
        billingDueDate: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      const tenantId = tenantRef.id

      // Cria perfil do usuário administrador da barbearia (tenant_admin)
      await setDoc(doc(db, 'users', uid), {
        uid,
        email: formData.email,
        name: formData.name,
        role: 'tenant_admin',
        tenantId,
        status: 'active',
        createdAt: new Date().toISOString(),
      })

      // Inicializa configurações padrão da barbearia
      await setDoc(doc(db, 'tenants', tenantId, 'settings', 'general'), {
        nome_barbearia: formData.barbershopName || `Barbearia de ${formData.name}`,
        telefone: formData.phone || '',
        horario_abertura: '09:00',
        horario_fechamento: '19:00',
        dias_funcionamento: [1, 2, 3, 4, 5, 6],
      })

      // Inicializa serviços padrão
      await addDoc(collection(db, 'tenants', tenantId, 'services'), {
        nome: 'Corte Tradicional',
        name: 'Corte Tradicional',
        preco: 40,
        price: 40,
        duracao_minutos: 30,
        durationMinutes: 30,
        ativo: true,
        active: true,
      })

      await addDoc(collection(db, 'tenants', tenantId, 'services'), {
        nome: 'Barba Completa',
        name: 'Barba Completa',
        preco: 35,
        price: 35,
        duracao_minutos: 30,
        durationMinutes: 30,
        ativo: true,
        active: true,
      })

      // Inicializa configurações de IA e WhatsApp
      await setDoc(doc(db, 'tenants', tenantId, 'aiSettings', 'primary'), {
        enabled: true,
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        greetingMessage: `Olá! Seja bem-vindo à ${formData.barbershopName || 'nossa barbearia'}. ✂️\nVou te ajudar a agendar seu horário.\nComo posso te chamar?`,
        humanHandoffKeyword: 'humano',
        audioEnabled: false,
        language: 'pt-BR',
      })

      setMessage({ text: 'Conta e barbearia cadastradas com sucesso! Redirecionando...', type: 'success' })
      setTimeout(() => navigate({ to: '/admin/dashboard' }), 1500)
    } catch (err: any) {
      console.error('Erro no cadastro:', err)
      let msg = 'Erro ao criar conta. Verifique os dados informados.'
      if (err.code === 'auth/email-already-in-use') {
        msg = 'Este e-mail já está em uso.'
      } else if (err.code === 'auth/weak-password') {
        msg = 'A senha deve conter no mínimo 6 caracteres.'
      }
      setMessage({ text: msg, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-barber-gray bg-barber-black px-4 py-2.5 text-barber-white placeholder:text-barber-white/30 focus:border-barber-gold focus:outline-none focus:ring-1 focus:ring-barber-gold'

  return (
    <div className="flex min-h-screen items-center justify-center bg-barber-black px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-barber-gold/10">
            <Scissors className="h-8 w-8 text-barber-gold" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-barber-gold">Cadastrar Barbearia</h1>
          <p className="mt-2 text-sm text-barber-white/60">
            Comece a utilizar o Barber AI com gestão completa e atendimento WhatsApp automatizado
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-barber-gray bg-barber-gray/40 p-8 shadow-xl backdrop-blur"
        >
          {message && (
            <div
              className={`mb-6 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
                message.type === 'error'
                  ? 'border-red-500/30 bg-red-500/10 text-red-400'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              }`}
            >
              {message.type === 'error' ? (
                <AlertCircle className="h-4 w-4 shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-barber-white/80">
                Seu Nome Completo
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className={inputClass}
                placeholder="Ex: Carlos Silva"
              />
            </div>

            <div>
              <label htmlFor="barbershopName" className="mb-1.5 block text-sm font-medium text-barber-white/80">
                Nome da Barbearia
              </label>
              <input
                id="barbershopName"
                type="text"
                value={formData.barbershopName}
                onChange={(e) => setFormData({ ...formData, barbershopName: e.target.value })}
                required
                className={inputClass}
                placeholder="Ex: Barbearia Estilo Real"
              />
            </div>

            <div>
              <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-barber-white/80">
                Telefone / WhatsApp de Contato
              </label>
              <input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
                className={inputClass}
                placeholder="(85) 99999-9999"
              />
            </div>

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-barber-white/80">
                E-mail de Acesso
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className={inputClass}
                placeholder="carlos@barbearia.com"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-barber-white/80">
                  Senha
                </label>
                <input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={6}
                  className={inputClass}
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-barber-white/80">
                  Confirmar Senha
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  required
                  minLength={6}
                  className={inputClass}
                  placeholder="••••••••"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-lg bg-barber-gold py-3 font-semibold text-barber-black transition-colors hover:bg-barber-gold/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Criando Barbearia...' : 'Cadastrar e Começar'}
          </button>

          <p className="mt-4 text-center text-sm text-barber-white/60">
            {t('signup.hasAccount')}{' '}
            <Link to="/login" className="text-barber-gold hover:underline">
              {t('signup.signIn')}
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
