import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, CheckCircle2, ChevronDown, ChevronUp,
  CircleAlert, Copy, Download, Eye, EyeOff, FileCheck2, FilePlus2, FileText, KeyRound, LoaderCircle,
  Plus, Printer, QrCode, RefreshCw, ShieldCheck, Sparkles, Trash2, Upload, Wifi, X, XCircle,
} from 'lucide-react';
import type { Difficulty, ExamMeta, GenerationSettings, MaterialDocument, ProviderId, Question, QuestionStatus, QuestionType } from './domain/types';
import { difficultyLabels, now, questionTypeLabels, uid } from './domain/types';
import { adapters, clearAllSessionKeys, clearSessionKey, hasSessionKey, setSessionKey } from './providers';
import type { ModelOption } from './providers/types';
import { extractPdf, extractTextFile, fromPastedText } from './services/pdfExtract';
import { clearSnapshot, loadSnapshot, saveSnapshot } from './services/localDb';
import { createMarkingHtml, createPrintHtml, downloadText } from './services/exportHtml';
import { reconcileQuestionSources } from './services/sourceValidation';

const steps = [
  ['AI 設定', '連接模型'], ['加入教材', '本機解析'], ['出題設定', '建立題目'], ['審核題庫', '教師把關'], ['匯出試卷', '列印與測驗'],
] as const;
const providerIds: ProviderId[] = ['cgu', 'openai', 'xai', 'gemini'];
const defaultModels: Record<ProviderId, string> = { cgu: '', openai: 'gpt-4.1-mini', xai: 'grok-3-mini', gemini: 'gemini-2.5-flash' };
const MODEL_CONFIG_STORAGE_KEY = 'teacher-exam-studio.model-config.v1';
const defaultSettings: GenerationSettings = { counts: { single: 5, multiple: 2, true_false: 2, short_answer: 1 }, difficulty: 'medium', points: 10, language: 'zh-TW', instructions: '' };
const defaultExam: ExamMeta = { title: '課堂學習評量', subtitle: '', duration: 50, seed: 2026 };

function totalRequested(settings: GenerationSettings) { return Object.values(settings.counts).reduce((a, b) => a + b, 0); }
function formatBytes(bytes: number) { return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function storedModelConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(MODEL_CONFIG_STORAGE_KEY) || '{}') as { provider?: ProviderId; models?: Partial<Record<ProviderId, string>> };
    return { provider: providerIds.includes(saved.provider as ProviderId) ? saved.provider as ProviderId : 'cgu' as ProviderId, models: { ...defaultModels, ...saved.models } };
  } catch { return { provider: 'cgu' as ProviderId, models: defaultModels }; }
}

