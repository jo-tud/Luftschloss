import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useStore } from './state/store'
import { App } from './ui/App'
import './styles.css'

// Für automatisierte Tests und Fehlersuche im Browser erreichbar
;(window as unknown as { luftschloss: typeof useStore }).luftschloss = useStore

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
