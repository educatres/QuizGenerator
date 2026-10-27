import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { MaterialDocument } from '../domain/types';
import { now, uid } from '../domain/types';
import { chunkText } from './chunker';

GlobalWorkerOptions.workerSrc = workerUrl;

const pdfOptions = {
  cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
  wasmUrl: `${import.meta.env.BASE_URL}pdfjs/wasm/`,
  isEvalSupported: false,
};

export async function extractPdf(file: File, onProgress?: (current: number, total: number) => void): Promise<MaterialDocument> {
  if (file.size > 100 * 1024 * 1024) throw new Error('PDF 上限為 100 MB，請先壓縮或分割。');
  const data = await file.arrayBuffer();
  const signature = new TextDecoder().decode(data.slice(0, 1024));
  if (!signature.includes('%PDF-')) throw new Error('檔案不是有效的 PDF。');
  const id = uid();
  let pdf;
  try { pdf = await getDocument({ ...pdfOptions, data: new Uint8Array(data) }).promise; }
  catch (error) { throw new Error((error as Error).name === 'PasswordException' ? 'PDF 有密碼保護，請先解除密碼。' : '無法解析 PDF，檔案可能損壞。'); }
  const pageCount = pdf.numPages;
  const chunks = [];
  let characterCount = 0;
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress?.(pageNumber, pdf.numPages);
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map(item => 'str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '').join('').trim();
    characterCount += text.length;
    chunks.push(...chunkText(id, text, pageNumber));
    page.cleanup();
  }
  await pdf.cleanup();
  return {
    id, name: file.name, kind: 'pdf', size: file.size, pageCount,
    characterCount, chunks, createdAt: now(),
    warning: characterCount < Math.max(30, pageCount * 10) ? '幾乎沒有擷取到文字；這可能是掃描型 PDF，MVP 尚未提供 OCR。' : undefined,
  };
}

export async function extractTextFile(file: File): Promise<MaterialDocument> {
  if (file.size > 10 * 1024 * 1024) throw new Error('文字檔上限為 10 MB。');
  const text = (await file.text()).replace(/^\uFEFF/, '');
  const id = uid();
  const kind = file.name.toLowerCase().endsWith('.md') ? 'md' : 'txt';
  return { id, name: file.name, kind, size: file.size, characterCount: text.length, chunks: chunkText(id, text), createdAt: now() };
}

export function fromPastedText(text: string): MaterialDocument {
  const id = uid();
  return { id, name: `貼上文字 ${new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`, kind: 'pasted', size: new Blob([text]).size, characterCount: text.length, chunks: chunkText(id, text), createdAt: now() };
}
