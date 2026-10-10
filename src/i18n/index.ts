import en from './en'

/**
 * Sprache: Quelltexte sind deutsch und dienen zugleich als Schlüssel; t() liefert die englische
 * Übersetzung aus src/i18n/en/*. Standard ist Englisch, außer der Browser ist auf Deutsch gestellt.
 * Platzhalter in geschweiften Klammern: t('{n} Maße', { n: 3 }).
 */
export type Lang = 'en' | 'de'
export type LangSetting = 'auto' | Lang

const KEY = 'luftschloss.sprache'

export function detectLang(): Lang {
  try {
    const langs = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : []
    return langs.some((l) => l?.toLowerCase().startsWith('de')) && langs[0]?.toLowerCase().startsWith('de') ? 'de' : 'en'
  } catch {
    return 'en'
  }
}

export function loadLangSetting(): LangSetting {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'en' || v === 'de' || v === 'auto') return v
  } catch {
    /* ohne Speicher */
  }
  return 'auto'
}

export function storeLangSetting(s: LangSetting) {
  try {
    localStorage.setItem(KEY, s)
  } catch {
    /* nur Komfort */
  }
}

let current: Lang = typeof window === 'undefined' ? 'en' : resolveLang(loadLangSetting())

export function resolveLang(s: LangSetting): Lang {
  return s === 'auto' ? detectLang() : s
}

export function getLang(): Lang {
  return current
}

export function setLang(l: Lang) {
  current = l
  if (typeof document !== 'undefined') document.documentElement.lang = l
}

/** Zahlenformat der aktuellen Sprache */
export function locale(): string {
  return current === 'de' ? 'de-DE' : 'en-GB'
}

const missing = new Set<string>()

export function t(de: string, vars?: Record<string, string | number>): string {
  let s = de
  if (current === 'en') {
    const tr = en[de]
    if (tr !== undefined) s = tr
    else if (import.meta.env?.DEV && !missing.has(de)) {
      missing.add(de)
      console.warn('[i18n] fehlende Übersetzung:', de)
    }
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
  return s
}

/** Wie t(), aber für Texte, die erst zur Laufzeit feststehen (Katalognamen u. Ä.) – ohne Warnung */
export function tr(de: string): string {
  return current === 'en' ? (en[de] ?? de) : de
}

/**
 * Markiert einen Text für die Übersetzung, ohne ihn schon zu übersetzen – für Tabellen, die beim
 * Laden des Moduls entstehen (Verbindungsarten, Katalog). Angezeigt wird er dann mit tr().
 */
export const tk = (de: string): string => de
