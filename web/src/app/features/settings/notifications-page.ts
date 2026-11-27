import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LocalNotificationService } from '../../core/local-notification.service';
import { NotificationPreferences } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-settings-notifications-page',
  imports: [FormsModule, RouterLink],
  template: `
    <main class="page">
      <header class="page-header">
        <div>
          <a class="settings-back" routerLink="/app/settings">‹ Settings</a>
          <p class="eyebrow">Local only</p>
          <h1 class="display">Notifications</h1>
        </div>
      </header>

      <p class="lede">
        Reminders are computed by your server but scheduled on this device. No
        push service, Firebase, or APNs is involved.
      </p>

      <section class="section">
        <div class="section__head">
          <h2 class="section__title">On this device</h2>
          <span class="section__meta">{{ permissionLabel() }}</span>
        </div>
        <div class="card">
          @if (local.native) {
            <p class="small muted">
              @if (local.permission() === 'granted') {
                {{ local.scheduledCount() }} reminder{{ local.scheduledCount() === 1 ? '' : 's' }} scheduled.
              } @else {
                Allow local notifications to receive library reminders.
              }
            </p>
            @if (local.permission() !== 'granted') {
              <button class="btn btn--ghost" type="button" (click)="enable()">Enable reminders</button>
            }
            <div class="divider"></div>
            <p class="small muted">Exact timing: <strong>{{ exactLabel() }}</strong></p>
            @if (local.exactAlarm() !== 'granted') {
              <button class="btn btn--quiet" type="button" (click)="allowExact()">Allow exact alarms</button>
            }
            <button class="btn btn--quiet" type="button" (click)="refresh()">Refresh schedule</button>
          } @else {
            <p class="small muted">
              Device reminders belong to the Android and iOS app. The browser shows the plan but cannot schedule local notifications.
            </p>
          }
        </div>
      </section>

      <section class="section">
        <div class="section__head">
          <h2 class="section__title">Next reminder</h2>
        </div>
        <div class="card">
          @if (notifications.nextReminder(); as next) {
            <p class="notification-preview__title">{{ next.title }}</p>
            <p class="small muted">{{ next.body }}</p>
            <p class="small">{{ formatWhen(next.scheduledAt) }}</p>
          } @else {
            <p class="small muted">No reminder is planned in the next week. Play something or add music and one may appear.</p>
          }
        </div>
      </section>

      <section class="section">
        <form class="form card" (ngSubmit)="save()">
          <label class="checkbox">
            <input type="checkbox" name="pushEnabled" [(ngModel)]="pushEnabled" />
            Allow reminders
          </label>
          <label class="checkbox">
            <input type="checkbox" name="morningPlan" [(ngModel)]="morningPlan" />
            Send library reminders
          </label>
          <label class="checkbox">
            <input type="checkbox" name="hideDetails" [(ngModel)]="hideDetails" />
            Keep track and artist names off the lock screen
          </label>

          <div class="form-grid">
            <label class="field">
              <span class="field__label">Quiet from</span>
              <input class="input" type="time" name="quietStart" [(ngModel)]="quietStart" />
            </label>
            <label class="field">
              <span class="field__label">Quiet until</span>
              <input class="input" type="time" name="quietEnd" [(ngModel)]="quietEnd" />
            </label>
            <label class="field">
              <span class="field__label">Reminder time</span>
              <input class="input" type="time" name="morningTime" [(ngModel)]="morningTime" />
            </label>
            <label class="field">
              <span class="field__label">Maximum per day</span>
              <select class="select" name="maxPerDay" [(ngModel)]="maxPerDay">
                <option [ngValue]="1">1 reminder</option>
                <option [ngValue]="2">2 reminders</option>
              </select>
            </label>
          </div>

          @if (error()) {
            <p class="form-error" role="alert">{{ error() }}</p>
          }
          @if (saved()) {
            <p class="small">Saved.</p>
          }

          <button class="btn btn--primary" type="submit" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Save reminders' }}
          </button>
          @if (local.native) {
            <button class="btn btn--quiet" type="button" (click)="sendTest()">Send a test reminder</button>
          }
        </form>
      </section>
    </main>
  `,
})
export class SettingsNotificationsPage implements OnInit {
  readonly local = inject(LocalNotificationService);
  readonly notifications = inject(NotificationService);
  private readonly toast = inject(ToastService);

  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly error = signal<string | null>(null);

  pushEnabled = true;
  morningPlan = true;
  morningTime = '08:00';
  quietStart = '21:00';
  quietEnd = '07:00';
  maxPerDay = 2;
  hideDetails = false;

  async ngOnInit(): Promise<void> {
    await this.notifications.load();
    const preferences = this.notifications.preferences();
    if (preferences) this.apply(preferences);
    if (this.local.native) await this.local.checkExactAlarm();
  }

  private apply(preferences: NotificationPreferences): void {
    this.pushEnabled = preferences.pushEnabled;
    this.morningPlan = preferences.morningPlan;
    this.morningTime = preferences.morningTime;
    this.quietStart = preferences.quietStart;
    this.quietEnd = preferences.quietEnd;
    this.maxPerDay = preferences.maxPerDay;
    this.hideDetails = preferences.hideDetails;
  }

  permissionLabel(): string {
    if (!this.local.native) return 'Mobile app';
    return this.local.permission() === 'granted' ? 'On' : 'Off';
  }

  exactLabel(): string {
    if (!this.local.native) return 'Mobile app only';
    return this.local.exactAlarm() === 'granted' ? 'exact' : 'flexible (may be delayed)';
  }

  formatWhen(iso: string): string {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);
    try {
      await this.notifications.save({
        pushEnabled: this.pushEnabled,
        morningPlan: this.morningPlan,
        morningTime: this.morningTime,
        quietStart: this.quietStart,
        quietEnd: this.quietEnd,
        maxPerDay: this.maxPerDay,
        hideDetails: this.hideDetails,
      });
      this.saved.set(true);
      this.local.requestSync();
      this.toast.show('Reminder settings saved.');
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  async enable(): Promise<void> {
    const granted = await this.local.requestPermission();
    if (granted) {
      await this.local.syncPlan();
      await this.notifications.load();
      this.toast.show('Reminders enabled.');
    } else {
      this.toast.show('Notifications are disabled in system settings.');
    }
  }

  async allowExact(): Promise<void> {
    await this.local.requestExactAlarm();
    await this.local.checkExactAlarm();
    if (this.local.exactAlarm() === 'granted') {
      await this.local.syncPlan();
      this.toast.show('Exact alarms allowed.');
    } else {
      this.toast.show('You can allow alarms in Android settings.');
    }
  }

  async refresh(): Promise<void> {
    await this.local.syncPlan();
    await this.notifications.load();
    this.toast.show('Reminder schedule refreshed.');
  }

  async sendTest(): Promise<void> {
    try {
      await this.local.scheduleTest();
      this.toast.show('Test reminder scheduled for 10 seconds.');
    } catch (error) {
      this.toast.show((error as Error).message);
    }
  }
}
