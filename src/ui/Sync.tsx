import { useEffect, useState } from 'react'
import { renderSVG } from 'uqr'
import { copyText } from './clipboard'
import { t, tr } from '../i18n'
import { migrate, useStore } from '../state/store'
import type { Project } from '../model/types'

/**
 * Abgleich mit dem Laptop im WLAN (npm run lan). Läuft die App ohne diesen Server (z. B. als
 * statische Seite), bleibt alles lokal im Browser.
 */

const DEVICE_KEY = 'luftschloss.geraet'
const REV_KEY = 'luftschloss.abgleich-stand'
const DIRTY_KEY = 'luftschloss.abgleich-offen'

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

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeKey(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ohne Speicher gilt der Stand nur bis zum Neuladen
  }
}

type Remote = { project: unknown; rev: number }

/**
 * Abgleich über eine Revision, die der Server vergibt (nicht über die Uhren der Geräte):
 * - Eigene Änderungen gelten als offen, bis der Server sie bestätigt hat; fehlgeschlagene Sendungen
 *   werden wiederholt, auch über einen Neustart hinweg.
 * - Ein fremder Stand wird nur übernommen, wenn hier nichts offen ist.
 * - Haben beide Geräte geändert, gilt der Stand hier; der andere bleibt über Rückgängig erreichbar.
 */
export function ServerSync() {
  useEffect(() => {
    let stop = false
    let rev = Number(readKey(REV_KEY) ?? 0)
    let dirty = readKey(DIRTY_KEY) === '1'
    let seq = 0
    let applying = false
    let sending = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const me = deviceId()
    const setRev = (r: number) => {
      rev = r
      writeKey(REV_KEY, String(r))
    }
    const setDirty = (d: boolean) => {
      dirty = d
      writeKey(DIRTY_KEY, d ? '1' : '0')
    }
    const status = (st: 'verbunden' | 'getrennt', lastSync?: number) =>
      useStore.setState((s) => ({ server: s.server && { ...s.server, status: st, ...(lastSync ? { lastSync } : {}) } }))
    const toast = (msg: string, ms = 2500) => {
      useStore.setState({ toast: msg })
      setTimeout(() => useStore.setState({ toast: null }), ms)
    }
    const apply = (remote: Remote): boolean => {
      let p: Project
      try {
        p = migrate(remote.project as Project)
      } catch {
        return false
      }
      applying = true
      useStore.getState().replaceProject(p)
      applying = false
      return true
    }
    /** Beide Geräte haben geändert: der fremde Stand kommt in den Verlauf, der eigene gilt und wird gesendet */
    const merge = (remote: Remote) => {
      const local = useStore.getState().project
      if (apply(remote)) {
        applying = true
        useStore.getState().replaceProject(local)
        applying = false
        toast(t('Auch auf dem anderen Gerät wurde geändert. Dieser Stand gilt – der andere ist mit Rückgängig erreichbar.'), 6000)
      }
      setRev(remote.rev)
      setDirty(true)
      push(0)
    }
    const push = (delay = 700) => {
      clearTimeout(timer)
      timer = setTimeout(() => void send(), delay)
    }
    const send = async () => {
      if (stop || !dirty || !useStore.getState().server) return
      if (sending) return push(500)
      sending = true
      const at = seq
      try {
        const r = await fetch('/api/projekt', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseRev: rev, device: me, savedAt: Date.now(), project: useStore.getState().project }),
        })
        if (r.status === 409) merge((await r.json()) as Remote)
        else if (r.ok) {
          setRev(((await r.json()) as { rev: number }).rev)
          // während des Sendens weiter geändert: bleibt offen und geht mit der nächsten Sendung
          if (seq === at) setDirty(false)
          else push()
          status('verbunden', Date.now())
        } else throw new Error(String(r.status))
      } catch {
        status('getrennt')
        push(3000)
      } finally {
        sending = false
      }
    }
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
        const remote = (await fetch('/api/projekt').then((r) => (r.ok ? r.json() : null))) as Remote | null
        if (remote && remote.rev !== rev) {
          if (dirty) merge(remote)
          else if (apply(remote)) setRev(remote.rev)
        } else if (!remote || dirty) {
          // Server noch leer oder hier liegt Ungesendetes
          setDirty(true)
          push(0)
        }
      } catch {
        // kein Server: rein lokal arbeiten
      }
    }
    const unsub = useStore.subscribe((s, prev) => {
      if (s.project !== prev.project && !applying && (s.server || rev > 0)) {
        seq++
        setDirty(true)
        if (s.server) push()
      }
    })
    const poll = setInterval(async () => {
      const s = useStore.getState()
      if (!s.server) return
      try {
        const meta = await fetch('/api/projekt?meta').then((r) => (r.ok ? r.json() : null))
        if (meta && meta.rev !== rev) {
          // Hier Offenes zuerst senden – der Server antwortet mit 409, dann wird zusammengeführt
          if (dirty) return push(0)
          const remote = (await fetch('/api/projekt').then((r) => (r.ok ? r.json() : null))) as Remote | null
          if (remote && !dirty && apply(remote)) {
            setRev(remote.rev)
            status('verbunden', Date.now())
            toast(t('Vom anderen Gerät aktualisiert'))
          }
        } else if (!dirty && s.server.status !== 'verbunden') status('verbunden')
      } catch {
        status('getrennt')
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
      <div className="modal share" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('Auf dem Tablet öffnen')}>
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
                    <button className="link" onClick={() => void copyText(u).then((ok) => ok && setCopied(u))}>
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
  return (
    <div className="toast" role="status" aria-live="polite">
      {tr(toast)}
    </div>
  )
}
