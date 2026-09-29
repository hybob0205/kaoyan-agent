import { type FormEvent, useEffect, useState } from 'react'
import DeferredRichText from './DeferredRichText'
import { generateQuiz, getQuizAnalysis, getQuizzes, saveQuizFeedback, submitQuiz, type Quiz, type QuizAnalysis, type QuizFeedbackCategory, type QuizQuestion, type SubjectKey } from '../api/client'

const subjects: Record<SubjectKey, string> = { math2: '数学二', english2: '英语二', politics: '政治' }
const feedbackCategories: Record<QuizFeedbackCategory, string> = {
  wrong_answer: '答案或解析有误',
  unclear: '题干不清楚',
  ambiguous: '选项有争议',
  outdated: '内容可能过时',
  other: '其他问题',
}

function QuestionFeedback({ question, busy, onSave }: {
  question: QuizQuestion
  busy: boolean
  onSave: (category: QuizFeedbackCategory, note: string) => Promise<boolean>
}) {
  const [category, setCategory] = useState<QuizFeedbackCategory>(question.feedback?.category ?? 'wrong_answer')
  const [note, setNote] = useState(question.feedback?.note ?? '')
  const [saved, setSaved] = useState(Boolean(question.feedback))

  return <div className="quiz-feedback">
    <span>发现题目问题？反馈供后续核对，不会自动改分。</span>
    <div>
      <select aria-label="题目问题类型" value={category} onChange={(event) => { setCategory(event.target.value as QuizFeedbackCategory); setSaved(false) }}>{Object.entries(feedbackCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <input aria-label="题目问题说明" value={note} onChange={(event) => { setNote(event.target.value); setSaved(false) }} maxLength={500} placeholder="可选：简单说明问题" />
      <button type="button" className="text-button" disabled={busy} onClick={() => void onSave(category, note).then((ok) => { if (ok) setSaved(true) })}>{saved ? '更新反馈' : '提交反馈'}</button>
    </div>
    {saved ? <small>反馈已保存</small> : null}
  </div>
}

type Props = { token: string; configured: boolean; onOpenSettings: () => void }

export default function QuizPanel({ token, configured, onOpenSettings }: Props) {
  const [subject, setSubject] = useState<SubjectKey>('math2')
  const [topic, setTopic] = useState('高数积分')
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [analysis, setAnalysis] = useState<QuizAnalysis | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    void Promise.all([getQuizzes(token), getQuizAnalysis(token)]).then(([items, savedAnalysis]) => {
      if (mounted) { setQuizzes(items); setActiveId(items[0]?.id ?? null); setAnalysis(savedAnalysis) }
    }).catch((reason: unknown) => { if (mounted) setError(reason instanceof Error ? reason.message : '无法读取测试记录') })
    return () => { mounted = false }
  }, [token])

  const active = quizzes.find((item) => item.id === activeId) ?? null

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const generated = await generateQuiz(token, subject, topic.trim())
      setQuizzes((items) => [generated, ...items].slice(0, 20))
      setActiveId(generated.id)
      setAnswers({})
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '生成失败')
    } finally {
      setBusy(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!active || active.submitted_at) return
    if (active.questions.some((_, index) => answers[index] === undefined)) {
      setError('请完成全部题目再提交')
      return
    }
    setError('')
    setBusy(true)
    try {
      const saved = await submitQuiz(token, active.id, active.questions.map((_, index) => answers[index]))
      setQuizzes((items) => items.map((item) => item.id === saved.id ? saved : item))
      void getQuizAnalysis(token).then(setAnalysis).catch(() => undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '提交失败')
    } finally {
      setBusy(false)
    }
  }

  async function saveFeedback(index: number, category: QuizFeedbackCategory, note: string): Promise<boolean> {
    if (!active?.submitted_at) return false
    setError('')
    setBusy(true)
    try {
      const saved = await saveQuizFeedback(token, active.id, index, category, note.trim())
      setQuizzes((items) => items.map((item) => item.id === saved.id ? saved : item))
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '反馈保存失败')
      return false
    } finally {
      setBusy(false)
    }
  }

  return <section className="quiz-card">
    <div className="quiz-heading"><div><p className="eyebrow">随堂练习</p><h2>模拟测试</h2><p>指定科目和范围，生成三道单选题；提交后查看得分与解析。</p></div></div>
    <form className="quiz-create" onSubmit={(event) => void create(event)}>
      <label>科目<select value={subject} onChange={(event) => setSubject(event.target.value as SubjectKey)}>{Object.entries(subjects).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      <label>测试范围<input value={topic} onChange={(event) => setTopic(event.target.value)} minLength={2} maxLength={120} required placeholder="例如：高数积分" /></label>
      <button className="secondary-button" disabled={busy || (!configured && subject !== 'math2')}>{busy ? '处理中…' : '生成小测'}</button>
    </form>
    <p className="quiz-hint">数学二目前支持导数与积分的校验题型；英语二、政治由当前模型生成。</p>
    {!configured && subject !== 'math2' && <p className="quiz-hint">生成英语二或政治试题需要先配置对话模型。<button className="text-button" type="button" onClick={onOpenSettings}>打开模型设置</button></p>}
    {analysis && <div className="quiz-analysis">
      <div className="quiz-analysis-heading"><div><span>学习能力分析</span><strong>{analysis.submitted_quizzes ? `${analysis.accuracy}%` : '待积累'}</strong></div><p>{analysis.recommendation}</p></div>
      {analysis.submitted_quizzes > 0 && <>
        <div className="quiz-analysis-metrics"><span><b>{analysis.submitted_quizzes}</b>已完成测试</span><span><b>{analysis.correct_answers}/{analysis.total_questions}</b>答对题目</span><span><b>{analysis.weak_topics.length}</b>薄弱知识点</span></div>
        <div className="quiz-analysis-grid">
          <div><h3>科目表现</h3>{analysis.subjects.map((item) => <p key={item.subject}><span>{subjects[item.subject]}</span><b>{item.accuracy}%</b><small>{item.correct_answers}/{item.total_questions} 题</small></p>)}</div>
          <div><h3>优先复习</h3>{analysis.weak_topics.length ? analysis.weak_topics.map((item) => <p key={`${item.subject}-${item.topic}`}><span>{subjects[item.subject]} · {item.topic}</span><b>{item.accuracy}%</b><small>{item.correct_answers}/{item.total_questions} 题</small></p>) : <p className="quiz-analysis-clear">当前没有低于 80% 的知识点</p>}</div>
        </div>
      </>}
    </div>}
    {quizzes.length > 0 && <label className="quiz-history">历史测试<select value={activeId ?? ''} onChange={(event) => { setActiveId(Number(event.target.value)); setAnswers({}); setError('') }}>{quizzes.map((item) => <option key={item.id} value={item.id}>{subjects[item.subject]} · {item.topic} · {item.score === null ? '未提交' : `${item.score}/${item.total} 分`}</option>)}</select></label>}
    {active && <form className="quiz-questions" onSubmit={(event) => void submit(event)}>
      <p className="quiz-hint">练习题不代表真题；模型生成的内容可能有误，重要知识点请核对教材或官方资料。</p>
      {active.questions.map((question, index) => <fieldset key={`${active.id}-${index}`} className="quiz-question">
        <legend>{index + 1}. <DeferredRichText text={question.stem} inline /></legend>
        {question.options.map((option, optionIndex) => <label key={optionIndex} className={active.submitted_at && question.answer_index === optionIndex ? 'quiz-correct' : ''}>
          <input type="radio" name={`question-${index}`} value={optionIndex} checked={(active.submitted_at ? question.selected_index : answers[index]) === optionIndex} disabled={Boolean(active.submitted_at) || busy} onChange={() => setAnswers((current) => ({ ...current, [index]: optionIndex }))} />
          <span>{String.fromCharCode(65 + optionIndex)}. <DeferredRichText text={option} inline /></span>
        </label>)}
        {active.submitted_at && <div className="quiz-explanation">{question.selected_index === question.answer_index ? '答对了。' : `正确答案：${String.fromCharCode(65 + (question.answer_index ?? 0))}。`} <DeferredRichText text={question.explanation} /></div>}
        {active.submitted_at && <QuestionFeedback key={`feedback-${active.id}-${index}`} question={question} busy={busy} onSave={(category, note) => saveFeedback(index, category, note)} />}
      </fieldset>)}
      {active.submitted_at ? <p className="quiz-score">本次得分：{active.score} / {active.total}</p> : <button className="primary-button compact" disabled={busy}>提交并查看解析</button>}
    </form>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>
}
