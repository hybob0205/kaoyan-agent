import { type FormEvent, useEffect, useState } from 'react'
import { getAgentConversation, type AgentAction, type AgentAnswerMode, type AgentConversation, type AgentConversationMessage, type AgentReply, type AgentSubject } from '../api/client'
import DeferredRichText from './DeferredRichText'
import ConversationList from './ConversationList'
import MessageTime from './MessageTime'
import { createAgentConversation, renameAgentConversation, deleteAgentConversations } from '../api/client'

type AssistantPanelProps = {
  configured: boolean
  token: string
  onAsk: (message: string, conversationId: number | null, onDelta: (text: string, reset?: boolean) => void, subject: AgentSubject, answerMode: AgentAnswerMode) => Promise<AgentReply>
  onLoadActions: () => Promise<AgentAction[]>
  onPreviewAction: (message: string) => Promise<AgentAction>
  onConfirmAction: (id: number) => Promise<void>
  onCancelAction: (id: number) => Promise<AgentAction>
  onLoadConversations: () => Promise<AgentConversation[]>
  onDeleteConversation: (id: number) => Promise<void>
  onOpenSettings: () => void
}

type ChatMessage = Pick<AgentConversationMessage, 'id' | 'role' | 'content' | 'used_tools'> & { created_at?: string }

const toolNames: Record<string, string> = { profile_summary: '学习画像', today_plan: '今日计划', weekly_review: '周复盘', school_candidates: '候选院校', study_hub_catalog: '四科研习室题库', study_hub_progress: '本机研习记录与错题', mistake_review: '本机拾错记录', user_documents: '个人资料库' }

