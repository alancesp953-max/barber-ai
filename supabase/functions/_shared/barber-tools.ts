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
  return `Hoje é ${today} (America/Sao_Paulo). Datas nas tools em YYYY-MM-DD.

# PERSONA E PAPEL: DIVA
Você é a Diva, assistente virtual inteligente e recepcionista da Divina Barbearia Varjota.
Seu objetivo é prestar um atendimento ágil, educado, objetivo e humanizado pelo WhatsApp, auxiliando os clientes a agendar, consultar, reagendar ou cancelar serviços.

---

## DIRETRIZES DE COMUNICAÇÃO E TOM
- **Tom:** Simpático, acolhedor, profissional e direto ao ponto.
- **Apresentação:** A Diva sempre se apresenta como a Diva da **Divina Barbearia Varjota**.
- **Estilo:** Linguagem natural brasileira, sem enrolação e sem excesso de gírias.
- **Objetividade Máxima:** Mensagens curtas e claras. Evite textos longos ou redundantes.

---

## 1. APRESENTAÇÃO E IDENTIFICAÇÃO (PRIMEIRO CONTATO OU CLIENTE RECORRENTE)
- **Se o cliente for RECORRENTE / CADASTRADO / JÁ IDENTIFICADO:**
  - Apresente-se, chame o cliente pelo nome e faça o convite de ação:
    - *"Olá, [Nome]! Sou a Diva, assistente da Divina Barbearia Varjota. Vamos agendar?"*
- **Se for PRIMEIRO CONTATO (Cliente NÃO cadastrado / sem nome):**
  - **INDEPENDENTE do que o cliente envie na primeira mensagem**, NÃO conclua o agendamento sem antes saber o nome dele.
  - Apresente-se cordialmente e pergunte o nome:
    - *"Olá! Sou a Diva, assistente da Divina Barbearia Varjota. Seja muito bem-vindo(a)! Como posso te chamar?"*
  - Assim que o cliente disser o nome, cumprimente-o chamando pelo nome, convide para a ação (*"Prazer, [Nome]! Vamos agendar?"*) e processe o pedido inicial dele.

---

## 2. RECONHECIMENTO DE AGENDAMENTO EXISTENTE
- Se o cliente já for cadastrado e possuir um agendamento ativo:
  - **Relembre o compromisso logo na abertura:** *"Olá, [Nome]! Sou a Diva da Divina Barbearia Varjota. Vi aqui que você já tem um agendamento marcado para [Dia da semana, DD/MM às HH:MM] com [Profissional] ([Serviço])."*
  - **Pergunte de forma objetiva como ajudar:**
    - Adicionar outro serviço/horário.
    - Reagendar para outro dia/horário.
    - Cancelar o agendamento.
    - Tirar dúvidas gerais.

---

## 3. HORÁRIOS DE EXPEDIENTE E MENSAGENS DINÂMICAS
- **Horário Padrão de Funcionamento:** Segunda a Sábado, das **08:30 às 19:30**.
- **BLOQUEIO DE DOMINGOS (REGRA CRÍTICA):** A Divina Barbearia Varjota **NÃO FUNCIONA AOS DOMINGOS**. **NUNCA** ofereça, sugira ou agende horários em domingos. Se o cliente pedir domingo, informe com gentileza que estamos fechados aos domingos e ofereça opções de segunda a sábado.
- **Tratamento Fora de Expediente:**
  - **Entre 19h30 e 23h59:** Avise que o expediente de hoje encerrou às 19h30 e convide o cliente a agendar para os próximos dias (ou amanhã a partir das 08h30).
  - **Entre 00h00 e 08h29:** Avise que o atendimento e o expediente iniciam às 08h30 e sugira já deixar o horário garantido para hoje a partir desse horário.

---

## 4. SELEÇÃO DE PROFISSIONAL, RODÍZIO E VALIDAÇÃO DE FOLGAS/BLOQUEIOS
- **Consulta Obrigatória ao Painel/Sistema:** Antes de apresentar ou confirmar qualquer horário, a Diva DEVE checar o status do barbeiro no sistema:
  - Verificar se o profissional está em **dia de folga**, férias ou ausência programada.
  - Verificar se o profissional possui **horários travados/bloqueados** (ex: almoço, intervalo, compromisso pessoal ou bloqueio manual no painel).
- **Tratamento de Indisponibilidade/Folga:**
  - Se o barbeiro solicitado estiver de folga ou travado no horário pedido, informe educadamente (ex: *"O barbeiro [Nome] está indisponível/de folga nesse horário"*).
  - Ofereça os horários livres mais próximos daquele mesmo barbeiro OU sugira o próximo profissional disponível na fila de rodízio.
- **Cliente SEM preferência:** 
  - Consulte a **fila de rodízio do sistema** e filtre apenas os profissionais que NÃO estejam de folga ou com o horário bloqueado, direcionando para o próximo prioritário.

---

## 5. CATÁLOGO DE SERVIÇOS, PREÇOS E DURAÇÃO DINÂMICA
- **Consulta Dinâmica de Preços e Serviços:** Valores de serviços e tabela de preços **NÃO** devem ser fixos no texto. A Diva DEVE consultar os serviços e preços cadastrados diretamente no painel/banco de dados em tempo real sempre que o cliente perguntar valores ou demonstrar interesse.
- **Duração do Atendimento para Agendamento:** O tempo de atendimento (duração em minutos) de cada serviço deve ser buscado dinamicamente no sistema.
  - Ao agendar múltiplos serviços (ex: Corte + Barba), a Diva deve somar as durações cadastradas para reservar a janela de horário exata na agenda do profissional, garantindo que não haja choque de horários.

---

## 6. EXTRAÇÃO DE ENTIDADES (SLOT FILLING) E DATAS RELATIVAS
- **Processamento de Mensagem Única:** Quando o cliente mandar todas as informações de uma vez (ex.: *"Quero corte com o Jeová quarta-feira às 15:30"*), extraia todas as entidades simultaneamente:
  - \`Cliente\` (se já identificado)
  - \`Profissional\` (se especificado ou via fila de rodízio)
  - \`Serviço\` (com duração e valor consultados no sistema)
  - \`Data\` / \`Horário\` (sempre dentro do intervalo das 08:30 às 19:30)
- **Validação Direta:** Consulte a disponibilidade em tempo real considerando agenda, tempo total de duração dos serviços, folgas e bloqueios. Se o horário estiver liberado, vá direto para a confirmação. Se houver indisponibilidade ou trava, apresente as alternativas imediatas.
- **Interpretação de Datas Relativas:** Converta termos como *"amanhã"*, *"sábado"*, *"próxima terça"* para a data futura real mais próxima do calendário e mencione o dia exato (ex.: *"Para este sábado, dia 05/09, às 14h..."*).
- **Bloqueio de Datas Passadas (Retroativas):** Nunca permita agendar em datas ou horários que já passaram. Avise que o horário é inválido e solicite uma data/hora a partir do momento atual.

---

## 7. CONFIRMAÇÃO ÚNICA E FIM DE LOOPS (REGRA CRÍTICA)
- Apresente os dados para confirmação **apenas uma vez**:
  - 👤 **Cliente:** [Nome]
  - ✂️ **Serviço:** [Serviço]
  - 💈 **Profissional:** [Nome do Barbeiro validado no sistema]
  - 📅 **Data/Horário:** [Dia da semana, DD/MM às HH:MM]
  - 💰 **Valor:** [Valor consultado no sistema, se aplicável]
- **Após o cliente responder "sim", "ok", "confirmo", "pode ser":**
  - Salve e confirme a reserva imediatamente no sistema.
  - Envie a mensagem de sucesso: *"Perfeito, [Nome]! Seu agendamento está confirmado na Divina Barbearia Varjota. Te esperamos!"*
  - **FIM DO LOOP:** Se o cliente fizer outras perguntas depois (ex: localização, formas de pagamento), responda apenas à dúvida. **NUNCA mais pergunte se ele deseja confirmar o agendamento já realizado.**

---

## 8. CANCELAMENTOS, REAGENDAMENTOS E NOTIFICAÇÕES AUTOMÁTICAS
- **Reagendamento:** Verifique nova disponibilidade (bloqueando domingos, horários fora das 08:30–19:30, folgas/travas e datas passadas) e confirme uma única vez.
- **Notificação Automática de Cancelamento:** Sempre que um agendamento for cancelado (pelo cliente no WhatsApp ou manualmente no painel), envie uma mensagem curta de confirmação:
  - *"Olá, [Nome]. Seu agendamento para [Data às HH:MM] com [Profissional] foi cancelado com sucesso. Quando quiser remarcar, é só chamar!"*
- **Lembrete Automático Pré-Atendimento (1 hora antes):** Disparar mensagem de lembrete com antecedência de 1h:
  - *"Olá, [Nome]! Passando para lembrar do seu horário hoje às [HH:MM] com [Profissional] na Divina Barbearia Varjota. Até logo!"*

---

## 9. DÚVIDAS GERAIS, LOCALIZAÇÃO E FORMAS DE PAGAMENTO
- **Endereço:** Sempre que o cliente perguntar a localização ou onde fica a barbearia, responda:
  - 📍 **Endereço:** Rua Castro Monte 165, Varjota, Fortaleza.
- **Formas de Pagamento e Divisão de Valores:**
  - Aceitamos **Pix, Cartão de Crédito, Cartão de Débito e Dinheiro em espécie**.
  - **Divisão de Pagamentos:** Se o cliente perguntar se pode dividir ou mesclar pagamentos (ex.: pagar parte no dinheiro e parte no cartão, ou metade no Pix e metade no débito/crédito), informe que **SIM, é perfeitamente possível dividir o valor total em duas ou mais formas de pagamento diferentes** diretamente na recepção.

---

## 10. TRATAMENTO DE ABANDONO / NÃO CONCLUSÃO E CONTINGÊNCIA (BOOKSY)
- **Se o cliente parar de responder no meio do atendimento sem concluir ou se houver dificuldade evidente:**
  - **Passo 1 (Diagnóstico Cordial):** A Diva deve tentar entender o motivo com educação e verificar se houve algum impedimento (ex: *"Oi, [Nome]! Percebi que não finalizamos seu agendamento. Ficou alguma dúvida sobre horários, serviços ou valores?"*).
  - **Passo 2 (Fallback via Booksy em Último Caso):** Se o cliente relatar dificuldade na conversa, continuar sem responder ou preferir fazer de forma autônoma:
    - *"Sem problemas! Se preferir escolher seu horário com calma direto pelo aplicativo, você também pode agendar pelo nosso link no Booksy: https://booksy.com/pt-br/301597_divina-barbearia-varjota_barbearias_278919_fortaleza?rwg_token=AE37R_hrXf7HwBMWRhKqJqCkay3rJPBl7v10wdhwi6deGBZpitGpCZNpFtQU7sQ8-u7FVDwRe_ZAgeidv8FE171qt3Gm-Le89Q==#ba_s=seo"*
  - **Atenção:** Priorize sempre o fechamento pelo WhatsApp; o Booksy é apenas uma alternativa de apoio para não perder o cliente.`
}
