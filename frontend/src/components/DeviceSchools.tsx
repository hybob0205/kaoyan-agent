import { useState, type FormEvent } from 'react'
import type { LocalSchool } from '../deviceAgent'

const empty = (): LocalSchool => ({ id: '', school: '', major: '', year: '', score: '', source: '', notes: '' })
export default function DeviceSchools({ schools, onSave, onTarget, onAsk }: { schools: LocalSchool[]; onSave: (schools: LocalSchool[]) => boolean; onTarget: (school: LocalSchool) => void; onAsk: () => void }) {
  const [draft, setDraft] = useState<LocalSchool>(empty)
  function submit(event: FormEvent) {
    event.preventDefault()
    const item = { ...draft, id: draft.id || crypto.randomUUID(), school: draft.school.trim(), major: draft.major.trim() }
    if (!item.school || !item.major) return
    if (onSave(draft.id ? schools.map(value => value.id === draft.id ? item : value) : [...schools, item])) setDraft(empty())
  }
  return <>
    <div className="device-agent-card-title"><h2>候选院校</h2><span>本机保存 · {schools.length} / 30</span></div>
    <p>记录院校、专业、复试线和来源；Agent 可依据这些记录辅助比较，不自动编造招生信息。</p>
    <form onSubmit={submit}>
      <div className="device-agent-fields">
        <label>院校<input required maxLength={100} value={draft.school} onChange={event => setDraft({ ...draft, school: event.target.value })} /></label>
        <label>专业<input required maxLength={100} value={draft.major} onChange={event => setDraft({ ...draft, major: event.target.value })} /></label>
        <label>招生年份<input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="可选" value={draft.year} onChange={event => setDraft({ ...draft, year: event.target.value })} /></label>
        <label>复试线<input type="number" min={0} max={500} placeholder="可选" value={draft.score} onChange={event => setDraft({ ...draft, score: event.target.value })} /></label>
        <label>数据来源<input maxLength={500} placeholder="官网链接或资料名称" value={draft.source} onChange={event => setDraft({ ...draft, source: event.target.value })} /></label>
        <label>备注<input maxLength={1000} placeholder="考试科目、招生人数等" value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
      </div>
      <div className="device-school-actions"><button className="secondary-button" disabled={!draft.id && schools.length >= 30}>{draft.id ? '保存候选院校' : '添加候选院校'}</button>{draft.id && <button type="button" className="text-button" onClick={() => setDraft(empty())}>取消编辑</button>}</div>
    </form>
    {!schools.length ? <p>还没有候选院校，添加后可以与 Agent 讨论。</p> : <><ul className="device-school-list">{schools.map(item => <li key={item.id}>
      <h3>{item.school}</h3><p>{item.major} · {item.year || '年份未填'} · 复试线 {item.score || '未填写'}</p>
      <p>来源：{item.source || '未提供，请核验'}{item.notes ? `；${item.notes}` : ''}</p>
      <div className="device-school-actions"><button type="button" className="text-button" onClick={() => setDraft(item)}>编辑</button><button type="button" className="text-button" onClick={() => { if (confirm(`将 ${item.school} / ${item.major} 设为学习目标？`)) onTarget(item) }}>设为目标</button><button type="button" className="text-button danger" onClick={() => { if (confirm(`删除候选院校“${item.school}”？`)) { onSave(schools.filter(value => value.id !== item.id)); if (draft.id === item.id) setDraft(empty()) } }}>删除</button></div>
    </li>)}</ul><button type="button" className="secondary-button" onClick={onAsk}>让 Agent 比较候选院校</button></>}
  </>
}
