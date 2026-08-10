# BarberAI

Painel administrativo para barbearias, com gestão de agendamentos, barbeiros, serviços, produtos, financeiro, comissões e relatórios.

## Stack

- **Frontend:** React 19, TypeScript, Vite
- **Roteamento:** TanStack Router
- **Estilo:** Tailwind CSS
- **Backend:** Supabase (Auth, Postgres, RLS)
- **i18n:** react-i18next (pt-BR)
- **Deploy:** Vercel

## Funcionalidades

- Dashboard com métricas e exportação PDF
- Agendamentos com check-in e controle de status
- Cadastro de barbeiros, serviços e produtos
- Controle de estoque e movimentações
- Financeiro (pagamentos e resumo)
- Comissões por barbeiro (serviços e vendas)
- Relatórios com gráficos e exportação PDF
- Configurações da barbearia
- **Bot WhatsApp** (UAZAPI + Edge Functions): agendar, consultar e cancelar pelo chat

## Pré-requisitos

- Node.js 20+
- Conta no [Supabase](https://supabase.com)

## Instalação

```bash
git clone https://github.com/alancesp953-max/barber-ai.git
cd barber-ai
npm install
```

Copie `.env.example` para `.env` e preencha as credenciais do Supabase:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Scripts

```bash
npm run dev      # servidor de desenvolvimento (http://localhost:5173)
npm run build    # build de produção
npm run preview  # preview do build local
npm run lint     # ESLint
```

## Rotas do admin

| Rota | Página |
|------|--------|
| `/login` | Login |
| `/admin/dashboard` | Dashboard |
| `/admin/appointments` | Agendamentos |
| `/admin/barbers` | Barbeiros |
| `/admin/services` | Serviços |
| `/admin/produtos` | Produtos |
| `/admin/financeiro` | Financeiro |
| `/admin/comissoes` | Comissões |
| `/admin/relatorios` | Relatórios |
| `/admin/configuracoes` | Configurações |

## Deploy (Vercel)

1. Importe o repositório no [Vercel](https://vercel.com)
2. Configure as variáveis de ambiente:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. O `vercel.json` já inclui o fallback SPA para rotas client-side

## WhatsApp bot (UAZAPI)

Canal: [UAZAPI](https://docs.uazapi.com/). Backend: Supabase Edge Functions + service role.

### 1. Banco

No SQL Editor do Supabase, execute:

1. `supabase/schema.sql` (base, se ainda não rodou)
2. `supabase/whatsapp.sql` — sessões, flags do bot, índice de telefone, RPC `get_available_slots`

### 2. Secrets das Edge Functions

```bash
supabase secrets set \
  UAZAPI_BASE_URL=https://SEU_SUBDOMINIO.uazapi.com \
  UAZAPI_INSTANCE_TOKEN=token_da_instancia \
  WEBHOOK_SECRET=escolha_um_segredo_longo
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem no ambiente das functions.

### 3. Deploy das functions

```bash
supabase functions deploy whatsapp-webhook --no-verify-jwt
supabase functions deploy whatsapp-send
```

- `whatsapp-webhook` — recebe mensagens da UAZAPI e roda o bot  
- `whatsapp-send` — envia texto (painel admin usa com JWT do usuário logado)

### 4. Webhook na UAZAPI

URL (com secret):

```
https://PROJECT_REF.supabase.co/functions/v1/whatsapp-webhook?secret=SEU_WEBHOOK_SECRET
```

No painel UAZAPI (ou `POST /webhook/set` com header `token`):

- Events: `messages`
- Exclude: `wasSentByApi`, mensagens de grupo (`isGroupYes`) — evita loop
- Method: POST

### 5. Ativar no painel

Em **Admin → Configurações → Bot WhatsApp**: ligue o bot. O token **não** é salvo no frontend.

### Fluxo do bot

| Opção | Ação |
|-------|------|
| 1 | Agendar (serviço → barbeiro → data → horário → confirmar) |
| 2 | Listar horários futuros |
| 3 | Cancelar agendamento |
| 0 | Menu / ajuda |

Horários livres usam `get_available_slots` + horários em Configurações.  
Ao criar agendamento no admin com telefone do cliente, o painel tenta enviar confirmação via `whatsapp-send`.

## Estrutura principal

```
src/
├── components/     # UI reutilizável (sidebar, modals, headers)
├── lib/api.ts      # funções de acesso ao Supabase (+ notify WhatsApp)
├── pages/          # páginas do admin
├── routes/         # rotas TanStack Router
├── services/       # cliente Supabase
├── types/          # tipos TypeScript
└── utils/          # utilitários (PDF, formatação)
supabase/
├── schema.sql
├── whatsapp.sql
└── functions/
    ├── whatsapp-webhook/
    ├── whatsapp-send/
    └── _shared/    # uazapi, db, cors
```

## Licença

Projeto privado.
