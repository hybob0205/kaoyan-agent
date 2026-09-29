import { useEffect, useRef, useState } from 'react'
import { ApiError, getAppSnapshot, saveAppSnapshot, type AppDataId, type AppSnapshot } from '../api/client'
import { parsePortableBackup, readPortableBackup, restorePortableBackup } from '../portableBackup'

const apps: { id: AppDataId; name: string }[] = [
  { id: 'study-hub', name: '四科研习室' },
  { id: 'mistake-review', name: '拾错复习' },
]

function allowedKey(appId: AppDataId, userId: number, key: string): boolean {
  if (appId === 'study-hub') return ['math2', 'english2', 'politics', 'cs408'].some((subject) => key === `${subject}-study-v1-agent-${userId}`)
  const prefix = `shicuo-agent-${userId}:`
  return ['shicuo-mistakes-v1', 'shicuo-chats-v1', 'shicuo-export-history-v1', 'shicuo-ai-review-plan-v1'].some((name) => key === prefix + name)
    || (key.startsWith(prefix + 'shicuo-review-count:') && key.length <= 180)
}

function localKeys(appId: AppDataId, userId: number): string[] {
  return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key): key is string => Boolean(key && allowedKey(appId, userId, key)))
}

function localData(appId: AppDataId, userId: number): Record<string, string> {
  return Object.fromEntries(localKeys(appId, userId).flatMap((key) => {
    const value = localStorage.getItem(key)
    return value === null ? [] : [[key, value]]
  }))
}

function restoreLocal(appId: AppDataId, userId: number, next: Record<string, string>) {
  if (Object.keys(next).some((key) => !allowedKey(appId, userId, key))) {
    throw new Error('备份文件包含无法识别或不属于当前账号的数据键')
  }
  const previous = localData(appId, userId)
  try {
    for (const key of Object.keys(previous)) localStorage.removeItem(key)
    for (const [key, value] of Object.entries(next)) localStorage.setItem(key, value)
  } catch (error) {
    try {
      for (const key of Object.keys(next)) localStorage.removeItem(key)
      for (const [key, value] of Object.entries(previous)) localStorage.setItem(key, value)
    } catch {
      throw new Error('浏览器存储失败，自动回滚也未完成；请保留原备份文件，不要关闭此页')
    }
    throw new Error('浏览器存储空间不足，已恢复原有本机记录', { cause: error })
  }
}

