-- Endereço e funcionamento oficiais da unidade
UPDATE configuracoes
SET
  endereco = COALESCE(NULLIF(TRIM(endereco), ''), 'Rua Castro Monte 165, Bairro Varjota, Fortaleza'),
  horario_segunda = '08:30 - 19:30',
  horario_terca = '08:30 - 19:30',
  horario_quarta = '08:30 - 19:30',
  horario_quinta = '08:30 - 19:30',
  horario_sexta = '08:30 - 19:30',
  horario_sabado = '08:30 - 19:30',
  horario_domingo = 'Fechado',
  updated_at = NOW()
WHERE id = 1;
