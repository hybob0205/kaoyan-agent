import { type FormEvent, useState } from 'react'
import type { ModelConfig, ModelConfigInput, ModelHealth, ModelProfile, ModelProfileInput, ModelProfiles } from '../api/client'
import ThemeButton from './ThemeButton'

type ModelSettingsProps = {
  config: ModelConfig | null
  profiles: ModelProfiles | null
  busy: boolean
  error: string
  health: ModelHealth | null
  onSave: (input: Omit<ModelProfileInput, 'expected_version'>) => Promise<ModelProfiles>
  onSelect: (id: string) => Promise<ModelProfiles>
  onDelete: (id: string) => Promise<ModelProfiles>
  onTest: () => Promise<void>
  backLabel: string
  onBack: () => void
}

function initialValues(config: ModelConfig | null): ModelConfigInput {
  return config ? {
    provider: 'openai_compatible',
    base_url: config.provider === 'ollama' ? `${config.base_url.replace(/\/+$/, '')}/v1` : config.base_url,
    model: config.model,
    embedding_model: config.embedding_model.startsWith('ollama://') ? '' : config.embedding_model,
    temperature: config.temperature,
  } : {
    provider: 'openai_compatible',
    base_url: '',
    model: '',
    embedding_model: '',
    temperature: 0.2,
  }
}

