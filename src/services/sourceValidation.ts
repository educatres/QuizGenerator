import type { GeneratedQuestion } from '../domain/questionSchema';
import type { MaterialChunk, SourceRef } from '../domain/types';

function compact(text: string) {
  return text.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

export function quoteExistsInChunk(chunkText: string, quote: string) {
  const trimmed = quote.trim();
  if (!trimmed) return false;
  if (chunkText.includes(trimmed)) return true;
  const haystack = compact(chunkText); const needle = compact(trimmed);
  if (needle.length >= 4 && haystack.includes(needle)) return true;
  const parts = trimmed.split(/(?:\.{3,}|…+)/).map(compact).filter(part => part.length >= 3);
  if (parts.length < 2) return false;
  let cursor = 0;
  return parts.every(part => { const index = haystack.indexOf(part, cursor); if (index < 0) return false; cursor = index + part.length; return true; });
}

function grams(text: string) {
  const normalized = compact(text); const output = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i += 1) output.add(normalized.slice(i, i + 2));
  return output;
}

function scoreText(candidate: string, question: GeneratedQuestion) {
  const target = grams(`${question.stem} ${question.explanation}`);
  let score = 0; for (const gram of grams(candidate)) if (target.has(gram)) score += 1;
  return score;
}

function actualQuote(chunk: MaterialChunk, question: GeneratedQuestion) {
  const sentences = chunk.text.replace(/\r/g, '').split(/(?<=[。！？!?])|\n+/).map(text => text.trim()).filter(Boolean);
  const candidates = sentences.flatMap(sentence => sentence.length <= 180 ? [sentence] : sentence.match(/.{1,160}/gu) ?? []);
  const best = candidates.sort((a, b) => scoreText(b, question) - scoreText(a, question))[0] ?? chunk.text.trim().slice(0, 160);
  return best.slice(0, 180);
}

function bestChunk(chunks: MaterialChunk[], question: GeneratedQuestion) {
  return [...chunks].sort((a, b) => scoreText(b.text, question) - scoreText(a.text, question))[0];
}

function reconcileSource(source: SourceRef, question: GeneratedQuestion, chunks: MaterialChunk[]) {
  const exact = chunks.find(chunk => chunk.id === source.chunkId && chunk.documentId === source.documentId);
  if (exact && quoteExistsInChunk(exact.text, source.quote)) return { source: { ...source, pageNumber: exact.pageNumber }, repaired: source.pageNumber !== exact.pageNumber };

  const quoted = chunks.find(chunk => chunk.documentId === source.documentId && quoteExistsInChunk(chunk.text, source.quote))
    ?? chunks.find(chunk => quoteExistsInChunk(chunk.text, source.quote));
  if (quoted) return { source: { documentId: quoted.documentId, chunkId: quoted.id, pageNumber: quoted.pageNumber, quote: source.quote.trim() }, repaired: true };

  const fallback = exact
    ?? chunks.find(chunk => chunk.id === source.chunkId)
    ?? chunks.find(chunk => chunk.documentId === source.documentId && chunk.pageNumber === source.pageNumber)
    ?? bestChunk(chunks, question);
  if (!fallback) return undefined;
  return { source: { documentId: fallback.documentId, chunkId: fallback.id, pageNumber: fallback.pageNumber, quote: actualQuote(fallback, question) }, repaired: true };
}

export function reconcileQuestionSources(questions: GeneratedQuestion[], chunks: MaterialChunk[]) {
  let repairedCount = 0;
  const normalized = questions.map(question => {
    const reconciled = question.sources.map(source => reconcileSource(source, question, chunks)).filter((result): result is NonNullable<typeof result> => !!result);
    repairedCount += reconciled.filter(result => result.repaired).length;
    const unique = reconciled.map(result => result.source).filter((source, index, all) => all.findIndex(item => item.chunkId === source.chunkId && item.quote === source.quote) === index);
    if (!unique.length) {
      const fallback = bestChunk(chunks, question);
      if (!fallback) throw new Error('教材沒有可供驗證的文字片段。');
      unique.push({ documentId: fallback.documentId, chunkId: fallback.id, pageNumber: fallback.pageNumber, quote: actualQuote(fallback, question) });
      repairedCount += 1;
    }
    return { ...question, sources: unique };
  });
  return { questions: normalized, repairedCount };
}
