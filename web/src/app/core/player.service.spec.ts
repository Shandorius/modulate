import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import { PlayerService } from './player.service';
import { ToastService } from './toast.service';

describe('PlayerService', () => {
  let service: PlayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PlayerService,
        { provide: ApiService, useValue: { url: (path: string) => path } },
        { provide: ToastService, useValue: { show: () => undefined } },
      ],
    });
    service = TestBed.inject(PlayerService);
  });

  it('formats playback time without negative values', () => {
    expect(service.formatTime(0)).toBe('0:00');
    expect(service.formatTime(65)).toBe('1:05');
    expect(service.formatTime(3601)).toBe('60:01');
    expect(service.formatTime(-4)).toBe('0:00');
  });

  it('starts idle until the server state arrives', () => {
    expect(service.current()).toBeNull();
    expect(service.queue()).toEqual([]);
    expect(service.isPlaying()).toBe(false);
  });
});
