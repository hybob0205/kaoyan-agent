const labels = { math2: '数学二', english2: '英语二', politics: '政治', cs408: '408' }
const pages = { math2: 'math.html', english2: 'english.html', politics: 'politics.html', cs408: 'cs408.html' }
const today = () => new Date().toLocaleDateString('sv-SE')

export function readableMath(value) {
  const symbols = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', lambda: 'λ', pi: 'π', sigma: 'σ', theta: 'θ', mu: 'μ', omega: 'ω', cdots: '⋯', ldots: '…', times: '×', cdot: '·', leq: '≤', geq: '≥', neq: '≠', sqrt: '√', infty: '∞' }
  const sub = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', i: 'ᵢ', n: 'ₙ' }
  const sup = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }
  return String(value || '').replace(/\\[()[\]]/g, '').replace(/\\([A-Za-z]+)(?![A-Za-z])/g, (match, command) => symbols[command] || match)
    .replace(/_\{([0-9in])\}/g, (_, character) => sub[character])
    .replace(/\^\{([0-9])\}/g, (_, character) => sup[character])
    .replace(/_([0-9in])(?![A-Za-z0-9])/g, (_, character) => sub[character])
    .replace(/\^([0-9])(?![A-Za-z0-9])/g, (_, character) => sup[character])
}

