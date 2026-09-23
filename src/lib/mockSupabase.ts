import {
  clearDemoSession,
  DEMO_ADMIN_USER,
  demoRoleFromEmail,
  getDemoSession,
  setDemoSession,
  type DemoRole,
  type DemoSession,
} from './demoAuth'
import { isFirebaseConfigured } from './firebase'
import {
  deleteFirestoreRow,
  insertFirestoreRow,
  isFirestoreShopCollection,
  listFirestoreCollection,
  updateFirestoreRow,
  upsertFirestoreRow,
  type FirestoreShopCollection,
} from './firestoreShop'
import { cloneRow, getTable, newId, setTable } from './mockDb'
import { mockAvailableSlots, mockCreateAppointment } from './mockAvailability'
import {
  audioConfigFromSettings,
  loadAudioSettings,
  saveAudioSettings,
  testElevenLabsWithKey,
  testGeminiWithKey,
} from './audioSettings'
import {
  connectWhatsAppLab,
  disconnectWhatsAppLab,
  statusWhatsAppLab,
  simulateWhatsAppLabScan,
} from './localWhatsAppLab'

type Filter =
  | { type: 'eq'; column: string; value: unknown }
  | { type: 'neq'; column: string; value: unknown }
  | { type: 'gte'; column: string; value: unknown }
  | { type: 'lte'; column: string; value: unknown }
  | { type: 'or'; expr: string }
  | { type: 'not'; column: string; op: string; value: unknown }

type OrderBy = { column: string; ascending: boolean; nullsFirst?: boolean }

type QueryState = {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete' | 'upsert'
  selectSpec: string
  countExact: boolean
  head: boolean
  filters: Filter[]
  orders: OrderBy[]
  limit?: number
  payload?: unknown
  onConflict?: string
  want: 'many' | 'single' | 'maybe'
}

type AuthListener = (event: string, session: DemoSession | null) => void

const RELATIONS: Record<string, Record<string, { table: string; fk: string }>> = {
  agendamentos: {
    barbeiros: { table: 'barbeiros', fk: 'barbeiro_id' },
    servicos: { table: 'servicos', fk: 'servico_id' },
    clientes: { table: 'clientes', fk: 'cliente_id' },
  },
  pagamentos: {
    agendamentos: { table: 'agendamentos', fk: 'agendamento_id' },
  },
  movimentacoes_estoque: {
    produtos: { table: 'produtos', fk: 'produto_id' },
    barbeiros: { table: 'barbeiros', fk: 'barbeiro_id' },
  },
}

function cmp(a: unknown, b: unknown) {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true })
}

function matchLike(value: unknown, pattern: string) {
  const text = String(value ?? '').toLowerCase()
  const escaped = pattern
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.')
  return new RegExp(`^${escaped}$`).test(text)
}

function parseInList(raw: unknown): unknown[] {
  const text = String(raw ?? '')
    .trim()
    .replace(/^\(/, '')
    .replace(/\)$/, '')
  if (!text) return []
  return text.split(',').map((part) => part.trim().replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, ''))
}

function applyFilter(row: Record<string, unknown>, filter: Filter): boolean {
  if (filter.type === 'eq') return row[filter.column] === filter.value
  if (filter.type === 'neq') return row[filter.column] !== filter.value
  if (filter.type === 'gte') return cmp(row[filter.column], filter.value) >= 0
  if (filter.type === 'lte') return cmp(row[filter.column], filter.value) <= 0
  if (filter.type === 'not') {
    if (filter.op === 'is' && filter.value == null) return row[filter.column] != null
    if (filter.op === 'in') return !parseInList(filter.value).includes(row[filter.column] as never)
    return row[filter.column] !== filter.value
  }
  return filter.expr.split(',').some((part) => matchOrPart(row, part.trim()))
}

