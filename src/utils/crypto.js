// src/utils/crypto.js
// Encrypts third-party API keys before they're stored in client_channels.
// Uses AES-256-GCM with a key derived from CREDENTIALS_SECRET (.env).
// Never store client channel credentials in plaintext.

const crypto = require('crypto');

function getKey() {
  const secret = process.env.CREDENTIALS_SECRET;
  if (!secret) {
    throw new Error(
      'CREDENTIALS_SECRET is not set. Add a long random value to .env before storing any client channel credentials.'
    );
  }
  return crypto.createHash('sha256').update(secret).digest(); // 32 bytes
}

function encrypt(plainTextObj) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const json = JSON.stringify(plainTextObj);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decrypt(payloadB64) {
  const key = getKey();
  const raw = Buffer.from(payloadB64, 'base64');
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

module.exports = { encrypt, decrypt };
