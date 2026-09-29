import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { deleteDeviceModelProfile, readDeviceModelKey, readDeviceModelProfiles, saveDeviceModelProfile, selectDeviceModelProfile, type DeviceModelProfile } from '../deviceModel'

const blank = (): DeviceModelProfile => ({ id: '', name: '', base_url: '', model: '', temperature: 0.2 })

export default function DeviceModelSettings({ onClose, onChange }: { onClose: () => void; onChange: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [profiles, setProfiles] = useState(readDeviceModelProfiles)
  const [draft, setDraft] = useState<DeviceModelProfile | null>(() => profiles.items.length ? null : blank())
  const [apiKey, setApiKey] = useState('')
  const [message, setMessage] = useState('')
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    dialog.current?.showModal()
    return () => { if (dialog.current?.open) dialog.current.close() }
  }, [])

  function edit(profile: DeviceModelProfile) {
    setDraft(profile)
    setApiKey(readDeviceModelKey(profile.id))
    setMessage('')
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft) return
    try {
      const next = saveDeviceModelProfile(draft, apiKey.trim())
      setProfiles(next)
      setDraft(null)
      setApiKey('')
      setMessage('已保存并设为当前模型。')
      onChange()
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存失败') }
  }

  function select(id: string) {
    try {
      setProfiles(selectDeviceModelProfile(id))
      setDraft(null)
      setMessage('已切换当前模型。')
      onChange()
    } catch (error) { setMessage(error instanceof Error ? error.message : '切换失败') }
  }

  function remove(id: string) {
    if (!confirm('删除这个模型配置？此操作不会删除学习记录。')) return
    setProfiles(deleteDeviceModelProfile(id))
    setDraft(null)
    setMessage('模型配置已删除。')
    onChange()
  }

  async function testConnection() {
    if (!draft) return
    setTesting(true)
    setMessage('正在连接模型…')
    try {
      const url = new URL(draft.base_url)
      if (!['http:', 'https:'].includes(url.protocol) || !draft.model.trim()) throw new Error('请先填写有效的接口地址和模型名称')
      const endpoint = `${url.href.replace(/\/+$/, '')}/chat/completions`
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey || 'device-no-key'}` }
      const data = { model: draft.model.trim(), stream: false, max_tokens: 16, messages: [{ role: 'user', content: '请回复：连接成功' }] }
      if (Capacitor.isNativePlatform()) {
        const response = await CapacitorHttp.post({ url: endpoint, headers, data, connectTimeout: 10000, readTimeout: 30000 })
        if (response.status < 200 || response.status >= 300) throw new Error(`接口返回 ${response.status}`)
      } else {
        const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(data) })
        if (!response.ok) throw new Error(`接口返回 ${response.status}`)
      }
      setMessage('连接成功。点击“保存并使用”后，Agent 和拾错都会使用此模型。')
    } catch (error) { setMessage(error instanceof Error ? error.message : '连接失败') }
    finally { setTesting(false) }
  }

  return <dialog ref={dialog} className="device-model-dialog" onClose={onClose} aria-labelledby="device-model-title">
    <div className="device-model-dialog-inner">
      <header className="device-model-dialog-header"><div><p className="eyebrow">有研在先</p><h2 id="device-model-title">模型设置</h2></div><button type="button" className="device-model-close" onClick={() => dialog.current?.close()} aria-label="关闭模型设置">×</button></header>
      <p className="device-model-intro">保存多个 OpenAI 兼容接口，随时切换；当前模型同时供学习 Agent 和拾错使用。</p>
      <div className="device-model-list" aria-label="已保存的模型配置">
        {profiles.items.map((profile) => <div key={profile.id} className={`device-model-item ${profiles.activeId === profile.id ? 'active' : ''}`}>
          <div><strong>{profile.name}</strong><small>{profile.model} · {profile.base_url}</small></div>
          <div className="device-model-item-actions">{profiles.activeId === profile.id ? <span className="device-model-active">当前使用</span> : <button type="button" onClick={() => select(profile.id)}>使用</button>}<button type="button" onClick={() => edit(profile)}>编辑</button><button type="button" className="danger" onClick={() => remove(profile.id)}>删除</button></div>
        </div>)}
        {!profiles.items.length && <p className="device-model-empty">还没有模型配置。填写下面的接口即可开始。</p>}
      </div>
      {draft ? <form className="device-model-form" onSubmit={save}>
        <h3>{draft.id ? '编辑模型配置' : '新增模型配置'}</h3>
        <label>配置名称<input required maxLength={60} value={draft.name} placeholder="例如：在线模型 / 家中 Ollama" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>接口地址（Base URL）<input required type="url" value={draft.base_url} placeholder="https://服务商地址/v1" onChange={(event) => setDraft({ ...draft, base_url: event.target.value })} /></label>
        <label>对话模型<input required value={draft.model} placeholder="模型名称" onChange={(event) => setDraft({ ...draft, model: event.target.value })} /></label>
        <div className="device-model-form-row"><label>API Key（可选）<input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} /></label><label>温度<input type="number" inputMode="decimal" min="0" max="2" step="0.1" value={draft.temperature} onChange={(event) => setDraft({ ...draft, temperature: Number(event.target.value) })} /></label></div>
        <p className="device-model-hint">API Key 只保留在当前应用会话，不写入备份。手机里的 127.0.0.1 指手机本身；HTTP 接口不会加密传输。</p>
        <div className="device-model-actions"><button type="button" className="secondary-button" disabled={testing} onClick={() => void testConnection()}>{testing ? '测试中…' : '测试连接'}</button><button type="submit" className="primary-button compact">保存并使用</button><button type="button" className="text-button" onClick={() => setDraft(null)}>取消编辑</button></div>
      </form> : <button type="button" className="secondary-button device-model-add" onClick={() => { setDraft(blank()); setApiKey(''); setMessage('') }}>＋ 添加模型</button>}
      {message && <p role="status" className="device-model-feedback">{message}</p>}
      <button type="button" className="device-model-done" onClick={() => dialog.current?.close()}>完成，关闭设置</button>
    </div>
  </dialog>
}
