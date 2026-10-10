import { useEffect, useState } from 'react'
import { renderSVG } from 'uqr'
import { t, tr } from '../i18n'
import { migrate, useStore } from '../state/store'
import type { Project } from '../model/types'

/**
 * Abgleich mit dem Laptop im WLAN (npm run lan). Läuft die App ohne diesen Server (z. B. als
 * statische Seite), bleibt alles lokal im Browser.
 */

const DEVICE_KEY = 'luftschloss.geraet'
const SAVED_KEY = 'luftschloss.gespeichert'

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = Math.random().toString(36).slice(2, 10)
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return 'unbekannt'
  }
}

function localSavedAt(): number {
  try {
    return Number(localStorage.getItem(SAVED_KEY) ?? 0)
  } catch {
    return 0
  }
}

export function ServerSync() {
  useEffect(() => {
    let stop = false
    let lastSent = 0
    let lastChange = 0
    let applying = false
    const me = deviceId()
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 2500)
    const start = async () => {
      // Statisch gehostete Online-Version (GitHub Pages) hat keinen Abgleich-Server
      if (location.hostname.endsWith('github.io')) return
      try {
        const info = await fetch('/api/info', { signal: ctrl.signal }).then((r) => (r.ok ? r.json() : null))
        clearTimeout(timeout)
        if (!info || stop) return
        useStore.setState({ server: { ips: info.ips, port: info.port, status: 'verbunden', lastSync: 0 } })
        // Neueren Stand vom Server übernehmen
        const remote = await fetch('/api/projekt').then((r) => (r.ok ? r.json() : null))
        if (remote && remote.savedAt > localSavedAt() && remote.project) {
          applying = true
          useStore.getState().replaceProject(migrate(remote.project as Project))
          applying = false
          lastSent = remote.savedAt
          localStorage.setItem(SAVED_KEY, String(remote.savedAt))
        } else push(useStore.getState().project)
      } catch {
        // kein Server: rein lokal arbeiten
      }
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const push = (project: Project) => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        const savedAt = Date.now()
        try {
          const r = await fetch('/api/projekt', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ savedAt, device: me, project }) })
          if (r.ok) {
            lastSent = savedAt
            localStorage.setItem(SAVED_KEY, String(savedAt))
            useStore.setState((s) => ({ server: s.server && { ...s.server, status: 'verbunden', lastSync: savedAt } }))
          }
        } catch {
          useStore.setState((s) => ({ server: s.server && { ...s.server, status: 'getrennt' } }))
        }
      }, 700)
    }
    const unsub = useStore.subscribe((s, prev) => {
      if (s.project !== prev.project && s.server && !applying) {
        lastChange = Date.now()
        push(s.project)
      }
    })
    const poll = setInterval(async () => {
      const s = useStore.getState()
      if (!s.server) return
      try {
        const meta = await fetch('/api/projekt?meta').then((r) => (r.ok ? r.json() : null))
        if (meta && meta.savedAt > lastSent && meta.device !== me && Date.now() - lastChange > 3000) {
          const remote = await fetch('/api/projekt').then((r) => (r.ok ? r.json() : null))
          if (!remote?.project) return
          applying = true
          useStore.getState().replaceProject(migrate(remote.project as Project))
          applying = false
          lastSent = remote.savedAt
          localStorage.setItem(SAVED_KEY, String(remote.savedAt))
          useStore.setState((st) => ({ server: st.server && { ...st.server, status: 'verbunden', lastSync: remote.savedAt }, toast: t('Vom anderen Gerät aktualisiert') }))
          setTimeout(() => useStore.setState({ toast: null }), 2500)
        } else if (s.server.status !== 'verbunden') useStore.setState({ server: { ...s.server, status: 'verbunden' } })
      } catch {
        useStore.setState((st) => ({ server: st.server && { ...st.server, status: 'getrennt' } }))
      }
    }, 4000)
    void start()
    return () => {
      stop = true
      unsub()
      clearInterval(poll)
      clearTimeout(timer)
    }
  }, [])
  return null
}

