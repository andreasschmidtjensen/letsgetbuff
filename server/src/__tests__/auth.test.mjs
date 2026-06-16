/**
 * Unit tests for verifyWerkzeugHash — Node built-in test runner.
 * Run: node --test server/src/__tests__/auth.test.mjs
 *
 * Hashes generated with Werkzeug for password 'testpassword123'.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, pbkdf2Sync, scryptSync, timingSafeEqual } from 'node:crypto'

function verifyWerkzeugHash(storedHash, password) {
  try {
    const dollarIdx = storedHash.indexOf('$')
    if (dollarIdx === -1) return false
    const method = storedHash.slice(0, dollarIdx)
    const rest = storedHash.slice(dollarIdx + 1)
    const secondDollar = rest.indexOf('$')
    if (secondDollar === -1) return false
    const salt = rest.slice(0, secondDollar)
    const expected = rest.slice(secondDollar + 1)
    let computed

    if (method.startsWith('pbkdf2:')) {
      const parts = method.split(':')
      if (parts.length !== 3) return false
      const hashName = parts[1]
      const iterations = parseInt(parts[2], 10)
      if (isNaN(iterations) || iterations < 1) return false
      const keylen = createHash(hashName).digest().length
      computed = pbkdf2Sync(password, salt, iterations, keylen, hashName).toString('hex')

    } else if (method.startsWith('scrypt:')) {
      const parts = method.split(':')
      if (parts.length !== 4) return false
      const N = parseInt(parts[1], 10)
      const r = parseInt(parts[2], 10)
      const p = parseInt(parts[3], 10)
      if ([N, r, p].some(n => isNaN(n) || n < 1)) return false
      const keylen = Buffer.from(expected, 'hex').length
      const maxmem = 128 * N * r * p + 1024 * 1024
      computed = scryptSync(password, salt, keylen, { N, r, p, maxmem }).toString('hex')

    } else {
      return false
    }

    const computedBuf = Buffer.from(computed, 'hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    if (computedBuf.length !== expectedBuf.length) return false
    return timingSafeEqual(computedBuf, expectedBuf)
  } catch {
    return false
  }
}

const SCRYPT_HASH = 'scrypt:32768:8:1$gDTSxbOUTsPcW8rB$1d826206b1873f2e7eadd6d573560ba7a9e18b932539256d79c4d3f9e95da4ef46e3fd26ea6ad4efa91fdb220f9028f968c2e5a19c2d13ab546cb3ee70c0436b'
const PBKDF2_HASH = 'pbkdf2:sha256:1000000$m9RRVon6AAusbZcV$94f11356d9a42447e9275b05f136db84d557ad15611633f6c2fa7bc94c405d33'
const CORRECT_PW = 'testpassword123'
const WRONG_PW = 'wrongpassword'

test('scrypt: correct password verifies', () => {
  assert.equal(verifyWerkzeugHash(SCRYPT_HASH, CORRECT_PW), true)
})

test('scrypt: wrong password is rejected', () => {
  assert.equal(verifyWerkzeugHash(SCRYPT_HASH, WRONG_PW), false)
})

test('pbkdf2:sha256: correct password verifies', () => {
  assert.equal(verifyWerkzeugHash(PBKDF2_HASH, CORRECT_PW), true)
})

test('pbkdf2:sha256: wrong password is rejected', () => {
  assert.equal(verifyWerkzeugHash(PBKDF2_HASH, WRONG_PW), false)
})

test('malformed hash returns false', () => {
  assert.equal(verifyWerkzeugHash('notahash', CORRECT_PW), false)
  assert.equal(verifyWerkzeugHash('', CORRECT_PW), false)
  assert.equal(verifyWerkzeugHash('unknown:method$salt$hash', CORRECT_PW), false)
})
