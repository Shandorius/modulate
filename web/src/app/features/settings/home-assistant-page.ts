import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HomeAssistantService } from '../../core/home-assistant.service';
import {
  IssuedSubsonicKey,
  SubsonicService,
} from '../../core/subsonic.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-settings-home-assistant-page',
  imports: [FormsModule, RouterLink, Icon],
  template: `
    <main class="page">
      <header class="page-header">
        <div>
          <a class="settings-back" routerLink="/app/settings">‹ Settings</a>
          <p class="eyebrow">Settings</p>
          <h1 class="display">Integrations</h1>
        </div>
        @if (integration()?.activePlayers) {
          <span class="status-pill status-pill--running">{{ integration()!.activePlayers }} player online</span>
        } @else {
          <span class="status-pill">No player online</span>
        }
      </header>

      <p class="lede">
        Connect Home Assistant to control the player, or point Music Assistant
        and other Subsonic apps at your library.
      </p>

      @if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      }

      <section class="section">
        <div class="section__head">
          <div>
            <p class="eyebrow">Home Assistant</p>
            <h2 class="section__title">Bearer tokens</h2>
          </div>
        </div>

        <p class="small muted">
          Commands are applied to the player that is currently open in a browser
          or on a phone.
        </p>

        @if (newToken(); as token) {
          <div class="token-reveal card">
            <p class="eyebrow">Copy this now</p>
            <p class="small muted">The full token is shown once. Store it in your Home Assistant secrets.</p>
            <code class="code-block">{{ token }}</code>
            <button class="btn btn--ghost btn--sm" type="button" (click)="copy(token)">Copy token</button>
          </div>
        }

        <form class="inline-create" (ngSubmit)="createToken()">
          <input class="input" name="label" [(ngModel)]="label" placeholder="Token label (Living room)" aria-label="Token label" />
          <button class="btn btn--primary" type="submit" [disabled]="issuing()">
            {{ issuing() ? 'Issuing…' : 'Create token' }}
          </button>
        </form>

        @if (integration()?.tokens?.length) {
          <div class="result-list">
            @for (token of integration()!.tokens; track token.id) {
              <div class="result-item">
                <span class="result-item__mark"><app-icon name="home" [size]="17" /></span>
                <span class="result-item__body">
                  <strong>{{ token.label }}</strong>
                  <small>{{ token.hint }}… · created {{ formatDate(token.createdAt) }}</small>
                </span>
                <button class="text-button text-button--danger" type="button" (click)="revoke(token.id)">Revoke</button>
              </div>
            }
          </div>
        } @else {
          <p class="empty-copy">No Home Assistant token yet.</p>
        }
      </section>

      <section class="section">
        <div class="section__head">
          <div>
            <p class="eyebrow">Music Assistant</p>
            <h2 class="section__title">Subsonic API</h2>
          </div>
        </div>

        <p class="small muted">
          Music Assistant, Symfonium, Feishin and other Subsonic apps can browse
          this library. In Music Assistant add an <strong>Open Subsonic</strong>
          music provider, enter the server URL below, and paste the API key into
          the “API Token” field instead of a username and password.
        </p>

        @if (newKey(); as key) {
          <div class="token-reveal card">
            <p class="eyebrow">Copy this now</p>
            <p class="small muted">The full API key is shown once.</p>
            <code class="code-block">{{ key.token }}</code>
            <button class="btn btn--ghost btn--sm" type="button" (click)="copy(key.token)">Copy API key</button>
          </div>
        }

        <form class="inline-create" (ngSubmit)="createKey()">
          <input class="input" name="keyLabel" [(ngModel)]="keyLabel" placeholder="Key label (Music Assistant)" aria-label="API key label" />
          <button class="btn btn--primary" type="submit" [disabled]="issuingKey()">
            {{ issuingKey() ? 'Issuing…' : 'Create API key' }}
          </button>
        </form>

        @if (subsonic()?.keys?.length) {
          <div class="result-list">
            @for (key of subsonic()!.keys; track key.id) {
              <div class="result-item">
                <span class="result-item__mark"><app-icon name="queue" [size]="17" /></span>
                <span class="result-item__body">
                  <strong>{{ key.label || 'Subsonic app' }}</strong>
                  <small>{{ key.hint }}… · created {{ formatDate(key.createdAt) }}</small>
                </span>
                <button class="text-button text-button--danger" type="button" (click)="revokeKey(key.id)">Revoke</button>
              </div>
            }
          </div>
        } @else {
          <p class="empty-copy">No Subsonic API key yet.</p>
        }

        @if (subsonic(); as info) {
          <div class="endpoint-list card">
            <div><span>Server URL</span><code>{{ info.baseUrl }}</code></div>
            <div><span>API endpoint</span><code>{{ info.endpoint }}</code></div>
            <div><span>Account</span><code>{{ info.owner }}</code></div>
          </div>
          <p class="small muted">
            Apps see the playlists this account can play: its own, playlists
            shared with it, and public playlists. Other accounts' private
            playlists stay hidden.
          </p>
        }
      </section>

      @if (integration(); as info) {
        <section class="section">
          <div class="section__head">
            <div>
              <p class="eyebrow">Connection</p>
              <h2 class="section__title">Home Assistant endpoints</h2>
            </div>
          </div>
          <div class="endpoint-list card">
            <div><span>Base URL</span><code>{{ info.baseUrl }}</code></div>
            <div><span>State</span><code>{{ info.endpoints.state }}</code></div>
            <div><span>Command</span><code>{{ info.endpoints.command }}</code></div>
            <div><span>Webhook</span><code>{{ info.endpoints.webhook }}</code></div>
            <div><span>Playlists</span><code>{{ info.endpoints.playlists }}</code></div>
            <div><span>Announcements</span><code>{{ info.endpoints.announcements }}</code></div>
          </div>
        </section>

        <section class="section">
          <div class="section__head">
            <div>
              <p class="eyebrow">Example</p>
              <h2 class="section__title">Home Assistant REST command</h2>
            </div>
            <button class="btn btn--quiet btn--sm" type="button" (click)="copy(yaml(info))">Copy YAML</button>
          </div>
          <pre class="code-block code-block--tall">{{ yaml(info) }}</pre>
        </section>
      }
    </main>
  `,
})
export class SettingsHomeAssistantPage implements OnInit {
  private readonly service = inject(HomeAssistantService);
  private readonly subsonicService = inject(SubsonicService);
  private readonly toast = inject(ToastService);

