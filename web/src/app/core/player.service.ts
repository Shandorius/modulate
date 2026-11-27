import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { PlayerState, Track } from './models';
import { ToastService } from './toast.service';

function storedClientId(): string {
  const key = 'modulate.player.client';
  try {
    const existing = globalThis.localStorage?.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    globalThis.localStorage?.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

@Injectable({ providedIn: 'root' })
export class PlayerService {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly audio = new Audio();
  private readonly clientId = storedClientId();

  readonly state = signal<PlayerState | null>(null);
  readonly current = computed(() => this.state()?.current || null);
  readonly queue = computed(() => this.state()?.queue || []);
  readonly isPlaying = signal(false);
  readonly position = signal(0);
  readonly duration = signal(0);
  readonly volume = signal(0.8);
  readonly activePlayers = computed(() => this.state()?.activePlayers || 0);
  readonly announcement = computed(() => this.state()?.announcement || null);
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);

  private initialized = false;
  private loadedTrackId: string | null = null;
  private lastLocalAction = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reportTimer: ReturnType<typeof setInterval> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.audio.preload = 'metadata';
    this.audio.volume = this.volume();

    this.audio.addEventListener('timeupdate', () => {
      this.position.set(this.audio.currentTime || 0);
    });
    this.audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(this.audio.duration)) {
        this.duration.set(this.audio.duration);
      }
    });
    this.audio.addEventListener('play', () => this.isPlaying.set(true));
    this.audio.addEventListener('pause', () => this.isPlaying.set(false));
    this.audio.addEventListener('ended', () => void this.next());

    await this.heartbeat();
    await this.poll();
    this.pollTimer = setInterval(() => void this.poll(), 4000);
    this.heartbeatTimer = setInterval(() => void this.heartbeat(), 15000);
    this.reportTimer = setInterval(() => {
      if (!this.audio.paused && this.current()) {
        void this.report().catch(() => {});
      }
    }, 8000);
  }

  async destroy(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reportTimer) clearInterval(this.reportTimer);
    this.pollTimer = null;
    this.heartbeatTimer = null;
    this.reportTimer = null;
    this.audio.pause();
    this.initialized = false;
    await this.api
      .delete(`/player/presence/${encodeURIComponent(this.clientId)}`)
      .catch(() => {});
  }

  async heartbeat(): Promise<void> {
    try {
      await this.api.post('/player/presence', {
        clientId: this.clientId,
        platform: 'web',
      });
    } catch {
      // Presence is best-effort; playback still works locally.
    }
  }

  async poll(): Promise<void> {
    try {
      const response = await this.api.get<{ data: PlayerState }>(
        '/player/state',
      );
      this.applyState(response.data);
    } catch {
      // Do not interrupt playback on a transient network failure.
    }
  }

  private applyState(data: PlayerState, force = false): void {
    const previousTrack = this.loadedTrackId;
    this.state.set(data);
    this.volume.set(data.state.volume);
    this.audio.volume = data.state.volume;
    this.isPlaying.set(data.state.isPlaying);

    if (!data.current) {
      if (this.loadedTrackId) {
        this.audio.pause();
        this.audio.removeAttribute('src');
        this.audio.load();
        this.loadedTrackId = null;
        this.position.set(0);
        this.duration.set(0);
      }
      return;
    }

    if (previousTrack !== data.current.id) {
      this.loadedTrackId = data.current.id;
      this.audio.src = this.api.url(data.current.streamUrl);
      this.audio.load();
      this.position.set(data.state.positionSeconds);
      this.duration.set(data.current.durationSeconds);
      const seekTo = Math.min(
        data.state.positionSeconds,
        Math.max(0, data.current.durationSeconds - 0.25),
      );
      try {
        this.audio.currentTime = seekTo;
      } catch {
        this.audio.addEventListener(
          'loadedmetadata',
          () => {
            try {
              this.audio.currentTime = seekTo;
            } catch {
              // The browser will start from zero if it cannot seek yet.
            }
          },
          { once: true },
        );
      }
      if (data.state.isPlaying) void this.tryPlay();
      return;
    }

    this.duration.set(data.current.durationSeconds);
    if (Date.now() - this.lastLocalAction < 2200 && !force) return;

    if (
      Math.abs(this.audio.currentTime - data.state.positionSeconds) > 4 &&
      Number.isFinite(this.audio.currentTime)
    ) {
      this.audio.currentTime = data.state.positionSeconds;
      this.position.set(data.state.positionSeconds);
    }
    if (data.state.isPlaying && this.audio.paused) void this.tryPlay();
    if (!data.state.isPlaying && !this.audio.paused) this.audio.pause();
  }

  private async tryPlay(): Promise<void> {
    try {
      await this.audio.play();
    } catch {
      this.error.set('Tap play once to allow audio on this device.');
    }
  }

  private markLocal(): void {
    this.lastLocalAction = Date.now();
  }

  private async action(
    body: Record<string, unknown>,
    force = false,
  ): Promise<PlayerState | null> {
    this.loading.set(true);
    this.error.set(null);
    this.markLocal();
    try {
      const response = await this.api.post<{ data: PlayerState }>(
        '/player/action',
        body,
      );
      this.applyState(response.data, force);
      return response.data;
    } catch (error) {
      this.error.set((error as Error).message);
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  async playTrack(track: Track, trackIds?: string[]): Promise<void> {
    await this.action({
      action: 'play_track',
      trackId: track.id,
      ...(trackIds?.length ? { trackIds } : {}),
    }, true);
    await this.tryPlay();
  }

  async playPlaylist(playlistId: string): Promise<void> {
    await this.action({ action: 'play_playlist', playlistId }, true);
    await this.tryPlay();
  }

  async togglePlay(): Promise<void> {
    if (this.audio.paused) {
      if (!this.current()) {
        await this.action({ action: 'play' }, true);
      } else {
        this.markLocal();
        await this.tryPlay();
        await this.action({ action: 'play' });
      }
    } else {
      this.audio.pause();
      await this.action({ action: 'pause' });
    }
  }

  async next(): Promise<void> {
    await this.action({ action: 'next' }, true);
    if (this.isPlaying()) await this.tryPlay();
  }

  async previous(): Promise<void> {
    await this.action({ action: 'previous' }, true);
    if (this.isPlaying()) await this.tryPlay();
  }

  async seek(positionSeconds: number): Promise<void> {
    this.markLocal();
    this.audio.currentTime = positionSeconds;
    this.position.set(positionSeconds);
    await this.action({ action: 'seek', positionSeconds });
  }

  async setVolume(volume: number): Promise<void> {
    const clamped = Math.min(Math.max(volume, 0), 1);
    this.volume.set(clamped);
    this.audio.volume = clamped;
    await this.action({ action: 'volume', volume: clamped });
  }

  async enqueue(track: Track): Promise<void> {
    await this.action({ action: 'enqueue', trackId: track.id });
    this.toast.show('Added to the queue.');
  }

  async removeQueueItem(queueId: string): Promise<void> {
    await this.action({ action: 'remove_queue_item', queueId });
  }

  async clearQueue(): Promise<void> {
    this.audio.pause();
    await this.action({ action: 'clear_queue' }, true);
  }

  async setRepeat(mode: 'off' | 'all' | 'one'): Promise<void> {
    await this.action({ action: 'set_repeat', repeatMode: mode });
  }

  async report(): Promise<void> {
    if (!this.current()) return;
    await this.api.post('/player/action', {
      action: 'report',
      positionSeconds: this.audio.currentTime || 0,
      isPlaying: !this.audio.paused,
    });
  }

  async acknowledgeAnnouncement(id: string): Promise<void> {
    await this.action({ action: 'ack_announcement', announcementId: id });
  }

  formatTime(seconds: number | null | undefined): string {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(value / 60);
    const remainder = String(value % 60).padStart(2, '0');
    return `${minutes}:${remainder}`;
  }
}
