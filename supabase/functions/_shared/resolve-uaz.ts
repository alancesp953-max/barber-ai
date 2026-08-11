/**
 * Resolve UAZAPI base URL + instance token from secrets / DB.
 * Prefer whatsapp_secrets + configuracoes when env host is missing or a UUID.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { getUazapiConfig, type UazapiConfig } from './uazapi.ts'

function normalizeBase(url: string): string {
  let base = url.trim().replace(/\/$/, '')
  if (!base) return ''
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`
  return base
}

function isUuidHost(baseUrl: string): boolean {
  try {
    const host = new URL(normalizeBase(baseUrl)).hostname
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(host)
  } catch {
    return false
  }
}

export async function resolveUazConfig(
  db?: SupabaseClient,
): Promise<{ config?: UazapiConfig; error?: string; source?: string }> {
  let envToken = (Deno.env.get('UAZAPI_INSTANCE_TOKEN') || '').trim()
  let envBase = normalizeBase(Deno.env.get('UAZAPI_BASE_URL') || '')
  let dbBase = ''
  let dbToken = ''
  let source = 'secret'

  if (db) {
    try {
      const { data: cfg } = await db
        .from('configuracoes')
        .select('uazapi_base_url')
        .eq('id', 1)
        .maybeSingle()
      dbBase = normalizeBase(String(cfg?.uazapi_base_url || ''))

      const { data: sec } = await db
        .from('whatsapp_secrets')
        .select('instance_token, base_url')
        .eq('id', 1)
        .maybeSingle()
      if (sec?.instance_token) dbToken = String(sec.instance_token).trim()
      if (sec?.base_url) {
        const b = normalizeBase(String(sec.base_url))
        if (b) dbBase = b
      }
    } catch {
      /* ignore */
    }
  }

  let baseUrl = envBase
  if (dbBase && (!envBase || isUuidHost(envBase) || (!envBase.includes('uazapi.com') && dbBase.includes('uazapi.com')))) {
    baseUrl = dbBase
    source = 'db'
  } else if (!baseUrl && dbBase) {
    baseUrl = dbBase
    source = 'db'
  }

  let token = envToken
  if (dbToken) {
    token = dbToken
    source = source === 'db' ? 'db' : 'db+secret'
  }

  if (!token) {
    return { error: 'UAZAPI_INSTANCE_TOKEN ausente (secret ou whatsapp_secrets).' }
  }
  if (!baseUrl) {
    return { error: 'UAZAPI_BASE_URL ausente (secret ou whatsapp_secrets / configuracoes).' }
  }
  if (isUuidHost(baseUrl)) {
    return {
      error: `UAZAPI_BASE_URL inválida (${baseUrl}). Use https://barberai.uazapi.com`,
    }
  }

  try {
    const config = getUazapiConfig({ baseUrl, token })
    return { config, source }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
