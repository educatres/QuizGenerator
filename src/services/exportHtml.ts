import QRCode from 'qrcode';
import type { ExamMeta, Question } from '../domain/types';
import { questionTypeLabels } from '../domain/types';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

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

function headerMarkup(meta: ExamMeta, questions: Question[], label: ExamVersion['label']) {
  return `<h1>${esc(meta.title)}<span class="version-badge">${label} 卷</span></h1><div class="meta">${esc(meta.subtitle)}　作答時間：${meta.duration} 分鐘　總分：${questions.reduce((sum, q) => sum + q.points, 0)} 分</div><div class="student"><span>班級：____________</span><span>姓名：____________</span><span>座號：______</span></div>`;
}

function answerValue(q: Question) {
  return q.type === 'true_false' ? (q.correctBoolean ? '正確' : '錯誤') : q.type === 'short_answer' ? q.referenceAnswer : q.correctOptionIds?.join('、');
}

function questionMarkup(q: Question, index: number, answers: boolean, version: ExamVersion['label']) {
  const options = q.type === 'true_false' ? [{ id: 'T', text: '正確' }, { id: 'F', text: '錯誤' }] : q.options ?? [];
  return `<section class="q" data-version="${version}" data-question-number="${index + 1}" data-question-id="${esc(q.id)}"><h2>${index + 1}. ${esc(q.stem)} <span class="type">[${esc(questionTypeLabels[q.type])}・${q.points} 分]</span></h2>${options.length ? `<div class="options">${options.map(o => `<div>(${esc(o.id)}) ${esc(o.text)}</div>`).join('')}</div>` : '<div class="answer-line"></div><div class="answer-line"></div>'}${answers ? `<div class="explanation"><strong>答案：</strong>${esc(answerValue(q))}<br><strong>解析：</strong>${esc(q.explanation)}${q.rubric ? `<br><strong>評分準則：</strong>${esc(q.rubric)}` : ''}</div>` : ''}</section>`;
}

export function createPrintHtml(meta: ExamMeta, questions: Question[]) {
  const versions = buildExamVersions(questions, meta.seed);
  const papers = versions.map(({ label, questions: ordered }, versionIndex) => `<section class="${versionIndex ? 'page-break' : ''}">${headerMarkup(meta, ordered, label)}${ordered.map((q, i) => questionMarkup(q, i, false, label)).join('')}</section>`).join('');
  const answers = versions.map(({ label, questions: ordered }) => `<section class="page-break">${headerMarkup(meta, ordered, label)}<h2>${label} 卷參考答案與解析</h2>${ordered.map((q, i) => questionMarkup(q, i, true, label)).join('')}</section>`).join('');
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(meta.title)} A／B 卷</title><style>${commonStyle()}</style></head><body><main>${papers}${answers}</main></body></html>`;
}

function markingAnswerMarkup(q: Question) {
  const options = q.type === 'true_false' ? [{ id: 'T', text: '正確' }, { id: 'F', text: '錯誤' }] : q.options ?? [];
  if (!options.length) return '<div class="written-answer"><span>請在框內作答</span></div>';
  return `<div class="mark-bubbles">${options.map(option => `<div><i></i><b>${esc(option.id)}</b><span>${esc(option.text)}</span></div>`).join('')}</div>`;
}

async function markingQuestionMarkup(meta: ExamMeta, q: Question, index: number, version: ExamVersion['label']) {
  const payload = safeJson({ schema: 'exam-studio-question-v1', exam: meta.title, version, number: index + 1, questionId: q.id, type: q.type });
  const qr = await QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, width: 64 });
  return `<section class="marking-question" data-version="${version}" data-question-number="${index + 1}" data-question-id="${esc(q.id)}"><div class="question-code"><strong>${index + 1}</strong><div class="question-qr" aria-label="${version} 卷第 ${index + 1} 題 QR Code">${qr}</div></div><div class="marking-content"><h2>${esc(q.stem)} <span class="type">[${esc(questionTypeLabels[q.type])}・${q.points} 分]</span></h2>${markingAnswerMarkup(q)}</div></section>`;
}

function gradingManifest(meta: ExamMeta, versions: ExamVersion[]) {
  return {
    schema: 'exam-studio-grading-v1',
    exam: { title: meta.title, subtitle: meta.subtitle, duration: meta.duration },
    versions: versions.map(({ label, questions }) => ({
      label,
      questions: questions.map((q, index) => ({
        number: index + 1,
        questionId: q.id,
        type: q.type,
        points: q.points,
        correctOptionIds: q.correctOptionIds,
        correctBoolean: q.correctBoolean,
        referenceAnswer: q.referenceAnswer,
        rubric: q.rubric,
      })),
    })),
  };
}

export async function createMarkingHtml(meta: ExamMeta, questions: Question[]) {
  const versions = buildExamVersions(questions, meta.seed);
  const papers: string[] = [];
  for (const [versionIndex, { label, questions: ordered }] of versions.entries()) {
    const questionHtml = await Promise.all(ordered.map((question, index) => markingQuestionMarkup(meta, question, index, label)));
    papers.push(`<section class="marking-paper ${versionIndex ? 'page-break' : ''}">${headerMarkup(meta, ordered, label)}<p class="marking-note">請將答案圓圈塗滿；簡答題請寫在方框內。每題 QR Code 用來辨識卷別、題號與題目。</p>${questionHtml.join('')}</section>`);
  }
  const answers = versions.map(({ label, questions: ordered }) => `<section class="page-break">${headerMarkup(meta, ordered, label)}<h2>${label} 卷 AI 批改參考答案</h2>${ordered.map((q, i) => questionMarkup(q, i, true, label)).join('')}</section>`).join('');
  const manifest = gradingManifest(meta, versions);
  const markingStyle = `.marking-note{padding:3mm;border:1px solid #777;background:#f5f5f5;font-size:12pt}.marking-question{display:grid;grid-template-columns:20mm 1fr;gap:4mm;break-inside:avoid;border-bottom:1px solid #bbb;padding:4mm 0}.question-code{display:flex;flex-direction:column;align-items:center;gap:1.5mm}.question-code>strong{font-size:16pt}.question-qr{width:17mm;height:17mm}.question-qr svg{display:block;width:100%;height:100%}.marking-content h2{font-size:12pt;margin:0 0 3mm}.mark-bubbles{display:flex;flex-wrap:wrap;gap:3mm 7mm}.mark-bubbles>div{display:flex;align-items:center;gap:1.5mm}.mark-bubbles i{display:block;width:5mm;height:5mm;border:1.5px solid #111;border-radius:50%}.mark-bubbles span{font-size:12pt}.written-answer{height:25mm;border:1px solid #777;padding:2mm;color:#777;font-size:12pt}`;
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(meta.title)} AI 劃卡 A／B 卷</title><style>${commonStyle()}${markingStyle}</style></head><body><main>${papers.join('')}${answers}<section class="page-break"><h1>AI 批改說明</h1><p>將學生作答掃描影像與此 HTML 一併提供給具備影像辨識能力的 AI。AI 可掃描每題 QR Code，依內嵌批改清單核對卷別、題號、正解與配分；簡答題依參考答案及評分準則評分。</p></section></main><script type="application/json" id="grading-manifest">${safeJson(manifest)}</script></body></html>`;
}

export function downloadText(filename: string, content: string, type = 'text/html') {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
