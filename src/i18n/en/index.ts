/**
 * Englische Übersetzungen, Schlüssel = deutscher Quelltext. Je Bereich eine Datei, damit
 * Änderungen nicht kollidieren. Fehlende Einträge findet tests/i18n.test.ts.
 */
import analysis from './analysis'
import model from './model'
import plan from './plan'
import uiApp from './ui-app'
import uiPanels from './ui-panels'
import views from './views'

const en: Record<string, string> = { ...model, ...analysis, ...views, ...plan, ...uiApp, ...uiPanels }
export default en
