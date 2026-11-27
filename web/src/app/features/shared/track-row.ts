import { Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Track } from '../../core/models';
import { PlayerService } from '../../core/player.service';

@Component({
  selector: 'app-track-row',
  imports: [RouterLink],
  template: `
    <article class="track-row" [class.is-current]="player.current()?.id === track().id">
      <button
        class="track-row__play"
        type="button"
        [attr.aria-label]="'Play ' + track().title"
        (click)="play.emit(track())"
      >
        <span aria-hidden="true">▶</span>
      </button>

      <div class="track-row__art">
        @if (track().artworkUrl) {
          <img [src]="api.url(track().artworkUrl)" [alt]="track().album || track().title" />
        } @else {
          <span class="cover-fallback" aria-hidden="true">♪</span>
        }
      </div>

      <div class="track-row__body">
        <p class="track-row__title">{{ track().title }}</p>
        <p class="track-row__meta">
          <span>{{ track().artist }}</span>
          @if (track().album) {
            <span class="dot">·</span>
            <a [routerLink]="['/app/collection/album', track().album]">{{ track().album }}</a>
          }
        </p>
      </div>

      <span class="track-row__duration">{{ player.formatTime(track().durationSeconds) }}</span>

      <div class="track-row__actions">
        @if (showAdd()) {
          <button
            class="icon-btn"
            type="button"
            title="Add to playlist"
            aria-label="Add to playlist"
            (click)="add.emit(track())"
          >
            +
          </button>
        }
        <button
          class="icon-btn"
          type="button"
          [class.is-on]="track().isFavorite"
          [title]="track().isFavorite ? 'Remove from favourites' : 'Add to favourites'"
          [attr.aria-label]="track().isFavorite ? 'Remove from favourites' : 'Add to favourites'"
          (click)="favorite.emit(track())"
        >
          {{ track().isFavorite ? '♥' : '♡' }}
        </button>
        <button
          class="icon-btn"
          type="button"
          title="Add to queue"
          aria-label="Add to queue"
          (click)="queue.emit(track())"
        >
          ≡+
        </button>
        @if (removable()) {
          <button
            class="icon-btn icon-btn--quiet"
            type="button"
            title="Remove from playlist"
            aria-label="Remove from playlist"
            (click)="remove.emit(track())"
          >
            ×
          </button>
        }
      </div>
    </article>
  `,
})
export class TrackRow {
  readonly api = inject(ApiService);
  readonly player = inject(PlayerService);

  readonly track = input.required<Track>();
  readonly index = input<number | null>(null);
  readonly removable = input(false);
  readonly showAdd = input(false);

  readonly play = output<Track>();
  readonly queue = output<Track>();
  readonly favorite = output<Track>();
  readonly add = output<Track>();
  readonly remove = output<Track>();
}
