import { describe, test, expect } from 'vitest';
import { isPushSupported } from '../lib/pushManager';

describe('PushBanner y PushManager', () => {
  test('isPushSupported maneja entornos sin soporte o SSR sin lanzar error', () => {
    const supported = isPushSupported();
    expect(typeof supported).toBe('boolean');
  });
});
