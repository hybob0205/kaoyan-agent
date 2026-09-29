import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Props = { items: { id: string; title: string }[]; activeId: string; busy: boolean; onNew: () => void; onSelect: (id: string) => void; onRename: (id: string, title: string) => void | Promise<void>; onDelete: (ids: string[]) => void | Promise<void> }
export default function ConversationList({ items, activeId, busy, onNew, onSelect, onRename, onDelete }: Props) {
  const drawer = useRef<HTMLDialogElement>(null)
  const [managing, setManaging] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const locked = busy || pending
  const chosen = selected.filter(id => items.some(item => item.id === id))
  async function run(action: () => void | Promise<void>) { setPending(true); setError(''); try { await action(); setEditing(null); setSelected([]) } catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败，请重试') } finally { setPending(false) } }
  return <><div className="conversation-toolbar"><button type="button" aria-label="打开历史对话" onClick={() => drawer.current?.showModal()}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 6h16M4 12h12M4 18h16" /></svg><span>历史对话</span></button><button type="button" disabled={locked} onClick={onNew}>新建对话</button></div>{createPortal(<dialog ref={drawer} className="conversation-drawer" aria-label="历史对话" onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX > rect.right) drawer.current?.close() } }}>
    <header><h2>历史对话</h2><button type="button" aria-label="关闭历史对话" onClick={() => drawer.current?.close()}>关闭</button></header>
    <aside className="conversation-list" aria-label="对话列表">
    <div className="conversation-list-tools"><button type="button" className="secondary-button" disabled={locked} onClick={() => { onNew(); drawer.current?.close() }}>新建对话</button><button type="button" className="text-button" disabled={locked} onClick={() => { setManaging(!managing); setSelected([]); setEditing(null) }}>{managing ? '完成管理' : '管理对话'}</button></div>
    {managing && <div className="conversation-list-tools"><button type="button" disabled={locked} onClick={() => setSelected(chosen.length === items.length ? [] : items.map(item => item.id))}>{chosen.length === items.length ? '取消全选' : '全选'}</button><button type="button" disabled={locked || !chosen.length} onClick={() => { if (confirm(`删除选中的 ${chosen.length} 个对话及其消息？此操作无法撤销。`)) void run(() => onDelete(chosen)) }}>删除所选（{chosen.length}）</button></div>}
    <ul>{items.map(item => <li key={item.id} className={item.id === activeId ? 'active' : ''}>
      {managing && <input type="checkbox" aria-label={`选择对话 ${item.title}`} checked={chosen.includes(item.id)} disabled={locked} onChange={event => setSelected(event.target.checked ? [...chosen, item.id] : chosen.filter(id => id !== item.id))} />}
      <button type="button" className="conversation-select" disabled={locked} aria-current={item.id === activeId ? 'true' : undefined} onClick={() => { onSelect(item.id); drawer.current?.close() }}>{item.title}</button>
      <button type="button" className="conversation-rename" disabled={locked} aria-label={`重命名 ${item.title}`} onClick={() => { setEditing(item.id); setTitle(item.title) }}>改名</button>
    </li>)}</ul>
    {!items.length && <p>还没有保存的对话</p>}
    {editing && <form onSubmit={event => { event.preventDefault(); if (title.trim()) void run(() => onRename(editing, title.trim())) }}><label>对话名称<input value={title} maxLength={80} required onChange={event => setTitle(event.target.value)} /></label><button disabled={locked || !title.trim()}>保存名称</button><button type="button" disabled={locked} onClick={() => setEditing(null)}>取消</button></form>}
    {error && <p role="alert">{error}</p>}
  </aside></dialog>, document.body)}</>
}
