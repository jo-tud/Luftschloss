import type Anthropic from '@anthropic-ai/sdk'

/**
 * Preis-Agent mit eigenem API-Schlüssel (BYOK): Claude recherchiert per Websuche die aktuellen
 * Baumarktpreise und antwortet im CSV-Format des Recherche-Prompts. Der Schlüssel geht nur direkt
 * vom Browser an die Anthropic-API.
 */

export const PRICE_MODEL = 'claude-opus-5-5'

export interface PriceAgentProgress {
  searches: string[]
  sources: { title: string; url: string }[]
}

export interface PriceAgentResult {
  text: string
  sources: { title: string; url: string }[]
  usage: { input: number; output: number; searches: number }
  servedBy: string
}

export async function runPriceAgent(apiKey: string, prompt: string, onProgress: (p: PriceAgentProgress) => void, signal?: AbortSignal): Promise<PriceAgentResult> {
  // Das SDK wird erst beim ersten Aufruf geladen und bleibt so aus dem Haupt-Bundle
  const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
  const client = new AnthropicSDK({ apiKey, dangerouslyAllowBrowser: true })
  const progress: PriceAgentProgress = { searches: [], sources: [] }
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: prompt }]
  const usage = { input: 0, output: 0, searches: 0 }
  let final: Anthropic.Beta.BetaMessage | undefined

  // Die Websuche läuft serverseitig; bei langen Recherchen pausiert der Turn (pause_turn) und wird fortgesetzt
  for (let round = 0; round < 5; round++) {
    const stream = client.beta.messages.stream(
      {
        model: PRICE_MODEL,
        max_tokens: 32000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        tools: [
          {
            type: 'web_search_20260209',
            name: 'web_search',
            max_uses: 25,
            user_location: { type: 'approximate', country: 'DE' },
          },
        ],
        messages,
      },
      { signal },
    )
    stream.on('contentBlock', (block) => {
      if (block.type === 'server_tool_use' && block.name === 'web_search') {
        const q = typeof block.input.query === 'string' ? block.input.query : ''
        progress.searches = [...progress.searches, q]
        onProgress(progress)
      } else if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        const known = new Set(progress.sources.map((s) => s.url))
        progress.sources = [...progress.sources, ...block.content.filter((r) => !known.has(r.url)).map((r) => ({ title: r.title, url: r.url }))]
        onProgress(progress)
      }
    })
    final = await stream.finalMessage()
    usage.input += final.usage.input_tokens
    usage.output += final.usage.output_tokens
    usage.searches += final.usage.server_tool_use?.web_search_requests ?? 0
    if (final.stop_reason !== 'pause_turn') break
    messages.push({ role: 'assistant', content: final.content })
  }
  if (!final) throw new Error('Keine Antwort erhalten.')
  if (final.stop_reason === 'refusal') throw new Error('Die Anfrage wurde abgelehnt. Bitte den Prompt kopieren und in einem Chat verwenden.')
  const text = final.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  return { text, sources: progress.sources, usage, servedBy: final.model }
}

const KEY = 'luftschloss.anthropic-key'

export function loadApiKey(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function storeApiKey(key: string | null) {
  try {
    if (key) localStorage.setItem(KEY, key)
    else localStorage.removeItem(KEY)
  } catch {
    // ohne Speicher bleibt der Schlüssel nur für diese Sitzung
  }
}