function matchOrPart(row: Record<string, unknown>, part: string) {
  const isMatch = part.match(/^([a-zA-Z0-9_]+)\.is\.null$/)
  if (isMatch) return row[isMatch[1]] == null
  const gte = part.match(/^([a-zA-Z0-9_]+)\.gte\.(.+)$/)
  if (gte) return cmp(row[gte[1]], gte[2]) >= 0
  const ilike = part.match(/^([a-zA-Z0-9_]+)\.ilike\.(.+)$/)
  if (ilike) return matchLike(row[ilike[1]], ilike[2])
  const eq = part.match(/^([a-zA-Z0-9_]+)\.eq\.(.+)$/)
  if (eq) return String(row[eq[1]]) === eq[2]
  return false
}

function pickFields(row: Record<string, unknown>, fields: string[]) {
  if (fields.includes('*') || fields.length === 0) return cloneRow(row)
  const out: Record<string, unknown> = {}
  for (const field of fields) {
    if (field === '*') continue
    out[field] = row[field] ?? null
  }
  return out
}

function parseEmbeds(selectSpec: string) {
  const embeds: { name: string; inner: boolean; fields: string[] }[] = []
  const re = /([a-zA-Z0-9_]+)(!inner)?\(([^)]*)\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(selectSpec))) {
    const fields = match[3]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    embeds.push({
      name: match[1],
      inner: Boolean(match[2]),
      fields: fields.length ? fields : ['*'],
    })
  }
  return embeds
}

type RelatedTables = Record<string, Record<string, unknown>[]>

async function loadTableRows(table: string) {
  if (isFirebaseConfigured() && isFirestoreShopCollection(table)) {
    return listFirestoreCollection(table)
  }
  return getTable(table)
}

async function loadShopSnapshots() {
  if (!isFirebaseConfigured()) return undefined
  const [barbeiros, servicos, agendamentos] = await Promise.all([
    listFirestoreCollection('barbeiros'),
    listFirestoreCollection('servicos'),
    listFirestoreCollection('agendamentos'),
  ])
  return { barbeiros, servicos, agendamentos }
}

async function loadRelatedTables(table: string, selectSpec: string): Promise<RelatedTables> {
  const cache: RelatedTables = {}
  for (const embed of parseEmbeds(selectSpec)) {
    const rel = RELATIONS[table]?.[embed.name]
    if (!rel || cache[rel.table]) continue
    cache[rel.table] = await loadTableRows(rel.table)
  }
  return cache
}

function embedRow(
  table: string,
  row: Record<string, unknown>,
  selectSpec: string,
  relatedTables: RelatedTables = {},
) {
  const result = cloneRow(row)
  const embeds = parseEmbeds(selectSpec)
  for (const embed of embeds) {
    const rel = RELATIONS[table]?.[embed.name]
    if (!rel) {
      result[embed.name] = null
      continue
    }
    const related = (relatedTables[rel.table] || getTable(rel.table)).find((item) => item.id === row[rel.fk])
    if (!related) {
      if (table === 'agendamentos' && embed.name === 'clientes') {
        const nome = String(row.clienteNome || row.cliente_nome || '').trim()
        if (nome) {
          result[embed.name] = pickFields(
            { nome, telefone: row.clienteTelefone || row.cliente_telefone || null, email: null },
            embed.fields,
          )
          continue
        }
      }
      if (embed.inner) return null
      result[embed.name] = null
      continue
    }
    result[embed.name] = pickFields(related, embed.fields)
  }
  return result
}

function sortRows(rows: Record<string, unknown>[], orders: OrderBy[]) {
  if (!orders.length) return rows
  return [...rows].sort((a, b) => {
    for (const order of orders) {
      const av = a[order.column]
      const bv = b[order.column]
      if (av == null && bv == null) continue
      if (av == null) return order.nullsFirst ? -1 : 1
      if (bv == null) return order.nullsFirst ? 1 : -1
      const diff = cmp(av, bv)
      if (diff !== 0) return order.ascending ? diff : -diff
    }
    return 0
  })
}

