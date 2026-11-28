import { Injectable, computed, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { APP_NAME } from './app-config';
import { ApiService } from './api.service';
import { LibraryService } from './library.service';
import { TokenStorageService } from './token-storage.service';
import { Entitlements, MeResponse, Profile, User } from './models';

interface AuthPayload {
  token?: string;
  user?: User;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly library = inject(LibraryService);
  readonly tokens = inject(TokenStorageService);

  readonly user = signal<User | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly tier = signal<string>('oss');
  readonly entitlements = signal<Entitlements | null>(null);
  readonly ready = signal(false);
  readonly isNative = signal(Capacitor.isNativePlatform());
  readonly needsInstance = computed(
    () => this.isNative() && !this.tokens.instanceUrl(),
  );

  readonly isAuthenticated = computed(() => Boolean(this.user()));
  readonly isAdmin = computed(() => this.user()?.userType === 'admin');
  readonly needsOnboarding = computed(
    () => this.isAuthenticated() && !this.profile()?.onboardingCompleted,
  );

  private bootPromise: Promise<void> | null = null;

  async setInstanceUrl(value: string): Promise<void> {
    const previous = this.tokens.instanceUrl();
    await this.tokens.setInstanceUrl(value);
    if (previous && previous !== this.tokens.instanceUrl()) {
      await this.tokens.clear();
      this.clearState();
    }
  }

  async bootstrap(force = false): Promise<void> {
    if (this.ready() && !force) return;
    if (this.bootPromise) return this.bootPromise;
    this.bootPromise = this.doBootstrap().finally(() => {
      this.bootPromise = null;
    });
    return this.bootPromise;
  }

  private async doBootstrap(): Promise<void> {
    await this.tokens.load();
    if (this.isNative() && !this.tokens.instanceUrl()) {
      this.ready.set(true);
      return;
    }
    try {
      await this.refreshMe();
      await this.syncTimezone();
    } catch {
      this.clearState();
    } finally {
      this.ready.set(true);
    }
  }

  async syncTimezone(): Promise<boolean> {
    if (!this.isAuthenticated()) return false;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!detected || detected === this.profile()?.timezone) return false;
    try {
      await this.api.patch('/me', { timezone: detected });
      await this.refreshMe();
      return true;
    } catch {
      return false;
    }
  }

  async refreshMe(): Promise<MeResponse> {
    const me = await this.api.get<{ data: MeResponse }>('/me');
    this.user.set(me.data.user);
    this.profile.set(me.data.profile);
    this.tier.set(me.data.tier);
    this.entitlements.set(me.data.entitlements);
    return me.data;
  }

  async registrationStatus(): Promise<{
    hasUsers: boolean;
    allowed: boolean;
    firstUser: boolean;
  }> {
    const response = await this.api.auth<{
      data: { hasUsers: boolean; allowed: boolean; firstUser: boolean };
    }>('GET', '/auth/registration-status');
    return response.data;
  }

  async login(email: string, password: string): Promise<void> {
    if (this.isNative()) {
      if (!this.tokens.instanceUrl()) {
        throw new Error('Enter the URL of your Modulate server first.');
      }
      const payload = await this.api.auth<AuthPayload>(
        'POST',
        '/auth/mobile/login',
        {
          email,
          password,
          platform: Capacitor.getPlatform(),
          deviceId: await this.tokens.deviceId(),
          label: `${APP_NAME} mobile`,
        },
      );
      if (!payload.token) throw new Error('No token returned by the server.');
      await this.tokens.set(payload.token);
    } else {
      await this.api.auth('POST', '/auth/login', { email, password });
    }
    this.library.reset();
    await this.refreshMe();
  }

  async register(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<void> {
    if (this.isNative()) {
      if (!this.tokens.instanceUrl()) {
        throw new Error('Enter the URL of your Modulate server first.');
      }
      const payload = await this.api.auth<AuthPayload>(
        'POST',
        '/auth/mobile/register',
        {
          email,
          password,
          displayName,
          platform: Capacitor.getPlatform(),
          deviceId: await this.tokens.deviceId(),
          label: `${APP_NAME} mobile`,
        },
      );
      if (!payload.token) throw new Error('No token returned by the server.');
      await this.tokens.set(payload.token);
    } else {
      await this.api.auth('POST', '/auth/register', {
        email,
        password,
        displayName,
      });
    }
    this.library.reset();
    await this.refreshMe();
  }

  async updateDisplayName(displayName: string): Promise<void> {
    await this.api.patch('/account', { displayName });
    await this.refreshMe();
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    await this.api.post('/account/change-password', {
      currentPassword,
      newPassword,
    });
  }

  async signOutAll(): Promise<void> {
    try {
      await this.api.post('/account/sign-out-all', {});
    } finally {
      await this.tokens.clear();
      this.clearState();
    }
  }

  async deleteAccount(password: string): Promise<void> {
    await this.api.delete('/account', { password });
    await this.tokens.clear();
    this.clearState();
  }

  async logout(): Promise<void> {
    try {
      if (this.isNative()) {
        await this.api.auth('POST', '/auth/mobile/logout', {});
      } else {
        await this.api.auth('POST', '/auth/logout', {});
      }
    } catch {
      // Local state should still clear if the server is unreachable.
    }
    await this.tokens.clear();
    this.clearState();
  }

  clearState(): void {
    this.user.set(null);
    this.profile.set(null);
    this.tier.set('oss');
    this.entitlements.set(null);
    this.library.reset();
  }
}
