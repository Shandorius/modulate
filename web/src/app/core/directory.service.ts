import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { DirectoryUser } from './models';

@Injectable({ providedIn: 'root' })
export class DirectoryService {
  private readonly api = inject(ApiService);
  readonly users = signal<DirectoryUser[]>([]);
  readonly loading = signal(false);

  async load(): Promise<DirectoryUser[]> {
    this.loading.set(true);
    try {
      const response = await this.api.get<{ data: DirectoryUser[] }>(
        '/users/directory',
      );
      this.users.set(response.data);
      return response.data;
    } finally {
      this.loading.set(false);
    }
  }
}