export function ShareDialog() {
  const show = useStore((s) => s.showShare)
  const server = useStore((s) => s.server)
  const set = useStore((s) => s.set)
  const [copied, setCopied] = useState('')
  if (!show) return null
  const urls = server ? server.ips.map((ip) => `http://${ip}:${server.port}/`) : []
  return (
    <div className="modal-bg" onClick={() => set({ showShare: false })}>
      <div className="modal share" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('Auf dem Tablet öffnen')}</h2>
          <button className="close" onClick={() => set({ showShare: false })} aria-label={t('Schließen')}>
            ✕
          </button>
        </header>
        <div className="modal-body">
          {server ? (
            <>
              <p>
                {t('Tablet ins selbe WLAN, QR-Code scannen. Laptop und Tablet arbeiten dann am')} <b>{t('selben Projekt')}</b> – {t('Änderungen gleichen sich alle paar Sekunden ab.')}
              </p>
              <div className="qr-list">
                {urls.map((u) => (
                  <div key={u} className="qr">
                    <div dangerouslySetInnerHTML={{ __html: renderSVG(u, { border: 1 }) }} />
                    <button className="link" onClick={() => navigator.clipboard?.writeText(u).then(() => setCopied(u))}>
                      {u}
                    </button>
                    {copied === u && <small className="ok">{t('kopiert')}</small>}
                  </div>
                ))}
              </div>
              <p className="hint">{t('Abgleich: {status}.', { status: tr(server.status) })}</p>
              <details>
                <summary>{t('Unterwegs ohne gemeinsames WLAN? (für Fortgeschrittene)')}</summary>
                <p className="hint">
                  {t('Mit der App Tailscale auf Laptop und Tablet entsteht ein privates Netz. Dann die Tailscale-Adresse des Laptops mit Port {port} öffnen. Mit', { port: server.port })} <code>{`tailscale serve --bg ${server.port}`}</code>{' '}
                  {t('gibt es eine HTTPS-Adresse, über die sich Luftschloss auf dem Tablet installieren lässt und offline läuft.')}
                </p>
              </details>
            </>
          ) : (
            <>
              {location.protocol === 'https:' && (
                <>
                  <p>{t('Diese Online-Version direkt auf dem Tablet öffnen – QR-Code scannen, dann im Browser „Zum Home-Bildschirm“ wählen, damit Luftschloss wie eine App startet und auch offline läuft.')}</p>
                  <div className="qr-list">
                    <div className="qr">
                      <div dangerouslySetInnerHTML={{ __html: renderSVG(location.origin + location.pathname, { border: 1 }) }} />
                      <small>{location.origin + location.pathname}</small>
                    </div>
                  </div>
                  <p className="hint">{t('Jedes Gerät speichert sein eigenes Projekt. Zum Übertragen im Projektmenü „Als Datei speichern“ und auf dem anderen Gerät „Öffnen…“.')}</p>
                  <h3>{t('Laptop und Tablet gleichzeitig am selben Projekt')}</h3>
                </>
              )}
              <p>{t('Diese Seite läuft ohne Abgleich-Server. So geht es auf dem Tablet:')}</p>
              <ol>
                <li>
                  {t('Auf dem Laptop im Projektordner')} <code>{'npm run lan'}</code> {t('starten.')}
                </li>
                <li>{t('Diese Seite über die angezeigte Netzwerk-Adresse öffnen – dann erscheint hier ein QR-Code für das Tablet.')}</li>
                <li>
                  {t('Alternativ: Im Projektmenü oben links „Als Datei speichern“ und die Datei auf dem Tablet mit „Öffnen…“ laden.')}
                </li>
              </ol>
              <p className="hint">{t('Mit Tailscale klappt das auch ohne gemeinsames WLAN, z. B. auf der Baustelle.')}</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function Toast() {
  const toast = useStore((s) => s.toast)
  if (!toast) return null
  return <div className="toast">{tr(toast)}</div>
}