export default function AssistantPanel({ configured, token, onAsk, onLoadActions, onPreviewAction, onConfirmAction, onCancelAction, onLoadConversations, onOpenSettings }: AssistantPanelProps) {
  const [conversations, setConversations] = useState<AgentConversation[]>([])
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationSummary, setConversationSummary] = useState('')
  const [draft, setDraft] = useState('')
  const [subject, setSubject] = useState<AgentSubject>('auto')
  const [answerMode, setAnswerMode] = useState<AgentAnswerMode>('concise')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pendingAction, setPendingAction] = useState<AgentAction | null>(null)
  const [actionNotice, setActionNotice] = useState('')
  const storageKey = `kaoyan-agent-conversation-v1:${token}`

  useEffect(() => {
    let active = true
    void onLoadConversations().then((items) => {
      if (!active) return
      setConversations(items)
      const savedId = Number(localStorage.getItem(storageKey))
      const selected = items.find((item) => item.id === savedId) ?? items[0]
      if (selected) void selectConversation(selected.id, items)
    }).catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : '会话列表加载失败') })
    return () => { active = false }
  }, [token])

  useEffect(() => {
    let active = true
    void onLoadActions().then((items) => {
      if (active) setPendingAction(items.find((item) => item.status === 'pending' && new Date(`${item.expires_at}Z`).getTime() > Date.now()) ?? null)
    }).catch(() => undefined)
    return () => { active = false }
  }, [token])

  async function refreshList(preferredId?: number) {
    const items = await onLoadConversations()
    setConversations(items)
    if (preferredId !== undefined) {
      const selected = items.find((item) => item.id === preferredId)
      if (selected) localStorage.setItem(storageKey, String(selected.id))
    }
  }

  async function selectConversation(id: number, list = conversations) {
    const item = list.find((entry) => entry.id === id)
    if (!item) return
    setConversationId(id)
    localStorage.setItem(storageKey, String(id))
    setError('')
    try {
      const response = await getAgentConversation(token, id)
      setConversationSummary(response.summary)
      setMessages(response.messages.map((message) => ({ ...message, used_tools: message.used_tools ?? [] })))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '会话加载失败')
    }
  }

  function newConversation() {
    setConversationId(null)
    setMessages([])
    setConversationSummary('')
    localStorage.removeItem(storageKey)
    setError('')
  }

  async function send(message: string) {
    const content = message.trim()
    if (!content || busy || pendingAction) return
    if (!configured) { onOpenSettings(); return }
    if (/^(?:把)?(?:今天|今日)?第[1-9]\d*项(?:任务)?(?:标记为|打卡为|已)?完成[。！!]?$|^完成(?:今天|今日)?第[1-9]\d*项(?:任务)?[。！!]?$|^新增(?:今日|今天)(?:数学二|英语二|政治)任务[：:].+[，,]\s*[1-9]\d{0,3}分钟[。！!]?$|^(?:将|把)?(?:今天|今日)?第[1-9]\d*项任务(?:时长)?改为[1-9]\d{0,3}分钟[。！!]?$/.test(content)) {
      setBusy(true)
      setError('')
      setActionNotice('')
      try {
        setPendingAction(await onPreviewAction(content))
        setDraft('')
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '操作预览失败')
      } finally { setBusy(false) }
      return
    }
    const temporaryId = Date.now()
    const replyId = temporaryId + 1
    setMessages((current) => [...current, { id: temporaryId, role: 'user', content, used_tools: [], created_at: new Date().toISOString() }, { id: replyId, role: 'assistant', content: '', used_tools: [] }])
    setDraft('')
    setError('')
    setBusy(true)
    try {
      const reply = await onAsk(content, conversationId, (delta, reset) => {
        setMessages((current) => current.map((item) => item.id === replyId ? { ...item, content: reset ? '' : item.content + delta } : item))
      }, subject, answerMode)
      setConversationId(reply.conversation_id)
      localStorage.setItem(storageKey, String(reply.conversation_id))
      setMessages((current) => current.map((item) => item.id === replyId ? { ...item, content: reply.answer, used_tools: reply.used_tools, created_at: new Date().toISOString() } : item))
      try { await refreshList(reply.conversation_id) } catch { /* The answer is already saved; list refresh can retry next visit. */ }
    } catch (caught) {
      setMessages((current) => current.filter((item) => item.id !== temporaryId && item.id !== replyId))
      setError(caught instanceof Error ? caught.message : 'Agent 暂时无法回答，请稍后重试')
    } finally { setBusy(false) }
  }

  async function finishAction(confirm: boolean) {
    if (!pendingAction || busy) return
    setBusy(true)
    setError('')
    try {
      if (confirm) {
        await onConfirmAction(pendingAction.id)
        setActionNotice(pendingAction.action === 'complete_task' ? '任务已完成并计入打卡记录。' : pendingAction.action === 'create_task' ? '任务已加入今日计划。' : '任务时长已更新。')
      } else {
        await onCancelAction(pendingAction.id)
        setActionNotice('已取消，本次未修改任务。')
      }
      setPendingAction(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '操作失败，请重新检查任务')
    } finally { setBusy(false) }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void send(draft) }

  return <section className="assistant-card">
    <div className="assistant-heading"><div><p className="eyebrow">智能学习助手</p><h2>问问你的考研助手</h2></div><span>受控工具 · 写入需确认</span></div>
    <div className="conversation-workspace"><ConversationList items={conversations.map(item => ({ id: String(item.id), title: item.title }))} activeId={String(conversationId ?? '')} busy={busy}
      onNew={() => { setBusy(true); void createAgentConversation(token).then(async item => { await refreshList(item.id); await selectConversation(item.id, [item]); setDraft('') }).catch(reason => setError(reason.message)).finally(() => setBusy(false)) }}
      onSelect={id => { setBusy(true); void selectConversation(Number(id)).finally(() => setBusy(false)); setDraft('') }}
      onRename={async (id, title) => { const saved = await renameAgentConversation(token, Number(id), title); setConversations(items => items.map(item => item.id === saved.id ? saved : item)) }}
      onDelete={async ids => { await deleteAgentConversations(token, ids.map(Number)); setConversations(items => items.filter(item => !ids.includes(String(item.id)))); if (ids.includes(String(conversationId))) newConversation() }} />
    <div className="conversation-main">
    {!configured && <p>历史对话仍可查看和管理。<button type="button" className="text-button" onClick={onOpenSettings}>配置模型后开始提问</button></p>}
    {messages.length === 0 ? <div className="suggestion-row">{['我今天要学什么？', '整理分析我在研习室的错题', '分析我在拾错里的待复习题', '我上传的资料如何解释定积分？', '根据我的薄弱点给些建议', '推荐数学二积分真题练习', '总结一下本周表现', '帮我比较候选院校'].map((prompt) => <button key={prompt} type="button" onClick={() => void send(prompt)}>{prompt}</button>)}</div> : <div className="chat-messages" aria-live="polite">{messages.map((message) => <article key={message.id} className={message.role}><span>{message.role === 'user' ? '你' : 'Agent'}</span><DeferredRichText text={message.content} /><MessageTime value={message.created_at} />{message.used_tools?.length ? <small>参考了：{message.used_tools.map((tool) => toolNames[tool] ?? tool).join('、')}</small> : null}</article>)}</div>}
    {conversationSummary ? <p className="conversation-summary-status">较早对话已摘要，当前回答仍以学习计划和打卡记录为准。</p> : null}
    {pendingAction ? <div className="agent-action-preview" role="status"><strong>待确认操作</strong><p>{pendingAction.preview}</p><div><button type="button" className="primary-button compact" disabled={busy} onClick={() => void finishAction(true)}>确认执行</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void finishAction(false)}>取消</button></div><small>预览 10 分钟后失效；确认前不会修改任务。</small></div> : null}
    {actionNotice ? <p role="status">{actionNotice}</p> : null}
    {busy ? <p className="agent-thinking" role="status">正在生成回答…</p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="agent-preferences"><label>科目<select value={subject} onChange={(event) => setSubject(event.target.value as AgentSubject)}><option value="auto">自动判断</option><option value="math2">数学二</option><option value="english2">英语二</option><option value="politics">政治</option><option value="cs408">408</option></select></label><label>回答方式<select value={answerMode} onChange={(event) => setAnswerMode(event.target.value as AgentAnswerMode)}><option value="concise">简洁回答</option><option value="step_by_step">分步讲解</option></select></label></div>
    <form className="agent-composer" onSubmit={submit}><label><span className="sr-only">向 Agent 提问</span><input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="例如：完成今日第1项任务，或新增今日数学二任务：积分练习，30分钟" disabled={pendingAction !== null} /></label><button type="submit" className="primary-button compact" disabled={busy || pendingAction !== null || !draft.trim()}>发送</button></form>
    <small>询问错题时，当前账号在研习室与拾错中的近期文字摘要会发送给你配置的对话模型；局域网模式下记录保存在电脑，其他模式保存在当前浏览器。</small>
    </div></div>
  </section>
}
