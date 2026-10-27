import {
  AlignmentType, BorderStyle, Document, HeadingLevel, Packer, PageBreak, Paragraph, TextRun,
} from 'docx';
import type { ExamMeta, Question } from '../domain/types';
import { questionTypeLabels } from '../domain/types';
import { buildExamVersions, seededShuffle, type ExamVersion } from './exportHtml';

export type ExamDocumentMode = 'standard' | 'ab';

const bodyFont = { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Microsoft JhengHei' } as const;
const pageProperties = {
  page: {
    size: { width: 11906, height: 16838 },
    margin: { top: 850, right: 850, bottom: 850, left: 850, header: 400, footer: 400 },
  },
};

function answerValue(question: Question) {
  if (question.type === 'true_false') return question.correctBoolean ? '正確' : '錯誤';
  if (question.type === 'short_answer') return question.referenceAnswer || '未設定參考答案';
  return question.correctOptionIds?.join('、') || '未設定答案';
}

function titleBlock(meta: ExamMeta, questions: Question[], version?: ExamVersion['label']) {
  const totalPoints = questions.reduce((sum, question) => sum + question.points, 0);
  return [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `${meta.title}${version ? `　${version} 卷` : ''}`, bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun(`${meta.subtitle ? `${meta.subtitle}　` : ''}作答時間 ${meta.duration} 分鐘　總分 ${totalPoints} 分`)],
    }),
    new Paragraph({
      spacing: { after: 280 },
      border: { bottom: { style: BorderStyle.SINGLE, color: '555555', size: 6, space: 6 } },
      children: [new TextRun('班級 ____________________　姓名 ____________________　座號 __________')],
    }),
  ];
}

function questionParagraphs(question: Question, index: number, includeAnswer: boolean) {
  const output: Paragraph[] = [new Paragraph({
    keepNext: true,
    keepLines: true,
    spacing: { before: 120, after: 100 },
    children: [
      new TextRun({ text: `${index + 1}. ${question.stem} `, bold: true }),
      new TextRun({ text: `[${questionTypeLabels[question.type]}・${question.points} 分]`, color: '666666' }),
    ],
  })];

  const options = question.type === 'true_false'
    ? [{ id: 'T', text: '正確' }, { id: 'F', text: '錯誤' }]
    : question.options ?? [];
  if (options.length) {
    for (const option of options) {
      output.push(new Paragraph({
        keepLines: true,
        indent: { left: 360 },
        spacing: { after: 60 },
        children: [new TextRun(`(${option.id}) ${option.text}`)],
      }));
    }
  } else {
    output.push(...[0, 1].map(() => new Paragraph({
      spacing: { after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, color: 'AAAAAA', size: 4, space: 4 } },
      children: [new TextRun('　')],
    })));
  }

  if (includeAnswer) {
    const runs = [
      new TextRun({ text: '答案：', bold: true }), new TextRun(answerValue(question)),
      new TextRun({ text: '解析：', bold: true, break: 1 }), new TextRun(question.explanation || '未提供解析'),
    ];
    if (question.rubric) runs.push(new TextRun({ text: '評分準則：', bold: true, break: 1 }), new TextRun(question.rubric));
    output.push(new Paragraph({
      keepLines: true,
      spacing: { before: 80, after: 180 },
      shading: { fill: 'F2F4EC' },
      indent: { left: 160, right: 160 },
      children: runs,
    }));
  } else {
    output.push(new Paragraph({ spacing: { after: 140 }, children: [] }));
  }
  return output;
}

function paper(meta: ExamMeta, questions: Question[], version?: ExamVersion['label']) {
  return [...titleBlock(meta, questions, version), ...questions.flatMap((question, index) => questionParagraphs(question, index, false))];
}

function answerKey(meta: ExamMeta, questions: Question[], version?: ExamVersion['label']) {
  return [
    ...titleBlock(meta, questions, version),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: `${version ? `${version} 卷` : ''}參考答案與解析`, bold: true })],
    }),
    ...questions.flatMap((question, index) => questionParagraphs(question, index, true)),
  ];
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

export async function createExamDocx(meta: ExamMeta, questions: Question[], mode: ExamDocumentMode) {
  const children: Paragraph[] = [];
  if (mode === 'standard') {
    const ordered = seededShuffle(questions, meta.seed);
    children.push(...paper(meta, ordered), pageBreak(), ...answerKey(meta, ordered));
  } else {
    const versions = buildExamVersions(questions, meta.seed);
    for (const [index, version] of versions.entries()) {
      if (index) children.push(pageBreak());
      children.push(...paper(meta, version.questions, version.label));
    }
    for (const version of versions) children.push(pageBreak(), ...answerKey(meta, version.questions, version.label));
  }

  const document = new Document({
    creator: 'Exam Studio',
    title: `${meta.title} ${mode === 'ab' ? 'A B 卷' : '一般考卷'}`,
    subject: '試卷與參考答案',
    description: '由 Exam Studio 在瀏覽器本機產生的可編輯 Word 試卷',
    styles: {
      default: {
        document: {
          run: { font: bodyFont, size: 24, color: '000000' },
          paragraph: { spacing: { line: 360, after: 120 } },
        },
        title: {
          run: { font: bodyFont, size: 40, bold: true, color: '000000' },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 120 } },
        },
        heading1: {
          run: { font: bodyFont, size: 30, bold: true, color: '000000' },
          paragraph: { spacing: { before: 160, after: 140 }, keepNext: true },
        },
      },
    },
    sections: [{ properties: pageProperties, children }],
  });
  return Packer.toBlob(document);
}
