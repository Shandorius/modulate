import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { TokenStorageService } from './token-storage.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokens = inject(TokenStorageService);
  const token = tokens.token();

  const request = token
    ? req.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
        withCredentials: false,
      })
    : req.clone({ withCredentials: true });

  return next(request).pipe(
    catchError((error) => {
      if (error?.status === 401) {
        void tokens.clear();
      }
      return throwError(() => error);
    }),
  );
};
