import { Injectable } from '@angular/core';

const DEFAULT_RGB = '62 229 143';
const DEFAULT_HEX = '#3ee58f';

@Injectable({ providedIn: 'root' })
export class AuraService {
  private readonly cache = new Map<string, string>();
  private currentUrl: string | null = null;

  setFromUrl(url: string | null | undefined): void {
    const root = document.documentElement;
    if (!url) {
      this.currentUrl = null;
      this.apply(DEFAULT_HEX, DEFAULT_RGB);
      return;
    }
    if (url === this.currentUrl) return;
    this.currentUrl = url;

    const cached = this.cache.get(url);
    if (cached) {
      this.apply(...this.parse(cached));
      return;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 24;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0, 24, 24);
        const pixels = context.getImageData(0, 0, 24, 24).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let weight = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index + 3] < 180) continue;
          const pr = pixels[index];
          const pg = pixels[index + 1];
          const pb = pixels[index + 2];
          const max = Math.max(pr, pg, pb);
          const min = Math.min(pr, pg, pb);
          const saturation = max === 0 ? 0 : (max - min) / max;
          const lightness = (max + min) / 510;
          if (lightness < 0.12 || lightness > 0.92) continue;
          const pixelWeight = 0.15 + saturation * 2.2;
          r += pr * pixelWeight;
          g += pg * pixelWeight;
          b += pb * pixelWeight;
          weight += pixelWeight;
        }
        if (!weight) return;
        const hex = this.toHex(r / weight, g / weight, b / weight);
        this.cache.set(url, hex);
        this.apply(...this.parse(hex));
      } catch {
        // Cross-origin or unsupported images keep the green fallback.
      }
    };
    image.src = url;
  }

  private parse(hex: string): [string, string] {
    const normalized = hex.replace('#', '');
    const value = Number.parseInt(normalized, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return [`#${normalized}`, `${r} ${g} ${b}`];
  }

  private toHex(r: number, g: number, b: number): string {
    const clamp = (value: number) =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, '0');
    return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
  }

  private apply(hex: string, rgb: string): void {
    document.documentElement.style.setProperty('--aura', hex);
    document.documentElement.style.setProperty('--aura-rgb', rgb);
  }
}
