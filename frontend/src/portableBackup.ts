import { validScheduleEvent } from './deviceSchedule.ts'

export type PortableBackup = {
  format: 'kaoyan-portable-v1'
  created_at: string
  study_hub: Record<string, string>
  mistake_review: Record<string, string>
  agent?: string
  model_profiles?: string
  hub_ai?: Record<string, string>
  schedule?: string
}

const agentKey = 'kaoyan-device-agent-v1'
const modelProfilesKey = 'kaoyan-device-model-profiles-v1'
const modelConfigKey = 'kaoyan-device-model-v1'
const modelKey = 'kaoyan-device-model-key-v1'
const scheduleKey = 'kaoyan-device-schedule-v1'

const subjects = ['math2', 'english2', 'politics', 'cs408']
const mistakeKeys = new Set(['shicuo-mistakes-v1', 'shicuo-chats-v1', 'shicuo-export-history-v1', 'shicuo-ai-review-plan-v1', 'shicuo-hub-sync-v1'])

function studyKey(namespace: string, subject: string) {
  return `${subject}-study-v1-agent-${namespace}`
}

function mistakePrefix(namespace: string) {
  return `shicuo-agent-${namespace}:`
}

function validMistakeKey(key: string) {
  return mistakeKeys.has(key) || (key.startsWith('shicuo-review-count:') && key.length <= 180)
}

export function readPortableBackup(namespace: string): PortableBackup {
  const study_hub: Record<string, string> = {}
  const hub_ai: Record<string, string> = {}
  const mistake_review: Record<string, string> = {}
  for (const subject of subjects) {
    const value = localStorage.getItem(studyKey(namespace, subject))
    if (value !== null) study_hub[subject] = value
    const chat = localStorage.getItem(`hub-ai-agent-${namespace}-${subject}-v1`)
    if (chat !== null) hub_ai[subject] = chat
  }
  const prefix = mistakePrefix(namespace)
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(prefix)) continue
    const shortKey = key.slice(prefix.length)
    if (!validMistakeKey(shortKey)) continue
    const value = localStorage.getItem(key)
    if (value !== null) mistake_review[shortKey] = value
  }
  const agent = namespace === 'device' ? localStorage.getItem(agentKey) : null
  const model_profiles = namespace === 'device' ? localStorage.getItem(modelProfilesKey) : null
  const schedule = namespace === 'device' ? localStorage.getItem(scheduleKey) : null
  return { format: 'kaoyan-portable-v1', created_at: new Date().toISOString(), study_hub, mistake_review,
    ...(agent === null ? {} : { agent }), ...(model_profiles === null ? {} : { model_profiles }), ...(schedule === null ? {} : { schedule }), ...(Object.keys(hub_ai).length ? { hub_ai } : {}) }
}

