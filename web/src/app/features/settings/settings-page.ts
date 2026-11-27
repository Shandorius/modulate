import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { PlayerService } from '../../core/player.service';

@Component({
  selector: 'app-settings-page',
  imports: [RouterLink],
  template: `
    <main class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Instance</p>
          <h1 class="display">Settings</h1>
        </div>
        <span class="pill">Open source</span>
      </header>

      <section class="card settings-identity">
        <div>
          <p class="eyebrow">Signed in as</p>
          <p class="settings-identity__email">{{ auth.user()?.email }}</p>
          <p class="small muted">All features are included. There is no paid tier.</p>
        </div>
        <div class="settings-identity__status">
          <span class="status-dot"></span>
          {{ player.activePlayers() }} active player{{ player.activePlayers() === 1 ? '' : 's' }}
        </div>
      </section>

      <nav class="settings-links" aria-label="Settings sections">
        <a class="settings-link" routerLink="/app/settings/ingest">
          <span class="settings-link__mark">↧</span>
          <span class="settings-link__body">
            <span class="settings-link__title">Imports</span>
            <span class="settings-link__desc">Add URLs, watch yt-dlp progress, retry a job</span>
          </span>
          <span aria-hidden="true">→</span>
        </a>

        <a class="settings-link" routerLink="/app/settings/home-assistant">
          <span class="settings-link__mark">⌂</span>
          <span class="settings-link__body">
            <span class="settings-link__title">Home Assistant</span>
            <span class="settings-link__desc">API tokens, state endpoint, playback commands</span>
          </span>
          <span aria-hidden="true">→</span>
        </a>

        @if (auth.isAdmin()) {
          <a class="settings-link" routerLink="/app/settings/users">
            <span class="settings-link__mark">☷</span>
            <span class="settings-link__body">
              <span class="settings-link__title">People</span>
              <span class="settings-link__desc">Accounts, roles, and registration policy</span>
            </span>
            <span aria-hidden="true">→</span>
          </a>
        }

        <a class="settings-link" routerLink="/app/settings/notifications">
          <span class="settings-link__mark">◌</span>
          <span class="settings-link__body">
            <span class="settings-link__title">Notifications</span>
            <span class="settings-link__desc">Quiet hours, local reminders, exact alarms</span>
          </span>
          <span aria-hidden="true">→</span>
        </a>

        <a class="settings-link" routerLink="/app/settings/account">
          <span class="settings-link__mark">☺</span>
          <span class="settings-link__body">
            <span class="settings-link__title">Account</span>
            <span class="settings-link__desc">Name, password, sessions, deletion</span>
          </span>
          <span aria-hidden="true">→</span>
        </a>
      </nav>

      <section class="card about-card">
        <p class="eyebrow">About Modulate</p>
        <p>
          A self-hosted music library built for your own server. The web app, API,
          playback state, and yt-dlp worker run in one container. PostgreSQL is the
          only companion service.
        </p>
      </section>
    </main>
  `,
})
export class SettingsPage {
  readonly auth = inject(AuthService);
  readonly player = inject(PlayerService);
}
