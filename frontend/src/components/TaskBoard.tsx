import { type FormEvent, useState } from 'react'
import type { DailyPlan, Difficulty, StudyTask, SubjectKey } from '../api/client'

const subjectNames: Record<SubjectKey, string> = { math2: '数学二', english2: '英语二', politics: '政治' }
const difficultyNames: Record<Difficulty, string> = {
  too_hard: '内容太难',
  time_short: '时间不足',
  low_energy: '状态不佳',
  other: '其他原因',
}

type TaskUpdate = Partial<Pick<StudyTask, 'title' | 'minutes'>>

type TaskBoardProps = {
  plan: DailyPlan | null
  nextPlan: DailyPlan | null
  dailyMinutes: number
  busy: boolean
  error: string
  onGenerate: (regenerate?: boolean) => Promise<void>
  onCreateTask: (task: Pick<StudyTask, 'subject' | 'title' | 'minutes'>) => Promise<boolean>
  onDeleteTask: (taskId: number) => Promise<void>
  onUpdateTask: (taskId: number, update: TaskUpdate) => Promise<void>
  onComplete: (task: StudyTask) => Promise<void>
  onRecordDifficulty: (task: StudyTask, difficulty: Difficulty, note: string, actualMinutes: number) => Promise<void>
  onAdjustNextDay: () => Promise<void>
}