async function execute(state: QueryState) {
  try {
    const useFirestore = isFirebaseConfigured() && isFirestoreShopCollection(state.table)
    const shopTable = state.table as FirestoreShopCollection
    const table: Record<string, unknown>[] = [...(await loadTableRows(state.table))]
    let working = table.filter((row) => state.filters.every((filter) => applyFilter(row, filter)))

    if (state.op === 'insert') {
      const incoming = Array.isArray(state.payload) ? state.payload : [state.payload]
      const inserted: Record<string, unknown>[] = []
      for (const item of incoming) {
        const rowIn = {
          created_at: new Date().toISOString(),
          ...(item as Record<string, unknown>),
        }
        if (useFirestore) {
          inserted.push(await insertFirestoreRow(shopTable, rowIn))
        } else {
          const row: Record<string, unknown> = {
            ...rowIn,
            id: (item as { id?: string })?.id || newId(state.table),
          }
          table.push(row)
          inserted.push(row)
        }
      }
      if (!useFirestore) setTable(state.table, table)
      working = inserted
    }

    if (state.op === 'update') {
      const patch = (state.payload || {}) as Record<string, unknown>
      const updated: Record<string, unknown>[] = []
      for (const row of working) {
        const next = { ...row, ...patch }
        if (useFirestore) {
          await updateFirestoreRow(shopTable, String(row.id), patch)
        } else {
          Object.assign(row, patch)
        }
        updated.push(next)
      }
      if (!useFirestore) setTable(state.table, table)
      working = updated
    }

    if (state.op === 'delete') {
      if (useFirestore) {
        for (const row of working) {
          await deleteFirestoreRow(shopTable, String(row.id))
        }
      } else {
        const ids = new Set(working.map((row) => row.id))
        setTable(
          state.table,
          table.filter((row) => !ids.has(row.id)),
        )
      }
    }

    if (state.op === 'upsert') {
      const incoming = Array.isArray(state.payload) ? state.payload : [state.payload]
      const keys = (state.onConflict || 'id')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
      const upserted: Record<string, unknown>[] = []
      for (const item of incoming) {
        const rowIn = item as Record<string, unknown>
        if (useFirestore) {
          upserted.push(await upsertFirestoreRow(shopTable, rowIn))
          continue
        }
        const idx = table.findIndex((existing) => keys.every((key) => existing[key] === rowIn[key]))
        if (idx >= 0) {
          table[idx] = { ...table[idx], ...rowIn }
          upserted.push(table[idx])
        } else {
          const created: Record<string, unknown> = {
            created_at: new Date().toISOString(),
            ...rowIn,
            id: String(rowIn.id || newId(state.table)),
          }
          table.push(created)
          upserted.push(created)
        }
      }
      if (!useFirestore) setTable(state.table, table)
      working = upserted
    }

    working = sortRows(working, state.orders)
    if (state.limit != null) working = working.slice(0, state.limit)

    const count = working.length
    if (state.head) {
      return { data: null, error: null, count }
    }

    const relatedTables = await loadRelatedTables(state.table, state.selectSpec)
    const embedded = working
      .map((row) => embedRow(state.table, row, state.selectSpec, relatedTables))
      .filter((row): row is Record<string, unknown> => row != null)

    if (state.want === 'single') {
      if (embedded.length === 0) {
        return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, count }
      }
      return { data: embedded[0], error: null, count }
    }
    if (state.want === 'maybe') {
      return { data: embedded[0] ?? null, error: null, count }
    }
    return { data: embedded, error: null, count }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao acessar o Firestore'
    return { data: null, error: { message }, count: 0 }
  }
}

