import type { WeeklyReview } from '../api/client'

type ReviewPanelProps = {
  dailyReview: WeeklyReview | null
  weeklyReview: WeeklyReview | null
  busy: boolean
  error: string
  onGenerateDaily: () => Promise<void>
  onGenerateWeekly: () => Promise<void>
}

const subjectNames: Record<string, string> = { math2: '数学二', english2: '英语二', politics: '政治' }
const reasonNames: Record<string, string> = { too_hard: '题目太难', time_short: '时间不足', low_energy: '状态欠佳', other: '其他' }

function ReviewBlock({ title, review, busy, emptyText, buttonText, onGenerate }: { title: string; review: WeeklyReview | null; busy: boolean; emptyText: string; buttonText: string; onGenerate: () => Promise<void> }) {
  if (review === null) return <article className="review-period review-period-empty"><h3>{title}</h3><p>{emptyText}</p><button type="button" className="secondary-button" disabled={busy} onClick={() => void onGenerate()}>{busy ? '统计中…' : buttonText}</button></article>
  return <article className="review-period">
    <div className="review-period-heading"><h3>{title}</h3><button type="button" className="text-button" disabled={busy} onClick={() => void onGenerate()}>刷新数据</button></div>
    <div className="review-metrics">
      <div><strong>{review.metrics.completion_rate}%</strong><span>任务完成率</span></div>
      <div><strong>{review.metrics.completed_tasks}/{review.metrics.planned_tasks}</strong><span>完成任务</span></div>
      <div><strong>{review.metrics.actual_minutes}</strong><span>实际分钟</span></div>
    </div>
    <p className="review-content">{review.content}</p>
    <div className="subject-time-row">{Object.entries(subjectNames).map(([key, name]) => <span key={key}><b>{name}</b>{review.metrics.subject_minutes[key] ?? 0} 分钟</span>)}</div>
    {Object.keys(review.metrics.incomplete_reasons).length ? <p className="review-reasons"><b>未完成原因：</b>{Object.entries(review.metrics.incomplete_reasons).map(([key, count]) => `${reasonNames[key] ?? key} ${count} 项`).join('、')}</p> : null}
  </article>
}

export default function ReviewPanel({ dailyReview, weeklyReview, busy, error, onGenerateDaily, onGenerateWeekly }: ReviewPanelProps) {
  return <section className="review-card">
    <div className="review-heading"><div><p className="eyebrow">学习复盘</p><h2>用真实记录回看执行情况</h2><p>日报关注当天执行，周报用于调整下一周任务量。</p></div></div>
    <div className="review-period-grid">
      <ReviewBlock title="今日日报" review={dailyReview} busy={busy} emptyText="汇总今天的完成率、投入时间和困难原因。" buttonText="生成今日日报" onGenerate={onGenerateDaily} />
      <ReviewBlock title="本周复盘" review={weeklyReview} busy={busy} emptyText="汇总最近七天数据并生成下周建议。" buttonText="生成周复盘" onGenerate={onGenerateWeekly} />
    </div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </section>
}
