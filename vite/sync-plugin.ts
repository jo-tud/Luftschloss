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
export function projektSync(dir = 'projekte'): Plugin {
  const folder = join(process.cwd(), dir)
  const file = join(folder, 'aktuell.json')
  const read = (): { savedAt: number; device: string; project: unknown } | null => {
    try {
      return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
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
        if (url.includes('meta')) return json(res, 200, { savedAt: stored.savedAt, device: stored.device })
        return json(res, 200, stored)
      }
      if (req.method === 'PUT') {
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          try {
            const data = JSON.parse(body)
            if (!data?.project) return json(res, 400, { error: 'kein Projekt' })
            mkdirSync(folder, { recursive: true })
            writeFileSync(file, JSON.stringify(data))
            json(res, 200, { ok: true, savedAt: data.savedAt })
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