function createQuery(table: string) {
  const state: QueryState = {
    table,
    op: 'select',
    selectSpec: '*',
    countExact: false,
    head: false,
    filters: [],
    orders: [],
    want: 'many',
  }

  const builder: any = {
    select(spec = '*', opts?: { count?: string; head?: boolean }) {
      state.selectSpec = spec
      state.countExact = opts?.count === 'exact'
      state.head = Boolean(opts?.head)
      return builder
    },
    insert(payload: unknown) {
      state.op = 'insert'
      state.payload = payload
      return builder
    },
    update(payload: unknown) {
      state.op = 'update'
      state.payload = payload
      return builder
    },
    delete() {
      state.op = 'delete'
      return builder
    },
    upsert(payload: unknown, opts?: { onConflict?: string }) {
      state.op = 'upsert'
      state.payload = payload
      state.onConflict = opts?.onConflict
      return builder
    },
    eq(column: string, value: unknown) {
      state.filters.push({ type: 'eq', column, value })
      return builder
    },
    neq(column: string, value: unknown) {
      state.filters.push({ type: 'neq', column, value })
      return builder
    },
    gte(column: string, value: unknown) {
      state.filters.push({ type: 'gte', column, value })
      return builder
    },
    lte(column: string, value: unknown) {
      state.filters.push({ type: 'lte', column, value })
      return builder
    },
    not(column: string, op: string, value: unknown) {
      state.filters.push({ type: 'not', column, op, value })
      return builder
    },
    or(expr: string) {
      state.filters.push({ type: 'or', expr })
      return builder
    },
    ilike(column: string, value: string) {
      state.filters.push({ type: 'or', expr: `${column}.ilike.${value}` })
      return builder
    },
    in(column: string, values: unknown[]) {
      state.filters.push({ type: 'not', column, op: 'in', value: values })
      // "in" via inverted not is wrong. Handle as custom eq-or:
      state.filters.pop()
      state.filters.push({
        type: 'or',
        expr: values.map((value) => `${column}.eq.${value}`).join(','),
      })
      return builder
    },
    order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
      state.orders.push({
        column,
        ascending: opts?.ascending !== false,
        nullsFirst: opts?.nullsFirst,
      })
      return builder
    },
    limit(n: number) {
      state.limit = n
      return builder
    },
    single() {
      state.want = 'single'
      return builder
    },
    maybeSingle() {
      state.want = 'maybe'
      return builder
    },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(execute(state)).then(resolve, reject)
    },
  }

  return builder
}

const listeners = new Set<AuthListener>()

function emitAuth(event: string, session: DemoSession | null) {
  listeners.forEach((listener) => listener(event, session))
}

async function rpcCreateAppointment(params: Record<string, unknown>) {
  const snapshots = await loadShopSnapshots()
  const check = mockCreateAppointment(params, snapshots)
  if (!check.ok) {
    return { data: { ok: false, error: check.error }, error: null }
  }
  const row = {
    data: params.p_data,
    horario: params.p_horario,
    barbeiro_id: check.barbeiro_id,
    servico_id: params.p_servico_id,
    cliente_id: params.p_cliente_id,
    status: params.p_status || 'pendente',
    valor: params.p_valor ?? null,
    created_at: new Date().toISOString(),
  }
  if (isFirebaseConfigured()) {
    const saved = await insertFirestoreRow('agendamentos', row)
    return { data: { ok: true, id: saved.id }, error: null }
  }
  const table = getTable('agendamentos')
  const local = { id: newId('agendamentos'), ...row }
  table.push(local)
  setTable('agendamentos', table)
  return { data: { ok: true, id: local.id }, error: null }
}

async function rpcAvailableSlots(params: Record<string, unknown>) {
  const snapshots = await loadShopSnapshots()
  const slots = mockAvailableSlots(params, snapshots)
  return { data: slots.map((horario) => ({ horario })), error: null }
}

