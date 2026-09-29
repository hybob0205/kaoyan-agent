import { readDeviceModelConfig, readDeviceModelKey } from './deviceModel'
import { streamDeviceChat } from './deviceStream'
import { readMistakeReview } from './mistakeReview'

export const deviceAgentKey = 'kaoyan-device-agent-v1'
export type Subject = 'math2' | 'english2' | 'politics' | 'cs408'
export type LocalTask = { id: string; subject: Subject; title: string; minutes: number; done: boolean }
export type LocalMessage = { role: 'user' | 'assistant'; content: string; createdAt?: string }
export type LocalConversation = { id: string; title: string; messages: LocalMessage[] }
export type LocalDay = { date: string; planned: number; completed: number; minutes: number }
export type LocalSchool = { id: string; school: string; major: string; year: string; score: string; source: string; notes: string }
export type LocalAgentData = {
  name: string
  examDate: string
  school: string
  major: string
  dailyMinutes: number
  scores: Record<Subject, number>
  taskDate: string
  tasks: LocalTask[]
  history: LocalDay[]
  messages: LocalMessage[]
  schools: LocalSchool[]
  conversations: LocalConversation[]
  activeConversationId: string
}

const subjects: Subject[] = ['math2', 'english2', 'politics', 'cs408']
const labels: Record<Subject, string> = { math2: '数学二', english2: '英语二', politics: '政治', cs408: '408' }
const focus: Record<Subject, string> = { math2: '基础知识与例题训练', english2: '词汇复习与阅读训练', politics: '核心考点理解与背诵', cs408: '分科练习与错题复盘' }
const today = () => new Date().toLocaleDateString('sv-SE')

export function defaultDeviceAgent(): LocalAgentData {
  const year = new Date().getFullYear()
  const examDate = today() < `${year}-12-19` ? `${year}-12-19` : `${year + 1}-12-19`
  return { name: '', examDate, school: '', major: '', dailyMinutes: 180,
    scores: { math2: 2, english2: 2, politics: 2, cs408: 2 }, taskDate: '', tasks: [], history: [], messages: [], schools: [], conversations: [], activeConversationId: '' }
}

export function readDeviceAgent(): LocalAgentData {
  const fallback = defaultDeviceAgent()
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(deviceAgentKey) || 'null')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback
    const value = parsed as Partial<LocalAgentData>
    const validMessages = (messages: unknown): LocalMessage[] => Array.isArray(messages) ? messages.filter((item): item is LocalMessage => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-40) : []
    const conversations: LocalConversation[] = Array.isArray(value.conversations) ? value.conversations.filter(item => item && typeof item.id === 'string' && typeof item.title === 'string').map(item => ({ id: item.id, title: item.title.slice(0, 80) || '新对话', messages: validMessages(item.messages) })) : []
    if (!conversations.length && validMessages(value.messages).length) conversations.push({ id: 'legacy', title: '之前的对话', messages: validMessages(value.messages) })
    const active = conversations.find(item => item.id === value.activeConversationId) || conversations[0]
    const scores = { ...fallback.scores }
    for (const subject of subjects) {
      const score = value.scores?.[subject]
      if (typeof score === 'number' && Number.isInteger(score) && score >= 1 && score <= 5) scores[subject] = score
    }
    return {
      name: typeof value.name === 'string' ? value.name.slice(0, 60) : '',
      examDate: typeof value.examDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.examDate) ? value.examDate : fallback.examDate,
      school: typeof value.school === 'string' ? value.school.slice(0, 100) : '',
      major: typeof value.major === 'string' ? value.major.slice(0, 100) : '',
      dailyMinutes: typeof value.dailyMinutes === 'number' && value.dailyMinutes >= 30 && value.dailyMinutes <= 720 ? value.dailyMinutes : fallback.dailyMinutes,
      scores,
      taskDate: typeof value.taskDate === 'string' ? value.taskDate : '',
      tasks: Array.isArray(value.tasks) ? value.tasks.filter((item): item is LocalTask => item && typeof item.id === 'string' && subjects.includes(item.subject) && typeof item.title === 'string' && typeof item.minutes === 'number' && typeof item.done === 'boolean').slice(0, 30) : [],
      history: Array.isArray(value.history) ? value.history.filter((item): item is LocalDay => item && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && typeof item.planned === 'number' && typeof item.completed === 'number' && typeof item.minutes === 'number').slice(-90) : [],
      conversations, activeConversationId: active?.id || '', messages: active?.messages || [],
      schools: Array.isArray(value.schools) ? value.schools.filter((item): item is LocalSchool => item && ['id', 'school', 'major', 'year', 'score', 'source', 'notes'].every(key => typeof item[key as keyof LocalSchool] === 'string')).slice(0, 30).map(item => ({ id: item.id.slice(0, 80), school: item.school.slice(0, 100), major: item.major.slice(0, 100), year: item.year.slice(0, 4), score: item.score.slice(0, 10), source: item.source.slice(0, 500), notes: item.notes.slice(0, 1000) })) : [],
    }
  } catch { return fallback }
}

