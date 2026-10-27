import type { ExamMeta, Question } from '../domain/types';
import { questionTypeLabels } from '../domain/types';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export interface ExamVersion {
  label: 'A' | 'B';
  questions: Question[];
}

export function seededShuffle<T>(items: T[], seed: number): T[] {
  const output = [...items]; let state = seed >>> 0;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
  for (let i = output.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [output[i], output[j]] = [output[j], output[i]]; }
  return output;
}

export function buildExamVersions(questions: Question[], seed: number): ExamVersion[] {
  const a = seededShuffle(questions, seed);
  const offset = a.length > 1 ? 1 + ((seed >>> 0) % (a.length - 1)) : 0;
  const b = offset ? [...a.slice(offset), ...a.slice(0, offset)] : [...a];
  return [{ label: 'A', questions: a }, { label: 'B', questions: b }];
}

function commonStyle() { return `*{box-sizing:border-box}body{font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif;font-size:12pt;color:#222;margin:0}main{max-width:180mm;margin:auto}h1{text-align:center;font-size:22pt;margin:0 0 3mm}.meta{text-align:center;margin-bottom:5mm}.version-badge{display:inline-block;margin-left:3mm;padding:1mm 3mm;border:1.5px solid #222;border-radius:2mm;font-weight:700}.student{display:flex;gap:10mm;border-bottom:1px solid #333;padding-bottom:3mm;margin-bottom:7mm}.q{break-inside:avoid;margin:0 0 7mm;line-height:1.7}.q h2{font-size:12pt;margin:0 0 2mm;font-weight:600}.type{font-size:12pt;color:#666}.options{display:grid;grid-template-columns:1fr 1fr;gap:2mm 8mm;margin-left:5mm}.answer-line{border-bottom:1px solid #aaa;height:9mm}.page-break{break-before:page}.explanation{font-size:12pt;color:#444;background:#f4f5ef;padding:3mm;margin-top:2mm}@page{size:A4;margin:15mm}@media print{button{display:none}}`; }

function headerMarkup(meta: ExamMeta, questions: Question[], label?: ExamVersion['label']) {
  return `<h1>${esc(meta.title)}${label ? `<span class="version-badge">${label} 卷</span>` : ''}</h1><div class="meta">${esc(meta.subtitle)}　作答時間：${meta.duration} 分鐘　總分：${questions.reduce((sum, q) => sum + q.points, 0)} 分</div><div class="student"><span>班級：____________</span><span>姓名：____________</span><span>座號：______</span></div>`;
}

function answerValue(q: Question) {
  return q.type === 'true_false' ? (q.correctBoolean ? '正確' : '錯誤') : q.type === 'short_answer' ? q.referenceAnswer : q.correctOptionIds?.join('、');
}

function questionMarkup(q: Question, index: number, answers: boolean) {
  const options = q.type === 'true_false' ? [{ id: 'T', text: '正確' }, { id: 'F', text: '錯誤' }] : q.options ?? [];
  return `<section class="q"><h2>${index + 1}. ${esc(q.stem)} <span class="type">[${esc(questionTypeLabels[q.type])}・${q.points} 分]</span></h2>${options.length ? `<div class="options">${options.map(o => `<div>(${esc(o.id)}) ${esc(o.text)}</div>`).join('')}</div>` : '<div class="answer-line"></div><div class="answer-line"></div>'}${answers ? `<div class="explanation"><strong>答案：</strong>${esc(answerValue(q))}<br><strong>解析：</strong>${esc(q.explanation)}${q.rubric ? `<br><strong>評分準則：</strong>${esc(q.rubric)}` : ''}</div>` : ''}</section>`;
}

function documentShell(meta: ExamMeta, content: string, suffix: string) {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(meta.title)} ${suffix}</title><style>${commonStyle()}</style></head><body><main>${content}</main></body></html>`;
}

export function createPrintHtml(meta: ExamMeta, questions: Question[]) {
  const ordered = seededShuffle(questions, meta.seed);
  const paper = `<section>${headerMarkup(meta, ordered)}${ordered.map((q, i) => questionMarkup(q, i, false)).join('')}</section>`;
  const answers = `<section class="page-break">${headerMarkup(meta, ordered)}<h2>參考答案與解析</h2>${ordered.map((q, i) => questionMarkup(q, i, true)).join('')}</section>`;
  return documentShell(meta, `${paper}${answers}`, '一般考卷');
}

export function createAbPrintHtml(meta: ExamMeta, questions: Question[]) {
  const versions = buildExamVersions(questions, meta.seed);
  const papers = versions.map(({ label, questions: ordered }, versionIndex) => `<section class="${versionIndex ? 'page-break' : ''}">${headerMarkup(meta, ordered, label)}${ordered.map((q, i) => questionMarkup(q, i, false)).join('')}</section>`).join('');
  const answers = versions.map(({ label, questions: ordered }) => `<section class="page-break">${headerMarkup(meta, ordered, label)}<h2>${label} 卷參考答案與解析</h2>${ordered.map((q, i) => questionMarkup(q, i, true)).join('')}</section>`).join('');
  return documentShell(meta, `${papers}${answers}`, 'A／B 卷');
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename: string, content: string, type = 'text/html') {
  downloadBlob(filename, new Blob([content], { type: `${type};charset=utf-8` }));
}
