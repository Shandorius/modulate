import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LibraryService } from '../../core/library.service';
import { Track } from '../../core/models';
import { PlayerService } from '../../core/player.service';
import { ToastService } from '../../core/toast.service';
import { TrackRow } from '../shared/track-row';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-home-page',
  imports: [FormsModule, RouterLink, TrackRow, Icon],
  template: `
    <main class="page">
      <section class="home-hero">
        <div class="home-hero__copy">
          <p class="eyebrow">Your collection</p>
          <h1 class="display home-hero__title">
            @if (auth.user()?.displayName) {
              Good listening, {{ auth.user()?.displayName }}.
            } @else {
              Your records, your rooms.
            }
          </h1>
          <p class="lede">
            @if (summary()?.counts; as counts) {
              {{ counts.tracks }} tracks across {{ counts.albums }} albums, kept on this server.
            } @else {
              A private library for the music you chose to keep.
            }
          </p>
          <div class="button-row">
            @if (library.tracks().length) {
              <button class="btn btn--primary" type="button" (click)="playLibrary()">Play the library</button>
            }
            <a class="btn btn--ghost" routerLink="/app/settings/ingest">Add music</a>
          </div>
        </div>
        <div class="home-hero__art" aria-hidden="true">
          @if (summary()?.recentlyAdded?.[0]?.artworkUrl) {
            <div class="hero-aura"></div>
            <img [src]="api.url(summary()!.recentlyAdded[0].artworkUrl)" alt="" />
          } @else {
            <div class="hero-cover-placeholder"><app-icon name="music" [size]="46" /></div>
          }
        </div>
      </section>

      @if (player.current(); as current) {
        <section class="continue-card">
          <div class="continue-card__art">
            @if (current.artworkUrl) {
              <img [src]="api.url(current.artworkUrl)" [alt]="current.album || current.title" />
            } @else {
              <span class="cover-fallback" aria-hidden="true"><app-icon name="music" [size]="22" /></span>
            }
          </div>
          <div class="continue-card__body">
            <p class="eyebrow">Still on the turntable</p>
            <h2>{{ current.title }}</h2>
            <p class="muted">{{ current.artist }}</p>
            <div class="continue-card__actions">
              <button class="btn btn--primary btn--sm" type="button" (click)="player.togglePlay()">
                {{ player.isPlaying() ? 'Pause' : 'Continue' }}
              </button>
              <button class="btn btn--quiet btn--sm" type="button" (click)="player.next()">Next</button>
            </div>
          </div>
        </section>
      }

      @if (library.loading() && !summary()) {
        <section class="section">
          <div class="skeleton skeleton--title"></div>
          <div class="skeleton skeleton--row"></div>
          <div class="skeleton skeleton--row"></div>
        </section>
      } @else if (!library.tracks().length) {
        <section class="empty-state">
          <span class="empty-state__mark" aria-hidden="true"><app-icon name="music" [size]="34" /></span>
          <h2>Nothing on the shelf yet.</h2>
          <p>Add a track or playlist URL. Modulate will fetch the audio, artwork, and metadata into your own library.</p>
          <a class="btn btn--primary" routerLink="/app/settings/ingest">Add your first music</a>
        </section>
      } @else {
        <section class="section">
          <div class="section__head">
            <div>
              <p class="eyebrow">In rotation</p>
              <h2 class="section__title">Playlists</h2>
            </div>
            <div class="section__actions">
              <button class="btn btn--ghost btn--sm" type="button" (click)="openCreate()">
                <app-icon name="plus" [size]="15" /> New playlist
              </button>
              <a class="section__link" routerLink="/app/library" [queryParams]="{ tab: 'playlists' }">All playlists</a>
            </div>
          </div>
          @if (playlists().length) {
            <div class="card-grid">
              @for (playlist of playlists(); track playlist.id) {
                <a class="playlist-card" [routerLink]="['/app/collection/playlist', playlist.id]">
                  <div class="playlist-card__art">
                    @if (playlist.artworkUrl) {
                      <img [src]="api.url(playlist.artworkUrl)" [alt]="playlist.name" />
                    } @else {
                      <span class="cover-fallback" aria-hidden="true"><app-icon name="library" [size]="18" /></span>
                    }
                  </div>
                  <h3>{{ playlist.name }}</h3>
                  <p class="small muted">
                    {{ playlist.trackCount }} track{{ playlist.trackCount === 1 ? '' : 's' }}
                    {{ playlist.relationship === 'owner' ? '' : '· ' + (playlist.ownerName || 'shared') }}
                  </p>
                </a>
              }
            </div>
          } @else {
            <div class="home-empty">
              <p class="muted">No playlists yet. Group tracks into a mix for a room, a mood, or a drive.</p>
              <button class="btn btn--primary btn--sm" type="button" (click)="openCreate()">Create a playlist</button>
            </div>
          }
        </section>

        <section class="section">
          <div class="section__head">
            <div>
              <p class="eyebrow">Recently added</p>
              <h2 class="section__title">Freshly filed</h2>
            </div>
            <a class="section__link" routerLink="/app/library">Open library</a>
          </div>
          <div class="track-list">
            @for (track of summary()?.recentlyAdded || []; track track.id) {
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

      @if (createOpen()) {
        <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="New playlist">
          <section class="modal modal--compact">
            <header class="modal__head">
              <div>
                <p class="eyebrow">Start a collection</p>
                <h2>New playlist</h2>
              </div>
              <button class="icon-btn" type="button" aria-label="Close" (click)="closeCreate()"><app-icon name="close" [size]="18" /></button>
            </header>
            <form class="create-form" (ngSubmit)="createPlaylist()">
              <input
                class="input"
                name="playlistName"
                [(ngModel)]="playlistName"
                placeholder="Playlist name"
                aria-label="Playlist name"
                maxlength="180"
              />
              <div class="modal__actions">
                <button class="btn btn--quiet" type="button" (click)="closeCreate()">Cancel</button>
                <button class="btn btn--primary" type="submit" [disabled]="!playlistName.trim() || creating()">
                  {{ creating() ? 'Creating…' : 'Create' }}
                </button>
              </div>
            </form>
          </section>
        </div>
      }
    </main>
  `,
})
export class HomePage implements OnInit {
  readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  readonly library = inject(LibraryService);
  readonly player = inject(PlayerService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly createOpen = signal(false);
  readonly creating = signal(false);
  readonly playlists = computed(() => this.library.playlists().slice(0, 4));
  playlistName = '';

  get summary() {
    return this.library.summary;
  }

  async ngOnInit(): Promise<void> {
    await this.library.load();
  }

  openCreate(): void {
    this.playlistName = '';
    this.createOpen.set(true);
  }

  closeCreate(): void {
    if (this.creating()) return;
    this.createOpen.set(false);
  }

  async createPlaylist(): Promise<void> {
    const name = this.playlistName.trim();
    if (!name || this.creating()) return;
    this.creating.set(true);
    try {
      const playlist = await this.library.createPlaylist(name);
      this.createOpen.set(false);
      this.playlistName = '';
      this.toast.show('Playlist created.');
      await this.router.navigate(['/app/collection/playlist', playlist.id]);
    } catch (error) {
      this.toast.show((error as Error).message);
    } finally {
      this.creating.set(false);
    }
  }

  async playLibrary(): Promise<void> {
    const first = this.library.tracks()[0];
    if (first) {
      await this.player.playTrack(
        first,
        this.library.tracks().map((item) => item.id),
      );
    }
  }

  async play(track: Track): Promise<void> {
    await this.player.playTrack(track);
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
}