export default function DataSyncPanel({ token, userId }: { token: string; userId: number }) {
  const [remote, setRemote] = useState<Partial<Record<AppDataId, AppSnapshot | null>>>({})
  const [pending, setPending] = useState<{ appId: AppDataId; action: 'upload' | 'restore' | 'import'; data?: Record<string, string> } | null>(null)
  const fileInputs = useRef<Partial<Record<AppDataId, HTMLInputElement | null>>>({})
  const portableInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    for (const app of apps) {
      void getAppSnapshot(token, app.id).then((item) => { if (active) setRemote((current) => ({ ...current, [app.id]: item })) })
        .catch((error) => { if (active) setRemote((current) => ({ ...current, [app.id]: error instanceof ApiError && error.status === 404 ? null : undefined })) })
    }
    return () => { active = false }
  }, [token])

  async function run(appId: AppDataId, action: 'upload' | 'restore' | 'import') {
    if (pending?.appId !== appId || pending.action !== action) { setPending({ appId, action }); setMessage(''); return }
    setBusy(true)
    setPending(null)
    try {
      if (action === 'upload') {
        const data = localData(appId, userId)
        if (!Object.keys(data).length) throw new Error('本机没有可备份的记录')
        const saved = await saveAppSnapshot(token, appId, remote[appId]?.version ?? 0, data)
        localStorage.setItem(`agent-live-sync-${appId}-${userId}`, JSON.stringify({ version: saved.version, dirty: false }))
        setRemote((current) => ({ ...current, [appId]: saved }))
        setMessage('本机记录已备份到当前账号。')
      } else if (action === 'restore') {
        const saved = await getAppSnapshot(token, appId)
        restoreLocal(appId, userId, saved.data)
        localStorage.setItem(`agent-live-sync-${appId}-${userId}`, JSON.stringify({ version: saved.version, dirty: false }))
        setRemote((current) => ({ ...current, [appId]: saved }))
        setMessage('已恢复到本机；重新打开对应应用后生效。')
      } else {
        if (!pending?.data) throw new Error('请重新选择备份文件')
        restoreLocal(appId, userId, pending.data)
        localStorage.removeItem(`agent-live-sync-${appId}-${userId}`)
        setMessage('备份文件已导入本机；重新打开对应应用后生效。')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '同步失败，请稍后重试')
      if (error instanceof ApiError && error.status === 409) {
        void getAppSnapshot(token, appId).then((item) => setRemote((current) => ({ ...current, [appId]: item }))).catch(() => undefined)
      }
    } finally { setBusy(false) }
  }

  function exportLocal(appId: AppDataId) {
    const blob = new Blob([JSON.stringify(localData(appId, userId))], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${appId}-local-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function selectBackup(appId: AppDataId, file: File | undefined) {
    if (!file) return
    setPending(null)
    try {
      if (file.size > 50_000_000) throw new Error('文件超过 50 MB，请使用应用内导入功能')
      const parsed: unknown = JSON.parse(await file.text())
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Object.keys(parsed).length
        || Object.entries(parsed).some(([key, value]) => typeof value !== 'string' || !allowedKey(appId, userId, key))) {
        throw new Error('文件格式不正确，或不是当前账号的该应用备份')
      }
      setPending({ appId, action: 'import', data: parsed as Record<string, string> })
      setMessage('')
    } catch (error) { setMessage(error instanceof Error ? error.message : '无法读取备份文件') }
  }

  async function exportPortable() {
    setBusy(true)
    try {
      const backup = readPortableBackup(String(userId))
      try { backup.schedule = (await getAppSnapshot(token, 'agent-schedule')).data.events }
      catch (error) { if (!(error instanceof ApiError && error.status === 404)) throw error }
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `考研Agent-跨设备备份-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage('合并备份已导出，包含账号日程及本浏览器的研习室、拾错记录，不含模型密钥。')
    } catch (error) { setMessage(error instanceof Error ? error.message : '导出失败，请稍后重试') }
    finally { setBusy(false) }
  }

  async function importPortable(file: File | undefined) {
    if (!file) return
    try {
      if (file.size > 50_000_000) throw new Error('备份超过 50 MB，请先精简图片')
      const backup = parsePortableBackup(await file.text())
      if (!window.confirm('导入会替换当前账号在此浏览器的研习室和拾错记录，并在下次打开内置页面时同步到电脑。请先导出当前记录。是否继续？')) return
      restorePortableBackup(String(userId), backup)
      for (const app of apps) {
        localStorage.setItem(`agent-live-sync-${app.id}-${userId}`, JSON.stringify({ version: remote[app.id]?.version ?? 0, dirty: true }))
      }
      let scheduleWarning = ''
      if (backup.schedule !== undefined) {
        try {
          const existing = await getAppSnapshot(token, 'agent-schedule').catch((error: unknown) => {
            if (error instanceof ApiError && error.status === 404) return null
            throw error
          })
          await saveAppSnapshot(token, 'agent-schedule', existing?.version ?? 0, { events: backup.schedule })
        } catch { scheduleWarning = '；日程未能导入，请保留备份文件，稍后重试' }
      }
      setMessage(`研习室与拾错已导入此浏览器，请分别打开并等待同步${scheduleWarning}。如提示冲突，请保留备份文件。`)
    } catch (error) { setMessage(error instanceof Error ? error.message : '导入失败') }
  }

  return <section className="account-section">
    <div className="account-section-heading"><div><h2>研习记录与备份</h2><p>局域网模式下安全状态会自动同步到电脑；检测到冲突会暂停覆盖。这里可手动导出、上传或恢复，不包含 API Key。</p></div></div>
    <div className="app-sync-list">{apps.map((app) => <div className="app-sync-row" key={app.id}>
      <div><strong>{app.name}</strong><small>{remote[app.id] === undefined ? '正在读取备份状态…' : remote[app.id] ? `账号备份：${new Date(remote[app.id]!.updated_at).toLocaleString('zh-CN')}` : '当前账号还没有备份'}</small></div>
      <div className="app-sync-actions"><button type="button" className="secondary-button" disabled={busy || !Object.keys(localData(app.id, userId)).length} onClick={() => exportLocal(app.id)}>导出本机文件</button><button type="button" className="secondary-button" disabled={busy} onClick={() => fileInputs.current[app.id]?.click()}>导入备份文件</button><input type="file" accept=".json,application/json" hidden ref={(element) => { fileInputs.current[app.id] = element }} onChange={(event) => { void selectBackup(app.id, event.target.files?.[0]); event.target.value = '' }} /><button type="button" className="secondary-button" disabled={busy || remote[app.id] === undefined} onClick={() => void run(app.id, 'upload')}>备份到账号</button><button type="button" className="secondary-button" disabled={busy || !remote[app.id]} onClick={() => void run(app.id, 'restore')}>恢复到本机</button></div>
      {pending?.appId === app.id ? <div className="app-sync-confirm" role="status"><span>{pending.action === 'upload' ? '上传会替换当前账号保存的该应用备份。' : '恢复会覆盖本机该应用现有记录；建议先导出本机文件。'}</span><button type="button" className="primary-button compact" disabled={busy} onClick={() => void run(app.id, pending.action)}>确认{pending.action === 'upload' ? '上传' : pending.action === 'import' ? '导入' : '恢复'}</button><button type="button" className="text-button" onClick={() => setPending(null)}>取消</button></div> : null}
    </div>)}</div>
    <div className="portable-actions"><strong>跨模式备份</strong><p>电脑局域网模式与本设备模式可用同一份备份文件迁移研习室、拾错与日程。导出前请分别打开研习室和拾错一次，确保此浏览器已有最新数据。</p><button type="button" className="secondary-button" disabled={busy} onClick={() => void exportPortable()}>导出合并备份</button><button type="button" className="secondary-button" disabled={busy || remote['study-hub'] === undefined || remote['mistake-review'] === undefined} onClick={() => portableInput.current?.click()}>导入合并备份</button><input ref={portableInput} type="file" accept=".json,application/json" hidden onChange={(event) => { void importPortable(event.target.files?.[0]); event.target.value = '' }} /></div>
    {message ? <p role="status" className="account-review-line">{message}</p> : null}
    <p className="account-review-line">图片较多时备份可能超过 10 MB；此时请用应用内导出功能保存完整记录。换设备登录同一账号后，在这里恢复。</p>
  </section>
}
