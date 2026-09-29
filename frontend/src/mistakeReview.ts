import type { MistakeReviewProgress } from './api/client'

type StoredMistake = Record<string, unknown>

const text = (value: unknown, limit: number) => {
  if (typeof value !== 'string' || /^(?:data:|blob:)/i.test(value.trim())) return ''
  return value.trim().slice(0, limit)
}

export function readMistakeReview(userId: number | string, source?: Record<string, string>): MistakeReviewProgress | null {
  try {
    const key = `shicuo-agent-${userId}:shicuo-mistakes-v1`
    const raw = source ? source[key] : localStorage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const records = parsed.filter((item): item is StoredMistake => item !== null && typeof item === 'object' && !Array.isArray(item))
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    return {
      total: Math.min(records.length, 100000),
      due: Math.min(records.filter((item) => typeof item.nextReview === 'string' && item.nextReview <= today).length, 100000),
      weak: Math.min(records.filter((item) => (typeof item.mastery === 'number' ? item.mastery : 1) < 3).length, 100000),
      items: [...records].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, 10).map((item) => ({
        subject: text(item.subject, 30), module: text(item.module, 60), knowledge: text(item.knowledge, 100),
        cause: text(item.cause, 160), question: text(item.question, 300), my_answer: text(item.myAnswer, 160),
        answer: text(item.answer, 160), explanation: text(item.explanation, 300),
        next_review: text(item.nextReview, 20),
        mastery: typeof item.mastery === 'number' && Number.isFinite(item.mastery) ? Math.min(5, Math.max(1, Math.round(item.mastery))) : 1,
      })),
    }
  } catch { return null }
}
