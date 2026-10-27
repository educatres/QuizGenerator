import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelOption } from '../providers/types';

describe('provider preferences', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });

  it('persists and clears an API key in browser storage', async () => {
    const providers = await import('../providers');
    providers.setSessionKey('cgu', 'test-key-123');
    expect(providers.hasSessionKey('cgu')).toBe(true);
    expect(localStorage.getItem('teacher-exam-studio.api-keys.v1')).toContain('test-key-123');
    providers.clearSessionKey('cgu');
    expect(providers.hasSessionKey('cgu')).toBe(false);
    expect(localStorage.getItem('teacher-exam-studio.api-keys.v1')).toBeNull();
  });

  it('places the latest Luna model first for CGU', async () => {
    const { sortCguModels } = await import('../providers');
    const models: ModelOption[] = [
      { id: 'mistral-small', label: 'Mistral Small', created: 300 },
      { id: 'luna-2.4', label: 'Luna 2.4', created: 100 },
      { id: 'luna-3.1', label: 'Luna 3.1', created: 200 },
    ];
    expect(sortCguModels(models).map(model => model.id)).toEqual(['luna-3.1', 'luna-2.4', 'mistral-small']);
  });

  it('uses semantic Luna version when timestamps are absent', async () => {
    const { sortCguModels } = await import('../providers');
    expect(sortCguModels([{ id: 'luna-2.10', label: 'Luna 2.10' }, { id: 'luna-2.9', label: 'Luna 2.9' }])[0].id).toBe('luna-2.10');
  });
});
