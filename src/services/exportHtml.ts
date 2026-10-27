import type { ExamMeta, Question } from '../domain/types';
import { questionTypeLabels } from '../domain/types';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const output = [...items]; let state = seed >>> 0;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
  for (let i = output.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [output[i], output[j]] = [output[j], output[i]]; }
  return output;
}

function commonStyle() { return `*{box-sizing:border-box}body{font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif;color:#222;margin:0}main{max-width:180mm;margin:auto}h1{text-align:center;font-size:22pt;margin:0 0 3mm}.meta{text-align:center;margin-bottom:8mm}.student{display:flex;gap:12mm;border-bottom:1px solid #333;padding-bottom:3mm;margin-bottom:7mm}.q{break-inside:avoid;margin:0 0 7mm;line-height:1.7}.q h2{font-size:12pt;margin:0 0 2mm;font-weight:600}.type{font-size:9pt;color:#666}.options{display:grid;grid-template-columns:1fr 1fr;gap:2mm 8mm;margin-left:5mm}.answer-line{border-bottom:1px solid #aaa;height:9mm}.page-break{break-before:page}.explanation{font-size:10pt;color:#444;background:#f4f5ef;padding:3mm;margin-top:2mm}@page{size:A4;margin:15mm}@media print{button{display:none}}` }

function questionMarkup(q: Question, index: number, answers: boolean) {
  const options = q.type === 'true_false' ? [{ id: 'T', text: '正確' }, { id: 'F', text: '錯誤' }] : q.options ?? [];
  const answer = q.type === 'true_false' ? (q.correctBoolean ? '正確' : '錯誤') : q.type === 'short_answer' ? q.referenceAnswer : q.correctOptionIds?.join('、');
  return `<section class="q"><h2>${index + 1}. ${esc(q.stem)} <span class="type">[${esc(questionTypeLabels[q.type])}・${q.points} 分]</span></h2>${options.length ? `<div class="options">${options.map(o => `<div>(${esc(o.id)}) ${esc(o.text)}</div>`).join('')}</div>` : '<div class="answer-line"></div><div class="answer-line"></div>'}${answers ? `<div class="explanation"><strong>答案：</strong>${esc(answer)}<br><strong>解析：</strong>${esc(q.explanation)}${q.rubric ? `<br><strong>評分準則：</strong>${esc(q.rubric)}` : ''}</div>` : ''}</section>`;
}

export function createPrintHtml(meta: ExamMeta, questions: Question[]) {
  const ordered = seededShuffle(questions, meta.seed);
  const header = `<h1>${esc(meta.title)}</h1><div class="meta">${esc(meta.subtitle)}　作答時間：${meta.duration} 分鐘　總分：${ordered.reduce((sum, q) => sum + q.points, 0)} 分</div><div class="student"><span>班級：____________</span><span>姓名：____________</span><span>座號：______</span></div>`;
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(meta.title)}</title><style>${commonStyle()}</style></head><body><main>${header}${ordered.map((q, i) => questionMarkup(q, i, false)).join('')}<section class="page-break">${header}<h2>參考答案與解析</h2>${ordered.map((q, i) => questionMarkup(q, i, true)).join('')}</section></main></body></html>`;
}

export function downloadText(filename: string, content: string, type = 'text/html') {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
