import { type ChangeEvent, type FormEvent, useRef, useState } from 'react'
import type { KnowledgeDocument, RagReply } from '../api/client'
import DeferredRichText from './DeferredRichText'

type KnowledgePanelProps = {
  configured: boolean
  documents: KnowledgeDocument[]
  busy: boolean
  error: string
  onUpload: (file: File) => Promise<void>
  onDelete: (documentId: number) => Promise<void>
  onAsk: (question: string) => Promise<RagReply>
  onOpenSettings: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function KnowledgePanel({
  configured,
  documents,
  busy,
  error,
  onUpload,
  onDelete,
  onAsk,
  onOpenSettings,
}: KnowledgePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<RagReply | null>(null)
  const [queryBusy, setQueryBusy] = useState(false)
  const [queryError, setQueryError] = useState('')

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    await onUpload(file)
    event.target.value = ''
  }

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = question.trim()
    if (!value || queryBusy) return
    setQueryBusy(true)
    setQueryError('')
    setAnswer(null)
    try {
      setAnswer(await onAsk(value))
    } catch (caught) {
      setQueryError(caught instanceof Error ? caught.message : '资料问答失败，请稍后重试')
    } finally {
      setQueryBusy(false)
    }
  }

  const readyDocuments = documents.filter((document) => document.status === 'ready')

  return <section className="knowledge-card">
    <div className="knowledge-heading">
      <div><p className="eyebrow">个人资料</p><h2>个人考研资料库</h2><p>支持 PDF、图片、TXT 和 Markdown，回答会附带资料来源。</p></div>
      {configured ? <><input ref={inputRef} className="file-input" type="file" accept=".pdf,.txt,.md,.png,.jpg,.jpeg,text/plain,text/markdown,application/pdf,image/png,image/jpeg" onChange={(event) => void chooseFile(event)} /><button type="button" className="secondary-button" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? '正在解析…' : '上传资料'}</button></> : <button type="button" className="secondary-button" onClick={onOpenSettings}>配置模型</button>}
    </div>
    <p className="knowledge-hint">单个文件不超过 20 MB；macOS 会本机识别扫描版 PDF 和 JPG/PNG 图片。扫描页中的公式会尝试用已配置的视觉模型转为 LaTeX，结果请对照原图核验；单份资料最多识别 30 个扫描页、5 个公式页。</p>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {documents.length ? <ul className="document-list">{documents.map((document) => <li key={document.id}>
      <div><strong>{document.filename}</strong><span>{formatSize(document.size_bytes)} · {document.status === 'ready' ? `${document.chunk_count} 个片段${document.page_count ? ` · ${document.page_count} 页` : ''}` : document.status === 'failed' ? document.error_message : '处理中'}</span></div>
      {deletingId === document.id ? <div className="delete-confirm"><button type="button" disabled={busy} onClick={() => void onDelete(document.id).then(() => { setDeletingId(null); setAnswer((current) => current?.sources.some((source) => source.document_id === document.id) ? null : current) }).catch(() => undefined)}>确认删除</button><button type="button" disabled={busy} onClick={() => setDeletingId(null)}>取消</button></div> : <button type="button" className="text-button danger" onClick={() => setDeletingId(document.id)}>删除</button>}
    </li>)}</ul> : <p className="document-empty">还没有资料。可以上传 PDF、扫描讲义、图片或文字笔记。</p>}
    {readyDocuments.length ? <div className="rag-area">
      <form className="rag-composer" onSubmit={(event) => void ask(event)}><label>基于资料提问<input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} placeholder="例如：定积分的几何意义是什么？" /></label><button type="submit" className="primary-button compact" disabled={queryBusy || !question.trim()}>{queryBusy ? '检索中…' : '提问'}</button></form>
      {queryError ? <p className="form-error" role="alert">{queryError}</p> : null}
      {answer ? <div className="rag-answer" aria-live="polite"><DeferredRichText text={answer.answer} />{answer.sources.length ? <ol>{answer.sources.map((source, index) => <li key={`${source.document_id}-${index}`}><strong>[{index + 1}] {source.filename}{source.page ? ` · 第 ${source.page} 页` : ''}</strong><span>{source.excerpt}</span></li>)}</ol> : null}</div> : null}
    </div> : null}
  </section>
}
