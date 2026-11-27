import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { HomeAssistantIntegration } from './models';

@Injectable({ providedIn: 'root' })
export class HomeAssistantService {
  private readonly api = inject(ApiService);

  readonly integration = signal<HomeAssistantIntegration | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const response = await this.api.get<{
        data: HomeAssistantIntegration;
      }>('/integrations/home-assistant');
      this.integration.set(response.data);
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async issueToken(label: string): Promise<string> {
    const response = await this.api.post<{ data: { token: string } }>(
      '/integrations/home-assistant/tokens',
      { label },
    );
    await this.load();
    return response.data.token;
  }

  async revokeToken(id: string): Promise<void> {
    await this.api.delete(`/integrations/home-assistant/tokens/${id}`);
    await this.load();
  }
}
