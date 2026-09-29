export const deviceModelConfigKey = 'kaoyan-device-model-v1'
export const deviceModelKeyKey = 'kaoyan-device-model-key-v1'
export const deviceModelProfilesKey = 'kaoyan-device-model-profiles-v1'

export type DeviceModelConfig = { base_url: string; model: string; temperature: number }
export type DeviceModelProfile = DeviceModelConfig & { id: string; name: string }
export type DeviceModelProfiles = { activeId: string; items: DeviceModelProfile[] }

function validConfig(value: unknown): DeviceModelConfig | null {
  if (!value || typeof value !== 'object') return null
  const config = value as Partial<DeviceModelConfig>
  if (typeof config.base_url !== 'string' || typeof config.model !== 'string' || !config.model.trim()
    || typeof config.temperature !== 'number' || !Number.isFinite(config.temperature) || config.temperature < 0 || config.temperature > 2) return null
  try {
    const url = new URL(config.base_url)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    return { base_url: url.href.replace(/\/+$/, ''), model: config.model.trim(), temperature: config.temperature }
  } catch { return null }
}

export function readDeviceModelProfiles(): DeviceModelProfiles {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(deviceModelProfilesKey) || 'null')
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      const value = stored as Partial<DeviceModelProfiles>
      const items = Array.isArray(value.items) ? value.items.flatMap((item) => {
        const config = validConfig(item)
        return config && typeof item.id === 'string' && item.id.length <= 80 && typeof item.name === 'string'
          ? [{ ...config, id: item.id, name: item.name.trim().slice(0, 60) || item.model }] : []
      }).slice(0, 20) : []
      return { items, activeId: items.some((item) => item.id === value.activeId) ? value.activeId! : items[0]?.id || '' }
    }
  } catch { /* Older or malformed settings fall back to the legacy configuration. */ }
  try {
    const legacy = validConfig(JSON.parse(localStorage.getItem(deviceModelConfigKey) || 'null'))
    if (legacy) return { activeId: 'legacy', items: [{ ...legacy, id: 'legacy', name: legacy.model }] }
  } catch { /* No legacy model configured. */ }
  return { activeId: '', items: [] }
}

export function readDeviceModelConfig(): DeviceModelConfig | null {
  const profiles = readDeviceModelProfiles()
  const active = profiles.items.find((item) => item.id === profiles.activeId)
  return active ? { base_url: active.base_url, model: active.model, temperature: active.temperature } : null
}

export function readDeviceModelKey(profileId?: string): string {
  const profiles = readDeviceModelProfiles()
  const id = profileId || profiles.activeId
  return sessionStorage.getItem(`${deviceModelKeyKey}:${id}`) || (id === profiles.activeId ? sessionStorage.getItem(deviceModelKeyKey) || '' : '')
}

function persist(profiles: DeviceModelProfiles, key?: string) {
  const active = profiles.items.find((item) => item.id === profiles.activeId)
  localStorage.setItem(deviceModelProfilesKey, JSON.stringify(profiles))
  if (active) localStorage.setItem(deviceModelConfigKey, JSON.stringify({ base_url: active.base_url, model: active.model, temperature: active.temperature }))
  else localStorage.removeItem(deviceModelConfigKey)
  if (key !== undefined && active) {
    if (key) sessionStorage.setItem(`${deviceModelKeyKey}:${active.id}`, key)
    else sessionStorage.removeItem(`${deviceModelKeyKey}:${active.id}`)
  }
  const activeKey = active ? sessionStorage.getItem(`${deviceModelKeyKey}:${active.id}`) || '' : ''
  if (activeKey) sessionStorage.setItem(deviceModelKeyKey, activeKey)
  else sessionStorage.removeItem(deviceModelKeyKey)
}

export function saveDeviceModelProfile(input: DeviceModelProfile, key: string): DeviceModelProfiles {
  const config = validConfig(input)
  if (!config) throw new Error('请填写有效的 Base URL、模型名称和 0–2 的温度')
  const name = input.name.trim().slice(0, 60)
  if (!name) throw new Error('请填写配置名称')
  const profiles = readDeviceModelProfiles()
  const id = input.id || crypto.randomUUID()
  if (profiles.items.length >= 20 && !profiles.items.some((item) => item.id === id)) throw new Error('最多保存 20 个模型配置')
  const item = { ...config, id, name }
  const items = profiles.items.some((saved) => saved.id === id)
    ? profiles.items.map((saved) => saved.id === id ? item : saved)
    : [...profiles.items, item]
  const next = { items, activeId: id }
  persist(next, key)
  return next
}

export function selectDeviceModelProfile(id: string): DeviceModelProfiles {
  const profiles = readDeviceModelProfiles()
  if (!profiles.items.some((item) => item.id === id)) throw new Error('模型配置不存在')
  const previousKey = sessionStorage.getItem(deviceModelKeyKey)
  if (previousKey && profiles.activeId) sessionStorage.setItem(`${deviceModelKeyKey}:${profiles.activeId}`, previousKey)
  const next = { ...profiles, activeId: id }
  persist(next)
  return next
}

export function deleteDeviceModelProfile(id: string): DeviceModelProfiles {
  const profiles = readDeviceModelProfiles()
  const items = profiles.items.filter((item) => item.id !== id)
  const next = { items, activeId: profiles.activeId === id ? items[0]?.id || '' : profiles.activeId }
  sessionStorage.removeItem(`${deviceModelKeyKey}:${id}`)
  persist(next)
  return next
}
