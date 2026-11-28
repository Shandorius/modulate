import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { APP_NAME } from '../../core/app-config';
import { AuthService } from '../../core/auth.service';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-auth-page',
  imports: [FormsModule, Icon],
  template: `
    <main class="auth-page">
      <section class="auth-card">
        <div class="auth-brand">
          <span class="brand"><span class="brand__mark" aria-hidden="true"><app-icon name="music" [size]="15" /></span> {{ appName }}</span>
          <span class="pill pill--quiet">Open source</span>
        </div>

        <h1 class="display auth-title">
          {{ mode() === 'login' ? 'Your library is waiting.' : 'Start a private library.' }}
        </h1>
        <p class="lede">
          {{
            mode() === 'login'
              ? 'Sign in to your self-hosted collection.'
              : registration().firstUser
                ? 'Create the first administrator account for this instance.'
                : 'Create a local account on this Modulate instance.'
          }}
        </p>

        @if (auth.isNative()) {
          <div class="instance-box">
            <p class="eyebrow">This device</p>
            <label class="field">
              <span class="field__label">Modulate server URL</span>
              <input
                class="input"
                name="instanceUrl"
                inputmode="url"
                autocomplete="url"
                [(ngModel)]="instanceUrl"
                placeholder="https://music.example.com"
              />
              <span class="field__hint">The same address you open in a browser. Public servers use https:// — a LAN address can stay http://.</span>
            </label>
            @if (auth.needsInstance()) {
              <button class="btn btn--ghost btn--block" type="button" [disabled]="savingInstance()" (click)="saveInstance()">
                {{ savingInstance() ? 'Checking…' : 'Use this server' }}
              </button>
            }
            @if (instanceStatus(); as status) {
              <p class="field__hint field__hint--ok">{{ status }}</p>
            }
          </div>
        }

        <form class="form" (ngSubmit)="submit()">
          @if (mode() === 'register') {
            <label class="field">
              <span class="field__label">Name <span class="muted">(optional)</span></span>
              <input
                class="input"
                name="displayName"
                autocomplete="name"
                [(ngModel)]="displayName"
                placeholder="What should we call you?"
              />
            </label>
          }

          <label class="field">
            <span class="field__label">Email</span>
            <input
              class="input"
              type="email"
              name="email"
              autocomplete="email"
              required
              [(ngModel)]="email"
              placeholder="you@example.com"
            />
          </label>

          <label class="field">
            <span class="field__label">Password</span>
            <input
              class="input"
              type="password"
              name="password"
              [autocomplete]="mode() === 'login' ? 'current-password' : 'new-password'"
              required
              [(ngModel)]="password"
              placeholder="At least 8 characters"
            />
          </label>

          @if (error()) {
            <p class="form-error" role="alert">{{ error() }}</p>
          }

          <button
            class="btn btn--primary btn--lg btn--block"
            type="submit"
            [disabled]="loading() || (auth.isNative() && auth.needsInstance())"
          >
            @if (loading()) {
              <span class="spinner" aria-hidden="true"></span>
              <span>Opening…</span>
            } @else {
              {{ mode() === 'login' ? 'Enter library' : 'Create library account' }}
            }
          </button>
        </form>

        @if (registration().allowed) {
          <p class="auth-switch">
            {{ mode() === 'login' ? 'New to this instance?' : 'Already have an account?' }}
            <button type="button" (click)="toggleMode()">
              {{ mode() === 'login' ? 'Create an account' : 'Sign in' }}
            </button>
          </p>
        } @else {
          <p class="auth-switch">
            Registration is closed on this instance. Ask the administrator to create your account.
          </p>
        }
      </section>

      <aside class="auth-note">
        <p class="eyebrow">Private by default</p>
        <p>Your media stays on your server. No external account, telemetry, or push service is involved.</p>
      </aside>
    </main>
  `,
})
export class AuthPage implements OnInit {
  readonly appName = APP_NAME;
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly mode = signal<'login' | 'register'>('login');
  readonly loading = signal(false);
  readonly savingInstance = signal(false);
  readonly instanceStatus = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly registration = signal({
    hasUsers: false,
    allowed: true,
    firstUser: false,
  });

  email = '';
  password = '';
  displayName = '';
  instanceUrl = this.auth.tokens.instanceUrl();

  async ngOnInit(): Promise<void> {
    await this.refreshRegistrationStatus();
  }

  private async refreshRegistrationStatus(): Promise<void> {
    if (this.auth.isNative() && this.auth.needsInstance()) return;
    try {
      const status = await this.auth.registrationStatus();
      this.registration.set(status);
      if (status.firstUser) this.mode.set('register');
    } catch {
      // Keep the normal login form available if status cannot be loaded.
    }
  }

  toggleMode(): void {
    this.mode.update((mode) => (mode === 'login' ? 'register' : 'login'));
    this.error.set(null);
  }

  async saveInstance(): Promise<void> {
    this.error.set(null);
    this.instanceStatus.set(null);
    this.savingInstance.set(true);
    try {
      await this.auth.setInstanceUrl(this.instanceUrl);
      this.instanceUrl = this.auth.tokens.instanceUrl();
      await this.api.probe();
      this.instanceStatus.set(`Connected to ${this.instanceUrl}.`);
      await this.refreshRegistrationStatus();
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.savingInstance.set(false);
    }
  }

  async submit(): Promise<void> {
    if (!this.email.trim() || !this.password) {
      this.error.set('Email and password are required.');
      return;
    }
    if (this.auth.isNative() && this.auth.needsInstance()) {
      this.error.set('Enter your Modulate server URL first.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    try {
      if (this.mode() === 'login') {
        await this.auth.login(this.email.trim(), this.password);
      } else {
        await this.auth.register(
          this.email.trim(),
          this.password,
          this.displayName.trim() || undefined,
        );
      }

      const destination = this.auth.profile()?.onboardingCompleted
        ? '/app/home'
        : '/onboarding';
      await this.router.navigateByUrl(destination);
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }
}
