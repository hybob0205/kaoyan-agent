import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import DeviceModelSettings from './components/DeviceModelSettings'
import ModelSettings from './components/ModelSettings'
import { getModelProfiles, getModelConfig, saveModelProfile, activateModelProfile, deleteModelProfile, testModelConfig, type ModelProfiles, type ModelConfig, type ModelHealth } from './api/client'
import './styles.css'

for (const path of ['/agent-design.css', '/web-design.css']) { const link = document.querySelector(`link[href="${path}"]`); if (link) document.head.append(link) }
function close() { if (parent !== window) parent.postMessage({ type: 'kaoyan-close-model-settings' }, location.origin); else location.assign('/') }
function Settings() {
  const device = localStorage.getItem('kaoyan-agent-run-mode-v1') === 'device'
  const token = localStorage.getItem('kaoyan-agent-token-v1') || ''
  const [profiles, setProfiles] = useState<ModelProfiles | null>(null)
  const [config, setConfig] = useState<ModelConfig | null>(null)
  const [health, setHealth] = useState<ModelHealth | null>(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(device)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (device) return; let active = true; Promise.all([getModelProfiles(token), getModelConfig(token).catch(() => null)]).then(([items, model]) => { if (active) { setProfiles(items); setConfig(model); setReady(true) } }).catch(reason => { if (active) setError(reason.message) }); return () => { active = false } }, [device, token])
  async function change(action: () => Promise<ModelProfiles>) { setBusy(true); setError(''); try { const value = await action(); setProfiles(value); setConfig(value.items.find(item => item.id === value.active_id) || null); return value } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); throw reason } finally { setBusy(false) } }
  if (device) return <DeviceModelSettings onClose={close} onChange={() => {}} />
  if (!ready) return <main className="center-screen"><p>{error || '正在读取模型设置…'}</p><button onClick={close}>关闭设置</button></main>
  return <ModelSettings config={config} profiles={profiles} busy={busy} error={error} health={health} onSave={input => change(() => saveModelProfile(token, { ...input, expected_version: profiles?.version || 0 }))} onSelect={id => change(() => activateModelProfile(token, id, profiles?.version || 0))} onDelete={id => change(() => deleteModelProfile(token, id, profiles?.version || 0))} onTest={async () => { setBusy(true); try { setHealth(await testModelConfig(token)) } catch (reason) { setError(reason instanceof Error ? reason.message : '测试失败') } finally { setBusy(false) } }} backLabel="关闭设置" onBack={close} />
}
createRoot(document.getElementById('root')!).render(<Settings />)
