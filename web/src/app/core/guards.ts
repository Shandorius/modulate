import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.bootstrap();
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
  return true;
};

export const onboardingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.bootstrap();
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
  if (!auth.profile()?.onboardingCompleted) {
    return router.createUrlTree(['/onboarding']);
  }
  return true;
};

export const onboardingPageGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.bootstrap();
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
  if (auth.profile()?.onboardingCompleted) {
    return router.createUrlTree(['/app/home']);
  }
  return true;
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.bootstrap();
  if (auth.isAuthenticated()) {
    return router.createUrlTree([
      auth.profile()?.onboardingCompleted ? '/app/home' : '/onboarding',
    ]);
  }
  return true;
};

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.bootstrap();
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
  if (!auth.isAdmin()) return router.createUrlTree(['/app/settings']);
  return true;
};
