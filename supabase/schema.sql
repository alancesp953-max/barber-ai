-- BarberAI schema — run in Supabase SQL Editor

CREATE TABLE clientes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  telefone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE barbeiros (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  telefone TEXT,
  especialidades TEXT[],
  avaliacao DECIMAL(3, 2) DEFAULT 5.0,
  foto_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE servicos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  preco DECIMAL(10, 2) NOT NULL,
  duracao_minutos INTEGER NOT NULL
);

CREATE TABLE agendamentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  data DATE NOT NULL,
  horario TIME NOT NULL,
  barbeiro_id UUID REFERENCES barbeiros(id),
  servico_id UUID REFERENCES servicos(id),
  cliente_id UUID REFERENCES clientes(id),
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado', 'cancelado', 'concluido')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE barbeiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura pública para clientes" ON clientes
  FOR SELECT USING (true);

CREATE POLICY "Leitura pública para barbeiros" ON barbeiros
  FOR SELECT USING (true);

CREATE POLICY "Leitura pública para serviços" ON servicos
  FOR SELECT USING (true);

CREATE POLICY "Leitura pública para agendamentos" ON agendamentos
  FOR SELECT USING (true);

CREATE POLICY "Escrita autenticada para agendamentos" ON agendamentos
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Painel admin: escrita completa para usuários autenticados
CREATE POLICY "Escrita autenticada para clientes" ON clientes
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Escrita autenticada para barbeiros" ON barbeiros
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Escrita autenticada para serviços" ON servicos
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Escrita autenticada admin agendamentos" ON agendamentos
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Exclusão autenticada agendamentos" ON agendamentos
  FOR DELETE USING (auth.role() = 'authenticated');

CREATE INDEX idx_agendamentos_barbeiro ON agendamentos(barbeiro_id);
CREATE INDEX idx_agendamentos_data ON agendamentos(data);
CREATE INDEX idx_agendamentos_cliente ON agendamentos(cliente_id);

CREATE TABLE produtos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  preco DECIMAL(10, 2) NOT NULL,
  estoque INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura pública para produtos" ON produtos
  FOR SELECT USING (true);

CREATE POLICY "Escrita autenticada para produtos" ON produtos
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
