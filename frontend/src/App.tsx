import { type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getHealth } from './api/health'
import {
  ApiError,
  cancelAgentAction,
  confirmAgentAction,
  adjustNextDayPlan,
  streamChatWithAgent,
  createDailyReview,
  createTodayTask,
  deleteAgentConversation,
  deleteTask,
  createWeeklyReview,
  deleteDocument,
  generateTodayPlan,
  generateCurrentWeekPlan,
  generateStagePlan,
  getCurrentUser,
  getCheckinStreak,
  getAgentConversations,
  getAgentActions,
  getAppSnapshot,
  saveAppSnapshot,
  getDocuments,
  getDailyReview,
  getModelConfig,
  getModelProfiles,
  getNextDayPlan,
  getProfile,
  getTodayPlan,
  getCurrentWeekPlan,
  getStagePlan,
  getWeeklyReview,
  login,
  previewAgentAction,
  recordCheckin,
  register,
  queryKnowledge,
  saveProfile,
  saveModelProfile,
  activateModelProfile,
  deleteModelProfile,
  testModelConfig,
  uploadDocument,
  updateCurrentUser,
  updateTask,
  updateStagePhase,
  type DailyPlan,
  type AgentReply,
  type AgentSubject,
  type AgentAnswerMode,
  type Difficulty,
  type HubProgress,
  type ModelConfig,
  type ModelProfileInput,
  type ModelProfiles,
  type ModelHealth,
  type KnowledgeDocument,
  type RagReply,
  type StudyProfile,
  type StudyTask,
  type StagePhaseUpdate,
  type StagePlan,
  type SubjectKey,
  type User,
  type WeeklyReview,
  type WeeklyPlan,
} from './api/client'
import ModelSettings from './components/ModelSettings'
import AssistantPanel from './components/AssistantPanel'
import KnowledgePanel from './components/KnowledgePanel'
import ReviewPanel from './components/ReviewPanel'
import TaskBoard from './components/TaskBoard'
import SchoolsPanel from './components/SchoolsPanel'
import WeekPlanPanel from './components/WeekPlanPanel'
import StagePlanPanel from './components/StagePlanPanel'
import QuizPanel from './components/QuizPanel'
import PersonalCenter from './components/PersonalCenter'
import DeviceHome from './components/DeviceHome'
import DeviceAgent from './components/DeviceAgent'
import DeviceScheduleSettings from './components/DeviceScheduleSettings'
import ThemeButton from './components/ThemeButton'
import StudyIcon from './components/StudyIcon'
import { daysUntil, localDate, validScheduleEvent, type ScheduleEvent } from './deviceSchedule'
import { Capacitor } from '@capacitor/core'
import { readMistakeReview } from './mistakeReview'
import './styles.css'

type Screen = 'loading' | 'mode' | 'device' | 'device-agent' | 'unavailable' | 'auth' | 'profile' | 'dashboard' | 'settings' | 'account'
type AuthMode = 'login' | 'register'
type RunMode = 'choose' | 'lan' | 'device'
const runModeKey = 'kaoyan-agent-run-mode-v1'

const widgetIds = ['welcome', 'countdown', 'target', 'subjects', 'schools', 'tasks', 'week', 'stages', 'quiz', 'review', 'knowledge', 'assistant'] as const
type WidgetId = typeof widgetIds[number]
const workspaceViews = {
  overview: { label: '总览', title: '今天，从这里开始', description: '看看目标，安排今天的学习，再进入你的研习室。', widgets: ['welcome', 'countdown', 'target', 'subjects', 'tasks'] },
  plans: { label: '学习计划', title: '让每一天都有方向', description: '从今日任务到阶段目标，把学习安排在自己的节奏里。', widgets: ['tasks', 'week', 'stages', 'schools'] },
  practice: { label: '练习与复盘', title: '把练习变成进步', description: '用小测检查掌握情况，再从复盘中找到下一步。', widgets: ['quiz', 'review'] },
  knowledge: { label: '资料库', title: '你的学习资料', description: '整理教材与笔记，围绕自己的资料提问。', widgets: ['knowledge'] },
  schools: { label: '候选院校', title: '找到适合自己的目标', description: '记录院校、专业与资料来源，再结合自己的基础比较选择。', widgets: ['schools'] },
  assistant: { label: 'Agent 对话', title: '一起梳理学习思路', description: '结合学习记录、错题与目标，和 Agent 讨论下一步。', widgets: ['assistant'] },
  all: { label: '查看全部', title: '全部学习模块', description: '所有工具集中在这里，也可以按你的习惯拖动排序。', widgets: [...widgetIds] },
} satisfies Record<string, { label: string; title: string; description: string; widgets: readonly WidgetId[] }>
type WorkspaceView = keyof typeof workspaceViews
const widgetNames: Record<WidgetId, string> = {
  welcome: '今日学习', countdown: '考试倒计时', target: '考试目标', subjects: '三科基础',
  schools: '择校候选', tasks: '今日任务', week: '本周计划', stages: '阶段计划',
  quiz: '模拟测试', review: '学习复盘', knowledge: '个人资料库', assistant: '学习 Agent',
}

function savedWidgetOrder(userId: number): WidgetId[] {
  try {
    const saved = JSON.parse(localStorage.getItem(`kaoyan-widget-order-${userId}`) ?? '[]') as unknown
    if (Array.isArray(saved) && saved.length === widgetIds.length && widgetIds.every((id) => saved.includes(id))) {
      return saved as WidgetId[]
    }
  } catch { /* Invalid saved layout falls back to the default order. */ }
  return [...widgetIds]
}

