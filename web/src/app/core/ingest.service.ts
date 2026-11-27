import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { LibraryService } from './library.service';
import { IngestJob } from './models';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class IngestService {
  private readonly api = inject(ApiService);
  private readonly library = inject(LibraryService);
  private readonly toast = inject(ToastService);

  readonly jobs = signal<IngestJob[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;
  private refreshingLibrary = false;

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.fetchJobs();
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

  private async fetchJobs(): Promise<void> {
    const previous = new Map(
      this.jobs().map((job) => [job.id, job.status] as const),
    );
    const response = await this.api.get<{ data: IngestJob[] }>(
      '/ingest/jobs',
    );
    const jobs = response.data;
    this.jobs.set(jobs);

    const finished = jobs.filter(
      (job) =>
        (job.status === 'completed' || job.status === 'failed') &&
        previous.has(job.id) &&
        previous.get(job.id) !== job.status,
    );
    if (!finished.length) return;

    const imported = finished.reduce(
      (total, job) => total + Number(job.resultCount || 0),
      0,
    );
    const failed = finished.filter((job) => job.status === 'failed').length;
    if (failed) {
      this.toast.show(
        failed === 1 ? 'An import needs attention.' : `${failed} imports need attention.`,
      );
    } else if (imported > 0) {
      this.toast.show(
        imported === 1 ? 'Imported 1 track.' : `Imported ${imported} tracks.`,
      );
    } else {
      this.toast.show('Import finished. The music was already in the library.');
    }

    if (this.refreshingLibrary) return;
    this.refreshingLibrary = true;
    try {
      await this.library.load(true);
    } finally {
      this.refreshingLibrary = false;
    }
  }

  private ensurePolling(): void {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      if (!this.hasActive()) return;
      try {
        await this.fetchJobs();
      } catch {
        // Keep the last known state.
      }
    }, 2500);
  }
}
