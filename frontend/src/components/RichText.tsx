import type { ReactNode } from 'react'
import Markdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'
import { prepareMathMarkdown } from '../mathMarkdown'

const remarkPlugins = [remarkMath]
const rehypePlugins = [rehypeKatex]
const inlineComponents = { p: ({ children }: { children?: ReactNode }) => <span>{children}</span> }

export default function RichText({ text, inline = false }: { text: string | null; inline?: boolean }) {
  const content = <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={inline ? inlineComponents : undefined}>{prepareMathMarkdown(text ?? '')}</Markdown>
  return inline ? <span className="rich-text rich-inline">{content}</span> : <div className="rich-text">{content}</div>
}
