const { isValidSignature } = require('./line')

const MAX_BODY_SIZE = 1024 * 1024
const DEFAULT_FORWARD_TIMEOUT_MS = 8000
const SUPABASE_WEBHOOK_ENV = 'SUPABASE_LINE_WEBHOOK_URL'
const DEFAULT_SUPABASE_LINE_WEBHOOK_URL = 'https://qjaywadzvwvcspdsjxth.supabase.co/functions/v1/line-todo-webhook'

function jsonResult(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  }
}

function getHeader(headers, name) {
  const target = String(name).toLowerCase()
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() === target) return value
  }
  return undefined
}

function isPlausibleLineSignature(signature) {
  const value = String(signature || '').trim()
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return false

  try {
    return Buffer.from(value, 'base64').length === 32
  } catch {
    return false
  }
}

function resolveSupabaseWebhookUrl(env = process.env) {
  const configured = String(env?.[SUPABASE_WEBHOOK_ENV] || '').trim()
  const value = configured || DEFAULT_SUPABASE_LINE_WEBHOOK_URL

  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:'
      || !url.hostname
      || url.username
      || url.password
      || url.hash
    ) {
      return ''
    }
    return url.toString()
  } catch {
    return ''
  }
}

function getMissingConfiguration(env = process.env) {
  const missing = []
  if (!String(env?.LINE_CHANNEL_SECRET || '').trim()) {
    missing.push('LINE_CHANNEL_SECRET')
  }
  if (!resolveSupabaseWebhookUrl(env)) missing.push(SUPABASE_WEBHOOK_ENV)
  return missing
}

async function forwardToSupabase({
  rawBody,
  signature,
  forwardUrl,
  contentType = 'application/json',
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_FORWARD_TIMEOUT_MS,
}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is not available')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetchImpl(forwardUrl, {
      method: 'POST',
      headers: {
        'content-type': contentType,
        'x-line-signature': signature,
      },
      body: rawBody,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

async function handleLineWebhookRequest({
  method = 'GET',
  headers = {},
  rawBody = Buffer.alloc(0),
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_FORWARD_TIMEOUT_MS,
} = {}) {
  const normalizedMethod = String(method || 'GET').toUpperCase()
  const missing = getMissingConfiguration(env)

  if (normalizedMethod === 'GET') {
    return jsonResult(missing.length ? 503 : 200, {
      ok: missing.length === 0,
      service: 'LINE webhook forwarder',
      upstream: 'Supabase line-todo-webhook',
      configured: missing.length === 0,
      missing,
    })
  }

  if (normalizedMethod !== 'POST') {
    return jsonResult(405, { error: 'Method not allowed' }, { allow: 'GET, POST' })
  }

  const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || '')
  if (bodyBuffer.length > MAX_BODY_SIZE) {
    return jsonResult(413, { error: 'Request body is too large' })
  }

  const signature = getHeader(headers, 'x-line-signature')
  if (!isPlausibleLineSignature(signature)) {
    return jsonResult(401, { error: 'Invalid signature' })
  }

  if (missing.length) {
    return jsonResult(500, { error: 'Webhook forwarder is not configured' })
  }

  if (!isValidSignature(bodyBuffer, signature, env.LINE_CHANNEL_SECRET)) {
    return jsonResult(401, { error: 'Invalid signature' })
  }

  try {
    JSON.parse(bodyBuffer.toString('utf8'))
  } catch {
    return jsonResult(400, { error: 'Invalid JSON' })
  }

  try {
    const upstream = await forwardToSupabase({
      rawBody: bodyBuffer,
      signature,
      forwardUrl: resolveSupabaseWebhookUrl(env),
      contentType: getHeader(headers, 'content-type') || 'application/json',
      fetchImpl,
      timeoutMs,
    })

    if (!upstream?.ok) {
      console.error(`Supabase LINE webhook returned status ${upstream?.status || 'unknown'}`)
      return jsonResult(502, { error: 'Supabase webhook rejected event' })
    }

    return jsonResult(200, {
      ok: true,
      forwarded: true,
      upstream: 'supabase',
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      console.error('Supabase LINE webhook forward timed out')
      return jsonResult(504, { error: 'Supabase webhook timed out' })
    }

    console.error('Unable to forward LINE webhook:', error?.message || 'unknown error')
    return jsonResult(502, { error: 'Unable to forward webhook' })
  }
}

module.exports = {
  DEFAULT_FORWARD_TIMEOUT_MS,
  DEFAULT_SUPABASE_LINE_WEBHOOK_URL,
  MAX_BODY_SIZE,
  SUPABASE_WEBHOOK_ENV,
  forwardToSupabase,
  getHeader,
  getMissingConfiguration,
  handleLineWebhookRequest,
  isPlausibleLineSignature,
  resolveSupabaseWebhookUrl,
}
