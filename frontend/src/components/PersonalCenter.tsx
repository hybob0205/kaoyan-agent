import { useEffect, useState, type FormEvent } from 'react'
import { getQuizAnalysis, type DailyPlan, type QuizAnalysis, type StudyProfile, type User, type WeeklyReview } from '../api/client'
import DataSyncPanel from './DataSyncPanel'
import ThemeButton from './ThemeButton'
import { daysUntil, localDate } from '../deviceSchedule'

type Props = {
  user: User
  profile: StudyProfile
  plan: DailyPlan | null
  streakDays: number
  dailyReview: WeeklyReview | null
  weeklyReview: WeeklyReview | null
  token: string
  busy: boolean
  error: string
  notice: string
  onSaveAccount: (input: Pick<User, 'username' | 'email'>) => Promise<void>
  onEditProfile: () => void
  onOpenSettings: () => void
  onBack: () => void
}

const subjectNames: Record<string, string> = { math2: '数学二', english2: '英语二', politics: '政治' }

export default function PersonalCenter({ user, profile, plan, streakDays, dailyReview, weeklyReview, token, busy, error, notice, onSaveAccount, onEditProfile, onOpenSettings, onBack }: Props) {
  const [username, setUsername] = useState(user.username)
  const [email, setEmail] = useState(user.email)
  const [quizAnalysis, setQuizAnalysis] = useState<QuizAnalysis | null>(null)

  useEffect(() => { setUsername(user.username); setEmail(user.email) }, [user.username, user.email])
  useEffect(() => {
    let active = true
    getQuizAnalysis(token).then((result) => { if (active) setQuizAnalysis(result) }).catch(() => undefined)
    return () => { active = false }
  }, [token])

  const completed = plan?.tasks.filter((task) => task.status === 'completed').length ?? 0
  const total = plan?.tasks.length ?? 0
  const completionRate = total ? Math.round(completed / total * 100) : 0
  const daysLeft = Math.max(0, daysUntil(profile.exam_date, localDate()) ?? 0)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSaveAccount({ username: username.trim(), email: email.trim() })
  }

  return <main className="account-shell">
    <header className="topbar"><div className="brand-mark">研</div><div><strong>考研 Agent</strong><span>个人中心</span></div><div className="topbar-actions"><ThemeButton /><button className="text-button" type="button" onClick={onBack}>返回仪表盘</button></div></header>
    <div className="account-content">
      <p className="eyebrow">个人中心</p><h1>你的学习空间</h1><p className="lead">查看学习进度，维护账号信息和考试目标。</p>
      <section className="account-section">
        <div className="account-section-heading"><div><h2>学习情况</h2><p>根据当前计划和已保存的复盘、小测实时展示。</p></div></div>
        <div className="account-stats">
          <div><span>今日任务完成</span><strong>{completed} / {total}</strong><small>{total ? `${completionRate}% 已完成` : '尚未生成今日计划'}</small></div>
          <div><span>今日实际学习</span><strong>{dailyReview?.metrics.actual_minutes ?? 0}<em> 分钟</em></strong><small>{dailyReview ? '来自今日日报' : '生成今日日报后更新'}</small></div>
          <div><span>小测正确率</span><strong>{quizAnalysis?.submitted_quizzes ? `${quizAnalysis.accuracy}%` : '—'}</strong><small>{quizAnalysis?.submitted_quizzes ?? 0} 次已交卷小测</small></div>
          <div><span>连续打卡</span><strong>{streakDays}<em> 天</em></strong><small>按完成任务的学习日计算</small></div>
        </div>
        <p className="account-review-line">{weeklyReview ? `本周任务完成率 ${weeklyReview.metrics.completion_rate}%，实际学习 ${weeklyReview.metrics.actual_minutes} 分钟。` : '本周复盘尚未生成，可在仪表盘查看和生成。'}</p>
      </section>
      <section className="account-section">
        <div className="account-section-heading"><div><h2>账号信息</h2><p>修改邮箱后会自动更新登录状态。</p></div><span>加入于 {new Date(user.created_at).toLocaleDateString('zh-CN')}</span></div>
        <form className="account-form" onSubmit={(event) => void submit(event)}>
          <label>用户名<input required minLength={2} maxLength={50} value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label>邮箱<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {notice ? <p className="save-result" role="status">{notice}</p> : null}
          <button className="primary-button compact" disabled={busy || (username === user.username && email === user.email)}>{busy ? '保存中…' : '保存账号信息'}</button>
        </form>
      </section>
      <section className="account-section">
        <div className="account-section-heading"><div><h2>考试目标与学习画像</h2><p>画像会影响计划的时长和科目安排。</p></div><button type="button" className="secondary-button" onClick={onEditProfile}>编辑学习画像</button></div>
        <dl className="account-details"><div><dt>目标院校</dt><dd>{profile.school}</dd></div><div><dt>目标专业</dt><dd>{profile.major}</dd></div><div><dt>考试日期</dt><dd>{profile.exam_date} · 还有 {daysLeft} 天</dd></div><div><dt>每日可用时间</dt><dd>{profile.daily_minutes} 分钟</dd></div></dl>
        <div className="account-subjects">{profile.subjects.map((item) => <span key={item.subject}>{subjectNames[item.subject]}：{item.score}/5{item.weaknesses ? ` · 薄弱点 ${item.weaknesses}` : ''}</span>)}</div>
      </section>
      <DataSyncPanel token={token} userId={user.id} />
      <div className="account-footer"><button className="text-button" type="button" onClick={onOpenSettings}>管理模型与资料读取方式</button></div>
    </div>
  </main>
}