export default function TaskBoard({
  plan,
  nextPlan,
  dailyMinutes,
  busy,
  error,
  onGenerate,
  onCreateTask,
  onDeleteTask,
  onUpdateTask,
  onComplete,
  onRecordDifficulty,
  onAdjustNextDay,
}: TaskBoardProps) {
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)
  const [difficultyTaskId, setDifficultyTaskId] = useState<number | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('too_hard')
  const [note, setNote] = useState('')
  const [actualMinutes, setActualMinutes] = useState(0)
  const [addingTask, setAddingTask] = useState(false)
  const [newSubject, setNewSubject] = useState<SubjectKey>('math2')
  const [newTitle, setNewTitle] = useState('')
  const [newMinutes, setNewMinutes] = useState(25)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  if (plan === null) {
    return <section className="plan-empty-card">
      <span className="step-number">02</span>
      <div><h2>生成第一份今日计划</h2><p>系统会优先安排薄弱科目，并确保总时长不超过你的每日可用时间。</p></div>
      <button type="button" className="primary-button compact" disabled={busy} onClick={() => void onGenerate()}>{busy ? '生成中…' : '生成今日计划'}</button>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  }

  const completion = plan.total_minutes === 0 ? 0 : Math.round(plan.completed_minutes / plan.total_minutes * 100)
  const hasSkippedTasks = plan.tasks.some((task) => task.status === 'skipped')
  const remainingMinutes = Math.max(0, dailyMinutes - plan.total_minutes)

  async function submitNewTask(event: FormEvent) {
    event.preventDefault()
    if (!newTitle.trim() || newMinutes < 5 || newMinutes > remainingMinutes) return
    const saved = await onCreateTask({ subject: newSubject, title: newTitle.trim(), minutes: newMinutes })
    if (saved) {
      setAddingTask(false)
      setNewTitle('')
      setNewMinutes(25)
    }
  }

  async function submitTitle(event: FormEvent, task: StudyTask) {
    event.preventDefault()
    if (!draftTitle.trim() || draftTitle.trim() === task.title) {
      setEditingTaskId(null)
      return
    }
    await onUpdateTask(task.id, { title: draftTitle.trim() })
    setEditingTaskId(null)
  }

  async function submitDifficulty(event: FormEvent, task: StudyTask) {
    event.preventDefault()
    await onRecordDifficulty(task, difficulty, note, actualMinutes)
    setDifficultyTaskId(null)
    setNote('')
    setActualMinutes(0)
  }

  return <section className="task-board">
    <div className="task-board-header">
      <div><p className="eyebrow">今日安排</p><h2>今日任务</h2></div>
      <div className="progress-summary"><strong>{completion}%</strong><span>{plan.completed_minutes} / {plan.total_minutes} 分钟</span></div>
    </div>
    <div className="progress-track"><i style={{ width: `${completion}%` }} /></div>
    <p className="plan-rationale">{plan.rationale}</p>
    <div className="task-add-header"><span>剩余可安排 {remainingMinutes} 分钟{remainingMinutes < 5 ? '；可先缩短或删除未打卡任务' : ''}</span><button type="button" className="text-button" onClick={() => setAddingTask(!addingTask)} disabled={busy || remainingMinutes < 5}>{addingTask ? '取消新增' : '＋ 新增任务'}</button></div>
    {addingTask ? <form className="task-add-form" onSubmit={(event) => void submitNewTask(event)}>
      <label>科目<select value={newSubject} onChange={(event) => setNewSubject(event.target.value as SubjectKey)}>{Object.entries(subjectNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>任务内容<input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} maxLength={200} required placeholder="例如：整理高数错题" /></label>
      <label>分钟<input type="number" min={5} max={remainingMinutes} value={newMinutes} onChange={(event) => setNewMinutes(Number(event.target.value))} required /></label>
      <button className="secondary-button" disabled={busy || !newTitle.trim() || newMinutes < 5 || newMinutes > remainingMinutes}>保存任务</button>
    </form> : null}
    {plan.tasks.length === 0 ? <div className="rest-day">今天没有安排任务；如需学习，可以手动新增。</div> : <ol className="task-list">
      {plan.tasks.map((task) => <li key={task.id} className={task.status}>
        <button
          type="button"
          className="task-check"
          aria-label={task.status === 'completed' ? `${task.title}已完成` : `完成${task.title}`}
          disabled={busy || task.status === 'completed'}
          onClick={() => void onComplete(task)}
        >{task.status === 'completed' ? '✓' : task.status === 'skipped' ? '!' : ''}</button>
        <div className="task-main">
          <div className="task-title-row">
            <span className={`subject-tag ${task.subject}`}>{subjectNames[task.subject]}</span>
            {editingTaskId === task.id
              ? <form className="inline-title-form" onSubmit={(event) => void submitTitle(event, task)}>
                  <input autoFocus value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} maxLength={200} />
                  <button>保存</button><button type="button" onClick={() => setEditingTaskId(null)}>取消</button>
                </form>
              : <button type="button" className="task-title" onClick={() => { setDraftTitle(task.title); setEditingTaskId(task.id) }}>{task.title}</button>}
          </div>
          <div className="task-secondary">
            {task.status === 'skipped' ? <span>已记录未完成</span> : task.status === 'pending' ? <><button type="button" onClick={() => { setDifficultyTaskId(task.id); setActualMinutes(0) }}>遇到困难</button>{deleteConfirmId === task.id ? <><span>确定删除这项任务？</span><button type="button" disabled={busy} onClick={() => { setDeleteConfirmId(null); void onDeleteTask(task.id) }}>确认删除</button><button type="button" onClick={() => setDeleteConfirmId(null)}>取消</button></> : <button type="button" disabled={busy} onClick={() => setDeleteConfirmId(task.id)}>删除任务</button>}</> : <span>已完成并计入复盘</span>}
          </div>
          {difficultyTaskId === task.id ? <form className="difficulty-form" onSubmit={(event) => void submitDifficulty(event, task)}>
            <select aria-label="未完成原因" value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>{Object.entries(difficultyNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <input aria-label="实际投入分钟" type="number" min={0} max={1440} value={actualMinutes} onChange={(event) => setActualMinutes(Number(event.target.value))} placeholder="已投入分钟" />
            <input aria-label="困难说明" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="简单说明遇到的问题" />
            <button disabled={busy}>保存记录</button><button type="button" onClick={() => setDifficultyTaskId(null)}>取消</button>
          </form> : null}
        </div>
        <div className="duration-editor">
          <button type="button" aria-label="减少五分钟" disabled={task.minutes <= 5 || busy} onClick={() => void onUpdateTask(task.id, { minutes: task.minutes - 5 })}>−</button>
          <span>{task.minutes} 分钟</span>
          <button type="button" aria-label="增加五分钟" disabled={busy} onClick={() => void onUpdateTask(task.id, { minutes: task.minutes + 5 })}>＋</button>
        </div>
      </li>)}
    </ol>}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {hasSkippedTasks ? <div className="adjustment-row">
      <div><strong>有任务未完成</strong><span>生成明日计划时会优先顺延并自动压缩普通任务。</span></div>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void onAdjustNextDay()}>{nextPlan ? '重新计算明日计划' : '生成明日调整'}</button>
    </div> : null}
    {nextPlan ? <div className="next-plan-summary"><strong>明日计划已生成</strong><span>{nextPlan.tasks.length} 项任务 · {nextPlan.total_minutes} 分钟</span><p>{nextPlan.rationale}</p></div> : null}
    <div className="plan-footer"><span>计划版本 {plan.version}</span><button type="button" className="text-button" disabled={busy} onClick={() => void onGenerate(true)}>重新生成</button></div>
  </section>
}
