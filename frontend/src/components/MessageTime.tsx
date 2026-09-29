export default function MessageTime({ value }: { value?: string }) {
  if (!value) return null
  // SQLite timestamps from the backend may omit the UTC suffix.
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return null
  return <time className="message-time" dateTime={date.toISOString()} title={date.toLocaleString('zh-CN')}>{date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} {date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</time>
}
