/**
 * One-time entity secret registration for Helm / Circle developer-controlled wallets.
 * Run with: bun scripts/register-entity-secret.ts
 * NEVER commit this output. NEVER print the secret value.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { registerEntitySecretCiphertext, initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'

const apiKey = process.env.CIRCLE_API_KEY
if (!apiKey) {
  console.error('CIRCLE_API_KEY is not set in .env')
  process.exit(1)
}

// 1. Generate secret (captured in memory, never printed)
const entitySecret = crypto.randomBytes(32).toString('hex')

// 2. Ensure recovery dir exists under app root (user-downloadable location)
const recoveryDir = '/home/user/app/.circle'
fs.mkdirSync(recoveryDir, { recursive: true })

// 3. Register ciphertext with Circle
console.log('Registering entity secret ciphertext with Circle…')
const response = await registerEntitySecretCiphertext({
  apiKey,
  entitySecret,
  recoveryFileDownloadPath: recoveryDir,
})

// 4. Persist recovery file
const recoveryPath = path.join(recoveryDir, 'recovery_file.dat')
if (response.data?.recoveryFile) {
  fs.writeFileSync(recoveryPath, response.data.recoveryFile)
  console.log('Recovery file written to .circle/recovery_file.dat')
} else {
  console.warn('Warning: no recovery file content in response — check Circle dashboard.')
}

// 5. Write secret to .env
const envPath = '/home/user/app/.env'
fs.appendFileSync(envPath, `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`, 'utf-8')
console.log('CIRCLE_ENTITY_SECRET written to .env')

// 6. Verify registration with a read call
console.log('Verifying registration…')
const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })
await client.listWalletSets({ pageSize: 1 })
console.log('Verification OK — entity secret is registered and active.')
console.log('STATUS=SUCCESS')
