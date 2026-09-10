/**
 * Which preview a file earns, decided from its name and media type.
 *
 * The host reports every text file as `text/plain` — deliberately, so a served
 * response can never be executed — which means the media type alone cannot tell
 * Markdown from TypeScript. The extension is therefore the discriminator, and
 * this module is the single place that maps one to a renderer and to a
 * highlighting grammar.
 */

/** Grammar ids understood by the shared code renderer, by file extension. */
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  py: 'python', rb: 'ruby', php: 'php', go: 'go', rs: 'rust', java: 'java',
  kt: 'kotlin', kts: 'kotlin', swift: 'swift', lua: 'lua', pl: 'perl', dart: 'dart',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', cs: 'csharp',
  json: 'json', jsonc: 'jsonc', json5: 'json5',
  yml: 'yaml', yaml: 'yaml', toml: 'toml', ini: 'ini', cfg: 'ini', conf: 'ini', properties: 'ini',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'fish', ps1: 'powershell', bat: 'bat', cmd: 'bat',
  sql: 'sql', graphql: 'graphql', gql: 'graphql',
  html: 'html', htm: 'html', xml: 'xml', vue: 'vue', svelte: 'svelte', astro: 'astro',
  css: 'css', scss: 'scss', sass: 'sass', less: 'less',
  diff: 'diff', patch: 'diff', tex: 'latex', r: 'r', jl: 'julia', ex: 'elixir', exs: 'elixir',
  erl: 'erlang', hs: 'haskell', clj: 'clojure', zig: 'zig', nim: 'nim', vim: 'viml',
  gradle: 'groovy', groovy: 'groovy', proto: 'proto', tf: 'hcl', hcl: 'hcl',
}

/** Grammars chosen by whole file name, for the files that have no extension. */
const LANGUAGE_BY_FILENAME: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  'cmakelists.txt': 'cmake',
  'cargo.lock': 'toml',
}

/** Documents rendered as Markdown rather than as source. */
const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdx']

/**
 * Split one file name into its lowercased extension and its lowercased name.
 * @param name - the file's basename.
 * @returns the extension without its dot (empty when there is none) and the name.
 */
function parts(name: string): { extension: string; lower: string } {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')
  return { extension: dot > 0 ? lower.slice(dot + 1) : '', lower }
}

/**
 * Whether a file is a Markdown document.
 * @param name - the file's basename.
 * @param mediaType - the media type the host serves it as.
 * @returns true when a Markdown renderer should claim it.
 */
export function isMarkdownFile(name: string, mediaType: string): boolean {
  if (mediaType.replace(/;.*$/, '').trim().toLowerCase() === 'text/markdown') return true
  return MARKDOWN_EXTENSIONS.includes(parts(name).extension)
}

/**
 * The highlighting grammar for a file, when one applies.
 * @param name - the file's basename.
 * @returns the grammar id, or undefined when the file is not source to highlight.
 */
export function languageForFile(name: string): string | undefined {
  const { extension, lower } = parts(name)
  const byName = LANGUAGE_BY_FILENAME[lower]
  if (byName !== undefined) return byName
  return LANGUAGE_BY_EXTENSION[extension]
}
