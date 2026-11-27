import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HomeAssistantService } from '../../core/home-assistant.service';
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
          <p class="eyebrow">Integrations</p>
          <h1 class="display">Home Assistant</h1>
        </div>
        @if (integration()?.activePlayers) {
          <span class="status-pill status-pill--running">{{ integration()!.activePlayers }} player online</span>
        } @else {
          <span class="status-pill">No player online</span>
        }
      </header>

      <p class="lede">
        Issue a bearer token for Home Assistant. Commands are applied to the
        player that is currently open in a browser or on a phone.
      </p>

      @if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      }

      <section class="section">
        <div class="section__head">
          <div>
            <p class="eyebrow">Access</p>
            <h2 class="section__title">Tokens</h2>
          </div>
        </div>

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

      @if (integration(); as info) {
        <section class="section">
          <div class="section__head">
            <div>
              <p class="eyebrow">Connection</p>
              <h2 class="section__title">Endpoints</h2>
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
  private readonly toast = inject(ToastService);

  readonly integration = this.service.integration;
  readonly error = this.service.error;
  readonly issuing = signal(false);
  readonly newToken = signal<string | null>(null);

  label = 'Living room';

  async ngOnInit(): Promise<void> {
    await this.service.load();
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
