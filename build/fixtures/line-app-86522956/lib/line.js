const crypto = require('crypto')

const REPLY_API_URL = 'https://api.line.me/v2/bot/message/reply'

function createSignature(body, channelSecret) {
  return crypto.createHmac('sha256', channelSecret).update(body).digest('base64')
}

function isValidSignature(body, signature, channelSecret) {
  if (!signature || !channelSecret) return false

  const expected = Buffer.from(createSignature(body, channelSecret))
  const received = Buffer.from(signature)

  return expected.length === received.length && crypto.timingSafeEqual(expected, received)
}

function createReply(event) {
  if (event.type !== 'message' || event.message?.type !== 'text' || !event.replyToken) {
    return null
  }

  return {
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: event.message.text }],
  }
}

async function sendReply(reply, channelAccessToken, fetchImpl = fetch) {
  const response = await fetchImpl(REPLY_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(reply),
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`LINE reply API returned ${response.status}: ${details}`)
  }
}

module.exports = {
  createReply,
  createSignature,
  isValidSignature,
  sendReply,
}
