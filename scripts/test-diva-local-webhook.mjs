import assert from 'node:assert/strict'

const BASE = process.env.DIVA_LOCAL_URL || 'http://localhost:8787'

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  assert.equal(res.ok, true, `${path} HTTP ${res.status} ${JSON.stringify(data)}`)
  return data
}

const health = await (await fetch(`${BASE}/health`)).json()
assert.equal(health.ok, true)
assert.equal(health.whatsappOficial, 'bloqueado')
console.log('health', health)

const greeting = await post('/test/webhook', {
  sessionId: 'unit_sem_nome',
  text: 'Quero cortar o cabelo amanhã às 10h',
})
assert.equal(
  greeting.reply,
  'Olá! Seja bem-vindo à Divina Barbearia da Varjota. Como posso te chamar?',
)
assert.equal(greeting.gravou, false)
assert.equal(greeting.outbound.blocked, true)
console.log('saudação sem nome: ok')

const named = await post('/test/webhook', {
  sessionId: 'unit_joao',
  nome: 'João',
  text: 'Quero cortar o cabelo amanhã às 10h',
})
assert.match(named.reply, /João/)
assert.equal(named.outbound.blocked, true)
const toolNames = named.tools.map((item) => item.name)
assert.ok(toolNames.includes('listar_servicos'))
assert.ok(toolNames.includes('consultar_disponibilidade'))
assert.ok(toolNames.includes('obter_proximo_barbeiro_rodizio'))
console.log('consulta com nome:', named.reply)

const sunday = await post('/test/webhook', {
  sessionId: 'unit_domingo',
  nome: 'João',
  text: 'Quero cortar o cabelo domingo às 10h',
})
assert.match(sunday.reply.toLowerCase(), /domingo/)
assert.equal(sunday.gravou, false)
console.log('domingo bloqueado: ok')

const servicos = await (await fetch(`${BASE}/tools/servicos`)).json()
assert.equal(servicos.servicos.length, 9)
assert.ok(servicos.servicos.some((row) => row.nome === 'Corte de Cabelo' && row.preco === 40))
const rodizio = await (await fetch(`${BASE}/tools/rodizio`)).json()
assert.equal(rodizio.barbeiro.nome, 'Marcos Correia')
console.log('cadastro oficial: 9 serviços, fila começa em Marcos Correia')

console.log('test-diva-local-webhook: passou')
