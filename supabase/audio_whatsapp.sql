-- Audio WhatsApp config — columns on whatsapp_secrets
ALTER TABLE whatsapp_secrets
  ADD COLUMN IF NOT EXISTS gemini_api_key TEXT,
  ADD COLUMN IF NOT EXISTS elevenlabs_api_key TEXT,
  ADD COLUMN IF NOT EXISTS elevenlabs_voice_id TEXT DEFAULT '21m00Tcm4TlvDq8ikWAM',
  ADD COLUMN IF NOT EXISTS audio_whatsapp_ativo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS audio_whatsapp_mode TEXT DEFAULT 'texto',
  ADD COLUMN IF NOT EXISTS gemini_model TEXT DEFAULT 'gemini-3.6-flash',
  ADD COLUMN IF NOT EXISTS elevenlabs_model TEXT DEFAULT 'eleven_multilingual_v2',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Audio config on configuracoes (toggle + safe fields visible from browser)
ALTER TABLE configuracoes
  ADD COLUMN IF NOT EXISTS audio_whatsapp_ativo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS audio_whatsapp_mode TEXT DEFAULT 'texto';