export function prepareMathMarkdown(text: string): string {
  return text
    .replace(/\\\[/g, '$$$$').replace(/\\\]/g, '$$$$')
    .replace(/\\\(/g, '$').replace(/\\\)/g, '$')
    .replace(/(?<!\]\()\/(?:study-hub\/(?:math|english|politics)\.html|mistake-review\/index\.html)(?:#[^\s）；，。]+)?/g, (path) => `[${path}](${path})`)
}
