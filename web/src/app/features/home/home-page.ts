import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
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
  imports: [RouterLink, TrackRow, Icon],
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
              <p class="eyebrow">Recently added</p>
              <h2 class="section__title">Freshly filed</h2>
            </div>
            <a class="section__link" routerLink="/app/library">Open library</a>
          </div>
          <div class="track-list">
            @for (track of summary()?.recentlyAdded || []; track track.id) {
              <app-track-row
                [track]="track"
                (play)="playFromList($event, summary()?.recentlyAdded || [])"
                (queue)="queue($event)"
                (favorite)="favorite($event)"
              />
            }
          </div>
        </section>

        @if (library.playlists().length) {
          <section class="section">
            <div class="section__head">
              <div>
                <p class="eyebrow">In rotation</p>
                <h2 class="section__title">Playlists</h2>
              </div>
              <a class="section__link" routerLink="/app/library">All playlists</a>
            </div>
            <div class="card-grid">
              @for (playlist of library.playlists().slice(0, 4); track playlist.id) {
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
          </section>
        }
      }
    </main>
  `,
})
export class HomePage implements OnInit {
  readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  readonly library = inject(LibraryService);
  readonly player = inject(PlayerService);
  private readonly toast = inject(ToastService);

  get summary() {
    return this.library.summary;
  }

  async ngOnInit(): Promise<void> {
    await this.library.load();
  }

  async playLibrary(): Promise<void> {
    const first = this.library.tracks()[0];
    if (first) await this.playFromList(first, this.library.tracks());
  }

  async playFromList(track: Track, list: Track[]): Promise<void> {
    await this.player.playTrack(
      track,
      list.map((item) => item.id),
    );
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
