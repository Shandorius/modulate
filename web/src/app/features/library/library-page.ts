import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { IngestService } from '../../core/ingest.service';
import { LibraryService } from '../../core/library.service';
import { Playlist, Track } from '../../core/models';
import { PlayerService } from '../../core/player.service';
import { ToastService } from '../../core/toast.service';
import { TrackRow } from '../shared/track-row';
import { Icon } from '../shared/icon';

type Tab = 'tracks' | 'playlists' | 'albums';

@Component({
  selector: 'app-library-page',
  imports: [FormsModule, RouterLink, TrackRow, Icon],
  template: `
    <main class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">The collection</p>
          <h1 class="display">Library</h1>
        </div>
        @if (library.summary()?.counts; as counts) {
          <div class="page-header__stat">
            <strong>{{ counts.tracks }}</strong>
            <span>track{{ counts.tracks === 1 ? '' : 's' }}</span>
          </div>
        }
      </header>

      <section class="add-strip">
        <div>
          <p class="eyebrow">Grow the library</p>
          <h2>Add a track or playlist URL</h2>
        </div>
        <form class="add-strip__form" (ngSubmit)="addMusic()">
          <input
            class="input"
            name="url"
            [(ngModel)]="url"
            placeholder="https://..."
            inputmode="url"
            aria-label="Music URL"
          />
          <select class="select" name="kind" [(ngModel)]="kind" aria-label="Import type">
            <option value="auto">Auto</option>
            <option value="track">Track</option>
            <option value="playlist">Playlist</option>
          </select>
          <button class="btn btn--primary" type="submit" [disabled]="adding()">
            {{ adding() ? 'Starting…' : 'Import' }}
          </button>
        </form>
        @if (importMessage()) {
          <p class="small muted">{{ importMessage() }}</p>
        }
      </section>

      <div class="segmented segmented--wide" role="group" aria-label="Library view">
        <button class="segmented__item" [class.is-active]="tab() === 'tracks'" type="button" (click)="tab.set('tracks')">Tracks</button>
        <button class="segmented__item" [class.is-active]="tab() === 'playlists'" type="button" (click)="tab.set('playlists')">Playlists</button>
        <button class="segmented__item" [class.is-active]="tab() === 'albums'" type="button" (click)="tab.set('albums')">Albums</button>
      </div>

      @if (library.loading() && !library.tracks().length) {
        <div class="section">
          <div class="skeleton skeleton--row"></div>
          <div class="skeleton skeleton--row"></div>
          <div class="skeleton skeleton--row"></div>
        </div>
      } @else if (tab() === 'tracks') {
        @if (library.tracks().length) {
          <section class="section">
            <div class="section__head">
              <h2 class="section__title">{{ library.tracks().length }} track{{ library.tracks().length === 1 ? '' : 's' }}</h2>
              <button class="btn btn--quiet btn--sm" type="button" (click)="playAll()">Play all</button>
            </div>
            <div class="track-list">
              @for (track of library.tracks(); track track.id) {
                <app-track-row
                  [track]="track"
                  [showAdd]="true"
                  [canDelete]="canDelete(track)"
                  (play)="play($event)"
                  (queue)="queue($event)"
                  (favorite)="favorite($event)"
                  (add)="startAdding($event)"
                  (delete)="deleteTrack($event)"
                />
              }
            </div>
          </section>
        } @else {
          <section class="empty-state">
            <span class="empty-state__mark" aria-hidden="true"><app-icon name="library" [size]="34" /></span>
            <h2>Your library is quiet.</h2>
            <p>Add a URL above, or open Settings → Imports to watch a job and retry it.</p>
          </section>
        }
      } @else if (tab() === 'playlists') {
        <section class="section">
          <form class="inline-create" (ngSubmit)="createPlaylist()">
            <input class="input" name="playlistName" [(ngModel)]="playlistName" placeholder="New playlist name" aria-label="New playlist name" />
            <button class="btn btn--ghost" type="submit">Create</button>
          </form>

          @if (ownedPlaylists().length) {
            <div class="section__head">
              <h2 class="section__title">Your playlists</h2>
              <span class="section__meta">{{ ownedPlaylists().length }}</span>
            </div>
            <div class="card-grid">
              @for (playlist of ownedPlaylists(); track playlist.id) {
                <a class="playlist-card" [routerLink]="['/app/collection/playlist', playlist.id]">
                  <div class="playlist-card__art">
                    @if (playlist.artworkUrl) {
                      <img [src]="api.url(playlist.artworkUrl)" [alt]="playlist.name" />
                    } @else {
                      <span class="cover-fallback" aria-hidden="true"><app-icon name="library" [size]="18" /></span>
                    }
                    @if (playlist.visibility === 'public') {
                      <span class="playlist-card__badge">Public</span>
                    }
                  </div>
                  <h3>{{ playlist.name }}</h3>
                  <p class="small muted">{{ playlist.trackCount }} track{{ playlist.trackCount === 1 ? '' : 's' }}</p>
                </a>
              }
            </div>
          } @else {
            <p class="empty-copy">You have no playlists of your own yet. Name one above and start collecting.</p>
          }

          @if (sharedPlaylists().length) {
            <div class="section__head">
              <h2 class="section__title">Shared with you</h2>
              <span class="section__meta">{{ sharedPlaylists().length }}</span>
            </div>
            <div class="card-grid">
              @for (playlist of sharedPlaylists(); track playlist.id) {
                <a class="playlist-card" [routerLink]="['/app/collection/playlist', playlist.id]">
                  <div class="playlist-card__art">
                    @if (playlist.artworkUrl) {
                      <img [src]="api.url(playlist.artworkUrl)" [alt]="playlist.name" />
                    } @else {
                      <span class="cover-fallback" aria-hidden="true"><app-icon name="library" [size]="18" /></span>
                    }
                    <span class="playlist-card__badge">Shared</span>
                  </div>
                  <h3>{{ playlist.name }}</h3>
                  <p class="small muted">From {{ playlist.ownerName || 'another listener' }} · {{ playlist.trackCount }} track{{ playlist.trackCount === 1 ? '' : 's' }}</p>
                </a>
              }
            </div>
          }

          @if (publicPlaylists().length) {
            <div class="section__head">
              <h2 class="section__title">Public on this server</h2>
              <span class="section__meta">{{ publicPlaylists().length }}</span>
            </div>
            <div class="card-grid">
              @for (playlist of publicPlaylists(); track playlist.id) {
                <a class="playlist-card" [routerLink]="['/app/collection/playlist', playlist.id]">
                  <div class="playlist-card__art">
                    @if (playlist.artworkUrl) {
                      <img [src]="api.url(playlist.artworkUrl)" [alt]="playlist.name" />
                    } @else {
                      <span class="cover-fallback" aria-hidden="true"><app-icon name="library" [size]="18" /></span>
                    }
                    <span class="playlist-card__badge">Public</span>
                  </div>
                  <h3>{{ playlist.name }}</h3>
                  <p class="small muted">By {{ playlist.ownerName || 'a listener' }} · {{ playlist.trackCount }} track{{ playlist.trackCount === 1 ? '' : 's' }}</p>
                </a>
              }
            </div>
          }
        </section>
      } @else {
        @if (library.albums().length) {
          <section class="section">
            <div class="card-grid">
              @for (album of library.albums(); track album.album) {
                <a class="playlist-card" [routerLink]="['/app/collection/album', album.album]">
                  <div class="playlist-card__art">
                    @if (album.artworkUrl) {
                      <img [src]="api.url(album.artworkUrl)" [alt]="album.album" />
                    } @else {
                      <span class="cover-fallback" aria-hidden="true"><app-icon name="music" [size]="18" /></span>
                    }
                  </div>
                  <h3>{{ album.album }}</h3>
                  <p class="small muted">{{ album.artist }} · {{ album.trackCount }} tracks</p>
                </a>
              }
            </div>
          </section>
        } @else {
          <p class="empty-copy">Albums appear here when imported tracks carry album metadata.</p>
        }
      }

      @if (addingTrack(); as track) {
        <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add track to playlist">
          <section class="modal">
            <header class="modal__head">
              <div>
                <p class="eyebrow">Add to playlist</p>
                <h2>{{ track.title }}</h2>
              </div>
              <button class="icon-btn" type="button" aria-label="Close" (click)="addingTrack.set(null)"><app-icon name="close" [size]="18" /></button>
            </header>
            @if (library.playlists().length) {
              <div class="result-list">
                @for (playlist of library.playlists(); track playlist.id) {
                  <button class="result-item result-item--button" type="button" (click)="addToPlaylist(playlist, track)">
                    <span class="result-item__mark"><app-icon name="library" [size]="17" /></span>
                    <span class="result-item__body">
                      <strong>{{ playlist.name }}</strong>
                      <small>{{ playlist.trackCount }} tracks</small>
                    </span>
                    <span aria-hidden="true">＋</span>
                  </button>
                }
              </div>
            } @else {
              <p class="empty-copy">Create a playlist first.</p>
            }
          </section>
        </div>
      }
    </main>
  `,
})
export class LibraryPage implements OnInit, OnDestroy {
  readonly api = inject(ApiService);
  readonly library = inject(LibraryService);
  private readonly auth = inject(AuthService);
  private readonly player = inject(PlayerService);
  private readonly ingest = inject(IngestService);
  private readonly toast = inject(ToastService);

