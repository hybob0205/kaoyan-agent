import { useEffect, useRef, useState } from 'react'
import { parsePortableBackup, readPortableBackup, restorePortableBackup } from '../portableBackup'
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import DeviceModelSettings from './DeviceModelSettings'
import DeviceScheduleSettings from './DeviceScheduleSettings'
import { readDeviceAgent } from '../deviceAgent'
import { daysUntil, localDate, readDeviceSchedule } from '../deviceSchedule'
import ThemeButton from './ThemeButton'
import StudyIcon from './StudyIcon'

export default function DeviceHome({ onChangeMode, onOpenAgent }: { onChangeMode: () => void; onOpenAgent: () => void }) {
  const native = Capacitor.isNativePlatform()
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false)
  const [schedule, setSchedule] = useState(readDeviceSchedule)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [currentDate, setCurrentDate] = useState(localDate)
  const [offlineReady, setOfflineReady] = useState(Boolean(navigator.serviceWorker?.controller))

  useEffect(() => {
    const update = () => setOfflineReady(Boolean(navigator.serviceWorker?.controller))
    navigator.serviceWorker?.addEventListener('controllerchange', update)
    return () => navigator.serviceWorker?.removeEventListener('controllerchange', update)
  }, [])

  useEffect(() => {
    if (location.hash === '#device-model') setModelSettingsOpen(true)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDate(localDate()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const examDate = readDeviceAgent().examDate
  const examYear = String(Number(examDate.slice(0, 4)) + 1).slice(-2)
  const examDays = daysUntil(examDate, currentDate)
  const todayEvents = schedule.filter((item) => item.date === currentDate)
  const nextEvent = schedule.find((item) => item.date > currentDate)

  const offlineStatus = native
    ? '研习室和拾错页面已包含在安装包中，可离线打开；使用联网 AI 时仍需要网络。'
    : !window.isSecureContext || import.meta.env.DEV
    ? '当前地址不能提供独立离线使用。手机从电脑局域网 HTTP 地址打开时，必须保持电脑在线；离线安装需要 HTTPS 正式地址。'
    : !('serviceWorker' in navigator)
      ? '当前浏览器不支持离线缓存。记录仍保存在本设备，但打开页面需要网络；请定期导出备份。'
    : offlineReady
      ? '离线资源已缓存到此设备。断网后可打开已缓存页面；请定期导出学习记录。'
      : '正在准备离线资源。保持联网，稍后刷新页面再确认是否缓存完成。'

  async function exportBackup() {
    const backup = readPortableBackup('device')
    const filename = `考研Agent-设备备份-${new Date().toISOString().slice(0, 10)}.json`
    if (native) {
      try {
        await Filesystem.writeFile({ path: filename, data: JSON.stringify(backup), directory: Directory.Cache, encoding: Encoding.UTF8 })
        const file = await Filesystem.getUri({ path: filename, directory: Directory.Cache })
        await Share.share({ title: '保存考研 Agent 备份', url: file.uri, dialogTitle: '保存或发送备份文件' })
        setMessage('备份文件已交给系统分享菜单。请保存到设备文件夹或其他安全位置。')
      } catch (error) { setMessage(error instanceof Error ? error.message : '无法导出备份') }
      return
    }
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage('备份文件已导出。请妥善保存，换设备时可在这里导入。')
  }

  async function importBackup(file: File | undefined) {
    if (!file) return
    try {
      if (file.size > 50_000_000) throw new Error('备份超过 50 MB，请先在原设备拆分或精简图片')
      const backup = parsePortableBackup(await file.text())
      if (!window.confirm('导入会替换此设备的 Agent、研习室和拾错记录。请确认已导出当前记录。是否继续？')) return
      restorePortableBackup('device', backup)
      setSchedule(readDeviceSchedule())
      setMessage('导入完成。重新打开学习 Agent、研习室或拾错后即可看到记录。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '备份导入失败')
    }
  }

  return <main className="device-shell home-paper">
    <header className="device-header"><img className="brand-mark" src="/app-icon.png" alt="" /><div><strong>有研在先</strong></div><div className="device-header-actions"><ThemeButton /><button type="button" className="icon-button" onClick={() => setModelSettingsOpen(true)} aria-label="模型设置" title="模型设置"><StudyIcon name="settings" /></button></div></header>
    <div className="device-content home-content">
      <div className="home-calendar-scene"><p className="calendar-motto">研途有光 · 终见山海</p>
      <h1 className="sr-only">你的学习台历</h1>
      <button type="button" className="device-countdown" onClick={() => setScheduleOpen(true)} aria-label="打开日程与考试倒计时设置">
        <span className="calendar-top"><span>学习台历</span><span>{currentDate.slice(0, 7).replace('-', ' / ')}</span></span>
        <span className="calendar-body"><span>距离{examYear}考研还有</span><strong className={examDays !== null && examDays >= 1000 ? 'calendar-long' : undefined}>{examDays !== null && examDays >= 0 ? examDays : '—'}<i>天</i></strong><span className="calendar-exam-date">{examDays !== null && examDays >= 0 ? `${Number(examDate.slice(5, 7))}月${Number(examDate.slice(8, 10))}日 考试` : '请在学习 Agent 中更新考试日期'}</span></span>
        <span className="calendar-bottom">{todayEvents.length ? `今天：${todayEvents.map((item) => item.title).join('、')}` : nextEvent ? `下一日程：${nextEvent.title} · ${nextEvent.date}` : '点此添加日程'}<span aria-hidden="true">↗</span></span>
      </button>
      </div>
      <section className="home-learning"><h2>继续学习</h2><div className="device-apps">
        <button type="button" onClick={onOpenAgent}><StudyIcon name="book" /><span><strong>学习 Agent</strong><small>对话分析与今日计划</small></span><b aria-hidden="true">›</b></button>
        <a href="/study-hub/index.html"><StudyIcon name="room" /><span><strong>四科研习室</strong><small>数学二 · 英语二 · 政治 · 408</small></span><b aria-hidden="true">›</b></a>
        <a href="/mistake-review/index.html"><StudyIcon name="mistake" /><span><strong>拾错复习</strong><small>整理错题，安排下一次复习</small></span><b aria-hidden="true">›</b></a>
      </div></section>
      <details className="device-backup"><summary>备份与换设备</summary><p>导出一份不含模型密钥的合并备份。导入前请先保存当前设备的记录；两种模式之间可以用该文件迁移，不会自动合并。</p><div><button type="button" className="primary-button compact" onClick={() => void exportBackup()}>导出备份</button><button type="button" className="secondary-button" onClick={() => fileInput.current?.click()}>导入备份</button><input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(event) => { void importBackup(event.target.files?.[0]); event.target.value = '' }} /></div>{message && <p role="status" className="device-message">{message}</p>}</details>
      <details className="device-unavailable"><summary>本机数据与使用说明</summary><p>{offlineStatus}</p><p>学习画像、今日计划和读取研习室/拾错记录的 Agent 对话已在本机运行。电脑端的资料库、模拟测试、周/阶段计划和账号系统尚未移植到移动版；移动版数据不会自动与电脑同步，请使用备份迁移。</p>{!native && <button type="button" className="text-button" onClick={onChangeMode}>切换使用模式</button>}</details>
    </div>
    {modelSettingsOpen && <DeviceModelSettings onClose={() => setModelSettingsOpen(false)} onChange={() => {}} />}
    {scheduleOpen && <DeviceScheduleSettings onClose={() => setScheduleOpen(false)} onChange={() => setSchedule(readDeviceSchedule())} />}
  </main>
}