async function invokeFunction(name: string, opts?: { body?: unknown; method?: string }) {
  if (name === 'whatsapp-audio-config') {
    const method = String(opts?.method || 'POST').toUpperCase()
    const body = (opts?.body || {}) as Record<string, unknown>
    const action = String(body.action || '')
    if (method === 'GET' || !action) {
      return { data: audioConfigFromSettings(loadAudioSettings()), error: null }
    }
    if (action === 'save') {
      const saved = saveAudioSettings({
        audio_whatsapp_ativo: Boolean(body.audio_whatsapp_ativo),
        audio_whatsapp_mode: String(body.audio_whatsapp_mode || ''),
        gemini_api_key: body.gemini_api_key as string | undefined,
        elevenlabs_api_key: body.elevenlabs_api_key as string | undefined,
        elevenlabs_voice_id: body.elevenlabs_voice_id as string | undefined,
        gemini_model: body.gemini_model as string | undefined,
        elevenlabs_model: body.elevenlabs_model as string | undefined,
      })
      return {
        data: { ...audioConfigFromSettings(saved), ok: true, message: 'Configurações de áudio salvas localmente.' },
        error: null,
      }
    }
    if (action === 'test_gemini') {
      const stored = loadAudioSettings()
      const result = await testGeminiWithKey(
        String(body.gemini_api_key || stored.gemini_api_key || ''),
        String(body.gemini_model || stored.gemini_model || ''),
      )
      return { data: result, error: null }
    }
    if (action === 'test_elevenlabs') {
      const stored = loadAudioSettings()
      const result = await testElevenLabsWithKey(
        String(body.elevenlabs_api_key || stored.elevenlabs_api_key || ''),
        String(body.elevenlabs_voice_id || stored.elevenlabs_voice_id || ''),
      )
      return { data: result, error: null }
    }
    return { data: audioConfigFromSettings(loadAudioSettings()), error: null }
  }
  if (name === 'whatsapp-instance') {
    const body = (opts?.body || {}) as Record<string, unknown>
    const action = String(body.action || 'status')
    if (action === 'connect') return { data: connectWhatsAppLab(), error: null }
    if (action === 'disconnect') return { data: disconnectWhatsAppLab(), error: null }
    if (action === 'simulate_scan') return { data: simulateWhatsAppLabScan(), error: null }
    return { data: statusWhatsAppLab(), error: null }
  }
  if (name === 'barber-user-admin') {
    return { data: { ok: true, senha: 'demo1234', email: DEMO_ADMIN_USER.email, nome: 'Demo' }, error: null }
  }
  if (name === 'whatsapp-campaign') {
    return { data: { ok: true, enviados: 0, erros: 0, total: 0 }, error: null }
  }
  if (name === 'crm-dispatch') {
    return { data: { ok: true, ausencia: 0, aniversario: 0, skipped: 0, erros: [] }, error: null }
  }
  return { data: { ok: false, skipped: true, error: 'Modo demonstração: envio real bloqueado.' }, error: null }
}

export function createMockSupabaseClient() {
  return {
    from(table: string) {
      return createQuery(table)
    },
    rpc(fn: string, params: Record<string, unknown> = {}) {
      if (fn === 'create_appointment_atomic') {
        return rpcCreateAppointment(params)
      }
      if (fn === 'get_available_slots') {
        return rpcAvailableSlots(params)
      }
      return Promise.resolve({ data: null, error: { message: `RPC ${fn} indisponível no modo demo` } })
    },
    functions: {
      invoke(name: string, opts?: { body?: unknown; method?: string }) {
        return invokeFunction(name, opts)
      },
    },
    auth: {
      async getSession() {
        return { data: { session: getDemoSession() }, error: null }
      },
      async getUser() {
        const session = getDemoSession()
        return { data: { user: session?.user ?? null }, error: null }
      },
      async signInWithPassword({ email }: { email: string; password: string }) {
        const role = demoRoleFromEmail(email) ?? (email.toLowerCase().includes('barbeiro') ? 'barber' : 'admin')
        const session = setDemoSession(role as DemoRole)
        emitAuth('SIGNED_IN', session)
        return { data: { user: session.user, session }, error: null }
      },
      async signUp({ email }: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
        const user = {
          ...DEMO_ADMIN_USER,
          id: newId('user'),
          email,
        }
        return { data: { user, session: null }, error: null }
      },
      async signOut() {
        clearDemoSession()
        emitAuth('SIGNED_OUT', null)
        return { error: null }
      },
      onAuthStateChange(callback: AuthListener) {
        listeners.add(callback)
        callback('INITIAL_SESSION', getDemoSession())
        return {
          data: {
            subscription: {
              unsubscribe() {
                listeners.delete(callback)
              },
            },
          },
        }
      },
    },
  }
}

export function enterDemo(role: DemoRole) {
  const session = setDemoSession(role)
  emitAuth('SIGNED_IN', session)
  return session
}
