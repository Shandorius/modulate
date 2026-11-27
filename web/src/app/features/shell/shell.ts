import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { App } from '@capacitor/app';
import { APP_NAME } from '../../core/app-config';
import { AuthService } from '../../core/auth.service';
import { IngestService } from '../../core/ingest.service';
import { LocalNotificationService } from '../../core/local-notification.service';
import { PlayerService } from '../../core/player.service';
import { ToastService } from '../../core/toast.service';
import { PlayerBar } from '../shared/player-bar';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PlayerBar, Icon],
  template: `
    <div class="app-shell">
      <header class="topbar">
        <div class="topbar__inner">
          <a class="brand" routerLink="/app/home">
            <span class="brand__mark" aria-hidden="true"><app-icon name="music" [size]="15" /></span>
            <span>{{ appName }}</span>
          </a>
          <div class="topbar__meta">
            <span class="pill pill--quiet">Self-hosted</span>
            <a class="icon-btn icon-btn--bordered" routerLink="/app/settings" aria-label="Settings"><app-icon name="settings" [size]="17" /></a>
          </div>
        </div>
      </header>

      <main class="app-main">
        <router-outlet />
      </main>

      <app-player-bar />

      <nav class="bottom-nav" aria-label="Main navigation">
        <a class="nav-item" routerLink="/app/home" routerLinkActive="is-active" aria-label="Home">
          <span class="nav-item__icon" aria-hidden="true"><app-icon name="home" [size]="20" /></span>
          <span>Home</span>
        </a>
        <a class="nav-item" routerLink="/app/search" routerLinkActive="is-active" aria-label="Search">
          <span class="nav-item__icon" aria-hidden="true"><app-icon name="search" [size]="20" /></span>
          <span>Search</span>
        </a>
        <a class="nav-item" routerLink="/app/library" routerLinkActive="is-active" aria-label="Library">
          <span class="nav-item__icon" aria-hidden="true"><app-icon name="library" [size]="20" /></span>
          <span>Library</span>
        </a>
        <a class="nav-item" routerLink="/app/settings" routerLinkActive="is-active" aria-label="Settings">
          <span class="nav-item__icon" aria-hidden="true"><app-icon name="settings" [size]="20" /></span>
          <span>Settings</span>
        </a>
      </nav>

      @if (toast.message(); as message) {
        <div class="toast" role="status">
          <span>{{ message }}</span>
          @if (toast.action(); as action) {
            <button class="toast__action" type="button" (click)="toast.runAction()">
              {{ action.label }}
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class Shell implements OnInit, OnDestroy {
  readonly appName = APP_NAME;
  readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);
  private readonly localNotifications = inject(LocalNotificationService);
  private readonly ingest = inject(IngestService);
  private readonly player = inject(PlayerService);

  async ngOnInit(): Promise<void> {
    await this.auth.bootstrap();
    await this.player.init();
    void this.ingest.load();
    void this.localNotifications.initialize();
    void App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      void this.auth.syncTimezone().then((changed) => {
        if (changed) this.localNotifications.requestSync();
      });
      void this.player.heartbeat();
      void this.player.poll();
      this.localNotifications.requestSync();
    });
  }

  async ngOnDestroy(): Promise<void> {
    await this.player.destroy();
  }
}
