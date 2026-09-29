export type User = {
  id: number
  username: string
  email: string
  created_at: string
}

export type SubjectKey = 'math2' | 'english2' | 'politics'

export type SubjectLevel = {
  id?: number
  subject: SubjectKey
  score: number
  weaknesses: string
}

export type StudyProfile = {
  exam_date: string
  school: string
  major: string
  daily_minutes: number
  rest_days: number[]
  subjects: SubjectLevel[]
}

export type StudyTask = {
  id: number
  subject: SubjectKey
  title: string
  minutes: number
  due_date: string
  status: 'pending' | 'completed' | 'skipped'
  priority: number
  sort_order: number
  updated_at: string
}

export type DailyPlan = {
  id: number
  plan_type: string
  start_date: string
  end_date: string
  status: string
  rationale: string
  version: number
  total_minutes: number
  completed_minutes: number
  tasks: StudyTask[]
}

export type WeeklyPlan = DailyPlan

export type StagePhase = {
  id: number
  sort_order: number
  title: string
  start_date: string
  end_date: string
  math_focus: string
  english_focus: string
  politics_focus: string
  updated_at: string
}

export type StagePlan = {
  id: number
  start_date: string
  end_date: string
  exam_date: string
  status: string
  version: number
  rationale: string
  phases: StagePhase[]
}

export type StagePhaseUpdate = Pick<StagePhase, 'math_focus' | 'english_focus' | 'politics_focus'>

export type Difficulty = 'too_hard' | 'time_short' | 'low_energy' | 'other'

export type CheckinResult = {
  checkin: {
    id: number
    task_id: number
    completed: boolean
    actual_minutes: number
    difficulty: Difficulty | null
    note: string
    updated_at: string
  }
  task: StudyTask
}

export type WeeklyReview = {
  id: number
  period_start: string
  period_end: string
  metrics: {
    planned_tasks: number
    completed_tasks: number
    completion_rate: number
    planned_minutes: number
    actual_minutes: number
    subject_minutes: Record<string, number>
    incomplete_reasons: Record<string, number>
  }
  content: string
  updated_at: string
}

export type ModelProviderName = 'openai_compatible' | 'ollama'

export type ModelConfig = {
  provider: ModelProviderName
  base_url: string
  model: string
  embedding_model: string
  temperature: number
  has_api_key: boolean
  api_key_masked: string
}

export type ModelConfigInput = {
  provider: ModelProviderName
  base_url: string
  model: string
  embedding_model: string
  temperature: number
  api_key?: string
  clear_api_key?: boolean
}

export type ModelHealth = { ok: boolean; message: string; latency_ms: number }
export type ModelProfile = ModelConfig & { id: string; name: string }
export type ModelProfiles = { version: number; active_id: string; items: ModelProfile[] }
export type ModelProfileInput = ModelConfigInput & { id?: string; name: string; expected_version: number }

export type AgentReply = {
  conversation_id: number
  answer: string
  intent: 'plan_query' | 'profile_query' | 'review_query' | 'school_query' | 'practice_query' | 'document_query' | 'study_advice' | 'general'
  used_tools: string[]
}

export type AgentSubject = 'auto' | SubjectKey | 'cs408'
export type AgentAnswerMode = 'concise' | 'step_by_step'

export type HubProgress = Partial<Record<SubjectKey | 'cs408', {
  practiced: number
  wrong: number
  due: number
  wrong_ids: string[]
  wrong_items: { id: string; answer: string; cause: string; notes: string }[]
  custom_mistakes: { title: string; source: string; detail: string; review: string }[]
}>>

export type MistakeReviewProgress = {
  total: number
  due: number
  weak: number
  items: { subject: string; module: string; knowledge: string; cause: string; question: string; my_answer: string; answer: string; explanation: string; next_review: string; mastery: number }[]
}

export type AppDataId = 'study-hub' | 'mistake-review' | 'agent-schedule'
export type AppSnapshot = { app_id: AppDataId; version: number; updated_at: string; data: Record<string, string> }

export type AgentAction = {
  id: number
  task_id: number
  action: 'complete_task' | 'create_task' | 'resize_task'
  status: 'pending' | 'applied' | 'cancelled' | 'expired'
  preview: string
  created_at: string
  expires_at: string
  confirmed_at: string | null
}

export type SchoolCandidate = {
  id: number
  school: string
  major: string
  year: number | null
  score_line: number | null
  source: string
  note: string
  created_at: string
  updated_at: string
}

export type SchoolCandidateInput = Omit<SchoolCandidate, 'id' | 'created_at' | 'updated_at'>

export type AgentConversation = {
  id: number
  title: string
  updated_at: string
  message_count: number
}

export type AgentConversationMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
  used_tools: string[]
  created_at: string
}