  readonly tab = signal<Tab>('tracks');
  readonly adding = signal(false);
  readonly importMessage = signal<string | null>(null);
  readonly addingTrack = signal<Track | null>(null);

  url = '';
  kind: 'auto' | 'track' | 'playlist' = 'auto';
  playlistName = '';
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  async ngOnInit(): Promise<void> {
    await this.library.load();
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  ownedPlaylists(): Playlist[] {
    return this.library.playlists().filter((item) => item.relationship === 'owner');
  }

  sharedPlaylists(): Playlist[] {
    return this.library.playlists().filter((item) => item.relationship === 'shared');
  }

  publicPlaylists(): Playlist[] {
    return this.library.playlists().filter((item) => item.relationship === 'public');
  }

  async addMusic(): Promise<void> {
    if (!this.url.trim()) {
      this.toast.show('Paste a URL first.');
      return;
    }
    this.adding.set(true);
    this.importMessage.set(null);
    try {
      await this.ingest.create(this.url.trim(), this.kind);
      this.url = '';
      this.importMessage.set('Import started. This library will refresh when it finishes.');
      this.toast.show('Import started.');
      this.startRefreshLoop();
    } catch (error) {
      this.toast.show((error as Error).message);
    } finally {
      this.adding.set(false);
    }
  }

  private startRefreshLoop(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(async () => {
      if (this.ingest.hasActive()) return;
      if (this.refreshTimer) clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      await this.library.load(true);
      this.importMessage.set('Library refreshed.');
      this.toast.show('Import finished. Library refreshed.');
    }, 3000);
  }

  async play(track: Track): Promise<void> {
    await this.player.playTrack(track, this.library.tracks().map((item) => item.id));
  }

  async playAll(): Promise<void> {
    const first = this.library.tracks()[0];
    if (first) await this.play(first);
  }

  async queue(track: Track): Promise<void> {
    await this.player.enqueue(track);
  }

  async favorite(track: Track): Promise<void> {
    const updated = await this.library.updateTrack(track.id, {
      isFavorite: !track.isFavorite,
    });
    this.toast.show(updated.isFavorite ? 'Added to favourites.' : 'Removed from favourites.');
    await this.library.load(true);
  }

  canDelete(track: Track): boolean {
    return (
      this.auth.isAdmin() ||
      (track.storageKind === 'managed' &&
        track.createdBy === this.auth.user()?.id)
    );
  }

  async deleteTrack(track: Track): Promise<void> {
    const scanned = track.storageKind === 'external';
    const message = scanned
      ? `Remove “${track.title}” from Modulate? The original file in the music folder stays untouched.`
      : `Delete “${track.title}” and its downloaded file? This cannot be undone.`;
    if (!window.confirm(message)) return;
    try {
      await this.library.deleteTrack(track.id);
      await this.library.load(true);
      this.toast.show(scanned ? 'Removed from the library.' : 'Track deleted.');
    } catch (error) {
      this.toast.show((error as Error).message);
    }
  }

  startAdding(track: Track): void {
    this.addingTrack.set(track);
  }

  async addToPlaylist(playlist: Playlist, track: Track): Promise<void> {
    try {
      await this.library.addTrack(playlist.id, track.id);
      this.addingTrack.set(null);
      this.toast.show(`Added to “${playlist.name}”.`);
      await this.library.load(true);
    } catch (error) {
      this.toast.show((error as Error).message);
    }
  }

  async createPlaylist(): Promise<void> {
    if (!this.playlistName.trim()) return;
    try {
      await this.library.createPlaylist(this.playlistName.trim());
      this.playlistName = '';
      this.toast.show('Playlist created.');
    } catch (error) {
      this.toast.show((error as Error).message);
    }
  }
}
