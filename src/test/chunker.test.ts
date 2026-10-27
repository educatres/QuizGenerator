import { describe, expect, it } from 'vitest';
import { chunkText, selectGenerationContext } from '../services/chunker';

describe('chunkText', () => {
  it('keeps document, chunk and page provenance', () => {
    const chunks = chunkText('doc-1', '第一段。\n\n第二段。', 3, 8);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toMatchObject({ documentId: 'doc-1', pageNumber: 3, id: 'doc-1-c1' });
  });

  it('does not exceed the context budget', () => {
    const chunks = chunkText('doc', '測試內容。'.repeat(100), 1, 80);
    expect(selectGenerationContext(chunks, 250).length).toBeLessThanOrEqual(250);
  });
});
