/**
* Barber shop tools for MiMo function-calling on WhatsApp
*/
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  fetchShopPublicInfo,
  findOrCreateClientByPhone,
  formatDateBR,
  formatServicePriceList,
  getSession,
  isKnownLeadName,
  parseDateBR,
  punctualityConfirmText,
  saveSession,
} from './db.ts'
import type { ToolDef } from './mimo.ts'
import {
createAppointmentAtomic,
fetchAvailableSlots,
listBookableBarbers,
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
description:
'Lista barbeiros na escala na data (padrão: hoje). Exclui quem está de folga/bloqueio cobrindo o expediente. Passe data se o cliente perguntou de outro dia.',
parameters: {
type: 'object',
properties: {
data: { type: 'string', description: 'YYYY-MM-DD ou DD/MM/AAAA (opcional; default hoje)' },
},
additionalProperties: false,
},
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
          .select('id, nome, preco, duracao_minutos, ativo')
          .order('nome')
        if (error) return JSON.stringify({ error: error.message })
        const list = (data || [])
          .filter((s: { ativo?: boolean }) => s.ativo !== false)
          .map((s) => ({
            id: s.id,
            nome: s.nome,
            preco: Number(s.preco),
            duracao_minutos: s.duracao_minutos,
          }))
        return JSON.stringify({
          servicos: list,
          tabela: formatServicePriceList(list),
          dica: 'Envie EXATAMENTE o campo tabela ao cliente. Prefixo: "vou lhe enviar as opções de serviços abaixo". Não invente preço. Não use lista numerada.',
        })
      }
