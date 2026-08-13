/** Defaults oficiais da unidade (admin + bot). */
export const SHOP_DEFAULTS: Record<string, string> = {
  endereco: 'Rua Castro Monte 165, Bairro Varjota, Fortaleza',
  horario_segunda: '08:30 - 19:30',
  horario_terca: '08:30 - 19:30',
  horario_quarta: '08:30 - 19:30',
  horario_quinta: '08:30 - 19:30',
  horario_sexta: '08:30 - 19:30',
  horario_sabado: '08:30 - 19:30',
  horario_domingo: 'Fechado',
}

export function withShopDefaults(config: Record<string, any> | null | undefined): Record<string, any> {
  const base: Record<string, any> = { ...SHOP_DEFAULTS, ...(config || {}) }
  for (const [key, value] of Object.entries(SHOP_DEFAULTS)) {
    if (base[key] == null || String(base[key]).trim() === '') {
      base[key] = value
    }
  }
  return base
}
