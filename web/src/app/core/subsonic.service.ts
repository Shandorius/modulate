import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

export interface SubsonicKey {
  id: string;
  label: string | null;
  hint: string | null;
  lastUsedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface SubsonicIntegration {
  baseUrl: string;
  endpoint: string;
  owner: string;
  keys: SubsonicKey[];
}

export interface IssuedSubsonicKey {
  token: string;
  label: string;
  hint: string;
  expiresAt: string;
  baseUrl: string;
  endpoint: string;
  owner: string;
}

@Injectable({ providedIn: 'root' })
export class SubsonicService {
  private readonly api = inject(ApiService);

  readonly integration = signal<SubsonicIntegration | null>(null);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    this.error.set(null);
    try {
      const response = await this.api.get<{ data: SubsonicIntegration }>(
        '/integrations/subsonic',
      );
      this.integration.set(response.data);
    } catch (error) {
      this.error.set((error as Error).message);
    }
  }

  async issueKey(label: string): Promise<IssuedSubsonicKey> {
    const response = await this.api.post<{ data: IssuedSubsonicKey }>(
      '/integrations/subsonic/keys',
      { label },
    );
    await this.load();
    return response.data;
  }

  async revokeKey(id: string): Promise<void> {
    await this.api.delete(`/integrations/subsonic/keys/${id}`);
    await this.load();
  }
}