function readHubProgress(userId: number, source?: Record<string, string>): HubProgress {
  const progress: HubProgress = {}
  for (const subject of ['math2', 'english2', 'politics', 'cs408'] as const) {
    try {
      const key = `${subject}-study-v1-agent-${userId}`
      const raw = source ? source[key] : localStorage.getItem(key)
      if (!raw) continue
      const stored = JSON.parse(raw) as {
        records?: Record<string, { checked?: boolean; status?: string; wrong?: boolean; due?: number; answer?: string; cause?: string; notes?: string }>
        customMistakes?: { title?: string; source?: string; detail?: string; review?: string }[]
      }
      if (!stored.records || typeof stored.records !== 'object' || Array.isArray(stored.records)) continue
      const records = Object.entries(stored.records).filter(([, record]) => record && typeof record === 'object')
      const wrong = records.filter(([, record]) => record.wrong === true || record.status === 'wrong')
      const field = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
      progress[subject] = {
        practiced: records.filter(([, record]) => record.checked === true || Boolean(record.status)).length,
        wrong: wrong.length,
        due: records.filter(([, record]) => typeof record.due === 'number' && record.due <= Date.now()).length,
        wrong_ids: wrong.slice(0, 20).map(([id]) => id),
        wrong_items: wrong.slice(-10).reverse().map(([id, record]) => ({
          id: id.slice(0, 80), answer: field(record.answer, 160), cause: field(record.cause, 80), notes: field(record.notes, 300),
        })),
        custom_mistakes: (Array.isArray(stored.customMistakes) ? stored.customMistakes : []).slice(-5).reverse()
          .filter((item) => item && typeof item === 'object' && typeof item.title === 'string' && typeof item.detail === 'string')
          .map((item) => ({ title: field(item.title, 160), source: field(item.source, 100), detail: field(item.detail, 400), review: field(item.review, 400) })),
      }
    } catch { /* Invalid local records are ignored; the study hub keeps its own recovery warning. */ }
  }
  return progress
}

const tokenKey = 'kaoyan-agent-token-v1'
const subjectNames: Record<SubjectKey, string> = {
  math2: '数学二',
  english2: '英语二',
  politics: '政治',
}

