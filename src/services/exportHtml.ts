import type { ExamMeta, Question } from '../domain/types';
import { questionTypeLabels } from '../domain/types';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const js = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

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

export function createInteractiveHtml(meta: ExamMeta, questions: Question[]) {
  const safeQuestions = questions.map(({ sources: _sources, providerId: _provider, modelId: _model, createdAt: _date, revision: _revision, status: _status, ...q }) => q);
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(meta.title)}</title><style>${commonStyle()}body{background:#eef1e8;padding:24px}main{background:#fff;padding:10mm;border-radius:8px}button{background:#355c4b;color:#fff;border:0;border-radius:5px;padding:10px 18px;font:inherit}.result{margin-top:18px;padding:14px;background:#edf2e6}.options{display:block}.options label{display:block;margin:7px 0}</style></head><body><main><h1>${esc(meta.title)}</h1><div class="meta">${esc(meta.subtitle)}</div><div id="quiz"></div><button id="submit">交卷並查看結果</button><div id="result" class="result" hidden></div></main><script>const qs=${js(seededShuffle(safeQuestions, meta.seed))};const root=document.getElementById('quiz');const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));root.innerHTML=qs.map((q,i)=>{let input='';if(q.type==='single'||q.type==='multiple')input=(q.options||[]).map(o=>'<label><input type="'+(q.type==='multiple'?'checkbox':'radio')+'" name="q'+i+'" value="'+E(o.id)+'"> '+E(o.id)+'. '+E(o.text)+'</label>').join('');else if(q.type==='true_false')input='<label><input type="radio" name="q'+i+'" value="true"> 正確</label><label><input type="radio" name="q'+i+'" value="false"> 錯誤</label>';else input='<textarea name="q'+i+'" rows="4" style="width:100%"></textarea>';return '<section class="q"><h2>'+(i+1)+'. '+E(q.stem)+'</h2><div class="options">'+input+'</div></section>'}).join('');document.getElementById('submit').onclick=()=>{let earned=0,total=0,details=[];qs.forEach((q,i)=>{total+=q.points;let ok=false;if(q.type==='single'||q.type==='multiple'){const got=[...document.querySelectorAll('[name=q'+i+']:checked')].map(x=>x.value).sort().join('|');ok=got===(q.correctOptionIds||[]).slice().sort().join('|')}else if(q.type==='true_false'){const x=document.querySelector('[name=q'+i+']:checked');ok=!!x&&x.value===String(q.correctBoolean)}if(ok)earned+=q.points;details.push('<p><strong>'+(i+1)+'. '+(q.type==='short_answer'?'請由教師評分':ok?'答對':'答錯')+'</strong><br>'+E(q.explanation)+'</p>')});const r=document.getElementById('result');r.hidden=false;r.innerHTML='<h2>自動計分：'+earned+' / '+total+'（簡答題不計）</h2>'+details.join('');r.scrollIntoView({behavior:'smooth'})};</script></body></html>`;
}

export function downloadText(filename: string, content: string, type = 'text/html') {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
