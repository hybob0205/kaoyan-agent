import { useEffect, useRef, useState, type FormEvent } from 'react'
import { askDeviceAgent, deviceLearningContext, generateDeviceTasks, readDeviceAgent, saveDeviceAgent, summarizeDay, type LocalAgentData, type Subject } from '../deviceAgent'
import DeferredRichText from './DeferredRichText'
import ThemeButton from './ThemeButton'
import StudyIcon from './StudyIcon'
import DeviceSchools from './DeviceSchools'
import ConversationList from './ConversationList'
import AgentFloatingMenu from './AgentFloatingMenu'
import MessageTime from './MessageTime'

const subjects: { key: Subject; name: string }[] = [{ key: 'math2', name: '数学二' }, { key: 'english2', name: '英语二' }, { key: 'politics', name: '政治' }, { key: 'cs408', name: '408' }]

export default function DeviceAgent({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<LocalAgentData>(readDeviceAgent)
  const latestData = useRef(data)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [streaming, setStreaming] = useState<string | null>(null)
  const [pendingQuestion, setPendingQuestion] = useState('')
  const [tab, setTab] = useState('profile')

  useEffect(() => {
    const appWindow = window as Window & { KAOYAN_ANDROID_BACK?: () => boolean }
    const handler = () => { if (tab !== 'profile') setTab('profile'); else onBack(); return true }
    appWindow.KAOYAN_ANDROID_BACK = handler
    return () => { if (appWindow.KAOYAN_ANDROID_BACK === handler) delete appWindow.KAOYAN_ANDROID_BACK }
  }, [onBack, tab])

  function update(next: LocalAgentData) {
    next = { ...next, conversations: next.conversations.map(item => item.id === next.activeConversationId ? { ...item, messages: next.messages } : item) }
    try { saveDeviceAgent(next); latestData.current = next; setData(next); setError(''); return true }
    catch { setError('设备存储空间不足，未能保存；请先导出备份并清理空间'); return false }
  }

  async function ask(event: FormEvent) {
    event.preventDefault()
    const question = draft.trim()
    if (!question || busy) return
    let current = latestData.current
    if (!current.activeConversationId) {
      const id = crypto.randomUUID()
      current = { ...current, activeConversationId: id, conversations: [...current.conversations, { id, title: question.slice(0, 40), messages: [] }] }
      if (!update(current)) return
    }
    setBusy(true)
    setError('')
    setPendingQuestion(question)
    setStreaming('')
    const sentAt = new Date().toISOString()
    try {
      const answer = await askDeviceAgent(current, question, setStreaming)
      update({ ...latestData.current, messages: [...latestData.current.messages, { role: 'user' as const, content: question, createdAt: sentAt }, { role: 'assistant' as const, content: answer, createdAt: new Date().toISOString() }].slice(-40) })
      setDraft('')
    } catch (caught) { setError(caught instanceof Error ? caught.message : '对话失败，请检查接口配置') }
    finally { setBusy(false); setStreaming(null); setPendingQuestion('') }
  }

  const currentTasks = data.taskDate === new Date().toLocaleDateString('sv-SE') ? data.tasks : []
  const completed = currentTasks.filter((task) => task.done).length
  const recentDays = [...data.history, ...(currentTasks.length ? [summarizeDay(data.taskDate, currentTasks)] : [])].slice(-7)
  const recentCompleted = recentDays.reduce((total, day) => total + day.completed, 0)
  const recentPlanned = recentDays.reduce((total, day) => total + day.planned, 0)
  const recentMinutes = recentDays.reduce((total, day) => total + day.minutes, 0)

  return <main className={`device-shell agent-paper${tab === 'chat' ? ' is-chat' : ''}`}>
    <AgentFloatingMenu onHome={onBack} />
    <header className="device-header"><button type="button" className="icon-button device-back-button" onClick={onBack} aria-label="返回首页"><StudyIcon name="back" /></button><div><strong>学习 Agent</strong></div><ThemeButton className="device-header-theme" /></header>
    <div className="device-content device-agent">
      <nav className="agent-view-tabs" aria-label="学习 Agent 功能">{[['profile', '学习画像'], ['schools', '候选院校'], ['tasks', '今日任务'], ['records', '学习记录'], ['chat', '对话'], ['features', '功能说明']].map(([id, label]) => <button type="button" key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>)}</nav>
      {error && tab !== 'chat' ? <p role="alert" className="form-error">{error}</p> : null}
      <section className="device-agent-card" hidden={tab !== 'schools'}><DeviceSchools schools={data.schools} onSave={schools => update({ ...data, schools })} onTarget={school => { update({ ...data, school: school.school, major: school.major }); setTab('profile') }} onAsk={() => { setDraft('请根据我记录的候选院校、学习画像和薄弱科目进行比较。标明资料不足之处，不要编造招生数据。'); setTab('chat') }} /></section>
      <section className="device-agent-card" hidden={tab !== 'features'}><h2>本设备的学习工具</h2><p>学习画像、候选院校、今日任务、学习记录和联网 AI 对话均在本设备使用。四科研习室与拾错通过下方入口进入，记录可在首页导出合并备份。</p><div className="device-agent-links"><a href="/study-hub/index.html">四科研习室 →</a><a href="/mistake-review/index.html">拾错复习 →</a></div><h3>电脑模式的其他工具</h3><p>周计划、阶段计划、资料库、模拟测试和自动日报／周复盘目前仍需要电脑后端，并未删除。可从首页切换使用方式进入电脑模式；APK 暂不支持这些后端工具。</p></section>
      <section className="device-agent-card" hidden={tab !== 'profile'}><div className="device-agent-card-title"><h2>学习画像</h2><span>自动保存到本机</span></div>
        <div className="device-agent-fields">
          <label>称呼<input value={data.name} maxLength={60} onChange={(event) => update({ ...data, name: event.target.value })} placeholder="怎么称呼你" /></label>
          <label>考试日期<input type="date" value={data.examDate} onChange={(event) => update({ ...data, examDate: event.target.value })} /></label>
          <label>目标院校<input value={data.school} maxLength={100} onChange={(event) => update({ ...data, school: event.target.value })} placeholder="尚未确定也可以留空" /></label>
          <label>目标专业<input value={data.major} maxLength={100} onChange={(event) => update({ ...data, major: event.target.value })} /></label>
          <label>每日学习时间（分钟）<input type="number" min="30" max="720" step="5" value={data.dailyMinutes} onChange={(event) => { const value = Number(event.target.value); if (value >= 30 && value <= 720) update({ ...data, dailyMinutes: value }) }} /></label>
        </div>
        <div className="device-agent-scores"><strong>基础自评 · 1 最薄弱，5 最扎实</strong><div>{subjects.map(({ key, name }) => <label key={key}>{name}<select value={data.scores[key]} onChange={(event) => update({ ...data, scores: { ...data.scores, [key]: Number(event.target.value) } })}>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}</select></label>)}</div></div>
      </section>
      <section className="device-agent-card" hidden={tab !== 'tasks'}><div className="device-agent-card-title"><h2>今日任务</h2><span>{completed} / {currentTasks.length} 已完成</span></div>
        <p>按照薄弱科目优先分配时间。重新生成会覆盖今天的任务与完成状态。</p>
        <button type="button" className="secondary-button" onClick={() => { if (currentTasks.length && !confirm('重新生成会覆盖今天的任务，继续吗？')) return; update(generateDeviceTasks(data)) }}>{currentTasks.length ? '重新生成今日任务' : '生成今日任务'}</button>
        {currentTasks.length ? <ul className="device-agent-tasks">{currentTasks.map((task) => <li key={task.id}><label><input type="checkbox" checked={task.done} onChange={() => update({ ...data, tasks: data.tasks.map((item) => item.id === task.id ? { ...item, done: !item.done } : item) })} /><span>{subjects.find((item) => item.key === task.subject)?.name} · {task.title}</span></label><small>{task.minutes} 分钟</small></li>)}</ul> : <p>今天还没有任务。</p>}
      </section>
      <section className="device-agent-card" hidden={tab !== 'records'}><div className="device-agent-card-title"><h2>学习记录</h2><span>只读取本机数据</span></div><div className="device-agent-summary"><DeferredRichText text={deviceLearningContext(data)} /></div><div className="device-agent-links"><a href="/study-hub/index.html">进入研习室 →</a><a href="/mistake-review/index.html">进入拾错 →</a></div></section>
      <section className="device-agent-card" hidden={tab !== 'records'}><div className="device-agent-card-title"><h2>近期学习概览</h2><span>最近 {recentDays.length} 个有任务的日期</span></div><p>已完成 {recentCompleted} / {recentPlanned} 项 · 计划任务完成 {recentPlanned ? Math.round(recentCompleted / recentPlanned * 100) : 0}% · 完成任务约 {recentMinutes} 分钟</p><p>这里只统计本机 Agent 任务，不把研习室练习时长推算成学习时长。</p></section>
      <section className="device-agent-card" id="device-agent-chat" hidden={tab !== 'chat'}>
        <div className="conversation-workspace"><ConversationList items={data.conversations} activeId={data.activeConversationId} busy={busy} onNew={() => { const id = crypto.randomUUID(); if (update({ ...data, activeConversationId: id, messages: [], conversations: [...data.conversations, { id, title: '新对话', messages: [] }] })) setDraft('') }} onSelect={id => { const item = data.conversations.find(item => item.id === id); if (item && update({ ...data, activeConversationId: id, messages: item.messages })) setDraft('') }} onRename={(id, title) => { if (!update({ ...data, conversations: data.conversations.map(item => item.id === id ? { ...item, title } : item) })) throw new Error('保存失败，原名称未修改') }} onDelete={ids => { const remaining = data.conversations.filter(item => !ids.includes(item.id)); const active = remaining.find(item => item.id === data.activeConversationId) || remaining[0]; if (!update({ ...data, conversations: remaining, activeConversationId: active?.id || '', messages: active?.messages || [] })) throw new Error('删除未保存，请重试') }} />
        <div className="conversation-main"><div className="device-agent-card-title"><h2>{data.conversations.find(item => item.id === data.activeConversationId)?.title || '一起理清学习思路'}</h2></div>
        <p>可问“根据研习室和拾错记录，分析薄弱点并安排复习”。回答不会自动改动原始记录。</p>
        <div className="device-agent-messages" aria-live="polite">{data.messages.length ? data.messages.map((message, index) => <div key={index} className={`device-agent-message ${message.role}`}><strong>{message.role === 'user' ? '我' : 'Agent'}</strong><DeferredRichText text={message.content} /><MessageTime value={message.createdAt} /></div>) : !busy && <p>还没有对话。从一个具体学习问题开始吧。</p>}{busy && <><div className="device-agent-message user"><strong>我</strong><p>{pendingQuestion}</p></div><div className="device-agent-message assistant"><strong>Agent · 正在回复</strong>{streaming ? <DeferredRichText text={streaming} /> : <p>正在连接模型…</p>}</div></>}</div>
        <form className="device-agent-ask" onSubmit={(event) => void ask(event)}><label htmlFor="device-agent-question">输入问题</label><textarea id="device-agent-question" rows={3} maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="例如：我的数学错题主要集中在哪些知识点？" /><button className="primary-button compact" disabled={busy || !draft.trim()}>{busy ? '思考中…' : '发送'}</button></form>
        {error ? <p role="alert" className="form-error">{error}</p> : null}
        </div></div>
      </section>
    </div>
  </main>
}
