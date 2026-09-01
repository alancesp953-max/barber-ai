-- Remove políticas permissivas antigas que OR-am com o RLS da agenda do barbeiro
DROP POLICY IF EXISTS "Permitir leitura pública" ON agendamentos;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar" ON agendamentos;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar" ON agendamentos;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir" ON agendamentos;
DROP POLICY IF EXISTS agendamentos_all_authenticated ON agendamentos;
DROP POLICY IF EXISTS delete_agendamentos_auth ON agendamentos;
DROP POLICY IF EXISTS "Leitura pública para agendamentos" ON agendamentos;