export type AgentConversationDetail = AgentConversation & { summary: string; messages: AgentConversationMessage[] }

export type KnowledgeDocument = {
  id: number
  filename: string
  mime_type: string
  size_bytes: number
  status: 'processing' | 'ready' | 'failed'
  page_count: number
  chunk_count: number
  error_message: string
  created_at: string
}

export type RagSource = {
  document_id: number
  filename: string
  page: number | null
  excerpt: string
  distance: number
}

export type RagReply = { answer: string; sources: RagSource[] }

export type QuizQuestion = {
  stem: string
  options: string[]
  answer_index: number | null
  explanation: string | null
  selected_index: number | null
  feedback: { category: QuizFeedbackCategory; note: string } | null
}

export type QuizFeedbackCategory = 'wrong_answer' | 'unclear' | 'ambiguous' | 'outdated' | 'other'

export type Quiz = {
  id: number
  subject: SubjectKey
  topic: string
  created_at: string
  submitted_at: string | null
  score: number | null
  total: number
  questions: QuizQuestion[]
}

export type QuizPerformance = {
  subject: SubjectKey
  submitted_quizzes: number
  correct_answers: number
  total_questions: number
  accuracy: number
}

export type QuizTopicPerformance = QuizPerformance & { topic: string }

export type QuizAnalysis = {
  submitted_quizzes: number
  correct_answers: number
  total_questions: number
  accuracy: number
  subjects: QuizPerformance[]
  topics: QuizTopicPerformance[]
  weak_topics: QuizTopicPerformance[]
  recommendation: string
}

type AuthResponse = {
  access_token: string
  token_type: string
  user: User
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string | Array<{ msg: string }> } | null
    const detail = Array.isArray(payload?.detail)
      ? payload.detail.map((item) => item.msg).join('；')
      : payload?.detail
    throw new ApiError(response.status, detail ?? '请求失败，请稍后重试')
  }
  return response.json() as Promise<T>
}

export function register(username: string, email: string, password: string): Promise<AuthResponse> {
  return request('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) })
}

export function login(account: string, password: string): Promise<AuthResponse> {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify({ account, password }) })
}

export function getCurrentUser(token: string): Promise<User> {
  return request('/api/auth/me', {}, token)
}

export function updateCurrentUser(token: string, input: Pick<User, 'username' | 'email'>): Promise<AuthResponse> {
  return request('/api/auth/me', { method: 'PUT', body: JSON.stringify(input) }, token)
}

export function getProfile(token: string): Promise<StudyProfile> {
  return request('/api/profile', {}, token)
}

export function saveProfile(token: string, profile: StudyProfile): Promise<StudyProfile> {
  const payload = {
    ...profile,
    subjects: profile.subjects.map(({ subject, score, weaknesses }) => ({ subject, score, weaknesses })),
  }
  return request('/api/profile', { method: 'PUT', body: JSON.stringify(payload) }, token)
}

export function getTodayPlan(token: string): Promise<DailyPlan> {
  return request('/api/plans/today', {}, token)
}

export function getCurrentWeekPlan(token: string): Promise<WeeklyPlan> {
  return request('/api/plans/week', {}, token)
}

export function generateCurrentWeekPlan(token: string, regenerate = false): Promise<WeeklyPlan> {
  return request('/api/plans/week/generate', {
    method: 'POST',
    body: JSON.stringify({ regenerate }),
  }, token)
}

export function getStagePlan(token: string): Promise<StagePlan> {
  return request('/api/plans/stages', {}, token)
}

export function generateStagePlan(token: string, regenerate = false): Promise<StagePlan> {
  return request('/api/plans/stages/generate', {
    method: 'POST',
    body: JSON.stringify({ regenerate }),
  }, token)
}

export function updateStagePhase(token: string, phaseId: number, update: StagePhaseUpdate): Promise<StagePhase> {
  return request(`/api/plans/stages/${phaseId}`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  }, token)
}

export function generateTodayPlan(token: string, regenerate = false): Promise<DailyPlan> {
  return request('/api/plans/generate', {
    method: 'POST',
    body: JSON.stringify({ regenerate }),
  }, token)
}

export function updateTask(
  token: string,
  taskId: number,
  update: Partial<Pick<StudyTask, 'title' | 'minutes' | 'status' | 'priority'>>,
): Promise<StudyTask> {
  return request(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  }, token)
}

export function createTodayTask(
  token: string,
  task: Pick<StudyTask, 'subject' | 'title' | 'minutes'>,
): Promise<StudyTask> {
  return request('/api/plans/today/tasks', { method: 'POST', body: JSON.stringify(task) }, token)
}

