/**
 * Englische Übersetzungen, Schlüssel = deutscher Quelltext. Je Bereich eine Datei, damit
 * Änderungen nicht kollidieren. Fehlende Einträge findet tests/i18n.test.ts.
 */
import analysis from './analysis'
import guide from './guide'
import model from './model'
import plan from './plan'
import uiApp from './ui-app'
import uiPanels from './ui-panels'
import views from './views'
import wizard from './wizard'

const en: Record<string, string> = { ...guide, ...model, ...analysis, ...views, ...plan, ...uiApp, ...uiPanels, ...wizard }
export default en
