import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

// Capacitor decides "native" from this global at module load. Set it before
// the imports run so ApiService takes its native code path.
vi.hoisted(() => {
  (globalThis as unknown as { androidBridge: unknown }).androidBridge = {};
});

import { ApiError, ApiService } from './api.service';
import { TokenStorageService } from './token-storage.service';

describe('ApiService on native', () => {
  let service: ApiService;
  let request: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    request = vi.fn().mockReturnValue(of({ status: 'ok' }));
    TestBed.configureTestingModule({
      providers: [
        ApiService,
        { provide: HttpClient, useValue: { request } },
        {
          provide: TokenStorageService,
          useValue: {
            token: () => null,
            instanceUrl: () => 'https://music.example.com',
          },
        },
      ],
    });
    service = TestBed.inject(ApiService);
  });

  it('uses the stored instance URL and never sends cookies', async () => {
    await service.auth('POST', '/auth/mobile/login', { email: 'a@b.c' });

    expect(request).toHaveBeenCalledWith(
      'POST',
      'https://music.example.com/auth/mobile/login',
      expect.objectContaining({
        withCredentials: false,
        body: { email: 'a@b.c' },
      }),
    );
  });

  it('resolves media URLs against the instance', () => {
    expect(service.url('/artwork/1')).toBe(
      'https://music.example.com/artwork/1',
    );
    expect(service.url('https://cdn.example.com/a.jpg')).toBe(
      'https://cdn.example.com/a.jpg',
    );
  });

  it('explains unreachable servers instead of surfacing status 0', async () => {
    request.mockReturnValue(
      throwError(() => Object.assign(new Error('Http failure response'), {
        status: 0,
      })),
    );

    await expect(
      service.auth('POST', '/auth/mobile/login', {}),
    ).rejects.toMatchObject({ status: 0 });

    await service.auth('POST', '/auth/mobile/login', {}).catch((error) => {
      expect((error as ApiError).message).toContain('Could not reach');
      expect((error as ApiError).message).toContain('music.example.com');
    });
  });
});
