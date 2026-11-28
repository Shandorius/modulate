import { TestBed } from '@angular/core/testing';
import { TokenStorageService } from './token-storage.service';

describe('TokenStorageService', () => {
  let service: TokenStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [TokenStorageService] });
    service = TestBed.inject(TokenStorageService);
  });

  it('normalizes a self-hosted server URL', () => {
    expect(service.normalizeUrl('https://music.example.com/')).toBe(
      'https://music.example.com',
    );
    expect(service.normalizeUrl(' https://music.example.com/base/ ')).toBe(
      'https://music.example.com/base',
    );
  });

  it('rejects non-http instance URLs', () => {
    expect(service.normalizeUrl('ftp://music.example.com')).toBe('');
    expect(service.normalizeUrl('not a url')).toBe('');
    expect(service.normalizeUrl('   ')).toBe('');
  });

  it('adds a scheme and prefers https for public hosts', () => {
    expect(service.normalizeUrl('music.example.com')).toBe(
      'https://music.example.com',
    );
    expect(service.normalizeUrl('http://modulate.mantaray.dev')).toBe(
      'https://modulate.mantaray.dev',
    );
    expect(service.normalizeUrl('http://modulate.mantaray.dev/health')).toBe(
      'https://modulate.mantaray.dev/health',
    );
  });

  it('keeps plain http for local and LAN addresses', () => {
    expect(service.normalizeUrl('http://192.168.1.185:8465')).toBe(
      'http://192.168.1.185:8465',
    );
    expect(service.normalizeUrl('192.168.1.185:8465')).toBe(
      'http://192.168.1.185:8465',
    );
    expect(service.normalizeUrl('http://localhost:3000')).toBe(
      'http://localhost:3000',
    );
    expect(service.normalizeUrl('modulate.local')).toBe(
      'http://modulate.local',
    );
  });
});
