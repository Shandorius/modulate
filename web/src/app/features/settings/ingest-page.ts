import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IngestService } from '../../core/ingest.service';
import { IngestJob } from '../../core/models';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-settings-ingest-page',
  imports: [FormsModule, RouterLink],
  template: `
    <main class="page">
      <header class="page-header">
        <div>
          <a class="settings-back" routerLink="/app/settings">‹ Settings</a>
          <p class="eyebrow">Imports</p>
          <h1 class="display">Add music</h1>
        </div>
      </header>

      <p class="lede">
        Modulate passes the URL to yt-dlp on this server. Audio, metadata, and
        artwork are written to the media volume and never leave your machine.
      </p>

      <form class="import-form card" (ngSubmit)="submit()">
        <label class="field">
          <span class="field__label">Track or playlist URL</span>
          <input
            class="input"
            name="url"
            [(ngModel)]="url"
            inputmode="url"
            placeholder="https://..."
          />
          <span class="field__hint">Public http or https URLs only. YouTube watch links import one video unless you choose Playlist.</span>
        </label>

        <div class="form-grid">
          <label class="field">
            <span class="field__label">Type</span>
            <select class="select" name="kind" [(ngModel)]="kind">
              <option value="auto">Auto detect</option>
              <option value="track">Single track</option>
              <option value="playlist">Playlist</option>
            </select>
          </label>
          <button class="btn btn--primary" type="submit" [disabled]="submitting()">
            {{ submitting() ? 'Starting…' : 'Start import' }}
          </button>
        </div>

        @if (error()) {
          <p class="form-error" role="alert">{{ error() }}</p>
        }
      </form>

      <section class="section">
        <div class="section__head">
          <div>
            <p class="eyebrow">Job history</p>
            <h2 class="section__title">Imports</h2>
          </div>
          <span class="section__meta">{{ ingest.jobs().length }}</span>
        </div>

        @if (ingest.loading() && !ingest.jobs().length) {
          <div class="skeleton skeleton--row"></div>
          <div class="skeleton skeleton--row"></div>
        } @else if (!ingest.jobs().length) {
          <div class="empty-state empty-state--small">
            <h2>No imports yet.</h2>
            <p>Paste a URL above. The first track will appear in your library when it finishes.</p>
          </div>
        } @else {
          <div class="job-list">
            @for (job of ingest.jobs(); track job.id) {
              <article class="job-card" [class.is-error]="job.status === 'failed'">
                <div class="job-card__top">
                  <div>
                    <p class="eyebrow">{{ job.status }} · {{ job.sourceKind }}</p>
                    <h3>{{ job.title || job.stage }}</h3>
                    <p class="small muted job-card__url">{{ job.sourceUrl }}</p>
                  </div>
                  <span class="status-pill status-pill--{{ job.status }}">{{ statusLabel(job) }}</span>
                </div>

                <div class="progress-track" role="progressbar" [attr.aria-valuenow]="job.progress" aria-valuemin="0" aria-valuemax="100">
                  <span [style.width.%]="job.progress"></span>
                </div>
                <div class="job-card__meta">
                  <span>{{ job.progress }}% · {{ job.stage }}</span>
                  <span>{{ job.resultCount }} track{{ job.resultCount === 1 ? '' : 's' }}</span>
                </div>

                @if (job.errorMessage) {
                  <p class="form-error">{{ job.errorMessage }}</p>
                }

                <div class="job-card__actions">
                  @if (job.status === 'queued' || job.status === 'running') {
                    <button class="btn btn--quiet btn--sm" type="button" (click)="cancel(job)">Cancel</button>
                  }
                  @if (job.status === 'failed' || job.status === 'cancelled') {
                    <button class="btn btn--ghost btn--sm" type="button" (click)="retry(job)">Retry</button>
                  }
                </div>
              </article>
            }
          </div>
        }
      </section>
    </main>
  `,
})
export class SettingsIngestPage implements OnInit {
  readonly ingest = inject(IngestService);
  private readonly toast = inject(ToastService);

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  url = '';
  kind: 'auto' | 'track' | 'playlist' = 'auto';

  async ngOnInit(): Promise<void> {
    await this.ingest.load();
  }

  async submit(): Promise<void> {
    if (!this.url.trim()) {
      this.error.set('Paste a URL first.');
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.ingest.create(this.url.trim(), this.kind);
      this.url = '';
      this.toast.show('Import started.');
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.submitting.set(false);
    }
  }

  async cancel(job: IngestJob): Promise<void> {
    try {
      await this.ingest.cancel(job.id);
      this.toast.show('Import cancelled.');
    } catch (error) {
      this.toast.show((error as Error).message);
    }
  }

  async retry(job: IngestJob): Promise<void> {
    try {
      await this.ingest.retry(job.id);
      this.toast.show('Import queued again.');
    } catch (error) {
      this.toast.show((error as Error).message);
    }
  }

  statusLabel(job: IngestJob): string {
    if (job.status === 'queued') return 'Queued';
    if (job.status === 'running') return 'Working';
    if (job.status === 'completed') return 'Ready';
    if (job.status === 'failed') return 'Needs attention';
    return 'Cancelled';
  }
}
