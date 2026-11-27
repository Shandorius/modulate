import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AdminUser, InstanceSettings } from './models';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly api = inject(ApiService);

  readonly users = signal<AdminUser[]>([]);
  readonly settings = signal<InstanceSettings | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [users, settings] = await Promise.all([
        this.api.get<{ data: AdminUser[] }>('/admin/users'),
        this.api.get<{ data: InstanceSettings }>('/admin/settings'),
      ]);
      this.users.set(users.data);
      this.settings.set(settings.data);
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async createUser(input: {
    email: string;
    password: string;
    displayName?: string;
    userType: 'user' | 'admin';
  }): Promise<AdminUser> {
    const response = await this.api.post<{ data: AdminUser }>(
      '/admin/users',
      input,
    );
    await this.load();
    return response.data;
  }

  async updateUser(
    id: string,
    input: { displayName?: string; userType?: 'user' | 'admin' },
  ): Promise<AdminUser> {
    const response = await this.api.patch<{ data: AdminUser }>(
      `/admin/users/${id}`,
      input,
    );
    await this.load();
    return response.data;
  }

  async deleteUser(id: string): Promise<void> {
    await this.api.delete(`/admin/users/${id}`);
    await this.load();
  }

  async setRegistration(allowRegistration: boolean): Promise<InstanceSettings> {
    const response = await this.api.put<{ data: InstanceSettings }>(
      '/admin/settings',
      { allowRegistration },
    );
    this.settings.set(response.data);
    return response.data;
  }
}
