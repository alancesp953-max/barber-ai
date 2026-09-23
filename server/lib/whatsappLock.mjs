/** Local lab: never contact the official UAZAPI / shop WhatsApp number. */
export const LOCAL_WHATSAPP_LOCK = true

export const OFFICIAL_INSTANCE_BLOCKED = 'uazapi_oficial_bloqueada_no_laboratorio'

export function sendWhatsAppOfficial(_payload) {
  return {
    sent: false,
    blocked: true,
    channel: OFFICIAL_INSTANCE_BLOCKED,
    reason:
      'Laboratório local isolado: qualquer disparo ativo para o WhatsApp oficial da barbearia está bloqueado.',
  }
}

export function assertLocalIsolation() {
  if (!LOCAL_WHATSAPP_LOCK) {
    throw new Error('Lock local do WhatsApp oficial deve permanecer ativo neste servidor.')
  }
  return sendWhatsAppOfficial()
}
