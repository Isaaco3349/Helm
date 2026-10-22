/**
 * Generates a new entity secret and produces a 684-char RSA-OAEP ciphertext
 * ready to paste into Circle Console "New entity secret ciphertext" field.
 * Raw secret is written ONLY to .env — never printed.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'

const apiKey = process.env.CIRCLE_API_KEY
if (!apiKey) { console.error('CIRCLE_API_KEY not set'); process.exit(1) }

// 1. Fetch Circle's RSA public key
const res = await fetch('https://api.circle.com/v1/w3s/config/entity/publicKey', {
  headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
})
const json = await res.json() as { data?: { publicKey?: string } }
const publicKeyPem = json?.data?.publicKey
if (!publicKeyPem) {
  console.error('Failed to fetch public key:', JSON.stringify(json))
  process.exit(1)
}

// 2. Generate 32-byte secret (hex = 64 chars) — never printed
const entitySecret = crypto.randomBytes(32).toString('hex')

// 3. Encrypt with RSA-OAEP + SHA-256 using Circle's 4096-bit public key
const encrypted = crypto.publicEncrypt(
  {
    key: publicKeyPem,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256',
  },
  Buffer.from(entitySecret, 'hex'),   // encrypt raw bytes, not the hex string
)
const ciphertext = encrypted.toString('base64')

// 4. Validate length — Circle console requires exactly 684 chars
console.log(`Ciphertext length: ${ciphertext.length} chars (need 684)`)
if (ciphertext.length !== 684) {
  console.error(`ERROR: Got ${ciphertext.length} chars — key may not be 4096-bit RSA. Check Circle public key.`)
  process.exit(1)
}

// 5. Write secret to .env (not printed)
const envPath = '/home/user/app/.env'
const current = fs.readFileSync(envPath, 'utf-8')
if (current.includes('CIRCLE_ENTITY_SECRET=')) {
  fs.writeFileSync(envPath, current.replace(/CIRCLE_ENTITY_SECRET=[^\n]*/g, `CIRCLE_ENTITY_SECRET=${entitySecret}`))
} else {
  fs.appendFileSync(envPath, `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`)
}

// 6. Print ONLY the ciphertext
console.log('\n=== PASTE THIS INTO "New entity secret ciphertext" ===')
console.log(ciphertext)
console.log('=== END CIPHERTEXT ===\n')
console.log('New entity secret saved to .env. Complete the reset in Circle Console, then reply here.')
