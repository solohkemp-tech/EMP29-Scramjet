// SPDX-License-Identifier: AGPL-3.0-only
import { randomBytes, scryptSync, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export async function verifyPassword(password, hash) {
  const [method, salt, expected] = String(hash).split(':');
  if (method !== 'scrypt' || !/^[a-f\d]{32}$/.test(salt) || !/^[a-f\d]{128}$/.test(expected) || typeof password !== 'string' || password.length > 512) return false;
  const bytes = await derive(password, salt, 64);
  return timingSafeEqual(bytes, Buffer.from(expected, 'hex'));
}
export function parseCookie(headers) {
  for (const item of (headers.cookie ?? '').split(';')) {
    const [key, ...rest] = item.trim().split('=');
    if (key === 'emp29_session') return rest.join('=');
  }
  return '';
}
export class Sessions {
  constructor(ttl = 12 * 60 * 60 * 1000) { this.ttl = ttl; this.tokens = new Map(); }
  create() {
    this.prune();
    if (this.tokens.size >= 1000) this.tokens.delete(this.tokens.keys().next().value);
    const token = randomBytes(32).toString('hex'); this.tokens.set(token, Date.now() + this.ttl); return token;
  }
  valid(token) { return /^[a-f\d]{64}$/.test(token) && (this.tokens.get(token) ?? 0) > Date.now(); }
  delete(token) { this.tokens.delete(token); }
  prune() { for (const [token, expires] of this.tokens) if (expires <= Date.now()) this.tokens.delete(token); }
}
export class RateLimit {
  constructor(limit, windowMs, maxKeys = 5000) { this.limit = limit; this.window = windowMs; this.maxKeys = maxKeys; this.entries = new Map(); }
  take(key) {
    const now = Date.now(); let entry = this.entries.get(key);
    if (!entry || entry.expires <= now) {
      if (this.entries.size >= this.maxKeys) {
        for (const [k, v] of this.entries) if (v.expires <= now) this.entries.delete(k);
        if (this.entries.size >= this.maxKeys) this.entries.delete(this.entries.keys().next().value);
      }
      entry = { count: 0, expires: now + this.window }; this.entries.set(key, entry);
    }
    return ++entry.count <= this.limit;
  }
}
