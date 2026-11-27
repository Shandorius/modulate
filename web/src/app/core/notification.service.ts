import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import {
  LocalPlan,
  NotificationPreferences,
} from './models';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly api = inject(ApiService);

  readonly preferences = signal<NotificationPreferences | null>(null);
  readonly plan = signal<LocalPlan | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [preferences, plan] = await Promise.all([
        this.api.get<{ data: NotificationPreferences }>(
          '/notifications/preferences',
        ),
        this.api.get<{ data: LocalPlan }>(
          '/notifications/local-plan?days=7',
        ),
      ]);
      this.preferences.set(preferences.data);
      this.plan.set(plan.data);
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async save(
    input: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const response = await this.api.put<{ data: NotificationPreferences }>(
      '/notifications/preferences',
      input,
    );
    this.preferences.set(response.data);
    await this.load();
    return response.data;
  }

  async sendTest(): Promise<void> {
    await this.api.post('/notifications/test', {});
    await this.load();
  }

  nextReminder(): LocalPlan['notifications'][number] | null {
    return this.plan()?.notifications[0] || null;
  }
}
