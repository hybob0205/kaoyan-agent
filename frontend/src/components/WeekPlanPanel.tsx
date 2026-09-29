import type { WeeklyPlan } from '../api/client'

const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const subjectNames = { math2: '数学二', english2: '英语二', politics: '政治' } as const

function toLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDay(value: string): string {
  const day = toLocalDate(value)
  return `${day.getMonth() + 1}月${day.getDate()}日 ${weekdayNames[day.getDay()]}`
}

function toDateKey(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

type WeekPlanPanelProps = {
  plan: WeeklyPlan | null
  busy: boolean
  error: string
  onGenerate: (regenerate?: boolean) => Promise<void>
}

export default function WeekPlanPanel({ plan, busy, error, onGenerate }: WeekPlanPanelProps) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const firstDay = plan === null ? null : toLocalDate(plan.start_date) < today ? today : toLocalDate(plan.start_date)
  const days = plan === null || firstDay === null ? [] : Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(firstDay)
    day.setDate(day.getDate() + offset)
    return toDateKey(day)
  }).filter((date) => date <= plan.end_date)
  const tasksByDate = new Map<string, WeeklyPlan['tasks']>()
  plan?.tasks.forEach((task) => {
    const tasks = tasksByDate.get(task.due_date) ?? []
    tasks.push(task)
    tasksByDate.set(task.due_date, tasks)
  })

  return <section className="week-plan-card">
    <div className="week-plan-heading">
      <div><p className="eyebrow">本周安排</p><h2>本周学习计划</h2><p>根据每日时间上限和固定休息日安排；考试日期之后不会生成任务。</p></div>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void onGenerate(plan !== null)}>
        {busy ? '生成中…' : plan ? '重新生成' : '生成本周计划'}
      </button>
    </div>
    {plan ? <>
      <div className="week-plan-summary"><span>{formatDay(plan.start_date)} — {formatDay(plan.end_date)}</span><strong>{plan.tasks.length} 项任务</strong><strong>{plan.total_minutes} 分钟</strong><span>版本 {plan.version}</span></div>
      <div className="week-day-list">
        {days.map((day) => {
          const tasks = tasksByDate.get(day) ?? []
          const minutes = tasks.reduce((total, task) => total + task.minutes, 0)
          return <article className="week-day" key={day}>
            <div className="week-day-heading"><strong>{formatDay(day)}</strong><span>{tasks.length ? `${tasks.length} 项 · ${minutes} 分钟` : '休息日'}</span></div>
            {tasks.length ? <ul>{tasks.map((task) => <li key={task.id}>
              <span className={`subject-tag ${task.subject}`}>{subjectNames[task.subject]}</span>
              <span>{task.title}</span><small>{task.minutes} 分钟</small>
            </li>)}</ul> : <p className="week-rest-day">留出时间恢复，或按需自行安排轻量复习。</p>}
          </article>
        })}
      </div>
      <p className="week-plan-rationale">{plan.rationale}</p>
    </> : <p className="week-plan-empty">还没有本周计划。生成后会按天展示任务，生成过程不会调用语言模型。</p>}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </section>
}
