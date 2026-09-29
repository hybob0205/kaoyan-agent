import { type FormEvent, useEffect, useState } from 'react'
import { deleteSchoolCandidate, getSchoolCandidates, saveSchoolCandidate, type SchoolCandidate } from '../api/client'

type Props = { token: string }
type Draft = { school: string; major: string; year: string; score_line: string; source: string; note: string }
const emptyDraft: Draft = { school: '', major: '', year: '', score_line: '', source: '', note: '' }

export default function SchoolsPanel({ token }: Props) {
  const [items, setItems] = useState<SchoolCandidate[]>([])
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    void getSchoolCandidates(token).then((candidates) => { if (active) setItems(candidates) })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : '候选院校加载失败') })
    return () => { active = false }
  }, [token])

  function edit(candidate: SchoolCandidate) {
    setEditingId(candidate.id)
    setDraft({
      school: candidate.school,
      major: candidate.major,
      year: candidate.year?.toString() ?? '',
      score_line: candidate.score_line?.toString() ?? '',
      source: candidate.source,
      note: candidate.note,
    })
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const saved = await saveSchoolCandidate(token, {
        school: draft.school.trim(),
        major: draft.major.trim(),
        year: draft.year ? Number(draft.year) : null,
        score_line: draft.score_line ? Number(draft.score_line) : null,
        source: draft.source.trim(),
        note: draft.note.trim(),
      }, editingId ?? undefined)
      setItems((current) => editingId === null ? [saved, ...current] : current.map((item) => item.id === saved.id ? saved : item))
      setDraft(emptyDraft)
      setEditingId(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '候选院校保存失败')
    } finally { setBusy(false) }
  }

  async function remove(candidate: SchoolCandidate) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await deleteSchoolCandidate(token, candidate.id)
      setDeleteConfirmId(null)
      setItems((current) => current.filter((item) => item.id !== candidate.id))
      if (editingId === candidate.id) { setEditingId(null); setDraft(emptyDraft) }
    } catch (caught) { setError(caught instanceof Error ? caught.message : '候选院校删除失败') }
    finally { setBusy(false) }
  }

  return <section className="schools-card">
    <div className="schools-heading"><div><p className="eyebrow">目标院校</p><h2>择校候选对比</h2><p>手动记录目标专业、年份、复试线与来源，再让 Agent 基于这些记录辅助比较。</p></div></div>
    <form className="school-form" onSubmit={(event) => void submit(event)}>
      <div className="school-form-grid">
        <label>院校<input required maxLength={120} value={draft.school} onChange={(event) => setDraft({ ...draft, school: event.target.value })} placeholder="例如：广东工业大学" /></label>
        <label>专业<input required maxLength={120} value={draft.major} onChange={(event) => setDraft({ ...draft, major: event.target.value })} placeholder="例如：计算机技术" /></label>
        <label>年份<input type="number" min={2000} max={2100} value={draft.year} onChange={(event) => setDraft({ ...draft, year: event.target.value })} placeholder="可选" /></label>
        <label>复试线<input type="number" min={0} max={500} value={draft.score_line} onChange={(event) => setDraft({ ...draft, score_line: event.target.value })} placeholder="总分，可选" /></label>
        <label className="school-wide">数据来源<input maxLength={500} value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })} placeholder="网址或资料名称，便于回查" /></label>
        <label className="school-wide">备注<textarea maxLength={3000} rows={2} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="招生人数、考试科目、个人考虑等" /></label>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="school-form-actions"><button className="primary-button compact" disabled={busy || !draft.school.trim() || !draft.major.trim()}>{busy ? '保存中…' : editingId === null ? '加入候选' : '保存修改'}</button>{editingId !== null ? <button type="button" className="secondary-button" disabled={busy} onClick={() => { setEditingId(null); setDraft(emptyDraft); setError('') }}>取消</button> : null}</div>
    </form>
    {items.length === 0 ? <p className="school-empty">还没有候选院校。添加后可以在这里横向比较，并向 Agent 提问。</p> : <div className="school-comparison" role="list" aria-label="候选院校比较">{items.map((item) => <article className="school-candidate" role="listitem" key={item.id}>
      <div><span className="school-year">{item.year ?? '年份待补'}</span><h3>{item.school}</h3><p>{item.major}</p></div>
      <div className="school-score"><strong>{item.score_line ?? '—'}</strong><span>复试线</span></div>
      {item.note ? <p className="school-note">{item.note}</p> : null}
      {item.source ? <p className="school-source">来源：{item.source}</p> : null}
      <div className="school-actions"><button type="button" className="text-button" disabled={busy} onClick={() => { setDeleteConfirmId(null); edit(item) }}>编辑</button>{deleteConfirmId === item.id ? <><span role="status">确定删除「{item.school}」？</span><button type="button" className="text-button danger" disabled={busy} onClick={() => void remove(item)}>确认删除</button><button type="button" className="text-button" disabled={busy} onClick={() => setDeleteConfirmId(null)}>取消</button></> : <button type="button" className="text-button danger" disabled={busy} onClick={() => setDeleteConfirmId(item.id)}>删除</button>}</div>
    </article>)}</div>}
  </section>
}
