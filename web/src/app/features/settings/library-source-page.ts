import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LibrarySourceService } from '../../core/library-source.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-settings-library-source-page',
  imports: [RouterLink, Icon],
  template: `
    <main class="page">
      <header class="page-header">
        <div>
          <a class="settings-back" routerLink="/app/settings"><app-icon name="chevron-left" [size]="14" /> Settings</a>
          <p class="eyebrow">Library</p>
          <h1 class="display">Music folder</h1>
        </div>
        <span class="pill">Read only</span>
      </header>

      <p class="lede">
        Mount an existing music collection on the server. Modulate scans the
        files in place, reads their tags and artwork, and adds them to the shared
        library. The original files are never changed or deleted.
      </p>

      @if (service.error()) {
        <p class="form-error" role="alert">{{ service.error() }}</p>
      }

      @if (service.source(); as source) {
        <section class="card library-source-card">
          <div class="library-source-card__head">
            <div>
              <p class="eyebrow">Mounted path</p>
              <code class="library-source-path">{{ source.rootPath }}</code>
            </div>
            <span
              class="status-pill"
              [class.status-pill--running]="source.status === 'running'"
              [class.status-pill--completed]="source.status === 'completed'"
              [class.status-pill--failed]="source.status === 'failed'"
            >
              {{ statusLabel(source.status) }}
            </span>
          </div>

          @if (source.error) {
            <p class="form-error">{{ source.error }}</p>
          }

          @if (source.status === 'running') {
            <div class="progress-track" role="progressbar" [attr.aria-valuenow]="progress(source)" aria-valuemin="0" aria-valuemax="100">
              <span [style.width.%]="progress(source)"></span>
            </div>
            <p class="small muted">
              Scanning {{ source.processed }} of {{ source.total }} files…
            </p>
          }

          <div class="library-source-stats">
            <div><strong>{{ source.trackCount }}</strong><span>tracks</span></div>
            <div><strong>{{ source.addedCount }}</strong><span>added</span></div>
            <div><strong>{{ source.updatedCount }}</strong><span>updated</span></div>
            <div><strong>{{ source.missingCount }}</strong><span>missing</span></div>
          </div>

          <div class="button-row">
            <button class="btn btn--primary" type="button" [disabled]="source.status === 'running'" (click)="scan()">
              <app-icon name="upload" [size]="16" />
              {{ source.status === 'running' ? 'Scanning…' : 'Scan library' }}
            </button>
            @if (source.lastScanAt) {
              <span class="small muted">Last scan {{ formatDate(source.lastScanAt) }}</span>
            }
          </div>
        </section>
      } @else if (service.loading()) {
        <div class="skeleton skeleton--row"></div>
      }

      <section class="card settings-note">
        <p class="eyebrow">How it works</p>
        <ol class="settings-steps">
          <li>Put audio files in the host folder mounted as <code>/music</code>.</li>
          <li>Click <strong>Scan library</strong> after adding or changing files.</li>
          <li>Modulate indexes newly found tracks and updates changed metadata.</li>
          <li>Removing a scanned track from Modulate leaves the original file alone.</li>
        </ol>
        <p class="small muted">
          Supported formats include MP3, M4A, FLAC, OGG, Opus, WAV, AAC, and WebM.
          Sidecar <code>cover.jpg</code>/<code>folder.jpg</code> artwork and embedded artwork are supported.
        </p>
      </section>
    </main>
  `,
})
export class SettingsLibrarySourcePage implements OnInit {
  readonly service = inject(LibrarySourceService);
  private readonly toast = inject(ToastService);

  async ngOnInit(): Promise<void> {
    await this.service.load();
  }

  async scan(): Promise<void> {
    try {
      await this.service.scan();
      this.toast.show('Library scan started.');
    } catch (error) {
      this.toast.show((error as Error).message);
    }
  }

  statusLabel(status: string): string {
    if (status === 'running') return 'Scanning';
    if (status === 'completed') return 'Indexed';
    if (status === 'failed') return 'Needs attention';
    return 'Not scanned';
  }

  progress(source: { processed: number; total: number }): number {
    if (!source.total) return 0;
    return Math.min(100, Math.round((source.processed / source.total) * 100));
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }
}
