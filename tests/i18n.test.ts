import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import { describe, expect, it } from 'vitest'
import en from '../src/i18n/en'

/**
 * Übersetzungen vollständig? Alle Schlüssel aus t('…') und tk('…') brauchen einen englischen
 * Eintrag, und sichtbare deutsche Texte dürfen nicht unübersetzt im Code stehen.
 * Ausnahme für eine Zeile: Kommentar „i18n-ok“.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return p.includes('i18n') ? [] : files(p)
    return /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts') ? [p] : []
  })
}

const GERMAN = /[äöüÄÖÜß]|\b(und|oder|nicht|der|die|das|mit|für|ist|bei|zum|zur|auf|wird|kein|keine|Bett|Wand|Raum|Fenster|Tür|Pfosten|Zarge|Höhe|Breite|Länge|Tiefe|Abstand|Prüfung|Verbindung|Schraube|Hinweis|Ansicht|Leiter|Geländer|Matratze|Decke|Boden|Möbel|Material|Statik|Teil|Teile|Schritt|Seite|links|rechts|vorne|hinten|oben|unten)\b/

/** sichtbarer Text: Wörter, nicht nur Einheiten und Zeichen */
const VISIBLE = /[A-Za-zÄÖÜäöüß]{2,}/
const UNITS = /\b(cm|mm|kg|kN|m|px|EN|DE|OSB|KVH|BSH|CSV|PNG|JSON|QR|URL|LAN|WLAN|3D|2D|M10|M8|Ø|x|y|z)\b/g

interface Scan {
  keys: { key: string; where: string }[]
  dynamic: string[]
  raw: string[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any

function scan(): Scan {
  const out: Scan = { keys: [], dynamic: [], raw: [] }
  for (const file of files('src')) {
    const text = readFileSync(file, 'utf8')
    const lines = text.split('\n')
    const ast = parse(text, { sourceType: 'module', plugins: ['typescript', ...(file.endsWith('.tsx') ? (['jsx'] as const) : [])] })
    const where = (n: N) => `${file}:${n.loc.start.line}`
    const okLine = (n: N) => lines[n.loc.start.line - 1].includes('i18n-ok')
    const isT = (n: N, names: string[]) => n?.type === 'CallExpression' && n.callee.type === 'Identifier' && names.includes(n.callee.name)
    const walk = (n: N, parents: N[]) => {
      if (!n || typeof n.type !== 'string') return
      if (n.type === 'ImportDeclaration' || n.type === 'ExportAllDeclaration' || n.type.startsWith('TS')) return
      if (isT(n, ['t', 'tk']) && n.arguments.length) {
        const a = n.arguments[0]
        if (a.type === 'StringLiteral') out.keys.push({ key: a.value, where: where(n) })
        else if (a.type === 'TemplateLiteral' && a.expressions.length === 0) out.keys.push({ key: a.quasis[0].value.cooked, where: where(n) })
        else out.dynamic.push(where(n))
      }
      const inside = parents.some((p) => isT(p, ['t', 'tk', 'tr']))
      const parent = parents[parents.length - 1]
      const check = (s: string, always = false) => {
        if (!s.trim() || !(always ? VISIBLE.test(s.replace(UNITS, '')) : GERMAN.test(s)) || inside || okLine(n)) return
        // Shader-Quelltext und Konsolenausgaben sind keine Oberfläche
        if (/#include|\bvec[234]\b|gl_/.test(s) || parents.some((p) => p.type === 'CallExpression' && p.callee.type === 'MemberExpression' && p.callee.object.name === 'console')) return
        out.raw.push(`${where(n)}  ${s.trim().replace(/\s+/g, ' ').slice(0, 70)}`)
      }
      if (n.type === 'JSXText') check(n.value, true)
      else if (n.type === 'StringLiteral' && parent?.type === 'JSXAttribute' && ['title', 'placeholder', 'aria-label', 'label', 'alt'].includes(parent.name.name)) check(n.value, true)
      else if (n.type === 'StringLiteral') {
        const compare = parent?.type === 'BinaryExpression' && ['===', '!=='].includes(parent.operator)
        const key = (parent?.type === 'ObjectProperty' && parent.key === n) || parent?.type === 'SwitchCase' || (parent?.type === 'MemberExpression' && parent.property === n)
        if (!compare && !key && parent?.type !== 'JSXAttribute' ? true : parent?.type === 'JSXAttribute') check(n.value)
      } else if (n.type === 'TemplateLiteral') check(n.quasis.map((q: N) => q.value.cooked).join(' '))
      for (const k of Object.keys(n)) {
        if (k === 'loc' || k === 'start' || k === 'end' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments') continue
        const v = n[k]
        if (Array.isArray(v)) for (const c of v) walk(c, [...parents, n])
        else if (v && typeof v === 'object') walk(v, [...parents, n])
      }
    }
    walk(ast.program, [])
  }
  return out
}

describe('Übersetzungen', () => {
  const s = scan()
  it('jeder Schlüssel hat einen englischen Text', () => {
    const missing = [...new Set(s.keys.filter((k) => !(k.key in en)).map((k) => `${k.where}  ${k.key}`))]
    expect(missing).toEqual([])
  })
  it('derselbe deutsche Text hat überall dieselbe englische Übersetzung', () => {
    const dir = 'src/i18n/en'
    const seen = new Map<string, { file: string; value: string }>()
    const clash: string[] = []
    for (const f of readdirSync(dir).filter((x) => x !== 'index.ts')) {
      const ast = parse(readFileSync(join(dir, f), 'utf8'), { sourceType: 'module', plugins: ['typescript'] })
      const decl = ast.program.body.find((n: N) => n.type === 'VariableDeclaration') as N
      for (const prop of decl.declarations[0].init.properties as N[]) {
        const key = prop.key.type === 'Identifier' ? prop.key.name : prop.key.value
        const value = prop.value.value
        const prev = seen.get(key)
        if (prev && prev.value !== value) clash.push(`${key}: ${prev.file}=${prev.value} | ${f}=${value}`)
        else seen.set(key, { file: f, value })
      }
    }
    expect(clash).toEqual([])
  })
  it('t() nur mit festen Texten (Platzhalter über {name})', () => {
    expect(s.dynamic).toEqual([])
  })
  it('keine unübersetzten deutschen Texte im Code', () => {
    expect(s.raw).toEqual([])
  })
})
