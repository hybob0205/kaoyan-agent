import { lazy, Suspense } from 'react'

const RichText = lazy(() => import('./RichText'))

export default function DeferredRichText({ text, inline = false }: { text: string | null; inline?: boolean }) {
  return <Suspense fallback={<span>{text}</span>}><RichText text={text} inline={inline} /></Suspense>
}
