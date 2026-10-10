import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { getLang, setLang } from './i18n'
import { useStore } from './state/store'
import { App } from './ui/App'
import './styles.css'

// Für automatisierte Tests und Fehlersuche im Browser erreichbar
;(window as unknown as { luftschloss: typeof useStore }).luftschloss = useStore

setLang(getLang())

/** Bei Sprachwechsel alles neu aufbauen – alle Texte kommen aus t() */
function Root() {
  const lang = useStore((s) => s.lang)
  return <App key={lang} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