function text(value, limit = 4000) {
  const element = document.createElement('div')
  element.innerHTML = String(value || '')
  return (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function catalog(subject) {
  if (subject === 'math2') return new Map([...(window.PAPERS?.questions || []), ...(window.STUDY?.questions || [])].map((q) => [q.id, { ...q, title: `${q.year || '专项'} · 第 ${q.number || '?'} 题`, prompt: q.body, link: `math.html#question/${encodeURIComponent(q.id)}` }]))
  if (subject === 'english2') return new Map([...(window.ENGLISH?.groups || []), ...(window.ENGLISH_PAPERS?.groups || [])].flatMap((group) => (group.questions || []).map((q) => [q.id, { ...q, title: `${group.year || '专项'} · ${group.title} · 第 ${q.number || '?'} 题`, prompt: `${group.body || ''}\n${q.prompt || ''}`, link: `english.html#group/${encodeURIComponent(group.id)}` }])))
  if (subject === 'politics') return new Map([...(window.POLITICS_PAPERS?.questions || []), ...(window.POLITICS?.analyses || []).flatMap((item) => item.items || [])].map((q) => [q.id, { ...q, title: `${q.year || '专项'} · 第 ${q.number || '?'} 题`, link: `politics.html#practice` }]))
  if (subject === 'cs408') return new Map((window.CS408?.questions || []).map((q) => [q.id, { ...q, title: `408 · ${q.subject?.toUpperCase() || '综合'} · 第 ${q.number || '?'} 题`, link: `cs408.html#review` }]))
  return new Map()
}

function readStudy(namespace, subject) {
  try { return JSON.parse(localStorage.getItem(`${subject}-study-v1-agent-${namespace}`) || 'null') }
  catch { return null }
}

export function syncHubMistakes(namespace, subject) {
  const data = readStudy(namespace, subject)
  if (!data?.records || typeof data.records !== 'object') return 0
  const questions = catalog(subject)
  if (!questions.size) return 0
  const prefix = `shicuo-agent-${namespace}:`
  const dbKey = `${prefix}shicuo-mistakes-v1`
  const syncKey = `${prefix}shicuo-hub-sync-v1`
  let items, synced
  try {
    items = JSON.parse(localStorage.getItem(dbKey) || '[]')
    synced = JSON.parse(localStorage.getItem(syncKey) || '{}')
    if (!Array.isArray(items) || !synced || typeof synced !== 'object' || Array.isArray(synced)) return 0
  } catch { return 0 }
  let added = 0
  for (const [id, record] of Object.entries(data.records)) {
    if (!record || typeof record !== 'object' || !(record.wrong || record.status === 'wrong')) continue
    const q = questions.get(id)
    if (!q) continue
    const sourceId = `${subject}:${id}`
    if (synced[sourceId] || items.some((item) => item?.hubSourceId === sourceId)) continue
    const prompt = text(q.prompt || q.body, 6000) || q.title
    const options = Array.isArray(q.options) ? q.options.map((option) => text(option, 500)) : []
    const answer = typeof q.answer === 'string' && /^[A-D]$/.test(q.answer) && options.length
      ? options[q.answer.charCodeAt(0) - 65] || q.answer : text(q.answer, 1000)
    const link = `/study-hub/${q.link}`
    items.unshift({ id: crypto.randomUUID(), sourceType: 'paste', sourceText: prompt, question: prompt,
      subject: labels[subject], module: text(q.chapter || q.subject || q.title, 100), knowledge: Array.isArray(q.tags) ? q.tags.join('、').slice(0, 200) : text(q.topic, 200),
      type: options.length ? '选择题' : '', difficulty: '', cause: text(record.cause || record.notes, 1000), myAnswer: text(record.answer, 1000),
      answer, explanation: text(q.explanation || q.reference, 3000), options, correctOption: /^[A-D]$/.test(q.answer || '') ? q.answer.charCodeAt(0) - 65 : null,
      tags: ['研习室导入'], createdAt: Date.now(), mastery: 1, reviews: 0, reviewHistory: [], nextReview: today(), lastReview: '', images: [], image: '',
      hubSourceId: sourceId, hubSourceTitle: q.title, hubSourceUrl: link })
    synced[sourceId] = true
    added++
  }
  if (added) {
    try {
      localStorage.setItem(dbKey, JSON.stringify(items))
      localStorage.setItem(syncKey, JSON.stringify(synced))
      window.AGENT_DATA_CHANGED?.()
    } catch { return 0 }
  }
  return added
}

function modelSettings(namespace) {
  if (namespace === 'device') {
    const config = JSON.parse(localStorage.getItem('kaoyan-device-model-v1') || 'null')
    if (!config?.base_url || !config?.model) throw new Error('请先返回 Agent 首页，在“模型设置”中添加接口')
    return { url: `${config.base_url.replace(/\/+$/, '')}/chat/completions`, model: config.model, temperature: config.temperature,
      key: sessionStorage.getItem('kaoyan-device-model-key-v1') || 'device-no-key' }
  }
  return { url: `${location.origin}/api/model-config/chat/completions`, model: 'agent-model', temperature: 0.2, key: localStorage.getItem('kaoyan-agent-token-v1') || '' }
}

async function streamChat(settings, messages, onText) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.key}`, Accept: 'text/event-stream, application/json' }
  const body = { model: settings.model, temperature: settings.temperature, stream: true, messages }
  let full = ''
  const accept = (payload) => {
    if (payload === '[DONE]') return
    const value = JSON.parse(payload)
    if (value.error) throw new Error(value.error.message || '模型接口返回错误')
    const delta = value.choices?.[0]?.delta?.content ?? value.choices?.[0]?.message?.content
    if (typeof delta === 'string') { full += delta; onText(full) }
  }
  if (window.Capacitor?.isNativePlatform?.()) {
    const id = crypto.randomUUID()
    let listener
    try {
      await new Promise(async (resolve, reject) => {
        try {
          listener = window.Capacitor.addListener('ModelStream', 'streamEvent', (event) => {
            if (event.id !== id) return
            try {
              if (event.type === 'error') throw new Error(event.data || '模型连接中断')
              if (event.type === 'data' || event.type === 'json') accept(event.data)
              if (event.type === 'done') resolve()
            } catch (error) { reject(error) }
          })
          await window.Capacitor.nativePromise('ModelStream', 'start', { id, url: settings.url, headers, body: JSON.stringify(body) })
        } catch (error) { reject(error) }
      })
    } finally { await listener?.remove() }
  } else {
    const response = await fetch(settings.url, { method: 'POST', headers, body: JSON.stringify(body) })
    if (!response.ok) throw new Error(`模型接口返回 ${response.status}`)
    if (!response.headers.get('content-type')?.includes('text/event-stream')) accept(await response.text())
    else {
      if (!response.body) throw new Error('当前浏览器不支持流式读取')
      const reader = response.body.getReader(), decoder = new TextDecoder()
      let buffer = '', pendingCR = false
      while (true) {
        const { done, value } = await reader.read()
        let chunk = (pendingCR ? '\r' : '') + decoder.decode(value, { stream: !done })
        pendingCR = chunk.endsWith('\r')
        if (pendingCR) chunk = chunk.slice(0, -1)
        buffer += chunk.replace(/\r\n?/g, '\n')
        let cut
        while ((cut = buffer.indexOf('\n\n')) >= 0) {
          for (const line of buffer.slice(0, cut).split('\n')) if (line.startsWith('data:')) accept(line.slice(5).trim())
          buffer = buffer.slice(cut + 2)
        }
        if (done) break
      }
      if (pendingCR) buffer += '\n'
      if (buffer.trim()) for (const line of buffer.split('\n')) if (line.startsWith('data:')) accept(line.slice(5).trim())
    }
  }
  if (!full.trim()) throw new Error('模型没有返回可读取的回答')
  return full.trim()
}

function studyContext(namespace, subject) {
  const records = Object.entries(readStudy(namespace, subject)?.records || {})
  const wrong = records.filter(([, item]) => item?.wrong || item?.status === 'wrong')
  const questions = catalog(subject)
  let review = []
  try { review = JSON.parse(localStorage.getItem(`shicuo-agent-${namespace}:shicuo-mistakes-v1`) || '[]').filter((item) => item?.hubSourceId?.startsWith(`${subject}:`)) }
  catch { /* Review data can still be viewed in its own app. */ }
  return `科目：${labels[subject]}。已练 ${records.filter(([, item]) => item?.checked || item?.status).length} 项；当前错题 ${wrong.length} 项。\n` +
    `拾错已收录本科研习室题目 ${review.length} 道，其中今日到期 ${review.filter((item) => item.nextReview <= today()).length} 道。\n` +
    wrong.slice(-15).map(([id, item]) => {
      const q = questions.get(id)
      return `题目 ${id}：${text(q?.prompt || q?.body || q?.title || id, 400)}；我的作答 ${text(item.answer, 120)}；错因 ${text(item.cause || item.notes, 200)}`
    }).join('\n')
}

export function bootHubIntegration(namespace) {
  const subject = location.pathname.endsWith('/english.html') ? 'english2' : location.pathname.endsWith('/politics.html') ? 'politics' : location.pathname.endsWith('/math.html') ? 'math2' : location.pathname.endsWith('/cs408.html') ? 'cs408' : ''
  if (!subject) return
  const sync = () => syncHubMistakes(namespace, subject)
  sync()
  const previousChanged = window.AGENT_DATA_CHANGED
  window.AGENT_DATA_CHANGED = (...args) => { previousChanged?.(...args); sync() }

  const key = `hub-ai-agent-${namespace}-${subject}-v1`
  let history = []
  try { const saved = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(saved)) history = saved.filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-20) }
  catch { /* Start a new conversation if prior chat is malformed. */ }
  const button = document.createElement('button')
  button.type = 'button'; button.className = 'hub-ai-launch'; button.textContent = '问研习室 AI'
  const reviewLink = document.createElement('a')
  reviewLink.className = 'hub-review-link'; reviewLink.href = '/mistake-review/index.html'; reviewLink.textContent = '去拾错复习 →'
  const dialog = document.createElement('dialog')
  dialog.className = 'hub-ai-dialog'
  dialog.innerHTML = '<div class="hub-ai-head"><div><small>研习室 · 做题复盘</small><h2>问研习室 AI</h2></div><button type="button" class="hub-ai-close" aria-label="关闭对话">×</button></div><p>可分析本科研习室的练习和错题。回答仅作复习参考，不会改动原记录。</p><div class="hub-ai-messages" aria-live="polite"></div><form class="hub-ai-form"><label for="hub-ai-question">输入问题</label><textarea id="hub-ai-question" rows="3" maxlength="2000" placeholder="例如：我最近主要错在哪里？下一步怎么练？" required></textarea><div><button type="submit">发送</button><button type="button" class="hub-ai-clear">清空对话</button></div></form><p class="hub-ai-error" role="alert"></p>'
  const list = dialog.querySelector('.hub-ai-messages')
  const render = (pending = '') => {
    list.replaceChildren()
    for (const message of [...history, ...(pending ? [{ role: 'assistant', content: pending }] : [])]) {
      const item = document.createElement('div')
      item.className = `hub-ai-message ${message.role}`
      const name = document.createElement('strong'); name.textContent = message.role === 'user' ? '我' : '研习室 AI'
      const content = document.createElement('p'); content.textContent = readableMath(message.content)
      item.append(name, content); list.append(item)
      if (message.createdAt && !Number.isNaN(new Date(message.createdAt).getTime())) {
        const time = document.createElement('time'); time.className = 'message-time'
        time.dateTime = message.createdAt; time.textContent = new Date(message.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        item.append(time)
      }
    }
    if (!history.length && !pending) list.textContent = '还没有对话。可以先问一次错题分析。'
    list.scrollTop = list.scrollHeight
  }
  render()
  const openChat = () => { render(); if (!dialog.open) dialog.showModal(); dialog.querySelector('textarea').focus() }
  dialog.querySelector('.hub-ai-close').onclick = () => dialog.close()
  dialog.querySelector('.hub-ai-clear').onclick = () => { if (!confirm('清空本科研习室的 AI 对话？')) return; history = []; localStorage.removeItem(key); render() }
  dialog.querySelector('form').onsubmit = async (event) => {
    event.preventDefault()
    const input = dialog.querySelector('textarea'), question = input.value.trim()
    if (!question) return
    const submit = dialog.querySelector('[type="submit"]'), error = dialog.querySelector('.hub-ai-error')
    submit.disabled = true; error.textContent = ''
    history.push({ role: 'user', content: question, createdAt: new Date().toISOString() }); render('正在连接模型…')
    try {
      const settings = modelSettings(namespace)
      const messages = [{ role: 'system', content: `你是中文考研研习室辅导老师。只依据以下本机记录分析，不编造答题情况或正确答案；指出证据不足处。用简短小标题分段，数学使用 Unicode 符号，分数写成 (分子)/(分母)，不要输出 LaTeX 命令，给出可执行的下一步建议。\n${studyContext(namespace, subject)}` }, ...history.slice(-10).map(({ role, content }) => ({ role, content }))]
      const answer = await streamChat(settings, messages, render)
      history.push({ role: 'assistant', content: answer, createdAt: new Date().toISOString() }); history = history.slice(-20)
      localStorage.setItem(key, JSON.stringify(history)); input.value = ''; render()
    } catch (caught) { history.pop(); error.textContent = caught instanceof Error ? caught.message : '对话失败，请检查模型设置'; render() }
    finally { submit.disabled = false }
  }
  const style = document.createElement('style')
  style.textContent = '.hub-ai-launch,.hub-review-link{position:fixed;left:16px;z-index:9999;min-height:48px;padding:10px 16px;border:0;border-radius:999px;background:#173f32;color:#fff!important;font:600 14px/28px system-ui,sans-serif;text-decoration:none!important;box-shadow:0 8px 24px #10281f44}.hub-ai-launch{bottom:calc(70px + env(safe-area-inset-bottom))}.hub-review-link{bottom:calc(126px + env(safe-area-inset-bottom));background:#f6faf6;color:#173f32!important;border:1px solid #b7c9ba}.hub-ai-dialog{width:min(640px,calc(100vw - 24px));max-height:88dvh;padding:20px;border:1px solid #cad7cb;border-radius:16px;color:#183229;background:#fff}.hub-ai-dialog::backdrop{background:#10281faa}.hub-ai-head{display:flex;justify-content:space-between;gap:16px;align-items:start}.hub-ai-head h2{margin:4px 0}.hub-ai-head button{min-width:48px;min-height:48px;font-size:26px}.hub-ai-dialog>p{color:#506657;line-height:1.6}.hub-ai-messages{display:grid;gap:10px;min-height:100px;max-height:35dvh;overflow:auto;margin:14px 0}.hub-ai-message{padding:12px;border-radius:10px;background:#f2f5ef;overflow-wrap:anywhere}.hub-ai-message.user{background:#e7f0e8}.hub-ai-message p{white-space:pre-wrap;line-height:1.6;margin:8px 0 0}.hub-ai-form{display:grid;gap:8px}.hub-ai-form textarea{width:100%;min-height:90px;padding:10px;font:16px/1.5 system-ui,sans-serif}.hub-ai-form>div{display:flex;gap:10px;flex-wrap:wrap}.hub-ai-form button{min-height:48px;padding:8px 14px}.hub-ai-form [type=submit]{background:#173f32;color:#fff;border:0;border-radius:8px}.hub-ai-error{color:#a12e2e!important}.hub-ai-dialog :focus-visible,.hub-ai-launch:focus-visible,.hub-review-link:focus-visible{outline:3px solid #287c58;outline-offset:2px}@media(max-width:720px){.hub-ai-launch,.hub-review-link{left:12px}.hub-ai-launch{bottom:calc(60px + env(safe-area-inset-bottom))}.hub-review-link{bottom:calc(116px + env(safe-area-inset-bottom))}}'
  document.head.append(style); document.body.append(dialog)
  window.AGENT_FLOATING_MENU_READY?.then((menu) => {
    menu?.addAction(reviewLink, '去拾错复习')
    menu?.addAction(button, '问研习室 AI', openChat)
  })
}