export function saveDeviceAgent(data: LocalAgentData) {
  localStorage.setItem(deviceAgentKey, JSON.stringify({ ...data, conversations: data.conversations.map(item => item.id === data.activeConversationId ? { ...item, messages: data.messages.slice(-40) } : item), tasks: data.tasks.slice(0, 30), history: data.history.slice(-90), messages: data.messages.slice(-40) }))
}

export function summarizeDay(date: string, tasks: LocalTask[]): LocalDay {
  return { date, planned: tasks.length, completed: tasks.filter((task) => task.done).length,
    minutes: tasks.filter((task) => task.done).reduce((total, task) => total + task.minutes, 0) }
}

export function generateDeviceTasks(data: LocalAgentData, date = today()): LocalAgentData {
  const history = data.taskDate && data.taskDate !== date && data.tasks.length
    ? [...data.history.filter((item) => item.date !== data.taskDate), summarizeDay(data.taskDate, data.tasks)].slice(-90)
    : data.history
  const ordered = [...subjects].sort((a, b) => data.scores[a] - data.scores[b])
  const count = Math.min(3, Math.max(1, Math.floor(data.dailyMinutes / 30)))
  const selected = ordered.slice(0, count)
  const allocations = selected.map(() => 25)
  let remaining = data.dailyMinutes - count * 25
  while (remaining >= 5) {
    const target = allocations.reduce((best, minutes, index) => (6 - data.scores[selected[index]]) / minutes > (6 - data.scores[selected[best]]) / allocations[best] ? index : best, 0)
    allocations[target] += 5
    remaining -= 5
  }
  return { ...data, history, taskDate: date, tasks: selected.map((subject, index) => ({
    id: `${date}-${subject}`, subject, title: focus[subject], minutes: allocations[index], done: false,
  })) }
}

function hubSummary() {
  return subjects.map((subject) => {
    try {
      const raw = localStorage.getItem(`${subject}-study-v1-agent-device`)
      if (!raw) return `${labels[subject]}：暂无研习记录`
      const value = JSON.parse(raw) as { records?: Record<string, { checked?: boolean; status?: string; wrong?: boolean; cause?: string; notes?: string }> }
      const records = Object.entries(value.records || {})
      const wrong = records.filter(([, item]) => item?.wrong || item?.status === 'wrong')
      const details = wrong.slice(-5).map(([id, item]) => `${id.slice(0, 60)}：${(item.cause || item.notes || '').slice(0, 100)}`).join('；')
      return `${labels[subject]}：练习 ${records.filter(([, item]) => item?.checked || item?.status).length}，错题 ${wrong.length}${details ? `；近期错题 ${details}` : ''}`
    } catch { return `${labels[subject]}：记录暂不可读取` }
  }).join('\n')
}

export function deviceLearningContext(data: LocalAgentData) {
  const mistake = readMistakeReview('device')
  const mistakes = mistake ? `拾错：共 ${mistake.total} 题，待复习 ${mistake.due} 题，薄弱 ${mistake.weak} 题。近期：${mistake.items.slice(0, 5).map((item) => `${item.subject}/${item.knowledge}：${item.question.slice(0, 120)}；原因 ${item.cause}`).join('；')}` : '拾错：暂无记录'
  const tasks = data.taskDate === today() ? data.tasks.map((task) => `${labels[task.subject]} ${task.title} ${task.minutes} 分钟 ${task.done ? '已完成' : '未完成'}`).join('；') : '今天尚未生成任务'
  const recent = data.history.slice(-7).map((item) => `${item.date} ${item.completed}/${item.planned} 项，${item.minutes} 分钟`).join('；')
  const schools = data.schools.map(item => `${item.school} / ${item.major}；${item.year || '未填年份'}复试线 ${item.score || '未填写'}；来源：${item.source || '未提供，需核验'}；备注：${item.notes}`).join('\n')
  return `姓名：${data.name || '未填写'}；考试日期：${data.examDate}；目标：${data.school || '未定'} ${data.major || ''}；每日可用 ${data.dailyMinutes} 分钟。\n候选院校（用户记录，未核验）：${schools || '暂无'}\n今日任务：${tasks}\n近期任务：${recent || '暂无'}\n${hubSummary()}\n${mistakes}`
}

export async function askDeviceAgent(data: LocalAgentData, question: string, onDelta: (text: string) => void = () => {}): Promise<string> {
  const config = readDeviceModelConfig()
  if (!config) throw new Error('请先在首页的“模型设置”中添加接口')
  if (!navigator.onLine) throw new Error('设备当前离线；学习记录仍可查看，AI 对话需要连接模型')
  const key = readDeviceModelKey()
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key || 'device-no-key'}` }
  const body = { model: config.model, temperature: config.temperature, stream: true,
    messages: [
      { role: 'system', content: `你是中文考研学习助手。仅依据下列本机学习数据给出个性化建议；数据未提供时明确说明，不编造进度。不能直接修改任务或记录；如用户要求修改，请给出建议并让用户在页面中确认。数学用标准 LaTeX 书写。\n${deviceLearningContext(data)}` },
      ...data.messages.slice(-10).map(({ role, content }) => ({ role, content })),
      { role: 'user', content: question },
    ] }
  const url = `${config.base_url}/chat/completions`
  return streamDeviceChat(url, headers, body, onDelta)
}
