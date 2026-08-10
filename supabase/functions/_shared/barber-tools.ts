/**
 * Barber shop tools for MiMo function-calling on WhatsApp
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { findOrCreateClientByPhone, formatDateBR, parseDateBR } from './db.ts'
import type { ToolDef } from './mimo.ts'

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
        const { data: slots, error } = await db.rpc('get_available_slots', {
          p_data: data,
          p_servico_id: servico_id,
          p_barbeiro_id: barbeiro_id,
        })
        if (error) {
          // fallback: simple free times
          const hours = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00']
          const { data: busy } = await db
            .from('agendamentos')
            .select('horario')
            .eq('data', data)
            .in('status', ['pendente', 'confirmado'])
          const taken = new Set((busy || []).map((b) => String(b.horario).slice(0, 5)))
          return JSON.stringify({
            data,
            data_br: formatDateBR(data),
            horarios: hours.filter((h) => !taken.has(h)),
            aviso: `rpc falhou: ${error.message}; fallback simples`,
          })
        }
        const horarios = ((slots as { horario: string }[]) || []).map((s) => String(s.horario).slice(0, 5))
        return JSON.stringify({ data, data_br: formatDateBR(data), horarios })
      }

      case 'create_appointment': {
        const servico_id = String(args.servico_id || '')
        const data = normalizeDate(String(args.data || ''))
        const horario = String(args.horario || '').slice(0, 5)
        const barbeiro_id = args.barbeiro_id ? String(args.barbeiro_id) : null
        if (!servico_id || !data || !horario) {
          return JSON.stringify({ error: 'servico_id, data e horario são obrigatórios' })
        }
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
          .select('id, data, horario, status')
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
          },
          mensagem: 'Agendamento criado com sucesso',
        })
      }

      case 'list_my_appointments': {
        const client = await findOrCreateClientByPhone(db, phone, senderName)
        const today = new Date().toISOString().slice(0, 10)
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
  const today = new Date().toISOString().slice(0, 10)
  return [
    'Você é o assistente virtual da barbearia no WhatsApp (BarberAI).',
    'Fale em português do Brasil, de forma curta, amigável e objetiva.',
    'Use as ferramentas para consultar serviços, horários, criar e cancelar agendamentos.',
    'Nunca invente IDs de serviço/barbeiro — sempre busque com as tools.',
    'Datas: aceite DD/MM e converta; ao chamar tools use data no formato YYYY-MM-DD quando possível.',
    `Hoje é ${today}.`,
    'Para agendar: descubra serviço, data, horário (e barbeiro se o cliente quiser) e confirme com create_appointment.',
    'Se faltar dado, pergunte em uma mensagem curta.',
    'Respostas no WhatsApp: sem markdown pesado; use *negrito* e listas simples se precisar.',
    'Se o cliente mandar só "oi" ou "menu", apresente opções: agendar, ver horários, cancelar, horários da loja.',
  ].join('\n')
}
