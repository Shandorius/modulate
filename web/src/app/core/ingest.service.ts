import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { IngestJob } from './models';

@Injectable({ providedIn: 'root' })
export class IngestService {
  private readonly api = inject(ApiService);

  readonly jobs = signal<IngestJob[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const response = await this.api.get<{ data: IngestJob[] }>(
        '/ingest/jobs',
      );
      this.jobs.set(response.data);
      this.ensurePolling();
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async create(
    url: string,
    kind: 'auto' | 'track' | 'playlist' = 'auto',
  ): Promise<IngestJob> {
    const response = await this.api.post<{ data: IngestJob }>('/ingest', {
      url,
      kind,
    });
    this.jobs.update((jobs) => [response.data, ...jobs]);
    this.ensurePolling();
    return response.data;
  }

  async cancel(id: string): Promise<void> {
    const response = await this.api.delete<{ data: IngestJob }>(
      `/ingest/jobs/${id}`,
    );
    this.replace(response.data);
  }

  async retry(id: string): Promise<void> {
    const response = await this.api.post<{ data: IngestJob }>(
      `/ingest/jobs/${id}/retry`,
    );
    this.replace(response.data);
    this.ensurePolling();
  }

  hasActive(): boolean {
    return this.jobs().some(
      (job) => job.status === 'queued' || job.status === 'running',
    );
  }

  private replace(job: IngestJob): void {
    this.jobs.update((jobs) =>
      jobs.map((item) => (item.id === job.id ? job : item)),
    );
  }

  private ensurePolling(): void {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      if (!this.hasActive()) return;
      try {
        const response = await this.api.get<{ data: IngestJob[] }>(
          '/ingest/jobs',
        );
        this.jobs.set(response.data);
      } catch {
        // Keep the last known state.
      }
    }, 2500);
  }
}
