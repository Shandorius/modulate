import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

const TOKEN_KEY = 'auth.token';
const DEVICE_KEY = 'device.id';
const INSTANCE_KEY = 'server.url';
const PREFIX = 'modulate_';

/**
 * Web uses the existing cookie session. Native bearer tokens and the
 * self-hosted instance URL live in the iOS Keychain / Android Keystore.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  private readonly _token = signal<string | null>(null);
  private readonly _instanceUrl = signal<string>('');
  private loaded = false;
  private secureReady: Promise<void> | null = null;

  readonly token = this._token.asReadonly();
  readonly instanceUrl = this._instanceUrl.asReadonly();

  get native(): boolean {
    return Capacitor.isNativePlatform();
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    if (!this.native) {
      this._token.set(localStorage.getItem('modulate.auth.token'));
      return;
    }

    try {
      await this.ensureSecure();
      const secure = await this.secureGet(TOKEN_KEY);
      if (secure) this._token.set(secure);
      const instance = await this.secureGet(INSTANCE_KEY);
      if (instance) this._instanceUrl.set(this.normalizeUrl(instance));
    } catch {
      this._token.set(null);
    }
  }

  async set(token: string): Promise<void> {
    this._token.set(token);
    if (!this.native) {
      localStorage.setItem('modulate.auth.token', token);
      return;
    }
    await this.ensureSecure();
    await SecureStorage.set(TOKEN_KEY, token);
  }

  async clear(): Promise<void> {
    this._token.set(null);
    if (!this.native) {
      localStorage.removeItem('modulate.auth.token');
      return;
    }
    await this.ensureSecure();
    await SecureStorage.remove(TOKEN_KEY).catch(() => {});
    await Preferences.remove({ key: 'app.auth.token' }).catch(() => {});
  }

  async setInstanceUrl(value: string): Promise<void> {
    const normalized = this.normalizeUrl(value);
    if (!normalized) throw new Error('Enter the full URL of your Modulate server.');
    this._instanceUrl.set(normalized);
    if (!this.native) return;
    await this.ensureSecure();
    await SecureStorage.set(INSTANCE_KEY, normalized);
  }

  normalizeUrl(value: string): string {
    const trimmed = String(value || '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    try {
      const url = new URL(trimmed);
      if (!['http:', 'https:'].includes(url.protocol)) return '';
      return url.toString().replace(/\/+$/, '');
    } catch {
      return '';
    }
  }

  async deviceId(): Promise<string> {
    if (!this.native) {
      const existing = localStorage.getItem('modulate.device.id');
      if (existing) return existing;
      const id = crypto.randomUUID();
      localStorage.setItem('modulate.device.id', id);
      return id;
    }

    await this.ensureSecure();
    const secure = await this.secureGet(DEVICE_KEY);
    if (secure) return secure;

    const legacy = await Preferences.get({ key: 'app.device.id' });
    const id = legacy.value || crypto.randomUUID();
    await SecureStorage.set(DEVICE_KEY, id);
    await Preferences.remove({ key: 'app.device.id' });
    return id;
  }

  private async ensureSecure(): Promise<void> {
    if (!this.secureReady) {
      this.secureReady = SecureStorage.setKeyPrefix(PREFIX);
    }
    await this.secureReady;
  }

  private async secureGet(key: string): Promise<string | null> {
    try {
      const value = await SecureStorage.get(key);
      return typeof value === 'string' ? value : null;
    } catch {
      return null;
    }
  }
}
