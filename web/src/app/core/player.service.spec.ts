import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import { PlayerService } from './player.service';
import { ToastService } from './toast.service';

const idleState = {
  state: {
    currentTrackId: null,
    positionSeconds: 0,
    volume: 0.8,
    isPlaying: false,
    repeatMode: 'off',
    shuffle: false,
    contextType: null,
    contextId: null,
    revision: 1,
    lastAction: null,
    updatedAt: new Date(0).toISOString(),
  },
  current: null,
  queue: [],
  queueIndex: -1,
  activePlayers: 0,
  announcement: null,
  serverTime: new Date(0).toISOString(),
};

describe('PlayerService', () => {
  let service: PlayerService;
  let post: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    post = vi.fn().mockResolvedValue({ data: idleState });
    TestBed.configureTestingModule({
      providers: [
        PlayerService,
        {
          provide: ApiService,
          useValue: { url: (path: string) => path, post },
        },
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

  it('auto-advance is distinct from a manual next press', async () => {
    await service.advance();
    expect(post).toHaveBeenCalledWith('/player/action', {
      action: 'next',
      auto: true,
    });
  });

  it('sends shuffle changes to the server', async () => {
    await service.setShuffle(true);
    expect(post).toHaveBeenCalledWith('/player/action', {
      action: 'set_shuffle',
      shuffle: true,
    });
  });
});
