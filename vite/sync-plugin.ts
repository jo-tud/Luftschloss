import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Projekt-Abgleich im WLAN: Läuft Luftschloss per `npm run lan` auf dem Laptop, holen sich Tablet
 * und Laptop den gemeinsamen Projektstand über /api/projekt. Gespeichert wird in ./projekte/.
 * Nur für das lokale Netz gedacht (keine Anmeldung) – nicht ins Internet freigeben.
 */
/** Größter angenommener Projektstand (Fotos liegen nicht im Projekt) */
const MAX_BODY = 20_000_000

export function projektSync(dir = 'projekte'): Plugin {
  const folder = join(process.cwd(), dir)
  const file = join(folder, 'aktuell.json')
  type Stored = { savedAt: number; device: string; project: unknown; rev: number }
  const read = (): Stored | null => {
    try {
      if (!existsSync(file)) return null
      const s = JSON.parse(readFileSync(file, 'utf8'))
      // ältere Stände ohne Revision
      return { ...s, rev: typeof s.rev === 'number' ? s.rev : 1 }
    } catch {
      return null
    }
  }
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(body))
  }
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? ''
    if (!url.startsWith('/api/')) return next()
    if (url.startsWith('/api/info')) {
      const ips = Object.values(networkInterfaces())
        .flat()
        .filter((i) => i && i.family === 'IPv4' && !i.internal)
        .map((i) => i!.address)
      const stored = read()
      return json(res, 200, { ips, port: req.socket.localPort, savedAt: stored?.savedAt ?? 0 })
    }
    if (url.startsWith('/api/projekt')) {
      if (req.method === 'GET') {
        const stored = read()
        if (!stored) return json(res, 404, { error: 'noch kein Projekt' })
        if (url.includes('meta')) return json(res, 200, { savedAt: stored.savedAt, device: stored.device, rev: stored.rev })
        return json(res, 200, stored)
      }
      if (req.method === 'PUT') {
        // Revision vom Server statt Uhrzeit der Geräte: Wer auf einem veralteten Stand speichert, bekommt
        // 409 mit dem aktuellen Stand und führt selbst zusammen – so geht keine Änderung verloren
        let body = ''
        let tooBig = false
        req.on('data', (c) => {
          if (tooBig) return
          body += c
          if (body.length > MAX_BODY) {
            tooBig = true
            body = ''
            json(res, 413, { error: 'zu groß' })
          }
        })
        req.on('end', () => {
          if (tooBig) return
          try {
            const data = JSON.parse(body)
            const p = data?.project
            if (!p || p.version !== 1 || typeof p.room !== 'object') return json(res, 400, { error: 'kein Luftschloss-Projekt' })
            const stored = read()
            const rev = stored?.rev ?? 0
            if (stored && data.baseRev !== rev) return json(res, 409, stored)
            const next = { savedAt: Number(data.savedAt) || Date.now(), device: String(data.device ?? ''), project: p, rev: rev + 1 }
            mkdirSync(folder, { recursive: true })
            writeFileSync(file, JSON.stringify(next))
            json(res, 200, { ok: true, rev: next.rev })
          } catch (e) {
            json(res, 400, { error: (e as Error).message })
          }
        })
        return
      }
    }
    json(res, 404, { error: 'unbekannt' })
  }
  return {
    name: 'luftschloss-sync',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}
