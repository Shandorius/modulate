import { Injectable, signal } from '@angular/core';

export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string | null>(null);
  readonly action = signal<ToastAction | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(message: string, duration = 3200): void {
    this.message.set(message);
    this.action.set(null);
    this.schedule(duration);
  }

  showAction(
    message: string,
    label: string,
    run: () => void | Promise<void>,
    duration = 8000,
  ): void {
    this.message.set(message);
    this.action.set({ label, run });
    this.schedule(duration);
  }

  async runAction(): Promise<void> {
    const action = this.action();
    if (!action) return;
    this.clear();
    await action.run();
  }

  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.message.set(null);
    this.action.set(null);
  }

  private schedule(duration: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.clear(), duration);
  }
}
