import type { MaterialChunk } from '../domain/types';

export function chunkText(documentId: string, text: string, pageNumber?: number, maxLength = 4200): MaterialChunk[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (!clean) return [];
  const chunks: MaterialChunk[] = [];
  let rest = clean;
  let index = 1;
  while (rest.length) {
    let end = Math.min(maxLength, rest.length);
    if (end < rest.length) {
      const boundary = Math.max(rest.lastIndexOf('\n\n', end), rest.lastIndexOf('。', end), rest.lastIndexOf('. ', end));
      if (boundary > maxLength * 0.55) end = boundary + 1;
    }
    const part = rest.slice(0, end).trim();
    if (part) chunks.push({ id: `${documentId}-c${index++}`, documentId, pageNumber, text: part });
    rest = rest.slice(end).trim();
  }
  return chunks;
}

export function selectGenerationContext(chunks: MaterialChunk[], maxChars = 52000): string {
  let size = 0;
  const selected: string[] = [];
  for (const chunk of chunks) {
    const header = `[documentId=${chunk.documentId}; chunkId=${chunk.id}${chunk.pageNumber ? `; page=${chunk.pageNumber}` : ''}]`;
    if (size + header.length + chunk.text.length > maxChars) break;
    selected.push(`${header}\n${chunk.text}`);
    size += header.length + chunk.text.length;
  }
  return selected.join('\n\n');
}
