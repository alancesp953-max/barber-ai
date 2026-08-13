/**
 * Barber shop tools for MiMo function-calling on WhatsApp
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  fetchShopPublicInfo,
  findOrCreateClientByPhone,
  formatDateBR,
  isKnownLeadName,
  parseDateBR,
} from './db.ts'
import type { ToolDef } from './mimo.ts'
import {
  checkSlotAvailability,
  fetchAvailableSlots,
  rotateBarberQueue,
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
      description:
        'Retorna endereço e horários de funcionamento da barbearia. Use quando o cliente perguntar onde fica, endereço, localização, funcionamento, que horas abre/fecha.',
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
        const { data, error } = await db.from('barbeiros').select('id, nome').eq('ativo', true).order('ordem_rodizio').order('nome')
        if (error) {
          const { data: fallback, error: err2 } = await db.from('barbeiros').select('id, nome').order('nome')
          if (err2) return JSON.stringify({ error: err2.message })
          return JSON.stringify({
            barbeiros: (fallback || []).map((b) => ({ id: b.id, nome: b.nome })),
          })
        }
        return JSON.stringify({
          barbeiros: (data || []).map((b) => ({ id: b.id, nome: b.nome })),
        })
      }

      case 'get_shop_hours': {
        const info = await fetchShopPublicInfo(db)
        return JSON.stringify({
          nome: info.nome,
          endereco: info.endereco,
          horarios: info.horarios,
          resumo: info.resumo,
          dica: 'Responda em prosa natural com endereço e funcionamento (seg–sáb 08h30–19h30; domingo fechado).',
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
        const nome = args.cliente_nome && isKnownLeadName(String(args.cliente_nome))
          ? String(args.cliente_nome)
          : (senderName && isKnownLeadName(senderName) ? senderName : undefined)
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
        if (check.from_rotation && barbeiro_id) {
          try {
            await rotateBarberQueue(db, barbeiro_id)
          } catch (e) {
            console.warn('rotateBarberQueue', e)
          }
        }
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
    'Você é alguém da recepção da barbearia no WhatsApp — uma pessoa real, não software.',
    'PROIBIDO se apresentar como: bot, robô, IA, assistente virtual, assistente, sistema, aplicativo ou menu.',
    'PROIBIDO emojis (nenhum).',
    'PROIBIDO listas de capacidades ao cumprimentar. NUNCA diga "posso te ajudar com:" nem inventário de menus.',
    'Cumprimento: se o system disser o nome do lead, use-o. Se não souber o nome, peça com naturalidade ("qual é o seu nome?").',
    'Nunca assuma o nome do perfil do WhatsApp como se fosse o nome real — confie só no nome salvo / o que o cliente disser.',
    'Exemplo BOM no oi (já com nome): "Oi, João! Tudo bem? Aqui é da barbearia. Como podemos ajudá-lo?"',
    'Exemplo RUIM: inventar nome do WhatsApp ou se apresentar como assistente virtual.',
    'Fale português do Brasil, curto, natural, educado.',
    'Use as ferramentas para serviços, barbeiros, slots, criar e cancelar. Nunca invente IDs nem horários.',
    'Se perguntarem endereço, onde fica, localização, funcionamento ou que horas abre/fecha: use get_shop_hours e responda com o resumo (não invente).',
    'Endereço oficial: Rua Castro Monte 165, Bairro Varjota, Fortaleza. Funcionamento: segunda a sábado, 08h30 às 19h30; domingo fechado.',
    'Sempre considere se o cliente já tem agendamento: use list_my_appointments quando precisar (e confie no bloco "Agenda do lead" do system se existir).',
    'Se o lead JÁ tiver horário marcado: reconheça em linguagem natural e ofereça opções relevantes (ver, remarcar cancelando o atual e criando outro, ou cancelar) — sem lista numerada e sem se dizer assistente.',
    'Se ele pedir para marcar e já tiver um horário, avise e pergunte se quer outro mesmo assim ou alterar o que já está.',
    'CONTEXTO: use o histórico. Não repita pergunta se o cliente já respondeu.',
    'Entenda gíria e mensagens curtas ("amanhã 15h", "cancela o de sexta").',
    `Hoje é ${today} (America/Sao_Paulo). Resolva "hoje/amanhã/segunda" a partir daqui. Datas nas tools em YYYY-MM-DD.`,
    'Fluxo de agendamento (uma pergunta por vez): serviço → SEMPRE pergunte se o cliente quer ser atendido por algum barbeiro em específico (use list_barbers; diga os nomes e ofereça também "qualquer um" / sem preferência) → data → get_available_slots com barbeiro_id se escolheu → create_appointment.',
    'Nunca pule a pergunta de preferência de barbeiro quando houver mais de um. Se só houver um, pergunte se pode ser com ele.',
    'Uma pergunta por vez se faltar dado. Confirma em prosa: "posso marcar?" Aceite sim/não naturais.',
    'Sem markdown pesado. Sem listas numeradas. Serviços e horários pelo nome/hora em frases corridas ou separados por vírgula.',
  ].join('\n')
}
