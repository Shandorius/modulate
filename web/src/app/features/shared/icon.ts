import { Component, input } from '@angular/core';

export type IconName =
  | 'home'
  | 'search'
  | 'library'
  | 'settings'
  | 'play'
  | 'pause'
  | 'previous'
  | 'next'
  | 'queue'
  | 'heart'
  | 'heart-filled'
  | 'plus'
  | 'share'
  | 'volume'
  | 'repeat'
  | 'close'
  | 'chevron-left'
  | 'music'
  | 'users'
  | 'upload'
  | 'bell'
  | 'more'
  | 'external'
  | 'trash'
  | 'grip'
  | 'arrow-up'
  | 'arrow-down'
  | 'check';

@Component({
  selector: 'app-icon',
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      @switch (name()) {
        @case ('home') {
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
          <path d="M9.5 21v-6h5v6" />
        }
        @case ('search') {
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        }
        @case ('library') {
          <path d="M4 4h3v16H4zM10 4h3v16h-3z" />
          <path d="m16.5 5 3.2-.8 3.2 14.8-3.2.8z" />
        }
        @case ('settings') {
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
        }
        @case ('play') {
          <path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none" />
        }
        @case ('pause') {
          <path d="M8 5h2.5v14H8zM13.5 5H16v14h-2.5z" fill="currentColor" stroke="none" />
        }
        @case ('previous') {
          <path d="M18.5 5.5v13L9.5 12z" fill="currentColor" stroke="none" />
          <path d="M6.5 5v14" />
        }
        @case ('next') {
          <path d="M5.5 5.5v13l9-6.5z" fill="currentColor" stroke="none" />
          <path d="M17.5 5v14" />
        }
        @case ('queue') {
          <path d="M4 6h10M4 12h10M4 18h7" />
          <path d="M18 9v9.5a2 2 0 1 0 2 2" />
          <path d="M18 9l3-1" />
        }
        @case ('heart') {
          <path d="M20.8 5.6a5.4 5.4 0 0 0-7.6 0L12 6.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 22l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />
        }
        @case ('heart-filled') {
          <path d="M20.8 5.6a5.4 5.4 0 0 0-7.6 0L12 6.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 22l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" fill="currentColor" />
        }
        @case ('plus') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('share') {
          <circle cx="18" cy="5" r="2.5" />
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="19" r="2.5" />
          <path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" />
        }
        @case ('volume') {
          <path d="M4 9.5h4L13 5v14l-5-4.5H4z" />
          <path d="M16 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
        }
        @case ('repeat') {
          <path d="m17 3 3 3-3 3" />
          <path d="M20 6H8a4 4 0 0 0-4 4v1M7 21l-3-3 3-3" />
          <path d="M4 18h12a4 4 0 0 0 4-4v-1" />
        }
        @case ('close') {
          <path d="m6 6 12 12M18 6 6 18" />
        }
        @case ('chevron-left') {
          <path d="m15 18-6-6 6-6" />
        }
        @case ('music') {
          <path d="M9 18V5l11-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="17" cy="16" r="3" />
        }
        @case ('users') {
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
          <path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 14.5a5.5 5.5 0 0 1 3 5.5" />
        }
        @case ('upload') {
          <path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" />
          <path d="M4 15v5h16v-5" />
        }
        @case ('bell') {
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        }
        @case ('more') {
          <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
        }
        @case ('external') {
          <path d="M14 4h6v6M20 4l-9 9" />
          <path d="M18 13v6H5V6h6" />
        }
        @case ('grip') {
          <circle cx="9" cy="6" r="1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="6" r="1" fill="currentColor" stroke="none" />
          <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="9" cy="18" r="1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="18" r="1" fill="currentColor" stroke="none" />
        }
        @case ('arrow-up') {
          <path d="m6 14 6-6 6 6" />
        }
        @case ('arrow-down') {
          <path d="m6 10 6 6 6-6" />
        }
        @case ('trash') {
          <path d="M4 7h16M9 7V4h6v3M6.5 7l1 14h9l1-14" />
          <path d="M10 11v6M14 11v6" />
        }
        @case ('check') {
          <path d="m5 12 4 4L19 6" />
        }
      }
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex: none;
        line-height: 0;
      }
      svg {
        display: block;
      }
    `,
  ],
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(20);
  readonly strokeWidth = input(1.8);
}
