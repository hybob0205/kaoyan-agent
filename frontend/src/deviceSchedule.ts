export const deviceScheduleKey = 'kaoyan-device-schedule-v1'
export type ScheduleEvent = { id: string; title: string; date: string }

const datePattern = /^\d{4}-\d{2}-\d{2}$/

export function localDate() { return new Date().toLocaleDateString('sv-SE') }

export function validScheduleEvent(value: unknown): value is ScheduleEvent {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ScheduleEvent>
  return typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 80
    && typeof item.title === 'string' && item.title.trim().length > 0 && item.title.length <= 80
    && typeof item.date === 'string' && datePattern.test(item.date)
    && !Number.isNaN(new Date(`${item.date}T12:00:00`).getTime())
    && new Date(`${item.date}T12:00:00`).toLocaleDateString('sv-SE') === item.date
}

export function readDeviceSchedule(): ScheduleEvent[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(deviceScheduleKey) || '[]')
    return Array.isArray(value) ? value.filter(validScheduleEvent).slice(0, 30).sort((a, b) => a.date.localeCompare(b.date)) : []
  } catch { return [] }
}

export function saveDeviceSchedule(items: ScheduleEvent[]) {
  if (items.length > 30 || items.some((item) => !validScheduleEvent(item))) throw new Error('最多保存 30 个日程，标题不超过 80 字')
  localStorage.setItem(deviceScheduleKey, JSON.stringify(items))
}

export function daysUntil(date: string, from = localDate()) {
  if (!datePattern.test(date) || !datePattern.test(from)) return null
  const utc = (value: string) => { const [year, month, day] = value.split('-').map(Number); return Date.UTC(year, month - 1, day) }
  return Math.round((utc(date) - utc(from)) / 86_400_000)
}
