import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { LocalNotificationService } from '../../core/local-notification.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-settings-account-page',
  imports: [FormsModule, RouterLink],
  template: `
    <main class="page">
      <header class="page-header">
        <div>
          <a class="settings-back" routerLink="/app/settings">‹ Settings</a>
          <p class="eyebrow">Personal</p>
          <h1 class="display">Account</h1>
        </div>
      </header>

      <section class="card">
        <p class="eyebrow">Signed in as</p>
        <p>{{ auth.user()?.email }}</p>
        <p class="small muted">Local account on this Modulate instance.</p>
      </section>

      <section class="section">
        <div class="section__head">
          <h2 class="section__title">Your name</h2>
        </div>
        <form class="form card" (ngSubmit)="saveName()">
          <label class="field">
            <span class="field__label">Display name</span>
            <input class="input" name="displayName" [(ngModel)]="displayName" maxlength="100" placeholder="What should we call you?" />
            <span class="field__hint">Used for the greeting on your home screen. Your email stays private.</span>
          </label>
          @if (nameError()) {
            <p class="form-error" role="alert">{{ nameError() }}</p>
          }
          @if (nameSaved()) {
            <p class="small">Saved.</p>
          }
          <button class="btn btn--ghost" type="submit" [disabled]="savingName()">
            {{ savingName() ? 'Saving…' : 'Save name' }}
          </button>
        </form>
      </section>

      <section class="section">
        <div class="section__head">
          <h2 class="section__title">Password</h2>
        </div>
        <form class="form card" (ngSubmit)="changePassword()">
          <label class="field">
            <span class="field__label">Current password</span>
            <input class="input" type="password" name="currentPassword" [(ngModel)]="currentPassword" autocomplete="current-password" maxlength="200" />
          </label>
          <label class="field">
            <span class="field__label">New password</span>
            <input class="input" type="password" name="newPassword" [(ngModel)]="newPassword" autocomplete="new-password" maxlength="200" />
          </label>
          <label class="field">
            <span class="field__label">Confirm new password</span>
            <input class="input" type="password" name="confirmPassword" [(ngModel)]="confirmPassword" autocomplete="new-password" maxlength="200" />
          </label>
          @if (passwordError()) {
            <p class="form-error" role="alert">{{ passwordError() }}</p>
          }
          @if (passwordSaved()) {
            <p class="small">Password changed. Other devices have been signed out.</p>
          }
          <button class="btn btn--ghost" type="submit" [disabled]="savingPassword()">
            {{ savingPassword() ? 'Changing…' : 'Change password' }}
          </button>
        </form>
      </section>

      <section class="section">
        <div class="section__head">
          <h2 class="section__title">Sessions</h2>
        </div>
        <div class="form card">
          <button class="btn btn--ghost btn--block" type="button" (click)="signOutAll()">Sign out all devices</button>
          <button class="btn btn--quiet btn--block" type="button" (click)="logout()">Sign out</button>
        </div>
      </section>

      <section class="section">
        <div class="section__head">
          <h2 class="section__title">Delete account</h2>
        </div>
        <form class="form card" (ngSubmit)="deleteAccount()">
          <p class="small muted">This permanently removes your account, private playlists, shares, playback state, and listening history. Music you imported stays in the shared library. There is no undo.</p>
          <label class="field">
            <span class="field__label">Confirm with your password</span>
            <input class="input" type="password" name="deletePassword" [(ngModel)]="deletePassword" autocomplete="current-password" maxlength="200" />
          </label>
          @if (deleteError()) {
            <p class="form-error" role="alert">{{ deleteError() }}</p>
          }
          <button class="btn btn--danger-quiet btn--block" type="submit" [disabled]="deleting()">
            {{ deleting() ? 'Deleting…' : 'Delete my account' }}
          </button>
        </form>
      </section>
    </main>
  `,
})
export class SettingsAccountPage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly local = inject(LocalNotificationService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  displayName = '';
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  deletePassword = '';

  readonly savingName = signal(false);
  readonly savingPassword = signal(false);
  readonly deleting = signal(false);
  readonly nameSaved = signal(false);
  readonly passwordSaved = signal(false);
  readonly nameError = signal<string | null>(null);
  readonly passwordError = signal<string | null>(null);
  readonly deleteError = signal<string | null>(null);

  ngOnInit(): void {
    this.displayName = this.auth.user()?.displayName || '';
  }

  async saveName(): Promise<void> {
    this.savingName.set(true);
    this.nameSaved.set(false);
    this.nameError.set(null);
    try {
      await this.auth.updateDisplayName(this.displayName.trim());
      this.nameSaved.set(true);
      this.toast.show('Name updated.');
    } catch (error) {
      this.nameError.set((error as Error).message);
    } finally {
      this.savingName.set(false);
    }
  }

  async changePassword(): Promise<void> {
    this.passwordSaved.set(false);
    this.passwordError.set(null);
    if (this.newPassword.length < 8) {
      this.passwordError.set('Use at least 8 characters.');
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.passwordError.set('The new passwords do not match.');
      return;
    }
    this.savingPassword.set(true);
    try {
      await this.auth.changePassword(this.currentPassword, this.newPassword);
      this.currentPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
      this.passwordSaved.set(true);
      this.toast.show('Password changed.');
    } catch (error) {
      this.passwordError.set((error as Error).message);
    } finally {
      this.savingPassword.set(false);
    }
  }

  async signOutAll(): Promise<void> {
    if (!window.confirm('Sign out every device, including this one?')) return;
    await this.local.cancelAll();
    await this.auth.signOutAll();
    this.toast.clear();
    await this.router.navigateByUrl('/login');
  }

  async logout(): Promise<void> {
    await this.local.cancelAll();
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
    this.toast.clear();
  }

  async deleteAccount(): Promise<void> {
    this.deleteError.set(null);
    if (!this.deletePassword) {
      this.deleteError.set('Enter your password to confirm.');
      return;
    }
    if (!window.confirm('Delete your account and all library data? This cannot be undone.')) return;
    this.deleting.set(true);
    try {
      await this.local.cancelAll();
      await this.auth.deleteAccount(this.deletePassword);
      this.toast.clear();
      await this.router.navigateByUrl('/login');
    } catch (error) {
      this.deleteError.set((error as Error).message);
    } finally {
      this.deleting.set(false);
    }
  }
}
