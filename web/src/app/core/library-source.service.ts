import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

export interface LibrarySource {
  id: string;
  name: string;
  rootPath: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  error: string | null;
  total: number;
  processed: number;
  trackCount: number;
  addedCount: number;
  updatedCount: number;
  missingCount: number;
  lastScanAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class LibrarySourceService {
  private readonly api = inject(ApiService);

  readonly source = signal<LibrarySource | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const response = await this.api.get<{ data: LibrarySource }>(
        '/admin/library',
      );
      this.source.set(response.data);
      this.ensurePolling();
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async scan(): Promise<void> {
    this.error.set(null);
    try {
      const response = await this.api.post<{ data: LibrarySource }>(
        '/admin/library/scan',
        {},
      );
      this.source.set(response.data);
      this.ensurePolling();
    } catch (error) {
      this.error.set((error as Error).message);
      throw error;
    }
  }

  private ensurePolling(): void {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      if (this.source()?.status !== 'running') return;
      try {
        const response = await this.api.get<{ data: LibrarySource }>(
          '/admin/library',
        );
        this.source.set(response.data);
      } catch {
        // Keep the last known scan state.
      }
    }, 2000);
  }
}
