import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { DEFAULT_API_BASE } from './app-config';
import { TokenStorageService } from './token-storage.service';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenStorageService);

  private apiRoot(): string {
    if (!Capacitor.isNativePlatform()) return '';
    return this.tokens.instanceUrl() || DEFAULT_API_BASE;
  }

  /** Resolve a server-relative media URL for the current platform. */
  url(path: string | null | undefined): string {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return `${this.apiRoot()}${path}`;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', `/api/v1${path}`);
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.request<T>('POST', `/api/v1${path}`, body);
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', `/api/v1${path}`, body);
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', `/api/v1${path}`, body);
  }

  delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('DELETE', `/api/v1${path}`, body);
  }

  auth<T>(method: 'POST' | 'GET', path: string, body?: unknown): Promise<T> {
    return this.request<T>(method, path, body);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const token = this.tokens.token();
    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    try {
      return await firstValueFrom(
        this.http.request<T>(method, `${this.apiRoot()}${path}`, {
          body,
          headers,
          withCredentials: !token,
          observe: 'body',
        }),
      );
    } catch (error) {
      const response = error as HttpErrorResponse;
      const payload = response.error as
        | { error?: { code?: string; message?: string } }
        | undefined;
      throw new ApiError(
        payload?.error?.message || response.message || 'Request failed.',
        response.status || 0,
        payload?.error?.code,
      );
    }
  }
}
