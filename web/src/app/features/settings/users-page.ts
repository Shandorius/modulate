import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../core/admin.service';
import { AuthService } from '../../core/auth.service';
import { AdminUser } from '../../core/models';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-settings-users-page',
  imports: [FormsModule, RouterLink],
  template: `
    <main class="page">
      <header class="page-header">
        <div>
          <a class="settings-back" routerLink="/app/settings">‹ Settings</a>
          <p class="eyebrow">Administration</p>
          <h1 class="display">People</h1>
        </div>
        <span class="pill">Admin</span>
      </header>

      <p class="lede">
        Accounts are managed by administrators. Everyone shares the same music
        library, while playlists, favourites, queues, and listening history stay
        personal.
      </p>

      @if (admin.error()) {
        <p class="form-error" role="alert">{{ admin.error() }}</p>
      }

      <section class="section">
        <div class="section__head">
          <div>
            <p class="eyebrow">Who can join</p>
            <h2 class="section__title">Registration</h2>
          </div>
          @if (admin.settings()?.allowRegistration) {
            <span class="status-pill status-pill--running">Open</span>
          } @else {
            <span class="status-pill">Invite only</span>
          }
        </div>
        <div class="card settings-identity">
          <div>
            <p class="small muted">
              {{ admin.settings()?.allowRegistration
                ? 'Anyone who can reach this server may create an account.'
                : 'Only administrators can create accounts. This is the recommended setting.' }}
            </p>
          </div>
          <button class="btn btn--ghost btn--sm" type="button" (click)="toggleRegistration()">
            {{ admin.settings()?.allowRegistration ? 'Close registration' : 'Allow open registration' }}
          </button>
        </div>
      </section>

      <section class="section">
        <div class="section__head">
          <div>
            <p class="eyebrow">Create</p>
            <h2 class="section__title">Add a listener</h2>
          </div>
        </div>
        <form class="form card" (ngSubmit)="createUser()">
          <div class="form-grid">
            <label class="field">
              <span class="field__label">Display name</span>
              <input class="input" name="displayName" [(ngModel)]="displayName" placeholder="Name" />
            </label>
            <label class="field">
              <span class="field__label">Role</span>
              <select class="select" name="userType" [(ngModel)]="userType">
                <option value="user">Listener</option>
                <option value="admin">Administrator</option>
              </select>
            </label>
          </div>
          <label class="field">
            <span class="field__label">Email</span>
            <input class="input" type="email" name="email" [(ngModel)]="email" autocomplete="off" placeholder="person@example.com" />
          </label>
          <label class="field">
            <span class="field__label">Temporary password</span>
            <input class="input" type="password" name="password" [(ngModel)]="password" autocomplete="new-password" placeholder="At least 8 characters" />
            <span class="field__hint">Share it privately. They can change it in Account settings.</span>
          </label>
          @if (createError()) {
            <p class="form-error" role="alert">{{ createError() }}</p>
          }
          <button class="btn btn--primary" type="submit" [disabled]="creating()">
            {{ creating() ? 'Creating…' : 'Create account' }}
          </button>
        </form>
      </section>

      <section class="section">
        <div class="section__head">
          <div>
            <p class="eyebrow">{{ admin.users().length }} accounts</p>
            <h2 class="section__title">On this instance</h2>
          </div>
        </div>

        @if (admin.loading() && !admin.users().length) {
          <div class="skeleton skeleton--row"></div>
          <div class="skeleton skeleton--row"></div>
        } @else {
          <div class="user-admin-list">
            @for (user of admin.users(); track user.id) {
              <article class="user-admin-row">
                <div class="user-admin-row__avatar">{{ initial(user) }}</div>
                <div class="user-admin-row__body">
                  <strong>{{ user.displayName || 'Unnamed listener' }}</strong>
                  <span>{{ user.email }}</span>
                  <small>Joined {{ formatDate(user.createdAt) }}</small>
                </div>
                <span class="status-pill" [class.status-pill--running]="user.userType === 'admin'">
                  {{ user.userType === 'admin' ? 'Admin' : 'Listener' }}
                </span>
                <div class="user-admin-row__actions">
                  @if (user.id !== auth.user()?.id) {
                    <button class="text-button" type="button" (click)="toggleRole(user)">
                      {{ user.userType === 'admin' ? 'Make listener' : 'Make admin' }}
                    </button>
                    <button class="text-button text-button--danger" type="button" (click)="deleteUser(user)">Remove</button>
                  } @else {
                    <span class="small muted">You</span>
                  }
                </div>
              </article>
            }
          </div>
        }
      </section>
    </main>
  `,
})
export class SettingsUsersPage implements OnInit {
  readonly admin = inject(AdminService);
  readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);

  email = '';
  password = '';
  displayName = '';
  userType: 'user' | 'admin' = 'user';

  async ngOnInit(): Promise<void> {
    await this.admin.load();
  }

  async createUser(): Promise<void> {
    this.createError.set(null);
    if (!this.email.trim() || this.password.length < 8) {
      this.createError.set('Enter an email and a password of at least 8 characters.');
      return;
    }
    this.creating.set(true);
    try {
      await this.admin.createUser({
        email: this.email.trim(),
        password: this.password,
        displayName: this.displayName.trim() || undefined,
        userType: this.userType,
      });
      this.email = '';
      this.password = '';
      this.displayName = '';
      this.userType = 'user';
      this.toast.show('Account created.');
    } catch (error) {
      this.createError.set((error as Error).message);
    } finally {
      this.creating.set(false);
    }
  }

  async toggleRegistration(): Promise<void> {
    const current = this.admin.settings()?.allowRegistration || false;
    try {
      await this.admin.setRegistration(!current);
      this.toast.show(
        current ? 'Open registration closed.' : 'Open registration enabled.',
      );
    } catch (error) {
      this.toast.show((error as Error).message);
    }
  }

  async toggleRole(user: AdminUser): Promise<void> {
    const next = user.userType === 'admin' ? 'user' : 'admin';
    try {
      await this.admin.updateUser(user.id, { userType: next });
      this.toast.show(
        next === 'admin' ? 'User promoted to admin.' : 'Admin changed to listener.',
      );
    } catch (error) {
      this.toast.show((error as Error).message);
    }
  }

  async deleteUser(user: AdminUser): Promise<void> {
    if (
      !window.confirm(
        `Remove ${user.displayName || user.email}? Their playlists will be deleted. Shared music stays in the library.`,
      )
    ) {
      return;
    }
    try {
      await this.admin.deleteUser(user.id);
      this.toast.show('Account removed.');
    } catch (error) {
      this.toast.show((error as Error).message);
    }
  }

  initial(user: AdminUser): string {
    return (user.displayName || user.email).slice(0, 1).toUpperCase();
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(value));
  }
}
