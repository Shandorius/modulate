import { Injectable, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import {
  LocalNotifications,
  type LocalNotificationSchema,
} from '@capacitor/local-notifications';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { LocalPlan } from './models';

const CHANNEL_ID = 'music-reminders';

function hashId(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2_000_000_000 + 1;
}

@Injectable({ providedIn: 'root' })
export class LocalNotificationService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly permission = signal<'unknown' | 'prompt' | 'granted' | 'denied'>('unknown');
  readonly exactAlarm = signal<'unknown' | 'granted' | 'denied' | 'prompt'>('unknown');
  readonly scheduledCount = signal(0);
  readonly nextScheduledAt = signal<string | null>(null);

  private initialized = false;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;

  get native(): boolean {
    return Capacitor.isNativePlatform();
  }

  async initialize(): Promise<void> {
    if (!this.native || this.initialized) return;
    this.initialized = true;

    try {
      await this.ensureChannel();
      await this.requestPermission();
      await this.checkExactAlarm();

      await LocalNotifications.addListener(
        'localNotificationActionPerformed',
        (event) => {
          const route =
            typeof event.notification.extra?.['route'] === 'string'
              ? (event.notification.extra['route'] as string)
              : '/app/home';
          void this.router.navigateByUrl(route);
        },
      );

      await App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) return;
        void this.syncPlan();
      });

      if (this.permission() === 'granted') await this.syncPlan();
    } catch (error) {
      console.warn('[local-notifications] initialization failed', error);
    }
  }

  async requestPermission(): Promise<boolean> {
    if (!this.native) return false;
    try {
      let permission = await LocalNotifications.checkPermissions();
      if (permission.display === 'prompt') {
        permission = await LocalNotifications.requestPermissions();
      }
      this.permission.set(
        permission.display === 'granted'
          ? 'granted'
          : permission.display === 'denied'
            ? 'denied'
            : 'prompt',
      );
      return permission.display === 'granted';
    } catch {
      this.permission.set('denied');
      return false;
    }
  }

  async checkExactAlarm(): Promise<boolean> {
    if (!this.native || Capacitor.getPlatform() !== 'android') {
      this.exactAlarm.set('granted');
      return true;
    }
    try {
      const status = await LocalNotifications.checkExactNotificationSetting();
      this.exactAlarm.set(status.exact_alarm as 'granted' | 'denied' | 'prompt');
      return status.exact_alarm === 'granted';
    } catch {
      return true;
    }
  }

  async requestExactAlarm(): Promise<void> {
    if (!this.native || Capacitor.getPlatform() !== 'android') return;
    if (await this.checkExactAlarm()) return;
    try {
      const status = await LocalNotifications.changeExactNotificationSetting();
      this.exactAlarm.set(status.exact_alarm as 'granted' | 'denied' | 'prompt');
    } catch {
      // The user can still allow alarms from system settings.
    }
  }

  async syncPlan(): Promise<void> {
    if (!this.native || this.permission() !== 'granted') return;

    try {
      const response = await this.api.get<{ data: LocalPlan }>(
        '/notifications/local-plan?days=7',
      );
      const plan = response.data;
      const pending = await LocalNotifications.getPending();
      const old = pending.notifications.filter(
        (notification) =>
          notification.extra?.app === 'modulate' &&
          notification.extra?.plan === true,
      );
      if (old.length > 0) {
        await LocalNotifications.cancel({
          notifications: old.map((notification) => ({ id: notification.id })),
        });
      }

      const upcoming = plan.notifications
        .filter((item) => new Date(item.scheduledAt).getTime() > Date.now())
        .slice(0, 20);
      this.nextScheduledAt.set(upcoming[0]?.scheduledAt || null);

      const notifications: LocalNotificationSchema[] = upcoming.map((item) => ({
        id: hashId(item.key),
        title: item.title,
        body: item.body,
        schedule: {
          at: new Date(item.scheduledAt),
          allowWhileIdle: true,
        },
        isExactNotification: true,
        channelId: CHANNEL_ID,
        autoCancel: true,
        extra: {
          ...item.data,
          app: 'modulate',
          plan: true,
          key: item.key,
        },
      }));

      if (notifications.length > 0) {
        await LocalNotifications.schedule({ notifications });
      }
      this.scheduledCount.set(notifications.length);
      if (notifications.length === 0) this.nextScheduledAt.set(null);
    } catch (error) {
      console.warn('[local-notifications] plan sync failed', error);
    }
  }

  requestSync(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      void this.syncPlan();
    }, 600);
  }

  async scheduleTest(): Promise<void> {
    if (!this.native) return;
    if (!(await this.requestPermission())) return;
    await this.ensureChannel();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: hashId(`test:${Date.now()}`),
          title: 'Modulate is ready',
          body: 'This is how a local reminder will look.',
          schedule: {
            at: new Date(Date.now() + 10_000),
            allowWhileIdle: true,
          },
          isExactNotification: true,
          channelId: CHANNEL_ID,
          extra: {
            app: 'modulate',
            plan: false,
            kind: 'test',
            route: '/app/home',
          },
        },
      ],
    });
  }

  async cancelAll(): Promise<void> {
    if (!this.native) return;
    try {
      const pending = await LocalNotifications.getPending();
      const own = pending.notifications.filter(
        (notification) => notification.extra?.app === 'modulate',
      );
      if (own.length > 0) {
        await LocalNotifications.cancel({
          notifications: own.map((notification) => ({ id: notification.id })),
        });
      }
      this.scheduledCount.set(0);
      this.nextScheduledAt.set(null);
    } catch {
      // Nothing to cancel.
    }
  }

  private async ensureChannel(): Promise<void> {
    if (!this.native || Capacitor.getPlatform() !== 'android') return;
    try {
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: 'Music reminders',
        description: 'Gentle reminders from your library.',
        importance: 3,
        visibility: 0,
        vibration: false,
        lights: false,
      });
    } catch {
      // Channel creation is Android-only and may already exist.
    }
  }
}
