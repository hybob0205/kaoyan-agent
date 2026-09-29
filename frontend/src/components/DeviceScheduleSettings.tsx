import { useEffect, useRef, useState, type FormEvent } from 'react'
import { localDate, readDeviceSchedule, saveDeviceSchedule, type ScheduleEvent } from '../deviceSchedule'

type Props = {
  onClose: () => void
  onChange: () => void
  initialItems?: ScheduleEvent[]
  onSaveItems?: (items: ScheduleEvent[]) => Promise<void>
  accountMode?: boolean
}

export default function DeviceScheduleSettings({ onClose, onChange, initialItems, onSaveItems, accountMode = false }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [items, setItems] = useState(() => initialItems ?? readDeviceSchedule())
  const [editing, setEditing] = useState<ScheduleEvent>({ id: '', title: '', date: localDate() })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { dialog.current?.showModal(); return () => { if (dialog.current?.open) dialog.current.close() } }, [])

  async function persist(next: ScheduleEvent[]) {
    if (busy) return
    setBusy(true)
    try { const ordered = [...next].sort((a, b) => a.date.localeCompare(b.date)); if (onSaveItems) await onSaveItems(ordered); else saveDeviceSchedule(ordered); setItems(ordered); setEditing({ id: '', title: '', date: localDate() }); setMessage(accountMode ? '日程已保存到当前账号。' : '日程已保存到本设备。'); onChange() }
    catch (error) { setMessage(error instanceof Error ? error.message : '保存失败，请检查设备空间') }
    finally { setBusy(false) }
  }

  function save(event: FormEvent) {
    event.preventDefault()
    const item = { ...editing, id: editing.id || crypto.randomUUID(), title: editing.title.trim() }
    void persist(editing.id ? items.map((saved) => saved.id === item.id ? item : saved) : [...items, item])
  }

  return <dialog ref={dialog} className="device-schedule-dialog" onClose={onClose} aria-labelledby="device-schedule-title">
    <div className="device-schedule-dialog-inner">
      <header><div><p className="eyebrow">重要日子</p><h2 id="device-schedule-title">日程与倒计时</h2></div><button type="button" onClick={() => dialog.current?.close()} aria-label="关闭日程设置">×</button></header>
      <p>考试日期取自{accountMode ? '当前账号' : '学习 Agent'}的学习画像；这里可添加放假、模考等自定义日程。到当天，首页会显示事件名称。</p>
      <div className="device-schedule-list">{items.length ? items.map((item) => <div key={item.id}><div><strong>{item.title}</strong><small>{item.date}</small></div><div><button type="button" disabled={busy} onClick={() => { setEditing(item); setMessage('') }}>编辑</button><button type="button" disabled={busy} className="danger" onClick={() => { if (confirm(`删除“${item.title}”？`)) void persist(items.filter((saved) => saved.id !== item.id)) }}>删除</button></div></div>) : <p>还没有自定义日程。</p>}</div>
      <form onSubmit={save}><h3>{editing.id ? '编辑日程' : '添加日程'}</h3><label>事件名称<input value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} maxLength={80} placeholder="例如：放假、第一次模拟考试" required /></label><label>日期<input type="date" value={editing.date} onChange={(event) => setEditing({ ...editing, date: event.target.value })} required /></label><div><button type="submit" disabled={busy} className="primary-button compact">{busy ? '保存中…' : editing.id ? '保存修改' : '添加日程'}</button>{editing.id && <button type="button" className="secondary-button" disabled={busy} onClick={() => setEditing({ id: '', title: '', date: localDate() })}>取消编辑</button>}</div></form>
      {message && <p role="status" className="device-schedule-feedback">{message}</p>}
      <button type="button" className="device-schedule-done" onClick={() => dialog.current?.close()}>完成，返回首页</button>
    </div>
  </dialog>
}