export async function deleteTask(token: string, taskId: number): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/tasks/${taskId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string } | null
    throw new ApiError(response.status, payload?.detail ?? '任务删除失败')
  }
}

export function recordCheckin(
  token: string,
  payload: {
    task_id: number
    completed: boolean
    actual_minutes: number
    difficulty?: Difficulty
    note?: string
  },
): Promise<CheckinResult> {
  return request('/api/checkins', { method: 'POST', body: JSON.stringify(payload) }, token)
}

export function getCheckinStreak(token: string): Promise<{ days: number }> {
  return request('/api/checkins/streak', {}, token)
}

export function adjustNextDayPlan(token: string, regenerate = false): Promise<DailyPlan> {
  return request('/api/plans/adjust-next-day', {
    method: 'POST',
    body: JSON.stringify({ regenerate }),
  }, token)
}

export function getNextDayPlan(token: string): Promise<DailyPlan> {
  return request('/api/plans/next-day', {}, token)
}

export function createWeeklyReview(token: string): Promise<WeeklyReview> {
  return request('/api/reviews/weekly', { method: 'POST', body: '{}' }, token)
}

export function getWeeklyReview(token: string): Promise<WeeklyReview> {
  return request('/api/reviews/weekly', {}, token)
}

export function createDailyReview(token: string): Promise<WeeklyReview> {
  return request('/api/reviews/daily', { method: 'POST', body: '{}' }, token)
}

export function getDailyReview(token: string): Promise<WeeklyReview> {
  return request('/api/reviews/daily', {}, token)
}

export function getModelConfig(token: string): Promise<ModelConfig> {
  return request('/api/model-config', {}, token)
}

export function getModelProfiles(token: string): Promise<ModelProfiles> {
  return request('/api/model-config/profiles', {}, token)
}

export function saveModelProfile(token: string, input: ModelProfileInput): Promise<ModelProfiles> {
  return request('/api/model-config/profiles', { method: 'POST', body: JSON.stringify(input) }, token)
}

export function activateModelProfile(token: string, id: string, expectedVersion: number): Promise<ModelProfiles> {
  return request(`/api/model-config/profiles/${encodeURIComponent(id)}/activate`, { method: 'PUT', body: JSON.stringify({ expected_version: expectedVersion }) }, token)
}

export function deleteModelProfile(token: string, id: string, expectedVersion: number): Promise<ModelProfiles> {
  return request(`/api/model-config/profiles/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ expected_version: expectedVersion }) }, token)
}

export function getAppSnapshot(token: string, appId: AppDataId): Promise<AppSnapshot> {
  return request(`/api/app-data/${appId}`, {}, token)
}

export function saveAppSnapshot(token: string, appId: AppDataId, expectedVersion: number, data: Record<string, string>): Promise<AppSnapshot> {
  return request(`/api/app-data/${appId}`, { method: 'PUT', body: JSON.stringify({ expected_version: expectedVersion, data }) }, token)
}

export function saveModelConfig(token: string, config: ModelConfigInput): Promise<ModelConfig> {
  return request('/api/model-config', { method: 'PUT', body: JSON.stringify(config) }, token)
}

export function testModelConfig(token: string): Promise<ModelHealth> {
  return request('/api/model-config/test', { method: 'POST', body: '{}' }, token)
}

export function chatWithAgent(token: string, message: string, conversationId: number | null): Promise<AgentReply> {
  return request('/api/agent/chat', { method: 'POST', body: JSON.stringify({ message, conversation_id: conversationId }) }, token)
}

export function getAgentActions(token: string): Promise<AgentAction[]> {
  return request('/api/agent/actions', {}, token)
}

export function previewAgentAction(token: string, message: string): Promise<AgentAction> {
  return request('/api/agent/actions/preview', { method: 'POST', body: JSON.stringify({ message }) }, token)
}

export function confirmAgentAction(token: string, id: number): Promise<StudyTask> {
  return request(`/api/agent/actions/${id}/confirm`, { method: 'POST', body: '{}' }, token)
}

export function cancelAgentAction(token: string, id: number): Promise<AgentAction> {
  return request(`/api/agent/actions/${id}/cancel`, { method: 'POST', body: '{}' }, token)
}

export async function streamChatWithAgent(
  token: string,
  message: string,
  conversationId: number | null,
  onDelta: (text: string, reset?: boolean) => void,
  hubProgress: HubProgress = {},
  mistakeReview: MistakeReviewProgress | null = null,
  subject: AgentSubject = 'auto',
  answerMode: AgentAnswerMode = 'concise',
): Promise<AgentReply> {
  const response = await fetch(`${apiBaseUrl}/api/agent/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversation_id: conversationId, subject, answer_mode: answerMode, hub_progress: hubProgress, mistake_review: mistakeReview }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string } | null
    throw new ApiError(response.status, payload?.detail ?? '对话请求失败')
  }
  if (!response.body) throw new Error('浏览器不支持流式回答')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let answer = ''
  let intent: AgentReply['intent'] = 'general'
  let usedTools: string[] = []
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n')
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const event = block.split('\n').find((line) => line.startsWith('event: '))?.slice(7)
        const raw = block.split('\n').find((line) => line.startsWith('data: '))?.slice(6)
        if (event && raw) {
          const data = JSON.parse(raw) as Record<string, unknown>
          if (event === 'meta') {
            intent = data.intent as AgentReply['intent']
            usedTools = data.used_tools as string[]
          } else if (event === 'delta') {
            const text = String(data.text ?? '')
            answer += text
            onDelta(text)
          } else if (event === 'reset') {
            answer = ''
            onDelta('', true)
          } else if (event === 'error') {
            throw new Error(String(data.message ?? '模型回答失败'))
          } else if (event === 'done') {
            return { conversation_id: Number(data.conversation_id), answer: answer.trim(), intent, used_tools: usedTools }
          }
        }
        boundary = buffer.indexOf('\n\n')
      }
      if (done) break
    }
    throw new Error('回答连接中断，请重试')
  } finally {
    reader.releaseLock()
  }
}

