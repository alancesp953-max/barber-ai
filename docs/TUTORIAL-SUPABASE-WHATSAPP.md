# Tutorial Supabase — Bot WhatsApp (BarberAI / UAZAPI)

Guia passo a passo **só no Supabase** para o projeto  
`PROJETO BARBEARIA AGENDAMENTO/FINANCEIRO` (`tikxzkkjdyocxdcuzgqv`).

Dashboard:  
https://supabase.com/dashboard/project/tikxzkkjdyocxdcuzgqv

---

## Visão geral

No Supabase precisamos de 4 coisas:

1. **SQL** — tabelas/funções do bot  
2. **Edge Functions** — webhook e envio de mensagens  
3. **Secrets** — URL e token da UAZAPI + secret do webhook  
4. **Configuração no banco** — bot ativo (flag admin)

O WhatsApp em si é na UAZAPI; o Supabase só recebe webhook e grava/consulta a agenda.

```text
WhatsApp → UAZAPI → Edge Function (whatsapp-webhook) → Postgres
                 ← UAZAPI ← Edge Function (resposta texto)
```

---

## 1. Abrir o projeto certo

1. Entre em [supabase.com/dashboard](https://supabase.com/dashboard)
2. Selecione a organização onde está o projeto
3. Abra: **PROJETO BARBEARIA AGENDAMENTO/FINANCEIRO**
4. Confira o **Project URL** (Settings → API):  
   `https://tikxzkkjdyocxdcuzgqv.supabase.co`

> Use a conta com papel **Owner** ou **Administrator**. Contas com menos permissão não gravam Secrets.

---

## 2. Rodar o SQL do WhatsApp

### 2.1 Pelo Dashboard (recomendado se não usa CLI)

1. Menu lateral → **SQL Editor**
2. **New query**
3. Abra o arquivo do repositório: [`supabase/whatsapp.sql`](./whatsapp.sql)
4. Cole **todo** o conteúdo e clique em **Run**

Isso cria/atualiza:

| Objeto | Função |
|--------|--------|
| Colunas em `configuracoes` | `whatsapp_bot_ativo`, `uazapi_base_url` |
| Tabela `whatsapp_sessions` | passo da conversa por telefone |
| Índice em `clientes.telefone` | busca por WhatsApp |
| Função `get_available_slots(...)` | horários livres |

### 2.2 Pela CLI (opcional)

```bash
cd caminho/do/projeto
npx supabase login
npx supabase link --project-ref tikxzkkjdyocxdcuzgqv
npx supabase db query --linked -f supabase/whatsapp.sql
```

### 2.3 Conferir se o SQL rodou

No **SQL Editor**, execute:

```sql
-- Colunas do bot
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'configuracoes'
  AND column_name IN ('whatsapp_bot_ativo', 'uazapi_base_url');

-- Tabela de sessão
SELECT to_regclass('public.whatsapp_sessions') AS whatsapp_sessions;

-- RPC de horários
SELECT to_regprocedure('public.get_available_slots(date,uuid,uuid)') AS get_available_slots;
```

**Esperado:** 2 colunas, `whatsapp_sessions` e o nome da função (não nulo).

---

## 3. Deploy das Edge Functions

### 3.1 Pela CLI

```bash
cd caminho/do/projeto
npx supabase link --project-ref tikxzkkjdyocxdcuzgqv

npx supabase functions deploy whatsapp-webhook --no-verify-jwt
npx supabase functions deploy whatsapp-send
npx supabase functions deploy whatsapp-instance
```

| Function | JWT | Uso |
|----------|-----|-----|
| `whatsapp-webhook` | **desligado** (`--no-verify-jwt`) | recebe mensagem da UAZAPI |
| `whatsapp-send` | **ligado** | envio usado pelo painel admin (usuário logado) |
| `whatsapp-instance` | **ligado** | QR code / status / desconectar (`POST /instance/connect`, `GET /instance/status`) |

### 3.2 QR code no painel Admin

Com Secrets configurados e a function `whatsapp-instance` deployada:

1. Abra o app → **Admin → Configurações**
2. Seção **Bot WhatsApp (UAZAPI)**
3. Clique em **Gerar / renovar QR code**
4. No celular: WhatsApp → **Aparelhos conectados** → **Conectar um aparelho** → escaneie o QR no painel
5. O status atualiza automaticamente até ficar **connected**

A function chama a API UAZAPI:

- `POST {UAZAPI_BASE_URL}/instance/connect` (sem `phone` → QR em base64)
- `GET {UAZAPI_BASE_URL}/instance/status`
- `POST {UAZAPI_BASE_URL}/instance/disconnect`

### 3.5 IA MiMo no bot WhatsApp

O `whatsapp-webhook` usa **Xiaomi MiMo** (`mimo-v2.5-pro`) com *function calling* para:

- listar serviços / barbeiros / horários da loja  
- consultar slots livres  
- criar e cancelar agendamentos  
- listar horários do cliente  

Config (tabela `whatsapp_secrets`, só service role, ou secrets Edge):

| Campo / Secret | Exemplo |
|----------------|---------|
| `mimo_api_key` / `MIMO_API_KEY` | token `tp-...` |
| `mimo_base_url` / `MIMO_BASE_URL` | `https://token-plan-sgp.xiaomimimo.com/v1` |
| `mimo_model` / `MIMO_MODEL` | `mimo-v2.5-pro` |

SQL: `supabase/whatsapp_mimo.sql`  

Se a IA falhar, o menu numérico clássico (1/2/3) continua como fallback.

### 3.6 Conferir no Dashboard

1. Menu → **Edge Functions**
2. Deve aparecer:
   - `whatsapp-webhook` — **Active**
   - `whatsapp-send` — **Active**
   - `whatsapp-instance` — **Active**

### 3.4 Teste rápido do webhook

No navegador ou terminal:

```text
GET https://tikxzkkjdyocxdcuzgqv.supabase.co/functions/v1/whatsapp-webhook
```

Resposta esperada:

```json
{"ok":true,"service":"whatsapp-webhook"}
```

---

## 4. Configurar Secrets (obrigatório)

1. Dashboard → **Project Settings** (engrenagem)  
   **ou** Edge Functions → **Secrets** / Manage secrets  
2. Atalho direto:  
   https://supabase.com/dashboard/project/tikxzkkjdyocxdcuzgqv/settings/functions  
3. Em **Secrets**, adicione:

| Nome | O que colocar | Exemplo |
|------|----------------|---------|
| `UAZAPI_BASE_URL` | URL da API da sua instância (sem `/` no final) | `https://meu-subdominio.uazapi.com` |
| `UAZAPI_INSTANCE_TOKEN` | Token da instância (header `token` da UAZAPI) | `abc123...` |
| `WEBHOOK_SECRET` | Segredo longo aleatório (você define; repete na URL do webhook) | veja valor gerado abaixo |

**Secret sugerido (já gerado para este setup):**

```text
WEBHOOK_SECRET=7a0fe40886faf6cfe8322cc926b80a8e12f7e815983057405eceaded95024e64
```

> **Não** coloque o token da UAZAPI no Vite / `.env` do frontend. Só nos Secrets das Edge Functions.

### Pela CLI (conta Owner)

```bash
npx supabase secrets set ^
  UAZAPI_BASE_URL=https://SEU_SUBDOMINIO.uazapi.com ^
  UAZAPI_INSTANCE_TOKEN=SEU_TOKEN ^
  WEBHOOK_SECRET=7a0fe40886faf6cfe8322cc926b80a8e12f7e815983057405eceaded95024e64
```

Para listar (só nomes/hashes, não o valor real):

```bash
npx supabase secrets list
```

---

## 5. Ativar o bot no banco (config admin)

1. **SQL Editor** → nova query:

```sql
UPDATE configuracoes
SET whatsapp_bot_ativo = true
WHERE id = 1;

SELECT id, whatsapp_bot_ativo, uazapi_base_url, whatsapp
FROM configuracoes
WHERE id = 1;
```

2. `whatsapp_bot_ativo` deve ser `true`.

(Opcional no admin do app: **Configurações → Bot WhatsApp → Bot ativo = Sim**.)

---

## 6. URL do webhook (para colar na UAZAPI)

Com o `WEBHOOK_SECRET` dos Secrets:

```text
https://tikxzkkjdyocxdcuzgqv.supabase.co/functions/v1/whatsapp-webhook?secret=7a0fe40886faf6cfe8322cc926b80a8e12f7e815983057405eceaded95024e64
```

Na UAZAPI (fora do Supabase, mas necessário):

- Method: **POST**
- Events: **messages**
- Exclude: **wasSentByApi**, mensagens de **grupo**
- Enabled: **sim**

Isso **não** se configura dentro do Supabase — só a URL aponta para o Supabase.

---

## 7. Logs e diagnóstico no Supabase

### Logs da function

1. **Edge Functions** → `whatsapp-webhook` → **Logs**
2. Envie uma mensagem no WhatsApp e veja se chega request

### Logs de `whatsapp-send`

1. **Edge Functions** → `whatsapp-send` → **Logs**
2. Crie um agendamento no admin com telefone do cliente

### Erros comuns

| Problema | Onde olhar no Supabase |
|----------|-------------------------|
| `401 Unauthorized` no webhook | `?secret=` ≠ `WEBHOOK_SECRET` |
| Function not found | Redeploy em Edge Functions |
| Bot não processa (200 mas sem reply) | Secrets UAZAPI faltando; Logs da function |
| Sem horários no bot | Tabela `configuracoes.horario_*` e RPC `get_available_slots` |
| `whatsapp_bot_ativo = false` | SQL do passo 5 |

Exemplo para testar a RPC (substitua o UUID de um serviço real):

```sql
SELECT * FROM get_available_slots(
  CURRENT_DATE + 1,
  'uuid-de-um-servico'::uuid,
  NULL
);
```

---

## 8. Checklist Supabase

- [ ] Projeto `tikxzkkjdyocxdcuzgqv` aberto com conta **Owner**
- [ ] SQL `supabase/whatsapp.sql` executado sem erro
- [ ] Colunas `whatsapp_bot_ativo` e `uazapi_base_url` existem
- [ ] Tabela `whatsapp_sessions` existe
- [ ] Função `get_available_slots` existe
- [ ] Function `whatsapp-webhook` Active, JWT off
- [ ] Function `whatsapp-send` Active
- [ ] GET health do webhook retorna `ok: true`
- [ ] Secrets: `UAZAPI_BASE_URL`, `UAZAPI_INSTANCE_TOKEN`, `WEBHOOK_SECRET`
- [ ] `whatsapp_bot_ativo = true`
- [ ] URL do webhook (com secret) configurada na UAZAPI

---

## 9. Ordem recomendada (resumo)

1. SQL (`whatsapp.sql`)  
2. Deploy das 2 Edge Functions  
3. Secrets (3 variáveis)  
4. `UPDATE configuracoes SET whatsapp_bot_ativo = true`  
5. Colar URL do webhook na UAZAPI  
6. Testar: GET health + mensagem `0` no WhatsApp  

Depois disso o restante é cadastro no app (serviços, barbeiros, horários) em **Admin → Configurações / Serviços**.
