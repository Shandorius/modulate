import { Component, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Track } from '../../core/models';
import { PlayerService } from '../../core/player.service';
import { Icon } from './icon';

@Component({
  selector: 'app-track-row',
  imports: [RouterLink, Icon],
  template: `
    <article
      class="track-row"
      [class.is-current]="player.current()?.id === track().id"
      [class.is-dragging]="dragging()"
      [class.is-drag-over]="dragOver()"
      [attr.draggable]="reorderable() ? 'true' : null"
      (dragstart)="onDragStart($event)"
      (dragover)="onDragOver($event)"
      (dragleave)="dragOver.set(false)"
      (drop)="onDrop($event)"
      (dragend)="onDragEnd()"
    >
      <button
        class="track-row__play"
        type="button"
        [attr.aria-label]="'Play ' + track().title"
        (click)="play.emit(track())"
      >
        <app-icon name="play" [size]="13" />
      </button>

      <div class="track-row__art">
        @if (track().artworkUrl) {
          <img [src]="api.url(track().artworkUrl)" [alt]="track().album || track().title" />
        } @else {
          <span class="cover-fallback" aria-hidden="true"><app-icon name="music" [size]="18" /></span>
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
        @if (reorderable()) {
          <span class="reorder-handle" aria-hidden="true"><app-icon name="grip" [size]="17" /></span>
          <button
            class="icon-btn"
            type="button"
            title="Move up"
            aria-label="Move up"
            [disabled]="!canMoveUp()"
            (click)="moveUp.emit()"
          >
            <app-icon name="arrow-up" [size]="17" />
          </button>
          <button
            class="icon-btn"
            type="button"
            title="Move down"
            aria-label="Move down"
            [disabled]="!canMoveDown()"
            (click)="moveDown.emit()"
          >
            <app-icon name="arrow-down" [size]="17" />
          </button>
        } @else {
        @if (showAdd()) {
          <button
            class="icon-btn"
            type="button"
            title="Add to playlist"
            aria-label="Add to playlist"
            (click)="add.emit(track())"
          >
            <app-icon name="plus" [size]="17" />
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
          <app-icon [name]="track().isFavorite ? 'heart-filled' : 'heart'" [size]="17" />
        </button>
        <button
          class="icon-btn"
          type="button"
          title="Add to queue"
          aria-label="Add to queue"
          (click)="queue.emit(track())"
        >
          <app-icon name="queue" [size]="17" />
        </button>
        @if (canDelete()) {
          <button
            class="icon-btn icon-btn--quiet"
            type="button"
            title="Delete track"
            aria-label="Delete track"
            (click)="delete.emit(track())"
          >
            <app-icon name="trash" [size]="16" />
          </button>
        }
        @if (removable()) {
          <button
            class="icon-btn icon-btn--quiet"
            type="button"
            title="Remove from playlist"
            aria-label="Remove from playlist"
            (click)="remove.emit(track())"
          >
            <app-icon name="close" [size]="16" />
          </button>
        }
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
  readonly canDelete = input(false);
  readonly reorderable = input(false);
  readonly reorderIndex = input<number | null>(null);
  readonly canMoveUp = input(false);
  readonly canMoveDown = input(false);

  readonly play = output<Track>();
  readonly queue = output<Track>();
  readonly favorite = output<Track>();
  readonly add = output<Track>();
  readonly remove = output<Track>();
  readonly delete = output<Track>();
  readonly moveUp = output<void>();
  readonly moveDown = output<void>();
  readonly dragStart = output<number>();
  readonly dropAt = output<number>();

  readonly dragging = signal(false);
  readonly dragOver = signal(false);

  onDragStart(event: DragEvent): void {
    const index = this.reorderIndex();
    if (!this.reorderable() || index === null) {
      event.preventDefault();
      return;
    }
    this.dragging.set(true);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
    this.dragStart.emit(index);
  }

  onDragOver(event: DragEvent): void {
    if (!this.reorderable()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOver.set(true);
  }

  onDrop(event: DragEvent): void {
    const index = this.reorderIndex();
    if (!this.reorderable() || index === null) return;
    event.preventDefault();
    this.dragOver.set(false);
    this.dragging.set(false);
    this.dropAt.emit(index);
  }

  onDragEnd(): void {
    this.dragging.set(false);
    this.dragOver.set(false);
  }
}
