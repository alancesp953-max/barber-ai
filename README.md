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
- Funções de API para agente WhatsApp (agendamento, disponibilidade, estoque)

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

## Estrutura principal

```
src/
├── components/     # UI reutilizável (sidebar, modals, headers)
├── lib/api.ts      # funções de acesso ao Supabase
├── pages/          # páginas do admin
├── routes/         # rotas TanStack Router
├── services/       # cliente Supabase
├── types/          # tipos TypeScript
└── utils/          # utilitários (PDF, formatação)
```

## Licença

Projeto privado.
