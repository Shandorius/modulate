import { Routes } from '@angular/router';
import {
  adminGuard,
  authGuard,
  guestGuard,
  onboardingGuard,
  onboardingPageGuard,
} from './core/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app/home' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/auth-page').then((m) => m.AuthPage),
  },
  {
    path: 'onboarding',
    canActivate: [onboardingPageGuard],
    loadComponent: () =>
      import('./features/onboarding/onboarding-page').then(
        (m) => m.OnboardingPage,
      ),
  },
  {
    path: 'app',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./features/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      {
        path: 'home',
        loadComponent: () =>
          import('./features/home/home-page').then((m) => m.HomePage),
      },
      {
        path: 'search',
        loadComponent: () =>
          import('./features/search/search-page').then((m) => m.SearchPage),
      },
      {
        path: 'library',
        loadComponent: () =>
          import('./features/library/library-page').then((m) => m.LibraryPage),
      },
      {
        path: 'collection/:type/:id',
        loadComponent: () =>
          import('./features/collection/collection-page').then(
            (m) => m.CollectionPage,
          ),
      },
      {
        path: 'settings',
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/settings/settings-page').then(
                (m) => m.SettingsPage,
              ),
          },
          {
            path: 'account',
            loadComponent: () =>
              import('./features/settings/account-page').then(
                (m) => m.SettingsAccountPage,
              ),
          },
          {
            path: 'ingest',
            loadComponent: () =>
              import('./features/settings/ingest-page').then(
                (m) => m.SettingsIngestPage,
              ),
          },
          {
            path: 'home-assistant',
            loadComponent: () =>
              import('./features/settings/home-assistant-page').then(
                (m) => m.SettingsHomeAssistantPage,
              ),
          },
          {
            path: 'library',
            canActivate: [adminGuard],
            loadComponent: () =>
              import('./features/settings/library-source-page').then(
                (m) => m.SettingsLibrarySourcePage,
              ),
          },
          {
            path: 'users',
            canActivate: [adminGuard],
            loadComponent: () =>
              import('./features/settings/users-page').then(
                (m) => m.SettingsUsersPage,
              ),
          },
          {
            path: 'notifications',
            loadComponent: () =>
              import('./features/settings/notifications-page').then(
                (m) => m.SettingsNotificationsPage,
              ),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: 'app/home' },
];