case 'list_barbers': {
const dataYmd = normalizeDate(String(args.data || '')) || todaySaoPaulo()
const barbeiros = await listBookableBarbers(db, dataYmd)
try {
  const sess = await getSession(db, phone)
  await saveSession(db, phone, sess.step || 'chat', {
    last_barbers: barbeiros,
    last_barbers_data: dataYmd,
  })
} catch {
  /* ignore */
}
return JSON.stringify({
data: dataYmd,
data_br: formatDateBR(dataYmd),
barbeiros,
dica:
barbeiros.length === 0
? 'Nenhum barbeiro na escala nesta data (folga/bloqueio). Não cite nomes de quem não está nesta lista.'
: 'SÓ mencione estes nomes. Quem está de folga/bloqueio NÃO aparece e NÃO deve ser citado nem sugerido.',
})
}
case 'get_shop_hours': {
const info = await fetchShopPublicInfo(db)
return JSON.stringify({
nome: info.nome,
endereco: info.endereco,
horarios: info.horarios,
resumo: info.resumo,
dica: `Responda em prosa natural usando EXATAMENTE estes horários salvos (não invente 08h00 nem outro horário). Resumo: ${info.resumo}`,
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
        try {
          await saveSession(db, phone, (await getSession(db, phone)).step || 'chat', {
            last_slots: horarios,
            last_slots_data: data,
            last_slots_servico_id: servico_id,
            last_slots_barbeiro_id: barbeiro_id,
          })
        } catch {
          /* ignore */
        }
const primeiro = horarios[0] || null
const ultimo = horarios.length ? horarios[horarios.length - 1] : null
return JSON.stringify({
data,
data_br: formatDateBR(data),
barbeiro_id,
horarios,
primeiro_horario: primeiro,
ultimo_horario: ultimo,
dica:
horarios.length === 0
? 'Sem horários livres (ocupados, fora do funcionamento salvo em Configurações, ou já passaram no dia de hoje). Peça outra data ou barbeiro.'
: `SÓ liste horários desta lista. O primeiro disponível é ${primeiro} (não diga que abre às 08:00 se a lista não começar assim).`,
})
}
case 'create_appointment': {
const servico_id = String(args.servico_id || '')
const data = normalizeDate(String(args.data || ''))
const horario = String(args.horario || '').slice(0, 5)
const barbeiro_id = args.barbeiro_id ? String(args.barbeiro_id) : null
if (!servico_id || !data || !horario) {
return JSON.stringify({ error: 'servico_id, data e horario são obrigatórios' })
}
try {
  const sess = await getSession(db, phone)
  const lastSlots = Array.isArray(sess.context.last_slots)
    ? (sess.context.last_slots as string[]).map((h) => String(h).slice(0, 5))
    : []
  if (lastSlots.length && !lastSlots.includes(horario)) {
    return JSON.stringify({
      error: 'Horário fora da última lista de vagas. Chame get_available_slots de novo.',
      horarios: lastSlots,
      ok: false,
    })
  }
} catch {
  /* ignore */
}
const nome =
args.cliente_nome && isKnownLeadName(String(args.cliente_nome))
? String(args.cliente_nome)
: senderName && isKnownLeadName(senderName)
? senderName
: undefined
const client = await findOrCreateClientByPhone(db, phone, nome)
const booked = await createAppointmentAtomic(db, {
clienteId: client.id,
servicoId: servico_id,
data,
horario,
barbeiroId: barbeiro_id,
useRotation: !barbeiro_id,
})
if (!booked.ok) {
return JSON.stringify({ error: booked.error, ok: false })
}
return JSON.stringify({
ok: true,
agendamento: {
id: booked.id,
data: booked.data,
data_br: formatDateBR(String(booked.data)),
horario: booked.horario,
status: 'pendente',
barbeiro_id: booked.barbeiro_id,
barbeiro_nome: booked.barbeiro_nome,
},
        mensagem: punctualityConfirmText(),
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
    'Você é a Diva da Divina Barbearia da Varjota no WhatsApp. Pessoa real, nunca software. NUNCA diga que é bot, robô, IA, assistente virtual, sistema ou menu.',
    'Ao se apresentar use EXATAMENTE: "Eu sou a Diva da Divina Barbearia da Varjota". CTA: "vamos agendar?" (nunca "como posso ajudar?").',
    'Ao listar serviços: primeiro "vou lhe enviar as opções de serviços abaixo" e depois cole o campo tabela da tool list_services, sem mudar nomes nem preços.',
    'TOM: amigável, curto, WhatsApp. PROIBIDO emojis. Sem markdown pesado, sem listas numeradas de menu.',
    `Hoje é ${today} (America/Sao_Paulo). Datas nas tools em YYYY-MM-DD.`,
    'NOME: só peça o nome no PRIMEIRO contato, se o system disser que ainda não está confirmado E o passo NÃO for agenda. NUNCA peça nome no meio de horário/barbeiro/confirmação. Nunca grave intenção nem nome de barbeiro como nome do cliente.',
    'PRIMEIRO CONTATO (sem passo de agenda): "Olá! Eu sou a Diva da Divina Barbearia da Varjota. Qual é o seu nome?"',
    'Depois do nome: "Prazer em te conhecer, [Nome]! Vamos agendar?"',
    'CLIENTE RECORRENTE: "Olá, [Nome]! Que bom te ver de volta! Vamos agendar?"',
    'FORA DO EXPEDIENTE: se o system disser que a loja está fechada, avise que o expediente de hoje já encerrou e ofereça agendar para amanhã ou outra data. Não encerre o papo.',
    'CLIENTE COM AGENDAMENTO HOJE: mencione serviço, horário e barbeiro e pergunte se quer mudar, cancelar ou marcar outro. Use list_my_appointments.',
    'NOVO AGENDAMENTO: list_services e envie a tabela. Depois pergunte qual serviço.',
    'PREFERÊNCIA DE BARBEIRO: use list_barbers com a data. SÓ cite nomes da tool. Folga ou dia fechado na escala = oculto.',
    'CONFIRMAÇÃO: confirme serviço, data, horário e barbeiro. Depois de criar, envie OBRIGATORIAMENTE o campo mensagem da tool (pontualidade) sem inventar minutos de atraso.',
    'CANCELAMENTO: cancele no sistema e informe serviço, barbeiro, data e horário.',
    'AVALIAÇÃO: após o corte, peça nota de 1 a 5.',
    'SEGURANÇA: NUNCA invente horários, preços, IDs ou nomes de barbeiro. Só use o que veio nas tools. Uma pergunta por vez. Se o system disser PASSO TRAVADO, não mude de assunto nem peça o nome.',
  ].join('\n')
}