export function parsePortableBackup(text: string): PortableBackup {
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('备份文件格式不正确')
  const backup = value as Partial<PortableBackup>
  if (backup.format !== 'kaoyan-portable-v1' || !backup.study_hub || !backup.mistake_review
    || typeof backup.study_hub !== 'object' || Array.isArray(backup.study_hub)
    || typeof backup.mistake_review !== 'object' || Array.isArray(backup.mistake_review)
    || Object.entries(backup.study_hub).some(([key, item]) => !subjects.includes(key) || typeof item !== 'string')
    || Object.entries(backup.mistake_review).some(([key, item]) => !validMistakeKey(key) || typeof item !== 'string')
    || (backup.hub_ai !== undefined && (!backup.hub_ai || typeof backup.hub_ai !== 'object' || Array.isArray(backup.hub_ai)
      || Object.entries(backup.hub_ai).some(([key, item]) => !subjects.includes(key) || typeof item !== 'string' || item.length > 200_000)))
    || (backup.agent !== undefined && (typeof backup.agent !== 'string' || backup.agent.length > 2_000_000))
    || (backup.schedule !== undefined && (typeof backup.schedule !== 'string' || backup.schedule.length > 20_000))
    || (backup.model_profiles !== undefined && (typeof backup.model_profiles !== 'string' || backup.model_profiles.length > 100_000))) {
    throw new Error('备份文件格式不正确，或包含未知记录')
  }
  if (backup.model_profiles !== undefined) {
    try {
      const models = JSON.parse(backup.model_profiles) as { activeId?: unknown; items?: unknown }
      if (!models || !Array.isArray(models.items) || typeof models.activeId !== 'string'
        || models.items.length > 20 || (models.activeId && !models.items.some((item) => item?.id === models.activeId))
        || models.items.some((item) => {
          if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 80
            || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 60
            || typeof item.base_url !== 'string' || typeof item.model !== 'string' || !item.model.trim()
            || typeof item.temperature !== 'number' || !Number.isFinite(item.temperature)
            || item.temperature < 0 || item.temperature > 2) return true
          try { const url = new URL(item.base_url); return !['http:', 'https:'].includes(url.protocol) || Boolean(url.username || url.password) }
          catch { return true }
        })) throw new Error('invalid')
    } catch { throw new Error('备份中的模型配置格式不正确') }
  }
  if (backup.schedule !== undefined) {
    try {
      const events = JSON.parse(backup.schedule) as unknown
      if (!Array.isArray(events) || events.length > 30 || events.some((item) => !validScheduleEvent(item))) throw new Error('invalid')
    } catch { throw new Error('备份中的日程格式不正确') }
  }
  return backup as PortableBackup
}

export function restorePortableBackup(namespace: string, backup: PortableBackup) {
  const previous = readPortableBackup(namespace)
  function write(data: PortableBackup) {
    if (namespace === 'device') {
      localStorage.removeItem(agentKey)
      if (data.agent !== undefined) localStorage.setItem(agentKey, data.agent)
      if (data.schedule !== undefined) localStorage.setItem(scheduleKey, data.schedule)
      if (data.model_profiles !== undefined) {
        const models = JSON.parse(data.model_profiles) as { activeId: string; items: { id: string; base_url: string; model: string; temperature: number }[] }
        const active = models.items.find((item) => item.id === models.activeId)
        localStorage.setItem(modelProfilesKey, data.model_profiles)
        if (active) localStorage.setItem(modelConfigKey, JSON.stringify({ base_url: active.base_url, model: active.model, temperature: active.temperature }))
        else localStorage.removeItem(modelConfigKey)
      }
    }
    for (const subject of subjects) localStorage.removeItem(studyKey(namespace, subject))
    if (data.hub_ai !== undefined) for (const subject of subjects) localStorage.removeItem(`hub-ai-agent-${namespace}-${subject}-v1`)
    const prefix = mistakePrefix(namespace)
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
    for (const key of keys) if (key?.startsWith(prefix) && validMistakeKey(key.slice(prefix.length))) localStorage.removeItem(key)
    for (const [subject, value] of Object.entries(data.study_hub)) localStorage.setItem(studyKey(namespace, subject), value)
    for (const [subject, value] of Object.entries(data.hub_ai || {})) localStorage.setItem(`hub-ai-agent-${namespace}-${subject}-v1`, value)
    for (const [key, value] of Object.entries(data.mistake_review)) localStorage.setItem(prefix + key, value)
  }
  try { write(backup) }
  catch {
    try { write(previous) }
    catch { throw new Error('设备存储空间不足，回滚也未完成；请保留原备份文件') }
    throw new Error('设备存储空间不足，原记录已恢复')
  }
  // Keys are device-local secrets, not portable data. Clear them only after the
  // imported profile set was written successfully, so failed imports keep them.
  if (namespace === 'device' && backup.model_profiles !== undefined) {
    localStorage.removeItem(modelKey)
    sessionStorage.removeItem(modelKey)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith(`${modelKey}:`)) localStorage.removeItem(key)
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(`${modelKey}:`)) sessionStorage.removeItem(key)
    }
  }
}
