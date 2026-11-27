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
  });
});
