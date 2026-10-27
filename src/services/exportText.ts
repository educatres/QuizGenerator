import type { ExamMeta, Question } from '../domain/types';
import { questionTypeLabels } from '../domain/types';
import { seededShuffle } from './examVersions';

function answerValue(question: Question) {
  if (question.type === 'true_false') return question.correctBoolean ? '正確' : '錯誤';
  if (question.type === 'short_answer') return question.referenceAnswer || '未設定參考答案';
  return question.correctOptionIds?.join('、') || '未設定答案';
}

function questionText(question: Question, index: number) {
  const lines = [`${index + 1}. ${question.stem}［${questionTypeLabels[question.type]}，${question.points} 分］`];
  if (question.type === 'true_false') lines.push('　（　）正確　（　）錯誤');
  else if (question.options?.length) lines.push(...question.options.map(option => `　(${option.id}) ${option.text}`));
  else lines.push('　答：________________________________________________________________');
  return lines.join('\r\n');
}

export function createExamText(meta: ExamMeta, questions: Question[]) {
  const ordered = seededShuffle(questions, meta.seed);
  const totalPoints = ordered.reduce((sum, question) => sum + question.points, 0);
  const heading = [meta.title || '未命名試卷', meta.subtitle, `作答時間：${meta.duration} 分鐘　總分：${totalPoints} 分`, '班級：____________　姓名：____________　座號：______'].filter(Boolean).join('\r\n');
  const paper = ordered.map(questionText).join('\r\n\r\n');
  const answers = ordered.map((question, index) => `${index + 1}. ${answerValue(question)}\r\n　解析：${question.explanation}${question.rubric ? `\r\n　評分準則：${question.rubric}` : ''}`).join('\r\n\r\n');
  return `\uFEFF${heading}\r\n\r\n${paper}\r\n\r\n========== 參考答案與解析 ==========\r\n\r\n${answers}\r\n`;
}