export function getAgentConversations(token: string): Promise<AgentConversation[]> {
  return request('/api/agent/conversations', {}, token)
}

export function createAgentConversation(token: string): Promise<AgentConversation> {
  return request('/api/agent/conversations', { method: 'POST' }, token)
}
export function renameAgentConversation(token: string, id: number, title: string): Promise<AgentConversation> {
  return request(`/api/agent/conversations/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }, token)
}
export async function deleteAgentConversations(token: string, ids: number[]): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/agent/conversations/delete-many`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ids }) })
  if (!response.ok) throw new Error('删除失败，列表可能已变化，请刷新后重试')
}

export function getAgentConversation(token: string, id: number): Promise<AgentConversationDetail> {
  return request(`/api/agent/conversations/${id}`, {}, token)
}

export async function deleteAgentConversation(token: string, id: number): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/agent/conversations/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string } | null
    throw new ApiError(response.status, payload?.detail ?? '会话删除失败')
  }
}

export function getSchoolCandidates(token: string): Promise<SchoolCandidate[]> {
  return request('/api/schools', {}, token)
}

export function saveSchoolCandidate(token: string, candidate: SchoolCandidateInput, id?: number): Promise<SchoolCandidate> {
  return request(`/api/schools${id === undefined ? '' : `/${id}`}`, {
    method: id === undefined ? 'POST' : 'PUT',
    body: JSON.stringify(candidate),
  }, token)
}

export async function deleteSchoolCandidate(token: string, id: number): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/schools/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string } | null
    throw new ApiError(response.status, payload?.detail ?? '候选院校删除失败')
  }
}

export function getDocuments(token: string): Promise<KnowledgeDocument[]> {
  return request('/api/documents', {}, token)
}

export function getQuizzes(token: string): Promise<Quiz[]> {
  return request('/api/quizzes', {}, token)
}

export function getQuizAnalysis(token: string): Promise<QuizAnalysis> {
  return request('/api/quizzes/analysis', {}, token)
}

export function generateQuiz(token: string, subject: SubjectKey, topic: string): Promise<Quiz> {
  return request('/api/quizzes', { method: 'POST', body: JSON.stringify({ subject, topic }) }, token)
}

export function submitQuiz(token: string, quizId: number, answers: number[]): Promise<Quiz> {
  return request(`/api/quizzes/${quizId}/submit`, { method: 'POST', body: JSON.stringify({ answers }) }, token)
}

export function saveQuizFeedback(
  token: string,
  quizId: number,
  questionIndex: number,
  category: QuizFeedbackCategory,
  note: string,
): Promise<Quiz> {
  return request(`/api/quizzes/${quizId}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ question_index: questionIndex, category, note }),
  }, token)
}

export async function uploadDocument(token: string, file: File): Promise<KnowledgeDocument> {
  const body = new FormData()
  body.append('file', file)
  const response = await fetch(`${apiBaseUrl}/api/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string } | null
    throw new ApiError(response.status, payload?.detail ?? '资料上传失败')
  }
  return response.json() as Promise<KnowledgeDocument>
}

export async function deleteDocument(token: string, documentId: number): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/documents/${documentId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string } | null
    throw new ApiError(response.status, payload?.detail ?? '资料删除失败')
  }
}

export function queryKnowledge(token: string, question: string): Promise<RagReply> {
  return request('/api/rag/query', {
    method: 'POST',
    body: JSON.stringify({ question, top_k: 4 }),
  }, token)
}
