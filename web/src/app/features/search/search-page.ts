import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { LibraryService } from '../../core/library.service';
import { AlbumSummary, Playlist, Track } from '../../core/models';
import { PlayerService } from '../../core/player.service';
import { ToastService } from '../../core/toast.service';
import { TrackRow } from '../shared/track-row';

type Filter = 'all' | 'tracks' | 'playlists' | 'albums';

@Component({
  selector: 'app-search-page',
  imports: [FormsModule, RouterLink, TrackRow],
  template: `
    <main class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Find something</p>
          <h1 class="display">Search</h1>
        </div>
      </header>

      <div class="search-box">
        <span class="search-box__icon" aria-hidden="true">⌕</span>
        <input
          class="search-box__input"
          name="query"
          [ngModel]="query()"
          (ngModelChange)="setQuery($event)"
          placeholder="Tracks, artists, albums, playlists"
          autocomplete="off"
          aria-label="Search your library"
        />
        @if (query()) {
          <button class="icon-btn" type="button" aria-label="Clear search" (click)="setQuery('')">×</button>
        }
      </div>

      <div class="segmented segmented--wide" role="group" aria-label="Search filter">
        @for (item of filters; track item.value) {
          <button
            class="segmented__item"
            [class.is-active]="filter() === item.value"
            type="button"
            (click)="filter.set(item.value)"
          >
            {{ item.label }}
          </button>
        }
      </div>

      @if (loading()) {
        <div class="section">
          <div class="skeleton skeleton--row"></div>
          <div class="skeleton skeleton--row"></div>
        </div>
      } @else {
        @if (filter() === 'all' || filter() === 'tracks') {
          @if (tracks().length) {
            <section class="section">
              <div class="section__head">
                <h2 class="section__title">Tracks</h2>
                <span class="section__meta">{{ tracks().length }}</span>
              </div>
              <div class="track-list">
                @for (track of tracks(); track track.id) {
                  <app-track-row
                    [track]="track"
                    (play)="play($event)"
                    (queue)="queue($event)"
                    (favorite)="favorite($event)"
                  />
                }
              </div>
            </section>
          }
        }

        @if (filter() === 'all' || filter() === 'playlists') {
          @if (playlists().length) {
            <section class="section">
              <div class="section__head">
                <h2 class="section__title">Playlists</h2>
                <span class="section__meta">{{ playlists().length }}</span>
              </div>
              <div class="result-list">
                @for (playlist of playlists(); track playlist.id) {
                  <a class="result-item" [routerLink]="['/app/collection/playlist', playlist.id]">
                    <span class="result-item__mark">≡</span>
                    <span class="result-item__body">
                      <strong>{{ playlist.name }}</strong>
                      <small>
                        {{ playlist.trackCount }} track{{ playlist.trackCount === 1 ? '' : 's' }}
                        · {{ playlist.relationship === 'owner' ? 'Yours' : 'By ' + (playlist.ownerName || 'a listener') }}
                        {{ playlist.visibility === 'public' ? ' · Public' : '' }}
                      </small>
                    </span>
                    <span aria-hidden="true">→</span>
                  </a>
                }
              </div>
            </section>
          }
        }

        @if (filter() === 'all' || filter() === 'albums') {
          @if (albums().length) {
            <section class="section">
              <div class="section__head">
                <h2 class="section__title">Albums</h2>
                <span class="section__meta">{{ albums().length }}</span>
              </div>
              <div class="card-grid">
                @for (album of albums(); track album.album) {
                  <a class="playlist-card" [routerLink]="['/app/collection/album', album.album]">
                    <div class="playlist-card__art">
                      @if (album.artworkUrl) {
                        <img [src]="api.url(album.artworkUrl)" [alt]="album.album" />
                      } @else {
                        <span class="cover-fallback" aria-hidden="true">◉</span>
                      }
                    </div>
                    <h3>{{ album.album }}</h3>
                    <p class="small muted">{{ album.artist }}</p>
                  </a>
                }
              </div>
            </section>
          }
        }

        @if (!tracks().length && !playlists().length && !albums().length) {
          <section class="empty-state">
            <span class="empty-state__mark" aria-hidden="true">⌕</span>
            <h2>No match in this library.</h2>
            <p>Try a different title, artist, or album. Search only looks at music you already host.</p>
            <a class="btn btn--ghost" routerLink="/app/settings/ingest">Add music</a>
          </section>
        }
      }
    </main>
  `,
})
export class SearchPage implements OnInit, OnDestroy {
  readonly api = inject(ApiService);
  private readonly library = inject(LibraryService);
  private readonly player = inject(PlayerService);
  private readonly toast = inject(ToastService);

  readonly query = signal('');
  readonly filter = signal<Filter>('all');
  readonly tracks = signal<Track[]>([]);
  readonly playlists = signal<Playlist[]>([]);
  readonly albums = signal<AlbumSummary[]>([]);
  readonly loading = signal(false);

  readonly filters: Array<{ value: Filter; label: string }> = [
    { value: 'all', label: 'Everything' },
    { value: 'tracks', label: 'Tracks' },
    { value: 'playlists', label: 'Playlists' },
    { value: 'albums', label: 'Albums' },
  ];

  private timer: ReturnType<typeof setTimeout> | null = null;

  async ngOnInit(): Promise<void> {
    await this.library.load();
    this.tracks.set(this.library.tracks());
    this.playlists.set(this.library.playlists());
    this.albums.set(this.library.albums());
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  setQuery(value: string): void {
    this.query.set(value);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.runSearch(), 220);
  }

  private async runSearch(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.library.search(this.query());
      this.tracks.set(result.tracks);
      this.playlists.set(result.playlists);
      this.albums.set(result.albums);
    } finally {
      this.loading.set(false);
    }
  }

  async play(track: Track): Promise<void> {
    await this.player.playTrack(track, this.tracks().map((item) => item.id));
  }

  async queue(track: Track): Promise<void> {
    await this.player.enqueue(track);
  }

  async favorite(track: Track): Promise<void> {
    const updated = await this.library.updateTrack(track.id, {
      isFavorite: !track.isFavorite,
    });
    this.tracks.update((tracks) =>
      tracks.map((item) => (item.id === track.id ? updated : item)),
    );
    this.toast.show(updated.isFavorite ? 'Added to favourites.' : 'Removed from favourites.');
  }
}