function defaultProfile(): StudyProfile {
  const year = new Date().getFullYear()
  const examYear = new Date().toLocaleDateString('sv-SE') < `${year}-12-19` ? year : year + 1
  return {
    exam_date: `${examYear}-12-19`,
    school: '',
    major: '',
    daily_minutes: 360,
    rest_days: [6],
    subjects: [
      { subject: 'math2', score: 2, weaknesses: '' },
      { subject: 'english2', score: 2, weaknesses: '' },
      { subject: 'politics', score: 1, weaknesses: '' },
    ],
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [runMode, setRunMode] = useState<RunMode>(() => {
    if (Capacitor.isNativePlatform()) return 'device'
    const saved = localStorage.getItem(runModeKey)
    return saved === 'lan' || saved === 'device' ? saved : 'choose'
  })
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [apiOnline, setApiOnline] = useState(true)
  const [lanMode, setLanMode] = useState(false)
  const [token, setToken] = useState(() => localStorage.getItem(tokenKey) ?? '')
  const [user, setUser] = useState<User | null>(null)
  const [accountBusy, setAccountBusy] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [accountNotice, setAccountNotice] = useState('')
  const [profileReturnToAccount, setProfileReturnToAccount] = useState(false)
  const [profileSnapshot, setProfileSnapshot] = useState<StudyProfile | null>(null)
  const [settingsReturn, setSettingsReturn] = useState<'dashboard' | 'account'>('dashboard')
  const [widgetOrder, setWidgetOrder] = useState<WidgetId[]>([...widgetIds])
  const [editingLayout, setEditingLayout] = useState(false)
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('overview')
  const [draggingWidget, setDraggingWidget] = useState<WidgetId | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: WidgetId; after: boolean } | null>(null)
  const [layoutMessage, setLayoutMessage] = useState('')
  const dragStart = useRef<{ id: WidgetId; x: number; y: number } | null>(null)
  const currentDrop = useRef<{ id: WidgetId; after: boolean } | null>(null)
  const dragPointer = useRef<{ x: number; y: number } | null>(null)
  const dragElement = useRef<HTMLDivElement | null>(null)
  const scrollTimer = useRef<number | null>(null)
  const previousWidgetRects = useRef<Map<string, DOMRect> | null>(null)
  const [profile, setProfile] = useState<StudyProfile>(defaultProfile)
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([])
  const [scheduleVersion, setScheduleVersion] = useState<number | null>(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [currentDate, setCurrentDate] = useState(localDate)
  const [plan, setPlan] = useState<DailyPlan | null>(null)
  const [streakDays, setStreakDays] = useState(0)
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan | null>(null)
  const [stagePlan, setStagePlan] = useState<StagePlan | null>(null)
  const [nextPlan, setNextPlan] = useState<DailyPlan | null>(null)
  const [review, setReview] = useState<WeeklyReview | null>(null)
  const [dailyReview, setDailyReview] = useState<WeeklyReview | null>(null)
  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null)
  const [modelProfiles, setModelProfiles] = useState<ModelProfiles | null>(null)
  const [modelHealth, setModelHealth] = useState<ModelHealth | null>(null)
  const [modelBusy, setModelBusy] = useState(false)
  const [modelError, setModelError] = useState('')
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [documentBusy, setDocumentBusy] = useState(false)
  const [documentError, setDocumentError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [planBusy, setPlanBusy] = useState(false)
  const [planError, setPlanError] = useState('')
  const [weekBusy, setWeekBusy] = useState(false)
  const [weekError, setWeekError] = useState('')
  const [stageBusy, setStageBusy] = useState(false)
  const [stageError, setStageError] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [reconnectAttempt, setReconnectAttempt] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDate(localDate()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (runMode !== 'lan' || !user || !token) return
    let active = true
    setScheduleVersion(null)
    setScheduleEvents([])
    setScheduleError('')
    void getAppSnapshot(token, 'agent-schedule').then((snapshot) => {
      if (!active) return
      const parsed: unknown = JSON.parse(snapshot.data.events || '[]')
      if (!Array.isArray(parsed) || parsed.some((item) => !validScheduleEvent(item))) throw new Error('账号日程格式不正确，请先保留备份并检查数据')
      setScheduleEvents([...parsed].sort((a, b) => a.date.localeCompare(b.date)))
      setScheduleVersion(snapshot.version)
    }).catch((error: unknown) => {
      if (!active) return
      if (error instanceof ApiError && error.status === 404) setScheduleVersion(0)
      else setScheduleError(error instanceof Error ? error.message : '日程读取失败')
    })
    return () => { active = false }
  }, [runMode, user?.id, token])

  async function saveAccountSchedule(items: ScheduleEvent[]) {
    if (scheduleVersion === null) throw new Error('日程尚未读取完成，请稍后重试')
    try {
      const snapshot = await saveAppSnapshot(token, 'agent-schedule', scheduleVersion, { events: JSON.stringify(items) })
      setScheduleEvents(items)
      setScheduleVersion(snapshot.version)
      setScheduleError('')
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) throw new Error('日程已在另一设备更新，请刷新页面后重试')
      throw error
    }
  }

  useLayoutEffect(() => {
    const previous = previousWidgetRects.current
    previousWidgetRects.current = null
    if (!previous || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    document.querySelectorAll<HTMLElement>('.dashboard-widget[data-widget-id]').forEach((element) => {
      const before = previous.get(element.dataset.widgetId ?? '')
      if (!before) return
      element.getAnimations().forEach((animation) => animation.cancel())
      const after = element.getBoundingClientRect()
      const dx = before.left - after.left
      const dy = before.top - after.top
      if (Math.abs(dx) + Math.abs(dy) < 2) return
      element.animate(
        [{ transform: `translate3d(${dx}px, ${dy}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }],
        { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      )
    })
  }, [widgetOrder])

  useEffect(() => {
    async function initialize() {
      if (runMode === 'choose') { setScreen('mode'); return }
      if (runMode === 'device') {
        if (Capacitor.isNativePlatform()) localStorage.setItem(runModeKey, 'device')
        setScreen('device'); return
      }
      try {
        const health = await getHealth()
        setApiOnline(true)
        setLanMode(Boolean(health.lan_mode))
      } catch {
        setApiOnline(false)
        setScreen(token ? 'unavailable' : 'auth')
        return
      }
      if (!token) {
        setScreen('auth')
        return
      }
      try {
        const profileRequest = getProfile(token).catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404) return null
          throw error
        })
        const planRequest = getTodayPlan(token).catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404) return null
          throw error
        })
        const weeklyPlanRequest = getCurrentWeekPlan(token).catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404) return null
          throw error
        })
        const stagePlanRequest = getStagePlan(token).catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404) return null
          throw error
        })
        const nextPlanRequest = getNextDayPlan(token).catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404) return null
          throw error
        })
        const reviewRequest = getWeeklyReview(token).catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404) return null
          throw error
        })
        const dailyReviewRequest = getDailyReview(token).catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404) return null
          throw error
        })
        const modelConfigRequest = getModelConfig(token).catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404) return null
          throw error
        })
        const [currentUser, currentProfile, currentPlan, currentWeeklyPlan, currentStagePlan, currentNextPlan, currentReview, currentDailyReview, currentModelConfig, currentModelProfiles, currentDocuments, currentStreak] = await Promise.all([
          getCurrentUser(token),
          profileRequest,
          planRequest,
          weeklyPlanRequest,
          stagePlanRequest,
          nextPlanRequest,
          reviewRequest,
          dailyReviewRequest,
          modelConfigRequest,
          getModelProfiles(token),
          getDocuments(token),
          getCheckinStreak(token),
        ])
        setUser(currentUser)
        setPlan(currentPlan)
        setStreakDays(currentStreak.days)
        setWeeklyPlan(currentWeeklyPlan)
        setStagePlan(currentStagePlan)
        setNextPlan(currentNextPlan)
        setReview(currentReview)
        setDailyReview(currentDailyReview)
        setModelConfig(currentModelConfig)
        setModelProfiles(currentModelProfiles)
        setDocuments(currentDocuments)
        if (currentProfile === null) setScreen('profile')
        else {
          setProfile(currentProfile)
          setScreen((current) => current === 'account' ? 'account' : window.location.search.includes('settings=1') ? 'settings' : 'dashboard')
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          localStorage.removeItem(tokenKey)
          setToken('')
          setScreen('auth')
        } else {
          setApiOnline(false)
          setScreen('unavailable')
        }
      }
    }
    void initialize()
  }, [token, reconnectAttempt, runMode])

  function chooseRunMode(mode: RunMode) {
    if (mode === 'choose') localStorage.removeItem(runModeKey)
    else localStorage.setItem(runModeKey, mode)
    setScreen('loading')
    setRunMode(mode)
  }

  useEffect(() => {
    if (user) setWidgetOrder(savedWidgetOrder(user.id))
  }, [user?.id])

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('')
    setSubmitting(true)
    const form = new FormData(event.currentTarget)
    try {
      const result = authMode === 'register'
        ? await register(String(form.get('username')), String(form.get('email')), String(form.get('password')))
        : await login(String(form.get('account')), String(form.get('password')))
      localStorage.setItem(tokenKey, result.access_token)
      setUser(result.user)
      setToken(result.access_token)
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('')
    setSubmitting(true)
    try {
      const saved = await saveProfile(token, profile)
      setProfile(saved)
      setProfileSnapshot(null)
      if (stagePlan !== null && stagePlan.exam_date !== saved.exam_date) setStagePlan(null)
      setScreen(profileReturnToAccount ? 'account' : 'dashboard')
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  function updateSubject(subject: SubjectKey, field: 'score' | 'weaknesses', value: number | string) {
    setProfile((current) => ({
      ...current,
      subjects: current.subjects.map((item) => item.subject === subject ? { ...item, [field]: value } : item),
    }))
  }

  function toggleRestDay(day: number) {
    setProfile((current) => ({
      ...current,
      rest_days: current.rest_days.includes(day)
        ? current.rest_days.filter((item) => item !== day)
        : [...current.rest_days, day],
    }))
  }

  function logout() {
    localStorage.removeItem(tokenKey)
    setToken('')
    setUser(null)
    setProfile(defaultProfile())
    setProfileSnapshot(null)
    setProfileReturnToAccount(false)
    setAccountError('')
    setAccountNotice('')
    setPlan(null)
    setStreakDays(0)
    setWeeklyPlan(null)
    setStagePlan(null)
    setNextPlan(null)
    setReview(null)
    setDailyReview(null)
    setModelConfig(null)
    setModelProfiles(null)
    setModelHealth(null)
    setModelError('')
    setDocuments([])
    setDocumentError('')
    setEditingLayout(false)
    setScreen('auth')
  }

  async function handleSaveAccount(input: Pick<User, 'username' | 'email'>) {
    setAccountError('')
    setAccountNotice('')
    setAccountBusy(true)
    try {
      const result = await updateCurrentUser(token, input)
      localStorage.setItem(tokenKey, result.access_token)
      setToken(result.access_token)
      setUser(result.user)
      setAccountNotice('账号信息已保存')
    } catch (error) {
      setAccountError(errorMessage(error))
    } finally {
      setAccountBusy(false)
    }
  }

  function openSettings(from: 'dashboard' | 'account' = 'dashboard') {
    setSettingsReturn(from)
    setModelError('')
    setModelHealth(null)
    setScreen('settings')
  }

  function openProfile(fromAccount: boolean) {
    setNotice('')
    setAccountNotice('')
    setAccountError('')
    setProfileReturnToAccount(fromAccount)
    setProfileSnapshot(profile)
    setScreen('profile')
  }

  function closeProfile() {
    if (profileSnapshot === null) {
      logout()
      return
    }
    setProfile(profileSnapshot)
    setProfileSnapshot(null)
    setNotice('')
    setScreen(profileReturnToAccount ? 'account' : 'dashboard')
  }

  function moveWidget(id: WidgetId, position: number) {
    const next = widgetOrder.filter((item) => item !== id)
    next.splice(position, 0, id)
    if (next.every((item, index) => item === widgetOrder[index])) return
    previousWidgetRects.current = new Map(
      [...document.querySelectorAll<HTMLElement>('.dashboard-widget[data-widget-id]')]
        .map((element) => [element.dataset.widgetId ?? '', element.getBoundingClientRect()]),
    )
    setWidgetOrder(next)
    if (user) localStorage.setItem(`kaoyan-widget-order-${user.id}`, JSON.stringify(next))
    setLayoutMessage(`已将${widgetNames[id]}移至第 ${next.indexOf(id) + 1} 位`)
  }

  function updateDrop(x: number, y: number) {
    const source = dragStart.current?.id
    const element = document.elementsFromPoint(x, y)
      .map((hit) => hit.closest<HTMLElement>('.dashboard-widget[data-widget-id]'))
      .find((item) => item && item.dataset.widgetId !== source)
    const id = element?.dataset.widgetId as WidgetId | undefined
    if (!element || !id || id === source || !widgetIds.includes(id)) {
      if (currentDrop.current) {
        currentDrop.current = null
        setDropTarget(null)
      }
      return
    }
    const rect = element.getBoundingClientRect()
    const after = element.classList.contains('compact') ? x > rect.left + rect.width / 2 : y > rect.top + rect.height / 2
    if (currentDrop.current?.id !== id || currentDrop.current.after !== after) {
      currentDrop.current = { id, after }
      setDropTarget(currentDrop.current)
    }
  }

  function startWidgetDrag(event: ReactPointerEvent<HTMLDivElement>, id: WidgetId) {
    if (!editingLayout || event.button !== 0 || (event.target as Element).closest('.widget-order-controls')) return
    dragStart.current = { id, x: event.clientX, y: event.clientY }
    currentDrop.current = null
    dragPointer.current = { x: event.clientX, y: event.clientY }
    dragElement.current = event.currentTarget
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveWidgetDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const start = dragStart.current
    if (!start) return
    if (!draggingWidget && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) return
    if (!draggingWidget && scrollTimer.current === null) {
      setDraggingWidget(start.id)
      scrollTimer.current = window.setInterval(() => {
        const pointer = dragPointer.current
        if (!pointer) return
        const direction = pointer.y < 70 ? -1 : pointer.y > window.innerHeight - 70 ? 1 : 0
        if (direction) {
          window.scrollBy(0, direction * 18)
          updateDrop(pointer.x, pointer.y)
        }
      }, 30)
    }
    dragPointer.current = { x: event.clientX, y: event.clientY }
    if (dragElement.current) dragElement.current.style.transform = `translate3d(${event.clientX - start.x}px, ${event.clientY - start.y}px, 0) scale(1.012)`
    updateDrop(event.clientX, event.clientY)
  }

  function finishWidgetDrag(event: ReactPointerEvent<HTMLDivElement>, commit = true) {
    const source = dragStart.current?.id
    const target = currentDrop.current
    if (commit && source && target) {
      const remaining = widgetOrder.filter((item) => item !== source)
      moveWidget(source, remaining.indexOf(target.id) + (target.after ? 1 : 0))
    }
    dragStart.current = null
    currentDrop.current = null
    dragPointer.current = null
    if (dragElement.current) {
      const moved = dragElement.current.style.transform
      dragElement.current.style.transform = ''
      if ((!commit || !target) && moved && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        dragElement.current.animate(
          [{ transform: moved }, { transform: 'translate3d(0, 0, 0)' }],
          { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        )
      }
    }
    dragElement.current = null
    if (scrollTimer.current !== null) window.clearInterval(scrollTimer.current)
    scrollTimer.current = null
    setDraggingWidget(null)
    setDropTarget(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function applyModelProfiles(next: ModelProfiles) {
    setModelProfiles(next)
    setModelConfig(next.items.find((item) => item.id === next.active_id) ?? null)
  }

  async function handleSaveModelConfig(input: Omit<ModelProfileInput, 'expected_version'>) {
    setModelError('')
    setModelHealth(null)
    setModelBusy(true)
    try {
      if (!modelProfiles) throw new Error('模型列表尚未载入，请重新打开设置')
      const next = await saveModelProfile(token, { ...input, expected_version: modelProfiles.version })
      applyModelProfiles(next)
      return next
    } catch (error) {
      setModelError(errorMessage(error))
      throw error
    } finally {
      setModelBusy(false)
    }
  }

  async function handleSelectModelProfile(id: string) {
    if (!modelProfiles) throw new Error('模型列表尚未载入，请重新打开设置')
    setModelBusy(true)
    setModelError('')
    try { const next = await activateModelProfile(token, id, modelProfiles.version); applyModelProfiles(next); return next }
    catch (error) { setModelError(errorMessage(error)); throw error }
    finally { setModelBusy(false) }
  }

  async function handleDeleteModelProfile(id: string) {
    if (!modelProfiles) throw new Error('模型列表尚未载入，请重新打开设置')
    setModelBusy(true)
    setModelError('')
    try { const next = await deleteModelProfile(token, id, modelProfiles.version); applyModelProfiles(next); return next }
    catch (error) { setModelError(errorMessage(error)); throw error }
    finally { setModelBusy(false) }
  }

  async function handleTestModelConfig() {
    setModelError('')
    setModelHealth(null)
    setModelBusy(true)
    try {
      setModelHealth(await testModelConfig(token))
    } catch (error) {
      setModelError(errorMessage(error))
    } finally {
      setModelBusy(false)
    }
  }

  async function handleGeneratePlan(regenerate = false) {
    setPlanError('')
    setPlanBusy(true)
    try {
      setPlan(await generateTodayPlan(token, regenerate))
    } catch (error) {
      setPlanError(errorMessage(error))
    } finally {
      setPlanBusy(false)
    }
  }

  async function handleGenerateWeeklyPlan(regenerate = false) {
    setWeekError('')
    setWeekBusy(true)
    try {
      setWeeklyPlan(await generateCurrentWeekPlan(token, regenerate))
    } catch (error) {
      setWeekError(errorMessage(error))
    } finally {
      setWeekBusy(false)
    }
  }

  async function handleGenerateStagePlan(regenerate = false) {
    setStageError('')
    setStageBusy(true)
    try {
      setStagePlan(await generateStagePlan(token, regenerate))
    } catch (error) {
      setStageError(errorMessage(error))
    } finally {
      setStageBusy(false)
    }
  }

  async function handleUpdateStagePhase(phaseId: number, update: StagePhaseUpdate) {
    setStageError('')
    setStageBusy(true)
    try {
      const saved = await updateStagePhase(token, phaseId, update)
      setStagePlan((current) => current === null ? current : {
        ...current,
        phases: current.phases.map((phase) => phase.id === saved.id ? saved : phase),
      })
    } catch (error) {
      setStageError(errorMessage(error))
      throw error
    } finally {
      setStageBusy(false)
    }
  }

  async function handleUpdateTask(
    taskId: number,
    update: Partial<Pick<StudyTask, 'title' | 'minutes'>>,
  ) {
    setPlanError('')
    setPlanBusy(true)
    try {
      const saved = await updateTask(token, taskId, update)
      applySavedTask(saved)
    } catch (error) {
      setPlanError(errorMessage(error))
    } finally {
      setPlanBusy(false)
    }
  }

  async function handleCreateTask(task: Pick<StudyTask, 'subject' | 'title' | 'minutes'>): Promise<boolean> {
    setPlanError('')
    setPlanBusy(true)
    try {
      await createTodayTask(token, task)
      setPlan(await getTodayPlan(token))
      return true
    } catch (error) {
      setPlanError(errorMessage(error))
      return false
    } finally {
      setPlanBusy(false)
    }
  }

  async function handleDeleteTask(taskId: number): Promise<void> {
    setPlanError('')
    setPlanBusy(true)
    try {
      await deleteTask(token, taskId)
      setPlan(await getTodayPlan(token))
    } catch (error) {
      setPlanError(errorMessage(error))
    } finally {
      setPlanBusy(false)
    }
  }

  function applySavedTask(saved: StudyTask) {
    setPlan((current) => {
      if (current === null) return current
      const tasks = current.tasks.some((task) => task.id === saved.id)
        ? current.tasks.map((task) => task.id === saved.id ? saved : task)
        : [...current.tasks, saved]
      return {
        ...current,
        tasks,
        total_minutes: tasks.reduce((total, task) => total + task.minutes, 0),
        completed_minutes: tasks.reduce((total, task) => total + (task.status === 'completed' ? task.minutes : 0), 0),
      }
    })
  }

  function refreshStreak() {
    void getCheckinStreak(token).then((result) => setStreakDays(result.days)).catch(() => undefined)
  }

  async function handleCompleteTask(task: StudyTask) {
    setPlanError('')
    setPlanBusy(true)
    try {
      const result = await recordCheckin(token, {
        task_id: task.id,
        completed: true,
        actual_minutes: task.minutes,
        note: '按计划完成',
      })
      applySavedTask(result.task)
      refreshStreak()
    } catch (error) {
      setPlanError(errorMessage(error))
    } finally {
      setPlanBusy(false)
    }
  }

  async function handleRecordDifficulty(
    task: StudyTask,
    difficulty: Difficulty,
    note: string,
    actualMinutes: number,
  ) {
    setPlanError('')
    setPlanBusy(true)
    try {
      const result = await recordCheckin(token, {
        task_id: task.id,
        completed: false,
        actual_minutes: actualMinutes,
        difficulty,
        note,
      })
      applySavedTask(result.task)
      refreshStreak()
    } catch (error) {
      setPlanError(errorMessage(error))
    } finally {
      setPlanBusy(false)
    }
  }

  async function handleAdjustNextDay() {
    setPlanError('')
    setPlanBusy(true)
    try {
      setNextPlan(await adjustNextDayPlan(token, nextPlan !== null))
    } catch (error) {
      setPlanError(errorMessage(error))
    } finally {
      setPlanBusy(false)
    }
  }

  async function handleWeeklyReview() {
    setReviewError('')
    setReviewBusy(true)
    try {
      setReview(await createWeeklyReview(token))
    } catch (error) {
      setReviewError(errorMessage(error))
    } finally {
      setReviewBusy(false)
    }
  }

  async function handleDailyReview() {
    setReviewError('')
    setReviewBusy(true)
    try {
      setDailyReview(await createDailyReview(token))
    } catch (error) {
      setReviewError(errorMessage(error))
    } finally {
      setReviewBusy(false)
    }
  }

  async function handleAgentMessageInConversation(message: string, conversationId: number | null, onDelta: (text: string, reset?: boolean) => void, subject: AgentSubject, answerMode: AgentAnswerMode): Promise<AgentReply> {
    let hubData: Record<string, string> | undefined
    let mistakeData: Record<string, string> | undefined
    if (lanMode && user) {
      const load = async (appId: 'study-hub' | 'mistake-review') => {
        try { return (await getAppSnapshot(token, appId)).data }
        catch (error) { if (error instanceof ApiError && error.status === 404) return {}; throw error }
      }
      const snapshots = await Promise.all([load('study-hub'), load('mistake-review')])
      hubData = snapshots[0]
      mistakeData = snapshots[1]
    }
    return streamChatWithAgent(token, message, conversationId, onDelta, user ? readHubProgress(user.id, hubData) : {}, user ? readMistakeReview(user.id, mistakeData) : null, subject, answerMode)
  }

  async function handleUploadDocument(file: File) {
    setDocumentError('')
    setDocumentBusy(true)
    try {
      const uploaded = await uploadDocument(token, file)
      setDocuments((current) => [uploaded, ...current])
    } catch (error) {
      setDocumentError(errorMessage(error))
    } finally {
      setDocumentBusy(false)
    }
  }

  async function handleDeleteDocument(documentId: number) {
    setDocumentError('')
    setDocumentBusy(true)
    try {
      await deleteDocument(token, documentId)
      setDocuments((current) => current.filter((document) => document.id !== documentId))
    } catch (error) {
      setDocumentError(errorMessage(error))
      throw error
    } finally {
      setDocumentBusy(false)
    }
  }

  async function handleKnowledgeQuestion(question: string): Promise<RagReply> {
    return queryKnowledge(token, question)
  }

  if (screen === 'loading') {
    return <main className="center-screen"><div className="loader" /><p>正在进入研习室…</p></main>
  }

  if (screen === 'mode') {
    return <main className="mode-shell"><ThemeButton className="mode-theme" /><div className="mode-content"><p className="eyebrow">有研在先 · 使用方式</p><h1>选择你的学习方式</h1><p>两种方式使用同一套研习室和拾错副本，但数据不会自动互通；需要换设备时请使用备份文件。</p><div className="mode-options"><button type="button" onClick={() => chooseRunMode('device')}><span>01 / 手机、平板优先</span><strong>本设备独立模式</strong><small>记录保存在此设备；联网并配置兼容接口后，可使用拾错的 AI 功能。需要电脑后端的 Agent 工具会明确标注。</small><b>使用本设备 →</b></button><button type="button" onClick={() => chooseRunMode('lan')}><span>02 / 电脑提供服务</span><strong>电脑局域网模式</strong><small>电脑开机运行 Agent，手机通过同一网络访问；账号、计划、资料与完整 Agent 功能由电脑提供。</small><b>连接电脑 →</b></button></div><p className="mode-footnote">本设备模式首次加载需要网络；浏览器可能清理本机记录，请定期导出备份。选择后随时可以切换。</p></div></main>
  }

  if (screen === 'device') return <DeviceHome onChangeMode={() => chooseRunMode('choose')} onOpenAgent={() => setScreen('device-agent')} />
  if (screen === 'device-agent') return <DeviceAgent onBack={() => setScreen('device')} />

  if (screen === 'unavailable') {
    return <main className="center-screen" role="status">
      <h1>暂时无法连接后端</h1>
      <p>本地服务可能尚未启动。你的登录信息和已保存的学习记录不会因此清除。</p>
      <button type="button" className="primary-button compact" onClick={() => { setScreen('loading'); setReconnectAttempt((value) => value + 1) }}>重新连接</button>
      <button type="button" className="text-button" onClick={() => chooseRunMode('choose')}>切换使用方式</button>
    </main>
  }

  if (screen === 'auth') {
    return <main className="auth-layout">
      <section className="auth-intro">
        <div className="auth-brand"><span className="auth-brand-mark">研</span><span>有研在先</span></div>
        <h1>让每天的努力<br />有清晰的下一步</h1>
        <p>围绕数学二、英语二和政治，建立目标、安排计划，并根据真实完成情况持续调整。</p>
        <div className={`api-status ${apiOnline ? 'online' : 'offline'}`}>
          <span />{apiOnline ? '服务已连接' : '后端未连接，请先启动服务'}
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-header-actions"><button type="button" className="text-button auth-mode-switch" onClick={() => chooseRunMode('choose')}>← 切换使用方式</button><ThemeButton /></div>
        <div className="mode-tabs" role="tablist">
          <button role="tab" aria-selected={authMode === 'login'} className={authMode === 'login' ? 'active' : ''} onClick={() => { setAuthMode('login'); setNotice('') }}>登录</button>
          <button role="tab" aria-selected={authMode === 'register'} className={authMode === 'register' ? 'active' : ''} onClick={() => { setAuthMode('register'); setNotice('') }}>注册</button>
        </div>
        <h2>{authMode === 'login' ? '继续今天的学习' : '创建你的考研档案'}</h2>
        <form onSubmit={handleAuth}>
          {authMode === 'register' && <>
            <label>用户名<input name="username" minLength={2} maxLength={50} required placeholder="例如：小研" /></label>
            <label>邮箱<input name="email" type="email" required placeholder="name@example.com" /></label>
          </>}
          {authMode === 'login' && <label>用户名或邮箱<input name="account" required placeholder="输入用户名或邮箱" /></label>}
          <label>密码<input name="password" type="password" minLength={8} required placeholder="至少 8 位" /></label>
          {notice && <p className="form-error" role="alert">{notice}</p>}
          <button className="primary-button" disabled={submitting || !apiOnline}>{submitting ? '请稍候…' : authMode === 'login' ? '登录' : '注册并开始建档'}</button>
        </form>
      </section>
    </main>
  }

  if (screen === 'profile') {
    const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    const editingExisting = profileSnapshot !== null
    return <main className="profile-shell">
      <header className="topbar"><div className="brand-mark">研</div><div><strong>有研在先</strong><span>学习画像</span></div><div className="topbar-actions"><ThemeButton /><button className="text-button" onClick={closeProfile}>{editingExisting ? '返回' : '退出'}</button></div></header>
      <form className="profile-form" onSubmit={handleProfile}>
        <div className="step-label">{editingExisting ? '修改学习画像' : '首次建档 · 约 2 分钟'}</div>
        <h1>{editingExisting ? '调整你的学习目标' : '先告诉我你的目标'}</h1>
        <p className="lead">这些信息用于控制任务总量和各科分配，之后可以随时修改。</p>
        <section className="form-section">
          <h2>考试目标</h2>
          <div className="field-grid">
            <label>目标院校<input value={profile.school} onChange={(e) => setProfile({ ...profile, school: e.target.value })} required placeholder="例如：广东工业大学" /></label>
            <label>目标专业<input value={profile.major} onChange={(e) => setProfile({ ...profile, major: e.target.value })} required placeholder="例如：计算机技术" /></label>
            <label>预计考试日期<input type="date" value={profile.exam_date} onChange={(e) => setProfile({ ...profile, exam_date: e.target.value })} required /></label>
            <label>每日可用时间（分钟）<input type="number" min={30} max={1440} step={30} value={profile.daily_minutes} onChange={(e) => setProfile({ ...profile, daily_minutes: Number(e.target.value) })} required /></label>
          </div>
          <fieldset><legend>固定休息日</legend><div className="day-options">{dayNames.map((name, day) => <label key={name} className={profile.rest_days.includes(day) ? 'selected' : ''}><input type="checkbox" checked={profile.rest_days.includes(day)} onChange={() => toggleRestDay(day)} />{name}</label>)}</div></fieldset>
        </section>
        <section className="form-section">
          <h2>三科基础</h2>
          <p className="section-hint">1 表示刚开始，5 表示基础扎实。</p>
          <div className="subject-list">{profile.subjects.map((item) => <div className="subject-row" key={item.subject}>
            <strong>{subjectNames[item.subject]}</strong>
            <label>自评<select value={item.score} onChange={(e) => updateSubject(item.subject, 'score', Number(e.target.value))}>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score} / 5</option>)}</select></label>
            <label className="weakness-field">薄弱点<input value={item.weaknesses} onChange={(e) => updateSubject(item.subject, 'weaknesses', e.target.value)} placeholder="可选，例如：高数积分" /></label>
          </div>)}</div>
        </section>
        {notice && <p className="form-error" role="alert">{notice}</p>}
        <div className="form-actions"><button className="primary-button" disabled={submitting}>{submitting ? '正在保存…' : editingExisting ? '保存修改' : '保存并进入仪表盘'}</button></div>
      </form>
    </main>
  }

  if (screen === 'settings') {
    return <ModelSettings
      config={modelConfig}
      profiles={modelProfiles}
      busy={modelBusy}
      error={modelError}
      health={modelHealth}
      onSave={handleSaveModelConfig}
      onSelect={handleSelectModelProfile}
      onDelete={handleDeleteModelProfile}
      onTest={handleTestModelConfig}
      backLabel={settingsReturn === 'account' ? '返回个人中心' : '返回仪表盘'}
      onBack={() => { if (window.location.search.includes('settings=1')) window.history.replaceState(null, '', '/'); setModelError(''); setModelHealth(null); setScreen(settingsReturn) }}
    />
  }

  if (screen === 'account' && user) {
    return <PersonalCenter
      user={user}
      profile={profile}
      plan={plan}
      streakDays={streakDays}
      dailyReview={dailyReview}
      weeklyReview={review}
      token={token}
      busy={accountBusy}
      error={accountError}
      notice={accountNotice}
      onSaveAccount={handleSaveAccount}
      onEditProfile={() => openProfile(true)}
      onOpenSettings={() => openSettings('account')}
      onBack={() => setScreen('dashboard')}
    />
  }

  const daysLeft = Math.max(0, daysUntil(profile.exam_date, currentDate) ?? 0)
  const examYear = String(Number(profile.exam_date.slice(0, 4)) + 1).slice(-2)
  const todayEvents = scheduleEvents.filter((item) => item.date === currentDate)
  const nextEvent = scheduleEvents.find((item) => item.date > currentDate)
  const today = new Date()
  const todayLabel = today.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })
  const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const widgets: Record<WidgetId, ReactNode> = {
    welcome: <section className="welcome-card"><time dateTime={todayDate}>{todayLabel}</time><h1>你好，{user?.username}</h1><p>{plan ? '今天的计划已经准备好。从最薄弱的科目开始，一项一项完成。' : '学习画像已经建立。现在可以根据你的基础和可用时间生成第一份计划。'}</p></section>,
    countdown: <button type="button" className="device-countdown dashboard-calendar" disabled={scheduleVersion === null} onClick={() => setScheduleOpen(true)} aria-label="打开日程与考试倒计时设置"><span className="calendar-top"><span>学习台历</span><span>{currentDate.slice(0, 7).replace('-', ' / ')}</span></span><span className="calendar-body"><span>距离{examYear}考研还有</span><strong className={daysLeft >= 1000 ? 'calendar-long' : undefined}>{daysLeft}<i>天</i></strong><span className="calendar-exam-date">{profile.exam_date} 考试 · 连续打卡 {streakDays} 天</span></span><span className="calendar-bottom">{scheduleError || (todayEvents.length ? `今天：${todayEvents.map((item) => item.title).join('、')}` : nextEvent ? `下一日程：${nextEvent.title} · ${nextEvent.date}` : '点此添加日程')}<span aria-hidden="true">↗</span></span></button>,
    target: <section className="target-card"><span>目标</span><h2>{profile.school}</h2><p>{profile.major}</p><div className="meta-row"><span>每天 {Math.floor(profile.daily_minutes / 60)} 小时 {profile.daily_minutes % 60 || ''}</span><button className="text-button" onClick={() => openProfile(false)}>编辑画像</button></div></section>,
    subjects: <section className="subjects-card"><span>当前基础</span>{profile.subjects.map((item) => <div className="subject-meter" key={item.subject}><b>{subjectNames[item.subject]}</b><div><i style={{ width: `${item.score * 20}%` }} /></div><em>{item.score}/5</em></div>)}</section>,
    schools: <SchoolsPanel token={token} />,
    tasks: <TaskBoard
      plan={plan} nextPlan={nextPlan} dailyMinutes={profile.daily_minutes} busy={planBusy} error={planError}
      onGenerate={handleGeneratePlan} onCreateTask={handleCreateTask} onDeleteTask={handleDeleteTask}
      onUpdateTask={handleUpdateTask} onComplete={handleCompleteTask} onRecordDifficulty={handleRecordDifficulty}
      onAdjustNextDay={handleAdjustNextDay}
    />,
    week: <WeekPlanPanel plan={weeklyPlan} busy={weekBusy} error={weekError} onGenerate={handleGenerateWeeklyPlan} />,
    stages: <StagePlanPanel plan={stagePlan} busy={stageBusy} error={stageError} onGenerate={handleGenerateStagePlan} onUpdatePhase={handleUpdateStagePhase} />,
    quiz: <QuizPanel token={token} configured={modelConfig !== null} onOpenSettings={() => openSettings()} />,
    review: <ReviewPanel dailyReview={dailyReview} weeklyReview={review} busy={reviewBusy} error={reviewError} onGenerateDaily={handleDailyReview} onGenerateWeekly={handleWeeklyReview} />,
    knowledge: <KnowledgePanel
      configured={Boolean(modelConfig)} documents={documents} busy={documentBusy} error={documentError}
      onUpload={handleUploadDocument} onDelete={handleDeleteDocument} onAsk={handleKnowledgeQuestion}
      onOpenSettings={() => openSettings()}
    />,
    assistant: <AssistantPanel
      configured={modelConfig !== null} token={token} onAsk={handleAgentMessageInConversation}
      onLoadActions={() => getAgentActions(token)} onPreviewAction={(message) => previewAgentAction(token, message)}
      onConfirmAction={async (id) => { applySavedTask(await confirmAgentAction(token, id)); refreshStreak() }}
      onCancelAction={(id) => cancelAgentAction(token, id)}
      onLoadConversations={() => getAgentConversations(token)} onDeleteConversation={(id) => deleteAgentConversation(token, id)}
      onOpenSettings={() => openSettings()}
    />,
  }
  return <main className="dashboard-shell web-workspace">
    <header className="topbar"><div className="brand-mark">研</div><div><strong>有研在先</strong><span>{user?.username} 的学习空间</span></div><nav className="topbar-actions" aria-label="学习空间导航"><ThemeButton /><a className="hub-link" href="/study-hub/index.html">四科研习室</a><a className="hub-link" href="/mistake-review/index.html">拾错复习</a><button className="account-button" onClick={() => { setAccountError(''); setAccountNotice(''); setScreen('account') }}>个人中心</button><details className="topbar-more"><summary>更多</summary><div><button type="button" onClick={() => openSettings()}>模型设置</button><button type="button" onClick={() => chooseRunMode('choose')}>切换模式</button><button type="button" onClick={logout}>退出账号</button></div></details></nav></header>
    <div className="web-workbench">
    <aside className="workspace-rail" aria-label="工作区">
      <nav aria-label="功能分类">{(Object.keys(workspaceViews) as WorkspaceView[]).map((view) => <button key={view} type="button" aria-current={workspaceView === view ? 'page' : undefined} onClick={() => { setEditingLayout(false); setWorkspaceView(view) }}><span>{workspaceViews[view].label}</span><span aria-hidden="true">↗</span></button>)}</nav>
      <div className="workspace-destinations"><a href="/study-hub/index.html"><StudyIcon name="room" /><span>四科研习室<small>按科目进入练习</small></span></a><a href="/mistake-review/index.html"><StudyIcon name="mistake" /><span>拾错复习<small>回看错题与薄弱点</small></span></a></div>
      <p className="workspace-storage">电脑提供服务<br />学习数据保存在电脑后端<br />研习室与拾错请定期备份</p>
    </aside>
    <div className="workspace-main">
    <div className="dashboard-layout-bar"><div><h1>{workspaceViews[workspaceView].title}</h1><span>{editingLayout ? '按住任意卡片并拖到目标位置，松开即可保存。' : workspaceViews[workspaceView].description}</span></div><div><button type="button" className="secondary-button" onClick={() => { setWorkspaceView('all'); setEditingLayout((value) => !value) }}>{editingLayout ? '完成排序' : '自定义顺序'}</button>{editingLayout ? <button type="button" className="text-button" onClick={() => { setWidgetOrder([...widgetIds]); setLayoutMessage('已恢复默认顺序'); if (user) localStorage.removeItem(`kaoyan-widget-order-${user.id}`) }}>恢复默认</button> : null}</div></div>
    <span className="sr-only" role="status" aria-live="polite">{layoutMessage}</span>
    <div className="dashboard-grid" id="dashboard-content">
      {widgetOrder.map((id, index) => <div key={id} hidden={!(workspaceViews[workspaceView].widgets as readonly string[]).includes(id)} data-widget-id={id} className={`dashboard-widget ${['welcome', 'countdown', 'target', 'subjects'].includes(id) ? 'compact' : 'full'}${editingLayout ? ' sorting' : ''}${draggingWidget === id ? ' dragging' : ''}${dropTarget?.id === id ? ` drop-${dropTarget.after ? 'after' : 'before'}` : ''}`} onPointerDown={(event) => startWidgetDrag(event, id)} onPointerMove={moveWidgetDrag} onPointerUp={finishWidgetDrag} onPointerCancel={(event) => finishWidgetDrag(event, false)}>
        {editingLayout ? <div className="widget-order-controls"><strong>{widgetNames[id]}</strong><span>按住卡片拖动</span><div aria-label={`${widgetNames[id]}键盘排序`}><button type="button" disabled={index === 0} onClick={() => moveWidget(id, index - 1)} aria-label={`上移${widgetNames[id]}`}>↑</button><button type="button" disabled={index === widgetOrder.length - 1} onClick={() => moveWidget(id, index + 1)} aria-label={`下移${widgetNames[id]}`}>↓</button></div></div> : null}
        {widgets[id]}
      </div>)}
    </div>
    </div></div>
    {scheduleOpen && <DeviceScheduleSettings accountMode initialItems={scheduleEvents} onSaveItems={saveAccountSchedule} onClose={() => setScheduleOpen(false)} onChange={() => {}} />}
  </main>
}
