import { Component, computed, effect, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { PlayerService } from '../../core/player.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from './icon';

@Component({
  selector: 'app-player-bar',
  imports: [Icon],
  template: `
    @if (player.announcement(); as announcement) {
      <div class="announcement" role="status">
        <span class="announcement__mark" aria-hidden="true"><app-icon name="bell" [size]="16" /></span>
        <p>{{ announcement.message }}</p>
        <button class="icon-btn" type="button" aria-label="Dismiss announcement" (click)="dismissAnnouncement()"><app-icon name="close" [size]="16" /></button>
      </div>
    }

    <section class="player" [class.player--empty]="!player.current()" aria-label="Now playing">
      <button class="player__cover" type="button" (click)="toggleExpanded()" aria-label="Open now playing">
        @if (player.current()?.artworkUrl) {
          <img [src]="api.url(player.current()!.artworkUrl)" [alt]="player.current()!.album || player.current()!.title" />
        } @else {
          <span class="cover-fallback" aria-hidden="true"><app-icon name="music" [size]="18" /></span>
        }
      </button>

      <div class="player__identity">
        @if (player.current(); as track) {
          <button class="player__title" type="button" (click)="toggleExpanded()">{{ track.title }}</button>
          <span class="player__artist">{{ track.artist }}</span>
        } @else {
          <span class="player__title">Nothing playing</span>
          <span class="player__artist">Choose a record from your library</span>
        }
      </div>

      <div class="player__transport">
        <button class="icon-btn" type="button" aria-label="Previous track" (click)="player.previous()" [disabled]="!player.current()"><app-icon name="previous" [size]="19" /></button>
        <button
          class="play-btn"
          type="button"
          [attr.aria-label]="player.isPlaying() ? 'Pause' : 'Play'"
          (click)="player.togglePlay()"
        >
          <app-icon [name]="player.isPlaying() ? 'pause' : 'play'" [size]="16" />
        </button>
        <button class="icon-btn" type="button" aria-label="Next track" (click)="player.next()" [disabled]="!player.current()"><app-icon name="next" [size]="19" /></button>
        <button class="icon-btn player__queue-toggle" type="button" aria-label="Queue" (click)="queueOpen.set(!queueOpen())">
          <app-icon name="queue" [size]="18" />
          @if (player.queue().length) {
            <span class="badge">{{ player.queue().length }}</span>
          }
        </button>
      </div>

      <div class="player__timeline">
        <span class="player__time">{{ player.formatTime(player.position()) }}</span>
        <input
          class="groove-range"
          type="range"
          min="0"
          [max]="Math.max(player.duration(), 1)"
          step="0.5"
          [value]="player.position()"
          aria-label="Seek"
          (input)="seek($event)"
        />
        <span class="player__time">{{ player.formatTime(player.duration()) }}</span>
      </div>

      <div class="player__extras">
        <button
          class="icon-btn"
          type="button"
          [class.is-on]="player.state()?.state?.repeatMode !== 'off'"
          [title]="'Repeat: ' + (player.state()?.state?.repeatMode || 'off')"
          (click)="cycleRepeat()"
        >
          <app-icon name="repeat" [size]="17" />
        </button>
        <input
          class="volume-range"
          type="range"
          min="0"
          max="1"
          step="0.01"
          [value]="player.volume()"
          aria-label="Volume"
          (input)="volume($event)"
        />
      </div>
    </section>

    @if (queueOpen()) {
      <aside class="queue-panel" aria-label="Playback queue">
        <header class="queue-panel__head">
          <div>
            <p class="eyebrow">Up next</p>
            <h2>Queue</h2>
          </div>
          <button class="icon-btn" type="button" aria-label="Close queue" (click)="queueOpen.set(false)"><app-icon name="close" [size]="18" /></button>
        </header>
        @if (player.queue().length) {
          <ol class="queue-list">
            @for (item of player.queue(); track item.queueId; let index = $index) {
              <li [class.is-current]="player.current()?.id === item.track.id">
                <span class="queue-list__index">{{ index + 1 }}</span>
                <button class="queue-list__track" type="button" (click)="player.playTrack(item.track, queueIds())">
                  <span>{{ item.track.title }}</span>
                  <small>{{ item.track.artist }}</small>
                </button>
                <button class="icon-btn icon-btn--quiet" type="button" aria-label="Remove from queue" (click)="player.removeQueueItem(item.queueId)"><app-icon name="close" [size]="16" /></button>
              </li>
            }
          </ol>
          <button class="btn btn--quiet btn--block" type="button" (click)="player.clearQueue()">Clear queue</button>
        } @else {
          <p class="empty-copy">The queue is empty. Add tracks from your library.</p>
        }
      </aside>
    }

    @if (expanded()) {
      <div class="now-playing" role="dialog" aria-modal="true" aria-label="Now playing">
        <button class="now-playing__close" type="button" aria-label="Close" (click)="expanded.set(false)"><app-icon name="close" [size]="22" /></button>
        <div class="now-playing__art">
          @if (player.current()?.artworkUrl) {
            <img [src]="api.url(player.current()!.artworkUrl)" [alt]="player.current()!.album || player.current()!.title" />
          } @else {
            <span class="cover-fallback" aria-hidden="true"><app-icon name="music" [size]="18" /></span>
          }
        </div>
        <p class="eyebrow">Now playing</p>
        <h2 class="now-playing__title">{{ player.current()?.title || 'Nothing playing' }}</h2>
        <p class="now-playing__artist">{{ player.current()?.artist || 'Choose a record from your library' }}</p>
        <div class="now-playing__timeline">
          <input
            class="groove-range"
            type="range"
            min="0"
            [max]="Math.max(player.duration(), 1)"
            step="0.5"
            [value]="player.position()"
            aria-label="Seek"
            (input)="seek($event)"
          />
          <div class="now-playing__times">
            <span>{{ player.formatTime(player.position()) }}</span>
            <span>{{ player.formatTime(player.duration()) }}</span>
          </div>
        </div>
        <div class="now-playing__controls">
          <button class="icon-btn" type="button" aria-label="Previous" (click)="player.previous()"><app-icon name="previous" [size]="24" /></button>
          <button class="play-btn play-btn--large" type="button" (click)="player.togglePlay()">
            <app-icon [name]="player.isPlaying() ? 'pause' : 'play'" [size]="24" />
          </button>
          <button class="icon-btn" type="button" aria-label="Next" (click)="player.next()"><app-icon name="next" [size]="24" /></button>
        </div>
        @if (player.current()?.album) {
          <p class="small muted">{{ player.current()?.album }}</p>
        }
      </div>
    }
  `,
})
export class PlayerBar {
  readonly api = inject(ApiService);
  readonly player = inject(PlayerService);
  private readonly toast = inject(ToastService);

  readonly queueOpen = signal(false);
  readonly expanded = signal(false);
  readonly Math = Math;
  readonly queueIds = computed(() => this.player.queue().map((item) => item.track.id));

  private lastAnnouncement: string | null = null;

  constructor() {
    effect(() => {
      const announcement = this.player.announcement();
      if (!announcement || announcement.id === this.lastAnnouncement) return;
      this.lastAnnouncement = announcement.id;
      this.toast.show(announcement.message);
      try {
        const speech = new SpeechSynthesisUtterance(announcement.message);
        speech.rate = 0.95;
        window.speechSynthesis.speak(speech);
      } catch {
        // Speech is optional; the banner remains visible.
      }
      setTimeout(() => void this.player.acknowledgeAnnouncement(announcement.id), 1500);
    });
  }

  toggleExpanded(): void {
    if (this.player.current()) this.expanded.update((value) => !value);
  }

  seek(event: Event): void {
    void this.player.seek(Number((event.target as HTMLInputElement).value));
  }

  volume(event: Event): void {
    void this.player.setVolume(Number((event.target as HTMLInputElement).value));
  }

  cycleRepeat(): void {
    const mode = this.player.state()?.state?.repeatMode || 'off';
    const next = mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off';
    void this.player.setRepeat(next);
  }

  dismissAnnouncement(): void {
    const announcement = this.player.announcement();
    if (announcement) void this.player.acknowledgeAnnouncement(announcement.id);
  }
}
