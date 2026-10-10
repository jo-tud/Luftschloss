/**
 * Text kopieren. Die Clipboard-API gibt es nur auf sicheren Seiten (https, localhost) – im WLAN über
 * http://192.168.… fehlt sie. Dann über ein verstecktes Textfeld kopieren. false, wenn beides scheitert.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // weiter mit dem Ersatzweg
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