export default function ModelSettings({ config, profiles, busy, error, health, onSave, onSelect, onDelete, onTest, backLabel, onBack }: ModelSettingsProps) {
  const [values, setValues] = useState<ModelConfigInput>(() => initialValues(config))
  const [editingId, setEditingId] = useState<string | undefined>(() => profiles?.active_id || undefined)
  const [name, setName] = useState(() => profiles?.items.find((item) => item.id === profiles.active_id)?.name || '')
  const [apiKey, setApiKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(Boolean(config && (config.provider === 'ollama' || config.embedding_model.startsWith('ollama://'))))
  const directReading = !values.embedding_model
  const [clearApiKey, setClearApiKey] = useState(false)
  const selectedProfile = profiles?.items.find((item) => item.id === editingId)

  function edit(profile: ModelProfile) {
    setEditingId(profile.id)
    setName(profile.name)
    setValues(initialValues(profile))
    setApiKey('')
    setClearApiKey(false)
    setDirty(profile.provider === 'ollama' || profile.embedding_model.startsWith('ollama://'))
    setSaved(false)
  }

  function add() {
    setEditingId(undefined)
    setName('')
    setValues(initialValues(null))
    setApiKey('')
    setClearApiKey(false)
    setDirty(true)
    setSaved(false)
  }

  async function select(profile: ModelProfile) {
    try { await onSelect(profile.id); edit(profile) } catch { /* Parent displays the request error. */ }
  }

  async function remove(profile: ModelProfile) {
    if (!confirm(`删除“${profile.name}”？此操作不会删除学习记录。`)) return
    try {
      const next = await onDelete(profile.id)
      const active = next.items.find((item) => item.id === next.active_id)
      if (active) edit(active)
      else add()
    } catch { /* Parent displays the request error. */ }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaved(false)
    try {
      const next = await onSave({ ...values, id: editingId, name: name.trim(), provider: 'openai_compatible', api_key: apiKey || undefined, clear_api_key: clearApiKey })
      setEditingId(next.active_id)
      setApiKey('')
      setClearApiKey(false)
      setSaved(true)
      setDirty(false)
    } catch {
      // The parent presents the API error next to the form.
    }
  }

  return <main className="settings-shell">
    <header className="topbar"><div className="brand-mark">研</div><div><strong>考研 Agent</strong><span>模型设置</span></div><div className="topbar-actions"><ThemeButton /><button type="button" className="text-button" onClick={onBack}>{backLabel}</button></div></header>
    <div className="settings-content">
      <p className="eyebrow">模型配置</p>
      <h1>连接你的模型接口</h1>
      <p className="lead">本地模型和在线模型共用 OpenAI 兼容接口。可保存多个配置并切换；资料默认直接读取文字，无需 Embedding。</p>
      <section className="model-profile-list" aria-label="已保存的模型配置"><div className="model-profile-heading"><h2>已保存的配置</h2><button type="button" className="secondary-button" disabled={busy || (profiles?.items.length ?? 0) >= 20} onClick={add}>＋ 添加模型</button></div>
        {profiles?.items.length ? profiles.items.map((profile) => <div className="model-profile-row" key={profile.id}><div><strong>{profile.name}</strong><small>{profile.model} · {profile.base_url}</small></div><div>{profiles.active_id === profile.id ? <span className="device-model-active">当前使用</span> : <button type="button" disabled={busy} aria-label={`使用${profile.name}`} onClick={() => void select(profile)}>使用</button>}<button type="button" disabled={busy} aria-label={`编辑${profile.name}`} onClick={() => edit(profile)}>编辑</button><button type="button" className="danger" disabled={busy} aria-label={`删除${profile.name}`} onClick={() => void remove(profile)}>删除</button></div></div>) : <p>还没有模型配置，填写下方表单即可开始。</p>}
      </section>
      <form className="settings-form" onChange={() => { setSaved(false); setDirty(true) }} onSubmit={(event) => void submit(event)}>
        <div className="settings-fields">
          <label>配置名称<input required maxLength={60} value={name} placeholder="例如：在线模型 / 家中 Ollama" onChange={(event) => setName(event.target.value)} /></label>
          <label>接口地址（Base URL）<input type="url" required value={values.base_url} placeholder="https://你的接口地址/v1" onChange={(event) => setValues({ ...values, base_url: event.target.value })} /></label>
          <label>对话模型<input required value={values.model} placeholder="接口提供的模型名称" onChange={(event) => setValues({ ...values, model: event.target.value })} /></label>
          <label>温度 <span className="field-value">{values.temperature.toFixed(1)}</span><input type="range" min={0} max={2} step={0.1} value={values.temperature} onChange={(event) => setValues({ ...values, temperature: Number(event.target.value) })} /></label>
          <label className="full-field">API Key（本地免密接口可留空）<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={selectedProfile?.has_api_key ? `已保存 ${selectedProfile.api_key_masked}，留空则不修改` : '接口需要认证时填写'} autoComplete="new-password" /></label>
        </div>
        {selectedProfile?.has_api_key ? <label className="secret-note"><input type="checkbox" checked={clearApiKey} onChange={(event) => setClearApiKey(event.target.checked)} /> 删除已保存的 API Key</label> : null}
        <p className="secret-note">本机 Ollama 调试可填 http://127.0.0.1:11434/v1 和 gemma3:4b；在线接口填写服务商提供的兼容地址。请求由后端发出，部署后 127.0.0.1 指服务器本身。</p>
        {config && config.provider === 'ollama' && dirty ? <p className="secret-note">已将旧 Ollama 配置转换为统一接口格式，请保存一次后再测试。</p> : null}
        <fieldset className="embedding-options"><legend>资料读取方式</legend>
          <p>默认从 PDF、图片等资料中提取文字并检索，无需额外模型。若当前接口也提供 /embeddings，可选填对应模型名提升长文档检索效果。</p>
          <label>Embedding 模型（可选）<input value={values.embedding_model} onChange={(event) => setValues({ ...values, embedding_model: event.target.value })} placeholder="例如 nomic-embed-text；留空则直接读取" /></label>
          <small>Embedding 与对话模型使用同一 Base URL 和 API Key；不再要求额外安装本地向量模型。</small>
        </fieldset>
        <p className="secret-note">API Key 在后端加密保存，仅用于所配置的接口；响应和日志不返回明文。</p>
        {saved ? <p className="save-result" role="status">配置已安全保存</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {health ? <p className={`health-result ${health.ok ? 'success' : 'failure'}`} role="status"><strong>{health.ok ? '连接成功' : '连接失败'}</strong>{health.message}<span>{health.latency_ms} ms</span></p> : null}
        <div className="settings-actions"><button type="submit" className="primary-button compact" disabled={busy}>{busy ? '保存中…' : '保存并使用'}</button><button type="button" className="secondary-button" disabled={busy || config === null || dirty || editingId !== profiles?.active_id} onClick={() => void onTest()}>{directReading ? '测试接口' : '测试接口与 Embedding'}</button></div>
        {dirty ? <p className="secret-note">先保存修改，再测试新配置。</p> : null}
      </form>
    </div>
  </main>
}