  readonly integration = this.service.integration;
  readonly error = this.service.error;
  readonly issuing = signal(false);
  readonly newToken = signal<string | null>(null);
  readonly subsonic = this.subsonicService.integration;
  readonly issuingKey = signal(false);
  readonly newKey = signal<IssuedSubsonicKey | null>(null);

  label = 'Living room';
  keyLabel = 'Music Assistant';

  async ngOnInit(): Promise<void> {
    await Promise.all([this.service.load(), this.subsonicService.load()]);
  }

  async createToken(): Promise<void> {
    this.issuing.set(true);
    this.newToken.set(null);
    try {
      const token = await this.service.issueToken(this.label.trim() || 'Home Assistant');
      this.newToken.set(token);
      this.toast.show('Token created. Copy it now.');
    } catch (error) {
      this.toast.show((error as Error).message);
    } finally {
      this.issuing.set(false);
    }
  }

  async revoke(id: string): Promise<void> {
    if (!window.confirm('Revoke this Home Assistant token?')) return;
    await this.service.revokeToken(id);
    this.toast.show('Token revoked.');
  }

  async createKey(): Promise<void> {
    this.issuingKey.set(true);
    this.newKey.set(null);
    try {
      const key = await this.subsonicService.issueKey(
        this.keyLabel.trim() || 'Music Assistant',
      );
      this.newKey.set(key);
      this.toast.show('API key created. Copy it now.');
    } catch (error) {
      this.toast.show((error as Error).message);
    } finally {
      this.issuingKey.set(false);
    }
  }

  async revokeKey(id: string): Promise<void> {
    if (!window.confirm('Revoke this Subsonic API key? Apps using it will stop working.')) {
      return;
    }
    await this.subsonicService.revokeKey(id);
    this.toast.show('API key revoked.');
  }

  copy(value: string): void {
    void navigator.clipboard.writeText(value).then(
      () => this.toast.show('Copied.'),
      () => this.toast.show('Could not copy automatically.'),
    );
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(value));
  }

  yaml(info: { baseUrl: string; endpoints: { command: string; state: string } }): string {
    return `# configuration.yaml
rest_command:
  modulate_play:
    url: "${info.endpoints.command}"
    method: POST
    headers:
      Authorization: "Bearer YOUR_TOKEN"
      Content-Type: "application/json"
    payload: '{"action": "play"}'
  modulate_pause:
    url: "${info.endpoints.command}"
    method: POST
    headers:
      Authorization: "Bearer YOUR_TOKEN"
      Content-Type: "application/json"
    payload: '{"action": "pause"}'
  modulate_next:
    url: "${info.endpoints.command}"
    method: POST
    headers:
      Authorization: "Bearer YOUR_TOKEN"
      Content-Type: "application/json"
    payload: '{"action": "next"}'

sensor:
  - platform: rest
    name: Modulate
    resource: "${info.endpoints.state}"
    headers:
      Authorization: "Bearer YOUR_TOKEN"
    value_template: "{{ value_json.data.current.title if value_json.data.current else 'Idle' }}"
    json_attributes_path: "$.data.state"
    json_attributes:
      - isPlaying
      - positionSeconds
      - volume`;
  }
}
