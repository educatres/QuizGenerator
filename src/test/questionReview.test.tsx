import { useState } from 'react';
import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuestionEditor } from '../App';
import type { Question } from '../domain/types';

const makeQuestion = (id: string, stem: string): Question => ({
  id,
  type: 'true_false',
  stem,
  correctBoolean: true,
  explanation: '測試解析',
  sources: [{ documentId: 'doc', chunkId: 'doc-c1', quote: '教材引文' }],
  difficulty: 'easy',
  points: 5,
  status: 'candidate',
  revision: 1,
  providerId: 'cgu',
  modelId: 'luna-test',
  createdAt: '2026-01-01T00:00:00.000Z',
});

function ReviewHarness() {
  const [questions, setQuestions] = useState([makeQuestion('q1', '第一題'), makeQuestion('q2', '第二題')]);
  const [focusId, setFocusId] = useState<string>();

  return <>{questions.map((question, index) => <QuestionEditor
    key={question.id}
    question={question}
    index={index}
    total={questions.length}
    focusToken={focusId === question.id ? 1 : undefined}
    update={patch => setQuestions(items => items.map(item => item.id === question.id ? { ...item, ...patch } : item))}
    accept={() => {
      setQuestions(items => items.map(item => item.id === question.id ? { ...item, status: 'accepted' } : item));
      setFocusId(questions[index + 1]?.id);
    }}
    move={() => undefined}
    duplicate={() => undefined}
    remove={() => undefined}
  />)}</>;
}

describe('candidate question review', () => {
  it('collapses an accepted question and opens and focuses the next one', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    Element.prototype.scrollIntoView = vi.fn();
    const { container } = render(<ReviewHarness />);
    const first = container.querySelector('[data-question-id="q1"]') as HTMLElement;
    const second = container.querySelector('[data-question-id="q2"]') as HTMLElement;

    fireEvent.click(within(first).getByRole('button', { name: '接受' }));

    expect(first.querySelector('.question-body')).not.toBeInTheDocument();
    const secondToggle = within(second).getByRole('button', { name: /第二題/ });
    expect(second.querySelector('.question-body')).toBeInTheDocument();
    expect(secondToggle).toHaveFocus();
  });
});
