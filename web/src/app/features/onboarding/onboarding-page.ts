import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { APP_NAME } from '../../core/app-config';
import { AuthService } from '../../core/auth.service';
import { IngestService } from '../../core/ingest.service';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-onboarding-page',
  imports: [FormsModule, Icon],
  template: `
    <main class="onboarding">
      <div class="onboarding__top">
        <span class="brand"><span class="brand__mark" aria-hidden="true"><app-icon name="music" [size]="15" /></span> {{ appName }}</span>
        <span class="pill pill--quiet">One last step</span>
      </div>

      <div class="onboarding__intro">
        <p class="eyebrow">Your library</p>
        <h1 class="display onboarding__title">Put something on the shelf.</h1>
        <p class="lede">
          Paste a track or playlist URL and Modulate will fetch it with yt-dlp.
          You can also look around first and add music later.
        </p>
      </div>

      <section class="card onboarding__card">
        <label class="field">
          <span class="field__label">Music URL</span>
          <input
            class="input"
            name="url"
            inputmode="url"
            [(ngModel)]="url"
            placeholder="https://..."
          />
          <span class="field__hint">A single track or a public playlist.</span>
        </label>

        <div class="segmented" role="group" aria-label="Import type">
          @for (option of kinds; track option.value) {
            <button
              class="segmented__item"
              [class.is-active]="kind === option.value"
              type="button"
              (click)="kind = option.value"
            >
              {{ option.label }}
            </button>
          }
        </div>

        @if (error()) {
          <p class="form-error" role="alert">{{ error() }}</p>
        }

        <button class="btn btn--primary btn--block" type="button" [disabled]="saving()" (click)="finish(true)">
          @if (saving()) {
            <span class="spinner" aria-hidden="true"></span>
            Starting import…
          } @else {
            Add my first music
          }
        </button>
        <button class="btn btn--quiet btn--block" type="button" [disabled]="saving()" (click)="finish(false)">
          Browse an empty library first
        </button>
      </section>

      <p class="small muted onboarding__foot">
        Imports run on your server. A failed source can be retried later in Settings → Imports.
      </p>
    </main>
  `,
})
export class OnboardingPage {
  readonly appName = APP_NAME;
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly ingest = inject(IngestService);
  private readonly router = inject(Router);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly kinds = [
    { value: 'auto' as const, label: 'Auto detect' },
    { value: 'track' as const, label: 'Track' },
    { value: 'playlist' as const, label: 'Playlist' },
  ];

  url = '';
  kind: 'auto' | 'track' | 'playlist' = 'auto';

  async finish(withMusic: boolean): Promise<void> {
    if (this.saving()) return;
    this.error.set(null);

    if (withMusic && !this.url.trim()) {
      this.error.set('Paste a URL, or choose “Browse an empty library first”.');
      return;
    }

    this.saving.set(true);
    try {
      if (withMusic) {
        await this.ingest.create(this.url.trim(), this.kind);
      }
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      await this.api.post('/onboarding/complete', {
        timezone,
        metadata: { firstAction: withMusic ? 'ingest' : 'browse' },
      });
      await this.auth.refreshMe();
      await this.router.navigateByUrl(
        withMusic ? '/app/settings/ingest' : '/app/library',
      );
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
