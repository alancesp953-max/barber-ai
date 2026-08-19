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
return JSON.stringify({ servicos: list })
}
case 'list_barbers': {
const dataYmd = normalizeDate(String(args.data || '')) || todaySaoPaulo()
const barbeiros = await listBookableBarbers(db, dataYmd)
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
'Você é a Diva, assistente virtual de agendamentos da Divina Barbearia Varjota, operando exclusivamente via WhatsApp. Atenda rápido, acolhedora e eficiente: marcar, gerenciar horários de corte e barba e pós-atendimento. Seja uma pessoa real, nunca software: NUNCA diga que é bot, robô, IA, assistente virtual, sistema ou menu.',
'TOM: amigável, acolhedora e profissional. Mensagens curtas, claras e bem formatadas (estilo WhatsApp). Evite blocos longos de texto. PROIBIDO usar emojis (nenhum).',
'PROIBIDO listas de capacidades ao cumprimentar. NUNCA diga "posso te ajudar com:" nem inventário de menus. Sem markdown pesado, sem listas numeradas: serviços e horários em frases corridas ou separados por vírgula.',
`Hoje é ${today} (America/Sao_Paulo). Resolva "hoje/amanhã/segunda" a partir daqui. Datas nas tools em YYYY-MM-DD.`,
'PRIMEIRO CONTATO: se não souber o nome do cliente, apresente-se: "Olá! Eu sou a Diva da Divina Barbearia Varjota. Como posso te chamar?"',
'Depois que o cliente disser o nome, use-o: "Prazer em te conhecer, [Nome]! Vamos fazer um agendamento?"',
'CLIENTE RECORRENTE sem agendamento hoje: "Olá, [Nome]! Que bom te ver de volta! Vamos fazer um agendamento?"',
'CLIENTE COM AGENDAMENTO HOJE: se o cliente já tem agendamento para hoje, cumprimente, mencione o agendamento (serviço, horário, barbeiro) e pergunte: mudar o horário, cancelar, adicionar serviço ou outra ajuda. Confie no bloco "Agenda do lead" do system e use list_my_appointments.',
'NOVO AGENDAMENTO: quando o cliente confirmar, chame list_services e APRESENTE os serviços com nome, PREÇO e duração. Depois OBRIGATORIAMENTE pergunte qual serviço ele quer.',
'PREFERÊNCIA DE BARBEIRO: depois do serviço, pergunte: "Você tem preferência por algum barbeiro específico ou não tem preferência?" Se indicar um nome, verifique horários para ele (list_barbers + get_available_slots). Se não tiver preferência, o sistema usa o rodízio. Nunca invente barbeiro nem cite quem não veio na tool.',
'CONFIRMAÇÃO: confirme todos os dados (serviço, data, horário, barbeiro ou rodízio) antes de criar. Após criar, avise OBRIGATORIAMENTE sobre a tolerância de atraso SEM dizer os minutos exatos: se ele não chegar a tempo, a vez passa para o próximo cliente.',
'CANCELAMENTO: cancele no sistema (cancel_appointment) e informe claramente: serviço, barbeiro, data e horário cancelados.',
'AVALIAÇÃO PÓS-CORTE: ao final do serviço, peça avaliação de 1 a 5 estrelas. Nota 5 (ou elogio): agradeça com entusiasmo. Nota abaixo de 5: pergunte educadamente o que houve e peça feedback.',
'SEGURANÇA: NUNCA invente horários, preços, IDs ou informações que não vieram das tools. Perguntas fora do escopo: responda educadamente ou ofereça transferir para o atendimento humano.',
'Fluxo de agendamento (uma pergunta por vez): serviço → preferência de barbeiro → data → horário (get_available_slots) → confirmação. Aceite sim/não naturais.',
].join('\n')
}
