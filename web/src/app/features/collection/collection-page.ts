import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuraService } from '../../core/aura.service';
import { DirectoryService } from '../../core/directory.service';
import { LibraryService } from '../../core/library.service';
import {
  DirectoryUser,
  Playlist,
  PlaylistShare,
  Track,
} from '../../core/models';
import { PlayerService } from '../../core/player.service';
import { ToastService } from '../../core/toast.service';
import { TrackRow } from '../shared/track-row';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-collection-page',
  imports: [FormsModule, RouterLink, TrackRow, Icon],
  template: `
    <main class="page">
      @if (loading()) {
        <div class="section">
          <div class="skeleton skeleton--hero"></div>
          <div class="skeleton skeleton--row"></div>
          <div class="skeleton skeleton--row"></div>
        </div>
      } @else if (error()) {
        <section class="empty-state">
          <h2>This collection could not be opened.</h2>
          <p>{{ error() }}</p>
          <a class="btn btn--ghost" routerLink="/app/library">Back to library</a>
        </section>
      } @else {
        <header class="collection-head">
          <div class="collection-head__art">
            @if (artworkUrl()) {
              <img [src]="api.url(artworkUrl())" [alt]="title()" />
            } @else {
              <span class="cover-fallback" aria-hidden="true"><app-icon name="music" [size]="34" /></span>
            }
          </div>
          <div class="collection-head__body">
            <a class="settings-back" routerLink="/app/library"><app-icon name="chevron-left" [size]="14" /> Library</a>
            <p class="eyebrow">{{ isPlaylist() ? (playlist()?.canManage ? 'Your playlist' : playlist()?.visibility === 'public' ? 'Public playlist' : 'Shared playlist') : 'Album' }}</p>
            <h1 class="display collection-head__title">{{ title() }}</h1>
            <p class="muted">{{ subtitle() }}</p>
            @if (isPlaylist() && playlist(); as list) {
              <p class="collection-byline">
                By {{ list.ownerName || 'a listener' }}
                <span class="dot">·</span>
                <span class="visibility-label">
                  {{ list.myRole === 'editor' ? 'Editor' : list.visibility === 'public' ? 'Public on this server' : 'Shared with you' }}
                </span>
              </p>
            }
            <div class="button-row">
              <button class="btn btn--primary" type="button" [disabled]="!tracks().length" (click)="playAll()">Play</button>
              @if (isPlaylist() && playlist()?.canEditTracks) {
                <button class="btn btn--ghost" type="button" (click)="showAdd.set(true)">Add tracks</button>
                <button class="btn btn--quiet" type="button" (click)="toggleReorder()">
                  <app-icon name="grip" [size]="16" /> {{ reorderMode() ? 'Done' : 'Reorder' }}
                </button>
              }
              @if (isPlaylist() && playlist()?.canManage) {
                <button class="btn btn--quiet" type="button" (click)="startRename()">Rename</button>
                <button class="btn btn--quiet" type="button" (click)="openShare()"><app-icon name="share" [size]="16" /> Share</button>
              }
            </div>
          </div>
        </header>

        @if (isPlaylist() && playlist(); as list) {
          @if (renaming()) {
            <form class="inline-create" (ngSubmit)="saveRename()">
              <input class="input" name="name" [(ngModel)]="playlistName" aria-label="Playlist name" />
              <button class="btn btn--ghost" type="submit">Save</button>
              <button class="btn btn--quiet" type="button" (click)="renaming.set(false)">Cancel</button>
            </form>
          }
          <div class="collection-meta">
            <span>{{ list.trackCount }} track{{ list.trackCount === 1 ? '' : 's' }}</span>
            <span>{{ player.formatTime(list.durationSeconds) }}</span>
            <span>{{ list.shareCount }} shared</span>
            @if (list.canManage) {
              <button class="text-button" type="button" (click)="deletePlaylist()">Delete playlist</button>
            }
          </div>
        }

        @if (tracks().length) {
          @if (reorderMode()) {
            <div class="track-list reorder-list">
              @for (track of tracks(); track track.id; let index = $index) {
                <app-track-row
                  [track]="track"
                  [reorderable]="true"
                  [reorderIndex]="index"
                  [canMoveUp]="index > 0"
                  [canMoveDown]="index < tracks().length - 1"
                  (moveUp)="moveTrack(index, -1)"
                  (moveDown)="moveTrack(index, 1)"
                  (dragStart)="draggedIndex.set($event)"
                  (dropAt)="dropAt($event)"
                />
              }
            </div>
          } @else {
            <div class="track-list">
              @for (track of tracks(); track track.id) {
                <app-track-row
                  [track]="track"
                  [removable]="isPlaylist() && (playlist()?.canEditTracks || false)"
                  (play)="play($event)"
                  (queue)="queue($event)"
                  (favorite)="favorite($event)"
                  (remove)="removeTrack($event)"
                />
              }
            </div>
          }
        } @else {
          <section class="empty-state">
            <span class="empty-state__mark" aria-hidden="true"><app-icon name="music" [size]="34" /></span>
            <h2>{{ isPlaylist() ? 'This playlist is empty.' : 'This album has no tracks.' }}</h2>
            <p>{{ isPlaylist() ? 'Add tracks from your library to start shaping it.' : 'Import more music to fill this album.' }}</p>
            @if (isPlaylist() && playlist()?.canEditTracks) {
              <button class="btn btn--primary" type="button" (click)="showAdd.set(true)">Add tracks</button>
            }
          </section>
        }
      }

      @if (showAdd()) {
        <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add tracks">
          <section class="modal">
            <header class="modal__head">
              <div>
                <p class="eyebrow">From the shared library</p>
                <h2>Add tracks</h2>
              </div>
              <button class="icon-btn" type="button" aria-label="Close" (click)="showAdd.set(false)"><app-icon name="close" [size]="18" /></button>
            </header>
            @if (availableTracks().length) {
              <div class="track-list track-list--compact">
                @for (track of availableTracks(); track track.id) {
                  <app-track-row
                    [track]="track"
                    [showAdd]="true"
                    (play)="play($event)"
                    (queue)="queue($event)"
                    (favorite)="favorite($event)"
                    (add)="addTrack($event)"
                  />
                }
              </div>
            } @else {
              <p class="empty-copy">Every track in the library is already in this playlist.</p>
            }
          </section>
        </div>
      }

      @if (shareOpen() && playlist(); as list) {
        <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Share playlist">
          <section class="modal">
            <header class="modal__head">
              <div>
                <p class="eyebrow">Who can listen?</p>
                <h2>Share “{{ list.name }}”</h2>
              </div>
              <button class="icon-btn" type="button" aria-label="Close" (click)="shareOpen.set(false)"><app-icon name="close" [size]="18" /></button>
            </header>

            <div class="share-visibility card">
              <div>
                <strong>{{ list.visibility === 'public' ? 'Public on this server' : 'Private' }}</strong>
                <p class="small muted">
                  {{ list.visibility === 'public'
                    ? 'Every account on this instance can see and play this playlist.'
                    : 'Only you and the people you choose can see this playlist.' }}
                </p>
              </div>
              <button class="btn btn--ghost btn--sm" type="button" (click)="toggleVisibility()">
                {{ list.visibility === 'public' ? 'Make private' : 'Make public' }}
              </button>
            </div>

            <form class="inline-create share-form" (ngSubmit)="shareWithSelected()">
              <select class="select" name="shareUser" [(ngModel)]="selectedUserId" aria-label="Choose a user">
                <option value="">Choose a user…</option>
                @for (user of availableUsers(); track user.id) {
                  <option [value]="user.id">{{ user.displayName || user.email }} · {{ user.email }}</option>
                }
              </select>
              <select class="select" name="shareRole" [(ngModel)]="shareRole" aria-label="Permission">
                <option value="viewer">Can view</option>
                <option value="editor">Can edit</option>
              </select>
              <button class="btn btn--primary" type="submit" [disabled]="!selectedUserId">Share</button>
            </form>

            @if (shares().length) {
              <div class="result-list">
                @for (share of shares(); track share.userId) {
                  <div class="result-item">
                    <span class="result-item__mark"><app-icon name="users" [size]="17" /></span>
                    <span class="result-item__body">
                      <strong>{{ share.displayName || share.email }}</strong>
                      <small>{{ share.email }}</small>
                    </span>
                    <select class="select share-role" [value]="share.role" (change)="changeShareRole(share, $event)" aria-label="Permission">
                      <option value="viewer">Can view</option>
                      <option value="editor">Can edit</option>
                    </select>
                    <button class="text-button text-button--danger" type="button" (click)="unshare(share.userId)">Remove</button>
                  </div>
                }
              </div>
            } @else {
              <p class="empty-copy">Not shared with anyone yet.</p>
            }
          </section>
        </div>
      }
    </main>
  `,
})
export class CollectionPage implements OnInit, OnDestroy {
  readonly api = inject(ApiService);
  readonly player = inject(PlayerService);
  private readonly library = inject(LibraryService);
  private readonly aura = inject(AuraService);
  private readonly directory = inject(DirectoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly tracks = signal<Track[]>([]);
  readonly playlist = signal<Playlist | null>(null);
  readonly isPlaylist = signal(false);
  readonly title = signal('');
  readonly subtitle = signal('');
  readonly artworkUrl = signal<string | null>(null);
  readonly showAdd = signal(false);
  readonly renaming = signal(false);
  readonly shareOpen = signal(false);
  readonly shares = signal<PlaylistShare[]>([]);
  readonly reorderMode = signal(false);
  readonly draggedIndex = signal<number | null>(null);

  private lastSavedTracks: Track[] = [];
  private orderTimer: ReturnType<typeof setTimeout> | null = null;
  private orderSequence = 0;

  playlistName = '';
  selectedUserId = '';
  shareRole: 'viewer' | 'editor' = 'viewer';

  availableTracks(): Track[] {
    const used = new Set(this.tracks().map((track) => track.id));
    return this.library.tracks().filter((track) => !used.has(track.id));
  }

  availableUsers(): DirectoryUser[] {
    const shared = new Set(this.shares().map((share) => share.userId));
    return this.directory.users().filter((user) => !shared.has(user.id));
  }

  async ngOnInit(): Promise<void> {
    const type = this.route.snapshot.paramMap.get('type');
    const id = decodeURIComponent(this.route.snapshot.paramMap.get('id') || '');
    if (!id || (type !== 'playlist' && type !== 'album')) {
      await this.router.navigateByUrl('/app/library');
      return;
    }

    try {
      await this.library.load();
      if (type === 'playlist') {
        this.isPlaylist.set(true);
        const playlist = await this.library.getPlaylist(id);
        this.playlist.set(playlist);
        this.tracks.set(playlist.tracks || []);
        this.lastSavedTracks = [...(playlist.tracks || [])];
        this.title.set(playlist.name);
        this.subtitle.set(playlist.description || 'A playlist from the library.');
        this.artworkUrl.set(playlist.artworkUrl);
        this.aura.setFromUrl(playlist.artworkUrl ? this.api.url(playlist.artworkUrl) : null);
        this.playlistName = playlist.name;
      } else {
        const album = await this.library.getAlbum(id);
        this.tracks.set(album.tracks);
        this.title.set(album.album);
        this.subtitle.set(
          `${album.tracks[0]?.artist || 'Unknown artist'} · ${album.tracks.length} tracks`,
        );
        const albumArtwork = album.tracks.find((track) => track.artworkUrl)?.artworkUrl || null;
        this.artworkUrl.set(albumArtwork);
        this.aura.setFromUrl(albumArtwork ? this.api.url(albumArtwork) : null);
      }
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async playAll(): Promise<void> {
    if (this.isPlaylist() && this.playlist()) {
      await this.player.playPlaylist(this.playlist()!.id);
    } else {
      const first = this.tracks()[0];
      if (first) await this.play(first);
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

  startRename(): void {
    this.playlistName = this.playlist()?.name || '';
    this.renaming.set(true);
  }

  async saveRename(): Promise<void> {
    if (!this.playlist() || !this.playlistName.trim()) return;
    const updated = await this.library.updatePlaylist(this.playlist()!.id, {
      name: this.playlistName.trim(),
    });
    this.playlist.set(updated);
    this.title.set(updated.name);
    this.renaming.set(false);
    this.toast.show('Playlist renamed.');
  }

  async addTrack(track: Track): Promise<void> {
    if (!this.playlist()) return;
    try {
      const updated = await this.library.addTrack(this.playlist()!.id, track.id);
      this.playlist.set(updated);
      this.tracks.set(updated.tracks || []);
      this.artworkUrl.set(updated.artworkUrl);
      this.toast.show(`Added “${track.title}”.`);
    } catch (error) {
      this.toast.show((error as Error).message);
    }
  }

  async removeTrack(track: Track): Promise<void> {
    if (!this.playlist()) return;
    try {
      const updated = await this.library.removeTrack(this.playlist()!.id, track.id);
      this.playlist.set(updated);
      this.tracks.set(updated.tracks || []);
      this.artworkUrl.set(updated.artworkUrl);
      this.toast.show('Removed from playlist.');
    } catch (error) {
      this.toast.show((error as Error).message);
    }
  }

  async openShare(): Promise<void> {
    if (!this.playlist()) return;
    this.shareOpen.set(true);
    this.selectedUserId = '';
    try {
      const [shares] = await Promise.all([
        this.library.shares(this.playlist()!.id),
        this.directory.load(),
      ]);
      this.shares.set(shares);
    } catch (error) {
      this.toast.show((error as Error).message);
    }
  }

  async shareWithSelected(): Promise<void> {
    if (!this.playlist() || !this.selectedUserId) return;
    const role = this.shareRole;
    try {
      const shares = await this.library.shareWith(
        this.playlist()!.id,
        this.selectedUserId,
        role,
      );
      this.shares.set(shares);
      const updated = await this.library.getPlaylist(this.playlist()!.id);
      this.playlist.set(updated);
      this.selectedUserId = '';
      this.shareRole = 'viewer';
      this.toast.show(
        role === 'editor'
          ? 'Playlist shared with edit access.'
          : 'Playlist shared.',
      );
    } catch (error) {
      this.toast.show((error as Error).message);
    }
  }

  async changeShareRole(
    share: PlaylistShare,
    event: Event,
  ): Promise<void> {
    if (!this.playlist()) return;
    const role = (event.target as HTMLSelectElement).value as
      | 'viewer'
      | 'editor';
    try {
      const shares = await this.library.updateShareRole(
        this.playlist()!.id,
        share.userId,
        role,
      );
      this.shares.set(shares);
      this.toast.show('Permission updated.');
    } catch (error) {
      this.toast.show((error as Error).message);
    }
  }

  async unshare(userId: string): Promise<void> {
    if (!this.playlist()) return;
    try {
      const shares = await this.library.unshare(this.playlist()!.id, userId);
      this.shares.set(shares);
      const updated = await this.library.getPlaylist(this.playlist()!.id);
      this.playlist.set(updated);
      this.toast.show('Share removed.');
    } catch (error) {
      this.toast.show((error as Error).message);
    }
  }

  async toggleVisibility(): Promise<void> {
    const playlist = this.playlist();
    if (!playlist) return;
    const visibility = playlist.visibility === 'public' ? 'private' : 'public';
    try {
      const updated = await this.library.setVisibility(playlist.id, visibility);
      this.playlist.set(updated);
      await this.library.load(true);
      this.toast.show(
        visibility === 'public'
          ? 'Playlist is now visible to everyone on this server.'
          : 'Playlist is private again.',
      );
    } catch (error) {
      this.toast.show((error as Error).message);
    }
  }

  ngOnDestroy(): void {
    this.flushOrder();
  }

  toggleReorder(): void {
    if (this.reorderMode()) {
      this.flushOrder();
      this.reorderMode.set(false);
      return;
    }
    this.lastSavedTracks = [...this.tracks()];
    this.reorderMode.set(true);
  }

  moveTrack(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.tracks().length) return;
    this.moveTo(index, target);
  }

  dropAt(target: number): void {
    const from = this.draggedIndex();
    this.draggedIndex.set(null);
    if (from === null || from === target) return;
    this.moveTo(from, target);
  }

  private moveTo(from: number, to: number): void {
    const next = [...this.tracks()];
    if (from < 0 || from >= next.length || to < 0 || to >= next.length) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    this.tracks.set(next);
    this.scheduleOrderSave();
  }

  private scheduleOrderSave(): void {
    if (this.orderTimer) clearTimeout(this.orderTimer);
    this.orderTimer = setTimeout(() => {
      this.orderTimer = null;
      void this.saveOrder();
    }, 350);
  }

  private flushOrder(): void {
    if (!this.orderTimer) return;
    clearTimeout(this.orderTimer);
    this.orderTimer = null;
    void this.saveOrder();
  }

  private async saveOrder(): Promise<void> {
    const playlist = this.playlist();
    if (!playlist) return;
    const sequence = ++this.orderSequence;
    const trackIds = this.tracks().map((track) => track.id);
    try {
      const updated = await this.library.reorderPlaylist(
        playlist.id,
        trackIds,
        playlist.revision,
      );
      if (sequence !== this.orderSequence) return;
      this.playlist.set(updated);
      this.lastSavedTracks = [...this.tracks()];
    } catch (error) {
      if (sequence !== this.orderSequence) return;
      this.tracks.set(this.lastSavedTracks);
      await this.library.load(true);
      this.toast.show((error as Error).message);
    }
  }

  async deletePlaylist(): Promise<void> {
    const playlist = this.playlist();
    if (!playlist) return;
    if (!window.confirm(`Delete “${playlist.name}”? The tracks stay in the shared library.`)) return;
    await this.library.deletePlaylist(playlist.id);
    this.toast.show('Playlist deleted.');
    await this.router.navigateByUrl('/app/library');
  }
}
