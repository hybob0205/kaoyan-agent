import { type FormEvent, useState } from 'react'
import type { StagePhase, StagePhaseUpdate, StagePlan } from '../api/client'

function formatDate(value: string): string {
  const [, month, day] = value.split('-')
  return `${Number(month)}月${Number(day)}日`
}

type StagePlanPanelProps = {
  plan: StagePlan | null
  busy: boolean
  error: string
  onGenerate: (regenerate?: boolean) => Promise<void>
  onUpdatePhase: (phaseId: number, update: StagePhaseUpdate) => Promise<void>
}

export default function StagePlanPanel({ plan, busy, error, onGenerate, onUpdatePhase }: StagePlanPanelProps) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<StagePhaseUpdate>({ math_focus: '', english_focus: '', politics_focus: '' })

  function beginEdit(phase: StagePhase) {
    setDraft({
      math_focus: phase.math_focus,
      english_focus: phase.english_focus,
      politics_focus: phase.politics_focus,
    })
    setEditingId(phase.id)
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (editingId === null) return
    try {
      await onUpdatePhase(editingId, draft)
      setEditingId(null)
    } catch {
      // The parent shows the API error and preserves the current draft.
    }
  }

  return <section className="stage-plan-card">
    <div className="stage-plan-heading">
      <div><p className="eyebrow">复习路线</p><h2>考前阶段计划</h2><p>根据剩余时间和三科薄弱点安排阶段重点，可单独修改每科方向。</p></div>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => { setEditingId(null); void onGenerate(plan !== null) }}>
        {busy ? '生成中…' : plan ? '重新生成' : '生成阶段计划'}
      </button>
    </div>
    {plan ? <>
      <p className="stage-plan-rationale">{plan.rationale}</p>
      <ol className="stage-phase-list">
        {plan.phases.map((phase, index) => <li key={phase.id} className="stage-phase">
          <div className="stage-phase-head">
            <div><span className="stage-phase-number">{String(index + 1).padStart(2, '0')}</span><strong>{phase.title}</strong><span>{formatDate(phase.start_date)} — {formatDate(phase.end_date)}</span></div>
            {editingId !== phase.id ? <button type="button" className="text-button" disabled={busy} onClick={() => beginEdit(phase)}>编辑重点</button> : null}
          </div>
          {editingId === phase.id ? <form className="stage-edit-form" onSubmit={(event) => void saveEdit(event)}>
            <label>数学二<input value={draft.math_focus} onChange={(event) => setDraft({ ...draft, math_focus: event.target.value })} maxLength={500} required /></label>
            <label>英语二<input value={draft.english_focus} onChange={(event) => setDraft({ ...draft, english_focus: event.target.value })} maxLength={500} required /></label>
            <label>政治<input value={draft.politics_focus} onChange={(event) => setDraft({ ...draft, politics_focus: event.target.value })} maxLength={500} required /></label>
            <div><button type="button" className="text-button" onClick={() => setEditingId(null)}>取消</button><button className="secondary-button" disabled={busy}>保存重点</button></div>
          </form> : <dl className="stage-focus-list">
            <div><dt>数学二</dt><dd>{phase.math_focus}</dd></div>
            <div><dt>英语二</dt><dd>{phase.english_focus}</dd></div>
            <div><dt>政治</dt><dd>{phase.politics_focus}</dd></div>
          </dl>}
        </li>)}
      </ol>
      <p className="stage-plan-version">阶段计划版本 {plan.version}</p>
    </> : <p className="stage-plan-empty">还没有阶段计划。生成后可查看每个阶段的时间范围与三科复习重点。</p>}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </section>
}
