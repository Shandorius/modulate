import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import {
  AlbumSummary,
  Playlist,
  PlaylistShare,
  Track,
  TrackSummary,
} from './models';

@Injectable({ providedIn: 'root' })
export class LibraryService {
  private readonly api = inject(ApiService);

  readonly tracks = signal<Track[]>([]);
  readonly playlists = signal<Playlist[]>([]);
  readonly albums = signal<AlbumSummary[]>([]);
  readonly summary = signal<TrackSummary | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async load(force = false): Promise<void> {
    if (
      !force &&
      (this.tracks().length ||
        this.playlists().length ||
        this.albums().length ||
        this.summary())
    ) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const [tracks, playlists, albums, summary] = await Promise.all([
        this.api.get<{ data: { tracks: Track[]; total: number } }>(
          '/tracks?limit=200&sort=recent',
        ),
        this.api.get<{ data: Playlist[] }>('/playlists'),
        this.api.get<{ data: AlbumSummary[] }>('/tracks/albums'),
        this.api.get<{ data: TrackSummary }>('/tracks/summary'),
      ]);
      this.tracks.set(tracks.data.tracks);
      this.playlists.set(playlists.data);
      this.albums.set(albums.data);
      this.summary.set(summary.data);
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async refreshTracks(query = ''): Promise<Track[]> {
    const response = await this.api.get<{ data: { tracks: Track[] } }>(
      `/tracks?limit=200&sort=recent${query ? `&q=${encodeURIComponent(query)}` : ''}`,
    );
    return response.data.tracks;
  }

  async search(query: string): Promise<{
    tracks: Track[];
    playlists: Playlist[];
    albums: AlbumSummary[];
  }> {
    const [tracks, playlists, albums] = await Promise.all([
      this.refreshTracks(query),
      this.api.get<{ data: Playlist[] }>('/playlists'),
      this.api.get<{ data: AlbumSummary[] }>('/tracks/albums'),
    ]);
    const needle = query.trim().toLowerCase();
    return {
      tracks,
      playlists: needle
        ? playlists.data.filter(
            (playlist) =>
              playlist.name.toLowerCase().includes(needle) ||
              (playlist.description || '').toLowerCase().includes(needle),
          )
        : playlists.data,
      albums: needle
        ? albums.data.filter(
            (album) =>
              album.album.toLowerCase().includes(needle) ||
              album.artist.toLowerCase().includes(needle),
          )
        : albums.data,
    };
  }

  async getPlaylist(id: string): Promise<Playlist> {
    const response = await this.api.get<{ data: Playlist }>(
      `/playlists/${id}`,
    );
    return response.data;
  }

  async getAlbum(name: string): Promise<{ album: string; tracks: Track[] }> {
    const response = await this.api.get<{
      data: { album: string; tracks: Track[] };
    }>(`/tracks/album?name=${encodeURIComponent(name)}`);
    return response.data;
  }

  async createPlaylist(
    name: string,
    description?: string,
  ): Promise<Playlist> {
    const response = await this.api.post<{ data: Playlist }>('/playlists', {
      name,
      description,
    });
    this.playlists.update((items) => [response.data, ...items]);
    return response.data;
  }

  async updatePlaylist(
    id: string,
    input: {
      name?: string;
      description?: string | null;
      visibility?: 'private' | 'public';
    },
  ): Promise<Playlist> {
    const response = await this.api.patch<{ data: Playlist }>(
      `/playlists/${id}`,
      input,
    );
    this.playlists.update((items) =>
      items.map((item) => (item.id === id ? response.data : item)),
    );
    return response.data;
  }

  async setVisibility(
    id: string,
    visibility: 'private' | 'public',
  ): Promise<Playlist> {
    const response = await this.api.patch<{ data: Playlist }>(
      `/playlists/${id}/visibility`,
      { visibility },
    );
    this.playlists.update((items) =>
      items.map((item) => (item.id === id ? response.data : item)),
    );
    return response.data;
  }

  async shares(id: string): Promise<PlaylistShare[]> {
    const response = await this.api.get<{ data: PlaylistShare[] }>(
      `/playlists/${id}/shares`,
    );
    return response.data;
  }

  async shareWith(
    id: string,
    userId: string,
    role: 'viewer' | 'editor' = 'viewer',
  ): Promise<PlaylistShare[]> {
    const response = await this.api.post<{ data: PlaylistShare[] }>(
      `/playlists/${id}/shares`,
      { userId, role },
    );
    await this.load(true);
    return response.data;
  }

  async updateShareRole(
    id: string,
    userId: string,
    role: 'viewer' | 'editor',
  ): Promise<PlaylistShare[]> {
    const response = await this.api.patch<{ data: PlaylistShare[] }>(
      `/playlists/${id}/shares/${userId}`,
      { role },
    );
    return response.data;
  }

  async unshare(id: string, userId: string): Promise<PlaylistShare[]> {
    const response = await this.api.delete<{ data: PlaylistShare[] }>(
      `/playlists/${id}/shares/${userId}`,
    );
    await this.load(true);
    return response.data;
  }

  async deletePlaylist(id: string): Promise<void> {
    await this.api.delete(`/playlists/${id}`);
    this.playlists.update((items) => items.filter((item) => item.id !== id));
  }

  async addTrack(playlistId: string, trackId: string): Promise<Playlist> {
    const response = await this.api.post<{ data: Playlist }>(
      `/playlists/${playlistId}/tracks`,
      { trackId },
    );
    this.playlists.update((items) =>
      items.map((item) =>
        item.id === playlistId
          ? { ...response.data, tracks: item.tracks }
          : item,
      ),
    );
    return response.data;
  }

  async reorderPlaylist(
    playlistId: string,
    trackIds: string[],
    expectedRevision?: number,
  ): Promise<Playlist> {
    const response = await this.api.put<{ data: Playlist }>(
      `/playlists/${playlistId}/order`,
      {
        trackIds,
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
      },
    );
    this.playlists.update((items) =>
      items.map((item) => (item.id === playlistId ? response.data : item)),
    );
    return response.data;
  }

  async removeTrack(playlistId: string, trackId: string): Promise<Playlist> {
    const response = await this.api.delete<{ data: Playlist }>(
      `/playlists/${playlistId}/tracks/${trackId}`,
    );
    return response.data;
  }

  async updateTrack(
    trackId: string,
    input: Partial<{
      title: string;
      artist: string;
      album: string | null;
      albumArtist: string | null;
      genre: string | null;
      isFavorite: boolean;
    }>,
  ): Promise<Track> {
    const response = await this.api.patch<{ data: Track }>(
      `/tracks/${trackId}`,
      input,
    );
    this.tracks.update((tracks) =>
      tracks.map((track) => (track.id === trackId ? response.data : track)),
    );
    return response.data;
  }

  async deleteTrack(trackId: string): Promise<void> {
    await this.api.delete(`/tracks/${trackId}`);
    this.tracks.update((tracks) => tracks.filter((track) => track.id !== trackId));
    this.playlists.update((playlists) =>
      playlists.map((playlist) => ({
        ...playlist,
        tracks: playlist.tracks?.filter((track) => track.id !== trackId),
      })),
    );
  }
}
