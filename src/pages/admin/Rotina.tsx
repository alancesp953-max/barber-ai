import React, { useEffect, useState } from 'react'
import {
  Calendar as CalendarIcon,
  Clock,
  Coffee,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  User,
  Save,
  CalendarDays,
  Sparkles,
  Info,
} from 'lucide-react'
import { PageHeader } from '../../components/PageHeader'
import { getBarbers, updateBarberRoutine } from '../../lib/api'
import type { Barber } from '../../types/database'

const WEEK_DAYS = [
  { id: 0, label: 'Dom', full: 'Domingo' },
  { id: 1, label: 'Seg', full: 'Segunda-feira' },
  { id: 2, label: 'Ter', full: 'Terça-feira' },
  { id: 3, label: 'Qua', full: 'Quarta-feira' },
  { id: 4, label: 'Qui', full: 'Quinta-feira' },
  { id: 5, label: 'Sex', full: 'Sexta-feira' },
  { id: 6, label: 'Sáb', full: 'Sábado' },
]

export default function Rotina() {
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [selectedBarberId, setSelectedBarberId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Dados da Rotina do Barbeiro Selecionado
  const [startHour, setStartHour] = useState('08:00')
  const [endHour, setEndHour] = useState('19:00')
  const [breakStart, setBreakStart] = useState('12:00')
  const [breakEnd, setBreakEnd] = useState('13:00')
  const [hasBreak, setHasBreak] = useState(true)
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6])
  const [daysOff, setDaysOff] = useState<string[]>([])

  // Controle de Navegação do Calendário
  const today = new Date()
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [currentYear, setCurrentYear] = useState(today.getFullYear())

  // Campo para folga rápida manual
  const [customFolgaDate, setCustomFolgaDate] = useState('')

  // Carrega Barbeiros
  const loadBarbersData = async () => {
    try {
      setLoading(true)
      const list = await getBarbers()
      setBarbers(list)
      if (list.length > 0) {
        const active = list.find((b) => b.id === selectedBarberId) || list[0]
        selectBarber(active)
      }
    } catch (err: any) {
      setErrorMsg('Falha ao carregar lista de barbeiros: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBarbersData()
  }, [])

  const selectBarber = (barber: Barber) => {
    setSelectedBarberId(barber.id)
    setStartHour(barber.startHour || '08:00')
    setEndHour(barber.endHour || '19:00')
    setBreakStart(barber.breakStart || '12:00')
    setBreakEnd(barber.breakEnd || '13:00')
    setHasBreak(Boolean(barber.breakStart && barber.breakEnd))
    setWorkingDays(Array.isArray(barber.workingDays) ? barber.workingDays : [1, 2, 3, 4, 5, 6])
    setDaysOff(Array.isArray(barber.daysOff) ? barber.daysOff : [])
  }

  const handleBarberChange = (bId: string) => {
    const found = barbers.find((b) => b.id === bId)
    if (found) {
      selectBarber(found)
    }
  }

  // Alterna dia da semana de trabalho
  const toggleWorkingDay = (dayId: number) => {
    if (workingDays.includes(dayId)) {
      setWorkingDays(workingDays.filter((d) => d !== dayId))
    } else {
      setWorkingDays([...workingDays, dayId].sort())
    }
  }

  // Alterna folga em uma data específica
  const toggleDateOff = (dateStr: string) => {
    if (daysOff.includes(dateStr)) {
      setDaysOff(daysOff.filter((d) => d !== dateStr))
    } else {
      setDaysOff([...daysOff, dateStr].sort())
    }
  }

  const handleAddCustomFolga = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customFolgaDate) return
    if (!daysOff.includes(customFolgaDate)) {
      setDaysOff([...daysOff, customFolgaDate].sort())
    }
    setCustomFolgaDate('')
  }

  const handleRemoveFolga = (dateStr: string) => {
    setDaysOff(daysOff.filter((d) => d !== dateStr))
  }

  // Salvar no Firebase Firestore e sincronizar com o Bot WhatsApp
  const handleSaveRoutine = async () => {
    if (!selectedBarberId) return
    setSaving(true)
    setSuccessMsg(null)
    setErrorMsg(null)

    try {
      await updateBarberRoutine(selectedBarberId, {
        startHour,
        endHour,
        breakStart: hasBreak ? breakStart : '',
        breakEnd: hasBreak ? breakEnd : '',
        workingDays,
        daysOff,
      })

      setSuccessMsg('Rotina, folgas e horários salvos e sincronizados com a IA do WhatsApp!')
      setTimeout(() => setSuccessMsg(null), 5000)

      // Atualiza estado local
      setBarbers((prev) =>
        prev.map((b) =>
          b.id === selectedBarberId
            ? {
                ...b,
                startHour,
                endHour,
                breakStart: hasBreak ? breakStart : '',
                breakEnd: hasBreak ? breakEnd : '',
                workingDays,
                daysOff,
              }
            : b,
        ),
      )
    } catch (err: any) {
      setErrorMsg('Erro ao salvar rotina: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Lógica de Renderização do Calendário
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay() // 0 = Dom, 1 = Seg...

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear(currentYear - 1)
    } else {
      setCurrentMonth(currentMonth - 1)
    }
  }

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear(currentYear + 1)
    } else {
      setCurrentMonth(currentMonth + 1)
    }
  }

  const monthNames = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ]

  const selectedBarber = barbers.find((b) => b.id === selectedBarberId)

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Rotina dos Barbeiros"
        description="Defina os horários comerciais e lance as folgas de cada profissional para o atendimento da IA no WhatsApp"
      />

      {/* Alertas */}
      {successMsg && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-400">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Seletor de Profissional */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-barber-gold/20 bg-barber-black/60 p-5 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-barber-gold/10 text-barber-gold">
            <User className="h-6 w-6" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-barber-white/60">
              Profissional Selecionado
            </label>
            <select
              value={selectedBarberId}
              onChange={(e) => handleBarberChange(e.target.value)}
              className="mt-1 block rounded-lg border border-barber-gold/30 bg-barber-black px-4 py-2 text-base font-bold text-barber-gold focus:border-barber-gold focus:outline-none"
            >
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome || b.name} {b.telefone ? `(${b.telefone})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleSaveRoutine}
          disabled={saving || !selectedBarberId}
          className="flex items-center gap-2 rounded-xl bg-barber-gold px-6 py-3 font-semibold text-barber-black shadow-md shadow-barber-gold/20 transition-all hover:bg-barber-gold/90 disabled:opacity-50"
        >
          <Save className="h-5 w-5" />
          {saving ? 'Salvando e Sincronizando...' : 'Salvar Rotina'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Coluna Esquerda: Horário Comercial e Dias Semanais (5 cols) */}
        <div className="space-y-6 lg:col-span-5">
          {/* Card Horários de Expediente */}
          <div className="rounded-2xl border border-barber-gold/20 bg-barber-black/60 p-6 shadow-md backdrop-blur-md">
            <div className="flex items-center gap-2 text-barber-gold">
              <Clock className="h-5 w-5" />
              <h2 className="font-serif text-lg font-bold">Horário Comercial de Atendimento</h2>
            </div>
            <p className="mt-1 text-xs text-barber-white/60">
              Horários em que o profissional estará ativo para receber agendamentos via WhatsApp
            </p>

            <div className="mt-5 grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-barber-white/70">Início do Expediente</label>
                <input
                  type="time"
                  value={startHour}
                  onChange={(e) => setStartHour(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-barber-gold/30 bg-barber-black/80 px-3 py-2 text-sm text-barber-white focus:border-barber-gold focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-barber-white/70">Fim do Expediente</label>
                <input
                  type="time"
                  value={endHour}
                  onChange={(e) => setEndHour(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-barber-gold/30 bg-barber-black/80 px-3 py-2 text-sm text-barber-white focus:border-barber-gold focus:outline-none"
                />
              </div>
            </div>

            {/* Intervalo / Almoço */}
            <div className="mt-5 border-t border-barber-gold/10 pt-4">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-semibold text-barber-gold">
                  <Coffee className="h-4 w-4" />
                  Intervalo / Pausa de Almoço
                </label>
                <input
                  type="checkbox"
                  checked={hasBreak}
                  onChange={(e) => setHasBreak(e.target.checked)}
                  className="h-4 w-4 rounded border-barber-gold/40 text-barber-gold accent-barber-gold"
                />
              </div>

              {hasBreak && (
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-barber-white/60">Início do Almoço</label>
                    <input
                      type="time"
                      value={breakStart}
                      onChange={(e) => setBreakStart(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-barber-gold/30 bg-barber-black/80 px-3 py-2 text-sm text-barber-white focus:border-barber-gold focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-barber-white/60">Fim do Almoço</label>
                    <input
                      type="time"
                      value={breakEnd}
                      onChange={(e) => setBreakEnd(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-barber-gold/30 bg-barber-black/80 px-3 py-2 text-sm text-barber-white focus:border-barber-gold focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Card Dias Semanais de Trabalho */}
          <div className="rounded-2xl border border-barber-gold/20 bg-barber-black/60 p-6 shadow-md backdrop-blur-md">
            <div className="flex items-center gap-2 text-barber-gold">
              <CalendarDays className="h-5 w-5" />
              <h2 className="font-serif text-lg font-bold">Dias Semanais de Atendimento</h2>
            </div>
            <p className="mt-1 text-xs text-barber-white/60">
              Dias da semana em que o profissional trabalha regularmente
            </p>

            <div className="mt-4 grid grid-cols-7 gap-1.5">
              {WEEK_DAYS.map((day) => {
                const isWorking = workingDays.includes(day.id)
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => toggleWorkingDay(day.id)}
                    title={day.full}
                    className={`flex flex-col items-center justify-center rounded-xl py-3 text-xs font-bold transition-all ${
                      isWorking
                        ? 'border border-barber-gold bg-barber-gold text-barber-black shadow-sm'
                        : 'border border-barber-gold/20 bg-barber-black/40 text-barber-white/40 hover:border-barber-gold/40 hover:text-barber-white'
                    }`}
                  >
                    <span>{day.label}</span>
                    <span className="mt-1 text-[10px] font-normal">{isWorking ? 'Trabalha' : 'Folga'}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Card Lançamento Rápido de Folga */}
          <div className="rounded-2xl border border-barber-gold/20 bg-barber-black/60 p-6 shadow-md backdrop-blur-md">
            <h3 className="font-serif text-base font-bold text-barber-gold">Lançar Folga por Data Específica</h3>
            <p className="mt-1 text-xs text-barber-white/60">
              Insira uma data avulsa (feriado, folga periódica, folga médica ou viagem)
            </p>

            <form onSubmit={handleAddCustomFolga} className="mt-4 flex gap-2">
              <input
                type="date"
                value={customFolgaDate}
                onChange={(e) => setCustomFolgaDate(e.target.value)}
                className="flex-1 rounded-lg border border-barber-gold/30 bg-barber-black px-3 py-2 text-sm text-barber-white focus:border-barber-gold focus:outline-none"
              />
              <button
                type="submit"
                disabled={!customFolgaDate}
                className="flex items-center gap-1.5 rounded-lg bg-barber-gold px-4 py-2 text-sm font-semibold text-barber-black hover:bg-barber-gold/90 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Lançar
              </button>
            </form>

            {/* Lista das Próximas Folgas */}
            <div className="mt-5 border-t border-barber-gold/10 pt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-barber-white/60">
                Folgas Lançadas ({daysOff.length})
              </h4>

              {daysOff.length === 0 ? (
                <p className="mt-2 text-xs italic text-barber-white/40">Nenhuma folga cadastrada no momento.</p>
              ) : (
                <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
                  {daysOff.map((dStr) => {
                    const [y, m, d] = dStr.split('-')
                    return (
                      <div
                        key={dStr}
                        className="flex items-center justify-between rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold">
                            {d}/{m}/{y}
                          </span>
                          <span className="text-[10px] text-rose-400/80">(Folga Lançada)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveFolga(dStr)}
                          className="text-rose-400 hover:text-rose-200"
                          title="Remover Folga"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Coluna Direita: Calendário Interativo Visual (7 cols) */}
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-2xl border border-barber-gold/20 bg-barber-black/60 p-6 shadow-md backdrop-blur-md">
            {/* Cabeçalho do Calendário */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-serif text-xl font-bold text-barber-gold">
                  {monthNames[currentMonth]} {currentYear}
                </h2>
                <p className="text-xs text-barber-white/60">
                  Clique em qualquer data para marcar ou desmarcar como <strong className="text-rose-400">FOLGA</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="rounded-lg border border-barber-gold/20 p-2 text-barber-white hover:bg-barber-gold/10 hover:text-barber-gold"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="rounded-lg border border-barber-gold/20 p-2 text-barber-white hover:bg-barber-gold/10 hover:text-barber-gold"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Legenda */}
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs border-y border-barber-gold/10 py-3">
              <div className="flex items-center gap-1.5">
                <div className="h-3.5 w-3.5 rounded border border-emerald-500 bg-emerald-500/20" />
                <span className="text-barber-white/80">Disponível / Atendimento</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3.5 w-3.5 rounded border border-rose-500 bg-rose-500/20" />
                <span className="text-rose-300 font-semibold">Folga Lançada</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3.5 w-3.5 rounded border border-barber-white/20 bg-barber-white/5" />
                <span className="text-barber-white/50">Folga Semanal Fixa</span>
              </div>
            </div>

            {/* Grade dos Dias da Semana */}
            <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs font-bold text-barber-gold/70">
              {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
            </div>

            {/* Células do Calendário */}
            <div className="mt-2 grid grid-cols-7 gap-2">
              {/* Espaçadores para dias do mês anterior */}
              {Array.from({ length: firstDayIndex }).map((_, idx) => (
                <div key={`empty-${idx}`} className="h-16 rounded-xl border border-transparent bg-transparent" />
              ))}

              {/* Dias do mês atual */}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const dayNum = idx + 1
                const dateObj = new Date(currentYear, currentMonth, dayNum)
                const dayOfWeek = dateObj.getDay()
                const formattedDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`

                const isRegularWorkDay = workingDays.includes(dayOfWeek)
                const isExplicitFolga = daysOff.includes(formattedDate)
                const isToday =
                  today.getDate() === dayNum &&
                  today.getMonth() === currentMonth &&
                  today.getFullYear() === currentYear

                return (
                  <button
                    key={formattedDate}
                    type="button"
                    onClick={() => toggleDateOff(formattedDate)}
                    className={`relative flex h-16 flex-col justify-between rounded-xl p-2 text-left transition-all hover:scale-105 ${
                      isExplicitFolga
                        ? 'border border-rose-500/60 bg-rose-500/20 text-rose-300 shadow-md shadow-rose-900/20'
                        : !isRegularWorkDay
                          ? 'border border-barber-white/10 bg-barber-white/5 text-barber-white/40'
                          : 'border border-barber-gold/20 bg-emerald-500/10 text-emerald-300 hover:border-barber-gold/50'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className={`text-sm font-bold ${isToday ? 'text-barber-gold underline' : ''}`}>
                        {dayNum}
                      </span>
                      {isToday && (
                        <span className="rounded bg-barber-gold px-1 py-0.5 text-[9px] font-bold text-barber-black">
                          Hoje
                        </span>
                      )}
                    </div>

                    <div className="text-[10px] font-semibold tracking-tight">
                      {isExplicitFolga ? (
                        <span className="rounded bg-rose-500/30 px-1 py-0.5 text-rose-200">FOLGA</span>
                      ) : !isRegularWorkDay ? (
                        <span className="text-barber-white/40">Sem escala</span>
                      ) : (
                        <span className="text-emerald-400">Atende</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Aviso informativo de IA */}
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-barber-gold/20 bg-barber-gold/5 p-4 text-xs text-barber-white/70">
              <Info className="h-5 w-5 shrink-0 text-barber-gold" />
              <div>
                <p className="font-semibold text-barber-gold">Comportamento Automático no WhatsApp:</p>
                <p className="mt-0.5">
                  Quando o cliente conversar com a IA solicitando uma data, o bot verificará instantaneamente as folgas
                  e os horários definidos aqui. Se o barbeiro estiver de folga ou fora de expediente, a IA bloqueará o
                  agendamento e sugerirá outros profissionais ou datas válidas.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
