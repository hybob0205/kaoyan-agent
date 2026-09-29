import assert from 'node:assert/strict'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Markdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { prepareMathMarkdown } from '../src/mathMarkdown.ts'

test('learning records typeset matrices and integrals instead of exposing TeX commands', () => {
  const record = String.raw`矩阵：\(A=\begin{pmatrix}2&1\\1&2\end{pmatrix}\)；积分：\(\iint_D x\,dxdy\)`
  const html = renderToStaticMarkup(React.createElement(Markdown, {
    remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex],
  }, prepareMathMarkdown(record)))
  assert.equal((html.match(/class="katex"/g) || []).length, 2)
  assert.match(html, /aria-hidden="true"/)
  assert.doesNotMatch(html.replace(/<annotation[^>]*>[\s\S]*?<\/annotation>/g, ''), /\\begin\{pmatrix\}|\\iint/)
})