export function App() {
  const [step, setStep] = useState(0);
  const initialModelConfig = useMemo(storedModelConfig, []);
  const [provider, setProvider] = useState<ProviderId>(initialModelConfig.provider);
  const [models, setModels] = useState<Partial<Record<ProviderId, ModelOption[]>>>({});
  const [selectedModels, setSelectedModels] = useState(initialModelConfig.models);
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [connected, setConnected] = useState<Partial<Record<ProviderId, boolean>>>({});
  const [materials, setMaterials] = useState<MaterialDocument[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [exam, setExam] = useState(defaultExam);
  const [pasteText, setPasteText] = useState('');
  const [expandedMaterial, setExpandedMaterial] = useState<string>();
  const [reviewFilter, setReviewFilter] = useState<QuestionStatus | 'all'>('all');
  const [reviewFocus, setReviewFocus] = useState<{ id: string; token: number }>();
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error' | 'info'; text: string }>();
  const [hydrated, setHydrated] = useState(false);
  const generationController = useRef<AbortController | undefined>(undefined);
  const noticeTimer = useRef<number | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { void loadSnapshot().then(snapshot => { if (snapshot) { setMaterials(snapshot.materials); setQuestions(snapshot.questions); setExam(snapshot.exam); } setHydrated(true); }); }, []);
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => void saveSnapshot({ materials, questions, exam }), 450);
    return () => clearTimeout(timer);
  }, [materials, questions, exam, hydrated]);
  useEffect(() => { setKeyDraft(''); setShowKey(false); setConnectionMessage(''); }, [provider]);
  useEffect(() => {
    try { localStorage.setItem(MODEL_CONFIG_STORAGE_KEY, JSON.stringify({ provider, models: selectedModels })); }
    catch { /* Keep settings in memory when browser storage is unavailable. */ }
  }, [provider, selectedModels]);

  const adapter = adapters[provider];
  const allChunks = useMemo(() => materials.flatMap(material => material.chunks), [materials]);
  const accepted = questions.filter(q => q.status === 'accepted');
  const visibleQuestions = questions.filter(q => reviewFilter === 'all' || q.status === reviewFilter);
  const canGo = [true, true, materials.length > 0, questions.length > 0, accepted.length > 0];
  const announce = (text: string, kind: 'success' | 'error' | 'info' = 'success') => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice({ text, kind });
    // Errors stay visible for debugging until the user explicitly closes them.
    if (kind !== 'error') noticeTimer.current = window.setTimeout(() => setNotice(undefined), 5000);
  };

  function saveKey() {
    try { setSessionKey(provider, keyDraft); setKeyDraft(''); setShowKey(false); setConnectionMessage('API Key 已保存在這個瀏覽器。請只在自己的裝置使用此功能。'); }
    catch (error) { setConnectionMessage((error as Error).message); }
  }
  async function listModels() {
    if (keyDraft.trim()) saveKey();
    setBusy('models'); setConnectionMessage('');
    try {
      const list = await adapter.listModels(); setModels(state => ({ ...state, [provider]: list }));
      const current = selectedModels[provider];
      const selected = list.some(model => model.id === current) ? current : list[0]?.id || '';
      setSelectedModels(state => ({ ...state, [provider]: selected }));
      const luna = provider === 'cgu' && list[0] && /luna/i.test(`${list[0].id} ${list[0].label}`);
      setConnectionMessage(list.length ? `已偵測 ${list.length} 個模型。${luna && selected === list[0].id ? `已預設選擇最新 Luna：${list[0].label}。` : ''}請再測試連線確認生成權限。` : 'API 沒有回傳可用模型。');
    } catch (error) { setConnectionMessage((error as Error).message); }
    finally { setBusy(''); }
  }
  async function testConnection() {
    if (keyDraft.trim()) saveKey();
    setBusy('test'); setConnectionMessage('');
    try { await adapter.testGeneration(selectedModels[provider]); setConnected(state => ({ ...state, [provider]: true })); setConnectionMessage('連線成功，所選模型已通過文字生成測試。'); }
    catch (error) { setConnected(state => ({ ...state, [provider]: false })); setConnectionMessage((error as Error).message); }
    finally { setBusy(''); }
  }

  async function importFiles(files: FileList | File[]) {
    const list = [...files]; if (!list.length) return;
    setBusy('import');
    try {
      const imported: MaterialDocument[] = [];
      for (const file of list) {
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (extension === 'pdf') imported.push(await extractPdf(file, (current, total) => setNotice({ kind: 'info', text: `正在解析 ${file.name}：${current} / ${total} 頁` })));
        else if (extension === 'txt' || extension === 'md' || extension === 'markdown') imported.push(await extractTextFile(file));
        else throw new Error(`${file.name} 的格式不受支援。請使用 PDF、TXT 或 Markdown。`);
      }
      setMaterials(state => [...state, ...imported]); setExpandedMaterial(imported[0]?.id); announce(`已在本機解析 ${imported.length} 份教材。`);
    } catch (error) { announce((error as Error).message, 'error'); }
    finally { setBusy(''); if (fileInput.current) fileInput.current.value = ''; }
  }
  function addPasted() {
    if (pasteText.trim().length < 20) return announce('請貼上至少 20 個字的教材內容。', 'error');
    const material = fromPastedText(pasteText); setMaterials(state => [...state, material]); setPasteText(''); setExpandedMaterial(material.id); announce('已加入貼上文字。');
  }
  async function addExampleMaterial() {
    setBusy('example');
    try {
      const existing = materials.find(item => item.name === 'AI_概念入門_範例.txt');
      if (existing) { setExpandedMaterial(existing.id); announce('「AI 概念入門」範例已在教材清單中。', 'info'); return; }
      const response = await fetch(`${import.meta.env.BASE_URL}examples/ai-concepts.txt`);
      if (!response.ok) throw new Error(`無法讀取範例資料（HTTP ${response.status}）。`);
      const text = await response.text();
      const material = { ...fromPastedText(text), name: 'AI_概念入門_範例.txt', kind: 'txt' as const };
      setMaterials(state => [...state, material]);
      setExpandedMaterial(material.id); announce('已載入「AI 概念入門」範例，可直接前往出題設定。');
    } catch (error) { announce((error as Error).message, 'error'); }
    finally { setBusy(''); }
  }

  async function generate() {
    if (!materials.length) return announce('請先加入教材。', 'error');
    if (!hasSessionKey(provider)) { setApiSettingsOpen(true); setStep(0); return announce('請先設定 API Key；設定面板已為你開啟。', 'error'); }
    if (!selectedModels[provider]) { setApiSettingsOpen(true); setStep(0); return announce('請先偵測並選擇模型。', 'error'); }
    if (totalRequested(settings) < 1 || totalRequested(settings) > 50) return announce('一次請產生 1–50 題。', 'error');
    const controller = new AbortController(); generationController.current = controller; setBusy('generate');
    try {
      const generated = await adapter.generateQuestions({ model: selectedModels[provider], chunks: allChunks, settings, signal: controller.signal });
      const verified = reconcileQuestionSources(generated, allChunks);
      const enriched: Question[] = verified.questions.map(q => ({ ...q, id: uid(), status: 'candidate', revision: 1, providerId: provider, modelId: selectedModels[provider], createdAt: now() }));
      setQuestions(state => [...state, ...enriched]); setStep(3); announce(`已建立 ${enriched.length} 題候選題${verified.repairedCount ? `，並校正 ${verified.repairedCount} 則來源引文` : ''}，請逐題審核。`);
    } catch (error) { announce((error as Error).message, 'error'); }
    finally { setBusy(''); generationController.current = undefined; }
  }

  function updateQuestion(id: string, patch: Partial<Question>) { setQuestions(state => state.map(q => q.id === id ? { ...q, ...patch, revision: q.revision + 1 } : q)); }
  function moveQuestion(index: number, direction: -1 | 1) {
    setQuestions(state => { const copy = [...state]; const target = index + direction; if (target < 0 || target >= copy.length) return state; [copy[index], copy[target]] = [copy[target], copy[index]]; return copy; });
  }
  function duplicateQuestion(question: Question) { setQuestions(state => [...state, { ...structuredClone(question), id: uid(), stem: `${question.stem}（副本）`, status: 'candidate', revision: 1, createdAt: now() }]); }
  function exportJson() { downloadText('exam-studio.json', JSON.stringify({ version: 1, exportedAt: now(), exam, questions }, null, 2), 'application/json'); }
  async function exportMarkingExam() {
    setBusy('export-marking');
    try {
      downloadText('exam-studio-ai-marking-ab.html', await createMarkingHtml(exam, accepted));
      announce('AI 劃卡 A／B 卷已建立；每題題號均附有 QR Code。');
    } catch (error) { announce(`無法建立劃卡卷：${(error as Error).message}`, 'error'); }
    finally { setBusy(''); }
  }
  async function importJson(file: File) {
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.questions)) throw new Error('JSON 中找不到 questions 陣列。');
      setQuestions(data.questions); if (data.exam) setExam(data.exam); announce(`已匯入 ${data.questions.length} 題。`);
    } catch (error) { announce(`匯入失敗：${(error as Error).message}`, 'error'); }
  }
  async function clearAll() { if (!confirm('確定清除這個瀏覽器保存的教材、題庫、試卷設定與所有 API Key？')) return; clearAllSessionKeys(); try { localStorage.removeItem(MODEL_CONFIG_STORAGE_KEY); } catch { /* Keep clearing other local data. */ } await clearSnapshot(); location.reload(); }

  return <div className="app-shell">
    <header className="app-header">
      <div className="brand"><div className="brand-symbol"><BookOpen size={24} /></div><div><h1>Exam Studio <span>1.0</span></h1><p>從教材到試卷，你的本機命題工作台</p></div></div>
      <div className="header-status"><button className={`ai-settings-toggle ${hasSessionKey(provider) && selectedModels[provider] ? 'ready' : ''}`} onClick={() => setApiSettingsOpen(true)}><KeyRound size={15} /><span><strong>AI 設定</strong><small>{hasSessionKey(provider) && selectedModels[provider] ? `${adapter.name} · ${selectedModels[provider]}` : '設定 API Key 與模型'}</small></span></button><span><ShieldCheck size={13} />教材直接傳至所選 AI</span><button onClick={() => void clearAll()} title="清除本機資料"><Trash2 size={15} /></button></div>
    </header>
    <nav className="stepper" aria-label="製作流程">{steps.map(([title, caption], index) => <button key={title} className={`${index === step ? 'active' : ''} ${canGo[index] ? 'available' : ''}`} onClick={() => canGo[index] && setStep(index)} disabled={!canGo[index]}><i>{index < step || (index === 0 && connected[provider]) ? <Check size={14} /> : index + 1}</i><span><strong>{title}</strong><small>{caption}</small></span></button>)}</nav>
    <main className="workspace">
      {step === 0 && <section className="panel connection-panel"><PageHeading eyebrow="STEP 01 · BRING YOUR OWN KEY" title="連接你的 AI" description="需要設定或更換 AI 時才打開設定面板；完成後可直接沿用這個瀏覽器保存的設定。" />
        <div className="connection-overview"><div className={`connection-orb ${hasSessionKey(provider) && selectedModels[provider] ? 'ready' : ''}`}>{hasSessionKey(provider) && selectedModels[provider] ? <Check size={28} /> : <KeyRound size={28} />}</div><p>{hasSessionKey(provider) && selectedModels[provider] ? 'AI 已準備完成' : '尚未完成 AI 設定'}</p><h3>{hasSessionKey(provider) && selectedModels[provider] ? adapter.name : '使用你自己的 API Key'}</h3><span>{hasSessionKey(provider) && selectedModels[provider] ? selectedModels[provider] : 'API Key 會保存在這個瀏覽器，且可隨時一鍵清除。'}</span><button className="primary settings-launch" onClick={() => setApiSettingsOpen(true)}><KeyRound size={16} />{hasSessionKey(provider) ? '查看或更改 AI 設定' : '設定 API Key 與模型'}</button><small><ShieldCheck size={13} />金鑰不會寫入題庫、匯出檔或 GitHub</small></div>
        <footer className="panel-actions"><span>只有在產生題目與測試連線時，瀏覽器才會呼叫所選 AI。</span><span className="spacer" /><button className="primary" onClick={() => setStep(1)}>下一步：加入教材<ArrowRight size={16} /></button></footer>
      </section>}

      {step === 1 && <section className="panel"><PageHeading eyebrow="STEP 02 · LOCAL PARSING" title="加入命題教材" description="PDF、TXT 與 Markdown 只在瀏覽器解析；只有按下產生題目時，文字片段才會送給 AI。" />
        <div className="material-layout"><div>
          <button className="drop-zone" onClick={() => fileInput.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void importFiles(e.dataTransfer.files); }}><Upload size={28} /><strong>{busy === 'import' ? '正在本機解析…' : '拖放或選擇教材檔案'}</strong><span>PDF · TXT · MD　PDF 上限 100 MB</span></button><input ref={fileInput} hidden type="file" accept=".pdf,.txt,.md,.markdown" multiple onChange={e => e.target.files && void importFiles(e.target.files)} />
          <button className="example-material-button" disabled={!!busy} onClick={() => void addExampleMaterial()}>{busy === 'example' ? <LoaderCircle className="spin" size={17} /> : <BookOpen size={17} />}<span><strong>載入 AI 概念入門範例</strong><small>純文字教材，可直接用來測試產題流程</small></span><ArrowRight size={15} /></button>
          <div className="or"><span>或貼上文字</span></div><textarea className="paste-area" value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder="貼上講義、文章或課程內容…" rows={7} /><button className="secondary add-paste" onClick={addPasted}><Plus size={15} />加入文字教材</button>
        </div><div className="material-list"><div className="list-heading"><span>教材清單</span><b>{materials.length} 份 · {allChunks.length} 個片段</b></div>{!materials.length ? <Empty icon={<FilePlus2 />} title="尚未加入教材" text="解析後可檢查擷取文字與頁碼，再交給 AI 出題。" /> : materials.map(material => <article key={material.id} className="material-card"><button className="material-summary" onClick={() => setExpandedMaterial(expandedMaterial === material.id ? undefined : material.id)}><FileText size={20} /><span><strong>{material.name}</strong><small>{material.kind.toUpperCase()} · {material.pageCount ? `${material.pageCount} 頁 · ` : ''}{material.characterCount.toLocaleString()} 字 · {formatBytes(material.size)}</small></span>{expandedMaterial === material.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>{material.warning && <p className="warning"><CircleAlert size={14} />{material.warning}</p>}{expandedMaterial === material.id && <div className="material-preview">{material.chunks.slice(0, 3).map(chunk => <div key={chunk.id}><b>{chunk.pageNumber ? `第 ${chunk.pageNumber} 頁` : chunk.id}</b><p>{chunk.text.slice(0, 550)}{chunk.text.length > 550 ? '…' : ''}</p></div>)}{material.chunks.length > 3 && <small>另有 {material.chunks.length - 3} 個片段</small>}</div>}<button className="remove" onClick={() => setMaterials(state => state.filter(d => d.id !== material.id))} aria-label={`移除 ${material.name}`}><X size={15} /></button></article>)}</div></div>
        <footer className="panel-actions"><button className="secondary" onClick={() => setStep(0)}><ArrowLeft size={16} />上一步</button><span className="spacer" /><button className="primary" disabled={!materials.length} onClick={() => setStep(2)}>下一步：設定題型<ArrowRight size={16} /></button></footer>
      </section>}

      {step === 2 && <section className="panel"><PageHeading eyebrow="STEP 03 · QUESTION BLUEPRINT" title="設定題型與難度" description="AI 產生的都是候選題；答案、引文與評分準則需由教師在下一步確認。" />
        <div className="generation-grid"><div className="settings-card"><h3>題型與題數</h3>{(Object.keys(settings.counts) as QuestionType[]).map(type => <label className="count-row" key={type}><span>{questionTypeLabels[type]}<small>{type === 'single' ? '恰有一個正解' : type === 'multiple' ? '可有多個正解' : type === 'true_false' ? '正確或錯誤' : '參考答案與評分準則'}</small></span><input type="number" min="0" max="25" value={settings.counts[type]} onChange={e => setSettings(s => ({ ...s, counts: { ...s.counts, [type]: Math.max(0, Number(e.target.value)) } }))} /></label>)}</div>
          <div className="settings-card"><h3>命題條件</h3><label className="stack-field"><span>整體難度</span><select value={settings.difficulty} onChange={e => setSettings(s => ({ ...s, difficulty: e.target.value as Difficulty }))}>{(Object.keys(difficultyLabels) as Difficulty[]).map(d => <option value={d} key={d}>{difficultyLabels[d]}</option>)}</select></label><label className="stack-field"><span>每題預設配分</span><input type="number" min="1" max="100" value={settings.points} onChange={e => setSettings(s => ({ ...s, points: Number(e.target.value) }))} /></label><label className="stack-field"><span>額外命題要求</span><textarea rows={5} value={settings.instructions} onChange={e => setSettings(s => ({ ...s, instructions: e.target.value }))} placeholder="例如：著重概念應用，避免純記憶題…" /></label></div>
          <aside className="generation-summary"><Sparkles size={26} /><span>這次將產生</span><strong>{totalRequested(settings)}</strong><b>題候選題</b><dl><div><dt>教材</dt><dd>{materials.length} 份</dd></div><div><dt>文字片段</dt><dd>{allChunks.length} 個</dd></div><div><dt>AI</dt><dd>{adapter.name}</dd></div><div><dt>模型</dt><dd>{selectedModels[provider] || '未選擇'}</dd></div></dl>{!hasSessionKey(provider) && <p className="warning"><CircleAlert size={14} />尚未設定 API Key；按下產生題目時會自動開啟設定面板。</p>}<button className="generate-button" disabled={busy === 'generate' || !allChunks.length} onClick={() => void generate()}>{busy === 'generate' ? <><LoaderCircle className="spin" />正在閱讀教材與命題…</> : <><Sparkles />產生候選題</>}</button>{busy === 'generate' && <button className="cancel" onClick={() => generationController.current?.abort()}>取消請求</button>}</aside></div>
        <footer className="panel-actions"><button className="secondary" onClick={() => setStep(1)}><ArrowLeft size={16} />上一步</button><span className="spacer" />{questions.length > 0 && <button className="secondary" onClick={() => setStep(3)}>查看已有 {questions.length} 題<ArrowRight size={16} /></button>}</footer>
      </section>}

      {step === 3 && <section className="panel review-panel"><PageHeading eyebrow="STEP 04 · HUMAN REVIEW" title="審核候選題庫" description="接受、修改或退回每一題。來源引文可協助你回查教材，但仍請教師做最終判斷。" />
        <div className="review-toolbar"><div>{(['all', 'candidate', 'accepted', 'rejected'] as const).map(status => <button key={status} className={reviewFilter === status ? 'active' : ''} onClick={() => setReviewFilter(status)}>{status === 'all' ? '全部' : status === 'candidate' ? '待審核' : status === 'accepted' ? '已接受' : '已退回'} <b>{status === 'all' ? questions.length : questions.filter(q => q.status === status).length}</b></button>)}</div><button className="text-button" onClick={() => setQuestions(state => state.map(q => q.status === 'candidate' ? { ...q, status: 'accepted' } : q))}><CheckCircle2 size={15} />接受所有待審題</button></div>
        <div className="question-list">{visibleQuestions.map((question, visibleIndex) => { const index = questions.findIndex(q => q.id === question.id); const nextQuestionId = visibleQuestions[visibleIndex + 1]?.id; return <QuestionEditor key={question.id} question={question} index={index} total={questions.length} focusToken={reviewFocus?.id === question.id ? reviewFocus.token : undefined} update={patch => updateQuestion(question.id, patch)} accept={() => { updateQuestion(question.id, { status: 'accepted' }); if (nextQuestionId) setReviewFocus({ id: nextQuestionId, token: Date.now() }); }} move={direction => moveQuestion(index, direction)} duplicate={() => duplicateQuestion(question)} remove={() => setQuestions(state => state.filter(q => q.id !== question.id))} />; })}{!visibleQuestions.length && <Empty icon={<FileCheck2 />} title="此分類沒有題目" text="調整篩選條件，或回到上一步產生題目。" />}</div>
        <footer className="panel-actions sticky-actions"><button className="secondary" onClick={() => setStep(2)}><ArrowLeft size={16} />回出題設定</button><span>{accepted.length} 題已接受 · 共 {accepted.reduce((sum, q) => sum + q.points, 0)} 分</span><span className="spacer" /><button className="primary" disabled={!accepted.length} onClick={() => setStep(4)}>下一步：匯出試卷<ArrowRight size={16} /></button></footer>
      </section>}

      {step === 4 && <section className="panel"><PageHeading eyebrow="STEP 05 · EXPORT" title="匯出與列印" description="一般卷與 AI 劃卡卷都會產生題目相同、題序與題號不同的 A／B 卷；HTML 可完全離線使用。" />
        <div className="export-layout"><div className="settings-card exam-meta"><h3>試卷資訊</h3><label className="stack-field"><span>試卷標題</span><input value={exam.title} onChange={e => setExam(s => ({ ...s, title: e.target.value }))} /></label><label className="stack-field"><span>副標題／科目</span><input value={exam.subtitle} onChange={e => setExam(s => ({ ...s, subtitle: e.target.value }))} placeholder="例如：自然科第三單元" /></label><div className="two-fields"><label className="stack-field"><span>作答時間（分鐘）</span><input type="number" min="1" value={exam.duration} onChange={e => setExam(s => ({ ...s, duration: Number(e.target.value) }))} /></label><label className="stack-field"><span>固定亂數種子</span><input type="number" value={exam.seed} onChange={e => setExam(s => ({ ...s, seed: Number(e.target.value) }))} /></label></div><p className="field-help">相同亂數種子會維持相同的 A／B 題序，方便重製試卷。</p></div>
          <div className="export-preview"><div className="paper-preview"><span>A4 · A／B</span><h3>{exam.title || '未命名試卷'}</h3><p>{exam.subtitle}</p><div>班級 ______　姓名 ______</div>{accepted.slice(0, 4).map((q, i) => <p key={q.id}><b>{i + 1}.</b> {q.stem}</p>)}</div><dl><div><dt>每卷題數</dt><dd>{accepted.length}</dd></div><div><dt>每卷總分</dt><dd>{accepted.reduce((sum, q) => sum + q.points, 0)}</dd></div><div><dt>卷別</dt><dd>2</dd></div></dl></div>
          <div className="export-cards"><button onClick={() => downloadText('exam-studio-ab.html', createPrintHtml(exam, accepted))}><Printer /><span><strong>A／B 試卷＋解答</strong><small>相同題目以不同題序編號，附兩卷解答</small></span><Download /></button><button disabled={busy === 'export-marking'} onClick={() => void exportMarkingExam()}>{busy === 'export-marking' ? <LoaderCircle className="spin" /> : <QrCode />}<span><strong>AI 劃卡 A／B 卷</strong><small>每題題號附 QR Code、作答圈與批改清單</small></span><Download /></button><button onClick={exportJson}><FileText /><span><strong>題庫 JSON</strong><small>可備份完整題庫與修訂資訊；不含 API Key</small></span><Download /></button><label className="import-json"><Upload /><span><strong>匯入題庫 JSON</strong><small>載入先前匯出的題庫</small></span><input type="file" accept="application/json,.json" onChange={e => e.target.files?.[0] && void importJson(e.target.files[0])} /></label></div></div>
        <footer className="panel-actions"><button className="secondary" onClick={() => setStep(3)}><ArrowLeft size={16} />回審核題庫</button><span className="spacer" /><span><ShieldCheck size={14} />已檢查：匯出檔不包含金鑰與教材全文</span></footer>
      </section>}
    </main>
    {apiSettingsOpen && <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setApiSettingsOpen(false)}><section className="api-settings-modal" role="dialog" aria-modal="true" aria-labelledby="api-settings-title">
      <header className="modal-heading"><div><p>LOCAL AI CONNECTION</p><h2 id="api-settings-title">連接你的 AI</h2><span>設定保存在這個瀏覽器；下次開啟可直接沿用。</span></div><button onClick={() => setApiSettingsOpen(false)} aria-label="關閉 AI 設定"><X size={19} /></button></header>
      <div className="modal-scroll">
        <div className="provider-tabs">{providerIds.map(id => <button key={id} className={provider === id ? 'active' : ''} onClick={() => !busy && setProvider(id)} disabled={!!busy}><span>{id === 'cgu' ? '◈' : id === 'openai' ? '✳' : id === 'xai' ? '𝕏' : '✦'}</span>{adapters[id].name}{hasSessionKey(id) && <i />}</button>)}</div>
        <div className="endpoint"><span>BASE URL</span><code>{adapter.baseUrl}</code></div>
        <div className="privacy-card"><ShieldCheck size={23} /><div><strong>API Key 儲存在你的瀏覽器</strong><p>請只在信任的個人裝置使用。金鑰不會進入教材、題庫、匯出檔或 GitHub，並可隨時清除。</p></div></div>
        <label className="field-label" htmlFor="api-key">API Key <span>{hasSessionKey(provider) ? '這個瀏覽器已保存' : '尚未設定'}</span></label>
        <div className="key-input"><KeyRound size={17} /><input id="api-key" type={showKey ? 'text' : 'password'} autoComplete="off" value={keyDraft} placeholder={hasSessionKey(provider) ? '••••••••（輸入新金鑰可取代）' : '貼上你的 API Key'} onChange={e => setKeyDraft(e.target.value)} /><button disabled={!keyDraft} onClick={() => setShowKey(!showKey)} aria-label={showKey ? '隱藏金鑰' : '顯示金鑰'}>{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
        <div className="key-actions"><a href={adapter.keyUrl} target="_blank" rel="noreferrer">取得 {adapter.name} API Key ↗</a><div>{hasSessionKey(provider) && <button className="text-danger" onClick={() => { clearSessionKey(provider); setConnected(state => ({ ...state, [provider]: false })); setSelectedModels(state => ({ ...state, [provider]: '' })); setModels(state => ({ ...state, [provider]: [] })); setConnectionMessage('已清除這個瀏覽器保存的 API Key。'); }}><Trash2 size={13} />清除 API Key</button>}<button className="secondary" disabled={!keyDraft.trim() || !!busy} onClick={saveKey}>儲存 API Key</button></div></div>
        <div className="divider" />
        <div className="model-setting-heading"><div><strong>選擇模型</strong><span>{provider === 'cgu' ? '偵測後會優先選擇最新版 Luna，你仍可自行更換。' : '先取得帳戶可用模型，再選擇要使用的模型。'}</span></div><button className="secondary" disabled={!!busy || (!hasSessionKey(provider) && !keyDraft)} onClick={() => void listModels()}>{busy === 'models' ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}偵測模型</button></div>
        {(models[provider]?.length ?? 0) > 0 ? <label className="stack-field model-select-field"><span>可用模型</span><select aria-label="可用模型" value={selectedModels[provider]} onChange={e => setSelectedModels(state => ({ ...state, [provider]: e.target.value }))}>{models[provider]!.map(model => <option key={model.id} value={model.id}>{model.label}{model.label !== model.id ? `（${model.id}）` : ''}</option>)}</select></label> : provider === 'cgu' ? <div className="model-placeholder">{selectedModels.cgu ? <>已保存模型：<strong>{selectedModels.cgu}</strong>。按「偵測模型」更新清單。</> : '尚未偵測 CGU 模型。儲存 Key 後按「偵測模型」。'}</div> : <label className="stack-field model-select-field"><span>模型 ID</span><input value={selectedModels[provider]} onChange={e => setSelectedModels(state => ({ ...state, [provider]: e.target.value.trim() }))} placeholder="輸入模型 ID，或按偵測模型" /></label>}
        {connectionMessage && <div className={`inline-message ${connected[provider] ? 'success' : ''}`}>{connected[provider] ? <CheckCircle2 size={17} /> : <CircleAlert size={17} />}<span>{connectionMessage}</span></div>}
      </div>
      <footer className="modal-actions"><span>測試會送出一則「只回覆 OK」，可能產生少量用量。</span><button className="secondary" disabled={!!busy || !selectedModels[provider] || (!hasSessionKey(provider) && !keyDraft)} onClick={() => void testConnection()}>{busy === 'test' ? <LoaderCircle className="spin" size={16} /> : <Wifi size={16} />}測試連線</button><button className="primary" onClick={() => setApiSettingsOpen(false)}>完成</button></footer>
    </section></div>}
    {notice && <div className={`toast ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.kind === 'success' ? <CheckCircle2 /> : notice.kind === 'error' ? <XCircle /> : <LoaderCircle className={notice.kind === 'info' ? 'spin' : ''} />}<span>{notice.text}</span><button onClick={() => setNotice(undefined)} aria-label="關閉訊息"><X /></button></div>}
  </div>;
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <header className="page-heading"><p>{eyebrow}</p><h2>{title}</h2><span>{description}</span></header>; }
function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="empty"><i>{icon}</i><h3>{title}</h3><p>{text}</p></div>; }

export function QuestionEditor({ question, index, total, focusToken, update, accept, move, duplicate, remove }: { question: Question; index: number; total: number; focusToken?: number; update: (patch: Partial<Question>) => void; accept: () => void; move: (direction: -1 | 1) => void; duplicate: () => void; remove: () => void }) {
  const [open, setOpen] = useState(question.status === 'candidate');
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (focusToken === undefined) return; setOpen(true); requestAnimationFrame(() => { toggleRef.current?.focus(); toggleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }); }, [focusToken]);
  return <article className={`question-card status-${question.status}`} data-question-id={question.id}>
    <header><button ref={toggleRef} className="question-toggle" aria-expanded={open} onClick={() => setOpen(!open)}><i>{index + 1}</i><span><b>{questionTypeLabels[question.type]} · {difficultyLabels[question.difficulty]} · {question.points} 分</b><strong>{question.stem}</strong></span>{open ? <ChevronUp /> : <ChevronDown />}</button><div className="question-actions"><button disabled={index === 0} onClick={() => move(-1)} title="上移"><ArrowUp /></button><button disabled={index === total - 1} onClick={() => move(1)} title="下移"><ArrowDown /></button><button onClick={duplicate} title="複製"><Copy /></button><button onClick={remove} title="刪除"><Trash2 /></button></div></header>
    {open && <div className="question-body"><div className="question-fields"><label className="stack-field wide"><span>題幹</span><textarea value={question.stem} rows={3} onChange={e => update({ stem: e.target.value })} /></label><label className="stack-field"><span>題型</span><select value={question.type} onChange={e => update({ type: e.target.value as QuestionType })}>{(Object.keys(questionTypeLabels) as QuestionType[]).map(type => <option key={type} value={type}>{questionTypeLabels[type]}</option>)}</select></label><label className="stack-field"><span>難度</span><select value={question.difficulty} onChange={e => update({ difficulty: e.target.value as Difficulty })}>{(Object.keys(difficultyLabels) as Difficulty[]).map(d => <option value={d} key={d}>{difficultyLabels[d]}</option>)}</select></label><label className="stack-field"><span>配分</span><input type="number" min="1" value={question.points} onChange={e => update({ points: Number(e.target.value) })} /></label></div>
      {(question.type === 'single' || question.type === 'multiple') && <div className="option-editor"><span>選項與正確答案</span>{(question.options ?? []).map((option, optionIndex) => <label key={option.id}><input type={question.type === 'multiple' ? 'checkbox' : 'radio'} name={`answer-${question.id}`} checked={question.correctOptionIds?.includes(option.id) ?? false} onChange={e => update({ correctOptionIds: question.type === 'single' ? [option.id] : e.target.checked ? [...(question.correctOptionIds ?? []), option.id] : (question.correctOptionIds ?? []).filter(id => id !== option.id) })} /><b>{option.id}</b><input value={option.text} onChange={e => update({ options: question.options?.map((o, i) => i === optionIndex ? { ...o, text: e.target.value } : o) })} /></label>)}</div>}
      {question.type === 'true_false' && <div className="boolean-editor"><span>正確答案</span><label><input type="radio" name={`boolean-${question.id}`} checked={question.correctBoolean === true} onChange={() => update({ correctBoolean: true })} />正確</label><label><input type="radio" name={`boolean-${question.id}`} checked={question.correctBoolean === false} onChange={() => update({ correctBoolean: false })} />錯誤</label></div>}
      {question.type === 'short_answer' && <><label className="stack-field"><span>參考答案</span><textarea rows={3} value={question.referenceAnswer ?? ''} onChange={e => update({ referenceAnswer: e.target.value })} /></label><label className="stack-field"><span>評分準則</span><textarea rows={3} value={question.rubric ?? ''} onChange={e => update({ rubric: e.target.value })} /></label></>}
      <label className="stack-field"><span>答案解析</span><textarea rows={3} value={question.explanation} onChange={e => update({ explanation: e.target.value })} /></label>
      <details className="sources"><summary>教材依據 · {question.sources.length} 則引文</summary>{question.sources.map((source, i) => <blockquote key={`${source.chunkId}-${i}`}><span>{source.pageNumber ? `第 ${source.pageNumber} 頁 · ` : ''}{source.chunkId}</span>「{source.quote}」</blockquote>)}</details>
      <div className="review-actions"><span>第 {question.revision} 版 · {question.providerId} / {question.modelId}</span><button className={question.status === 'rejected' ? 'reject active' : 'reject'} onClick={() => update({ status: 'rejected' })}><XCircle />退回</button><button className={question.status === 'accepted' ? 'accept active' : 'accept'} onClick={() => { setOpen(false); accept(); }}><CheckCircle2 />接受</button></div>
    </div>}
  </article>;
}
