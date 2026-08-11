/**
 * Barber shop tools for MiMo function-calling on WhatsApp
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { findOrCreateClientByPhone, formatDateBR, parseDateBR } from './db.ts'
import type { ToolDef } from './mimo.ts'
import {
  checkSlotAvailability,
  fetchAvailableSlots,
  todaySaoPaulo,
} from './slots.ts'

export const BARBER_TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'list_services',
      description: 'Lista serviços da barbearia com preço e duração',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_barbers',
      description: 'Lista barbeiros disponíveis',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_shop_hours',
      description: 'Retorna horários de funcionamento e dados da barbearia',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_available_slots',
      description: 'Horários livres em uma data para um serviço (e opcionalmente barbeiro)',
      parameters: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Data YYYY-MM-DD ou DD/MM/AAAA' },
          servico_id: { type: 'string', description: 'UUID do serviço' },
          barbeiro_id: { type: 'string', description: 'UUID do barbeiro (opcional)' },
        },
        required: ['data', 'servico_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_appointment',
      description: 'Cria agendamento para o cliente do WhatsApp atual',
      parameters: {
        type: 'object',
        properties: {
          servico_id: { type: 'string' },
          data: { type: 'string', description: 'YYYY-MM-DD ou DD/MM' },
          horario: { type: 'string', description: 'HH:MM' },
          barbeiro_id: { type: 'string', description: 'opcional' },
          cliente_nome: { type: 'string', description: 'nome do cliente se souber' },
        },
        required: ['servico_id', 'data', 'horario'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_my_appointments',
      description: 'Lista agendamentos futuros do cliente do telefone atual',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'Cancela agendamento pelo id',
      parameters: {
        type: 'object',
        properties: {
          agendamento_id: { type: 'string' },
        },
        required: ['agendamento_id'],
      },
    },
  },
]

function normalizeDate(input: string): string | null {
  if (!input) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input
  return parseDateBR(input)
}

export async function runBarberTool(
  db: SupabaseClient,
  phone: string,
  name: string,
  argsJson: string,
  senderName?: string,
): Promise<string> {
  let args: Record<string, unknown> = {}
  try {
    args = argsJson ? JSON.parse(argsJson) : {}
  } catch {
    return JSON.stringify({ error: 'arguments JSON inválido' })
  }

  try {
    switch (name) {
      case 'list_services': {
        const { data, error } = await db
          .from('servicos')
          .select('id, nome, preco, duracao_minutos')
          .order('nome')
        if (error) return JSON.stringify({ error: error.message })
        const list = (data || []).map((s) => ({
          id: s.id,
          nome: s.nome,
          preco: Number(s.preco),
          duracao_minutos: s.duracao_minutos,
        }))
        return JSON.stringify({ servicos: list })
      }

      case 'list_barbers': {
        const { data, error } = await db.from('barbeiros').select('id, nome').order('nome')
        if (error) return JSON.stringify({ error: error.message })
        return JSON.stringify({
          barbeiros: (data || []).map((b) => ({ id: b.id, nome: b.nome })),
        })
      }

      case 'get_shop_hours': {
        const { data, error } = await db.from('configuracoes').select('*').eq('id', 1).maybeSingle()
        if (error) return JSON.stringify({ error: error.message })
        const c = data || {}
        return JSON.stringify({
          nome: c.nome_barbearia,
          whatsapp: c.whatsapp,
          telefone: c.telefone,
          endereco: c.endereco,
          horarios: {
            segunda: c.horario_segunda,
            terca: c.horario_terca,
            quarta: c.horario_quarta,
            quinta: c.horario_quinta,
            sexta: c.horario_sexta,
            sabado: c.horario_sabado,
            domingo: c.horario_domingo,
          },
        })
      }

      case 'get_available_slots': {
        const data = normalizeDate(String(args.data || ''))
        const servico_id = String(args.servico_id || '')
        const barbeiro_id = args.barbeiro_id ? String(args.barbeiro_id) : null
        if (!data || !servico_id) {
          return JSON.stringify({ error: 'data e servico_id são obrigatórios' })
        }
        const { slots: horarios, error } = await fetchAvailableSlots(db, data, servico_id, barbeiro_id)
        if (error) {
          return JSON.stringify({
            data,
            data_br: formatDateBR(data),
            horarios,
            aviso: `rpc: ${error}`,
          })
        }
        return JSON.stringify({
          data,
          data_br: formatDateBR(data),
          barbeiro_id,
          horarios,
          dica:
            horarios.length === 0
              ? 'Sem horários livres (ocupados ou já passaram no dia de hoje). Peça outra data ou barbeiro.'
              : 'Só liste horários desta lista ao cliente. Horários passados não aparecem.',
        })
      }

      case 'create_appointment': {
        const servico_id = String(args.servico_id || '')
        const data = normalizeDate(String(args.data || ''))
        const horario = String(args.horario || '').slice(0, 5)
        let barbeiro_id = args.barbeiro_id ? String(args.barbeiro_id) : null
        if (!servico_id || !data || !horario) {
          return JSON.stringify({ error: 'servico_id, data e horario são obrigatórios' })
        }
        const check = await checkSlotAvailability(db, {
          data,
          servicoId: servico_id,
          horario,
          barbeiroId: barbeiro_id,
        })
        if (!check.ok) {
          return JSON.stringify({ error: check.message, ok: false })
        }
        barbeiro_id = check.barbeiro_id
        const nome = args.cliente_nome ? String(args.cliente_nome) : senderName
        const client = await findOrCreateClientByPhone(db, phone, nome)
        const { data: appt, error } = await db
          .from('agendamentos')
          .insert({
            cliente_id: client.id,
            servico_id,
            barbeiro_id,
            data,
            horario,
            status: 'pendente',
          })
          .select('id, data, horario, status, barbeiro_id')
          .single()
        if (error) return JSON.stringify({ error: error.message })
        return JSON.stringify({
          ok: true,
          agendamento: {
            id: appt.id,
            data: appt.data,
            data_br: formatDateBR(String(appt.data)),
            horario: String(appt.horario).slice(0, 5),
            status: appt.status,
            barbeiro_id: appt.barbeiro_id,
            barbeiro_nome: check.barbeiro_nome,
          },
          mensagem: 'Agendamento criado com sucesso',
        })
      }

      case 'list_my_appointments': {
        const client = await findOrCreateClientByPhone(db, phone, senderName)
        const today = todaySaoPaulo()
        const { data, error } = await db
          .from('agendamentos')
          .select('id, data, horario, status, servicos(nome), barbeiros(nome)')
          .eq('cliente_id', client.id)
          .in('status', ['pendente', 'confirmado'])
          .gte('data', today)
          .order('data', { ascending: true })
          .order('horario', { ascending: true })
        if (error) return JSON.stringify({ error: error.message })
        const list = (data || []).map((a) => {
          const serv = Array.isArray(a.servicos) ? a.servicos[0] : a.servicos
          const barb = Array.isArray(a.barbeiros) ? a.barbeiros[0] : a.barbeiros
          return {
            id: a.id,
            data: a.data,
            data_br: formatDateBR(String(a.data)),
            horario: String(a.horario).slice(0, 5),
            status: a.status,
            servico: serv?.nome || null,
            barbeiro: barb?.nome || null,
          }
        })
        return JSON.stringify({ agendamentos: list })
      }

      case 'cancel_appointment': {
        const id = String(args.agendamento_id || '')
        if (!id) return JSON.stringify({ error: 'agendamento_id obrigatório' })
        const client = await findOrCreateClientByPhone(db, phone, senderName)
        const { data: existing } = await db
          .from('agendamentos')
          .select('id, cliente_id, status')
          .eq('id', id)
          .maybeSingle()
        if (!existing) return JSON.stringify({ error: 'Agendamento não encontrado' })
        if (existing.cliente_id !== client.id) {
          return JSON.stringify({ error: 'Este agendamento não pertence a este telefone' })
        }
        const { error } = await db.from('agendamentos').update({ status: 'cancelado' }).eq('id', id)
        if (error) return JSON.stringify({ error: error.message })
        return JSON.stringify({ ok: true, mensagem: 'Agendamento cancelado' })
      }

      default:
        return JSON.stringify({ error: `tool desconhecida: ${name}` })
    }
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
  }
}

export function systemPromptBarber(): string {
  const today = todaySaoPaulo()
  return [
    'Você é o assistente virtual da barbearia no WhatsApp (BarberAI).',
    'Fale em português do Brasil, de forma curta, amigável e objetiva.',
    'Use as ferramentas para consultar serviços, horários, criar e cancelar agendamentos.',
    'Nunca invente IDs de serviço/barbeiro — sempre busque com as tools.',
    'Datas: aceite DD/MM e converta; ao chamar tools use data no formato YYYY-MM-DD quando possível.',
    `Hoje é ${today} (fuso America/Sao_Paulo).`,
    'Fluxo de agendamento: (1) list_services (2) list_barbers — se só houver 1, use-o sem perguntar; se vários, deixe o cliente escolher (3) data (4) get_available_slots com barbeiro_id quando souber (5) criar com create_appointment.',
    'Nunca ofereça horários que a tool não retornou. Horários do passado no dia de hoje não existem na lista.',
    'Se create_appointment ou get_available_slots indicar conflito, avise claramente que aquele barbeiro não tem o horário e ofereça alternativas.',
    'Não invente disponibilidade. Não marque em cima de horário ocupado.',
    'Se faltar dado, pergunte em uma mensagem curta.',
    'Respostas no WhatsApp: sem markdown pesado; use *negrito* e listas simples se precisar.',
    'Se o cliente mandar só "oi" ou "menu", apresente opções: agendar, ver horários, cancelar, horários da loja.',
  ].join('\n')
}
