/**
 * Output security helpers for remote command results.
 *
 * Redaction is *defence in depth*, not a guarantee: `vps_exec` can read any
 * secret a remote shell can read, which is exactly why arbitrary exec is not
 * allowed by the read-only agent policy (see VpsManager). These helpers keep
 * the obvious credential shapes out of job buffers, audit trails, and the UI.
 */

const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g
const SECRET_ASSIGNMENT = /(\b[A-Za-z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API[_-]?KEY|PRIVATE[_-]?KEY|CREDENTIAL|AUTH)[A-Za-z0-9_]*\s*[:=]\s*)(\S+)/gi
const BEARER = /(\bBearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi
const SUDO_PASSWORD_PROMPT = /(\[sudo\] password for [^:]+:\s*)/gi

/** Mask secret-looking values in arbitrary remote output. */
export function redactOutput(text: string): string {
  if (!text) return text
  return text
    .replace(PRIVATE_KEY_BLOCK, '[redacted private key]')
    // Bearer first: otherwise the assignment rule swallows the "Bearer" word
    // and leaves the token itself behind.
    .replace(BEARER, '$1***')
    .replace(SECRET_ASSIGNMENT, '$1***')
    .replace(SUDO_PASSWORD_PROMPT, '$1')
}

/** Redact a URL/userinfo form (`scheme://user:pass@host`). */
export function redactUrlCredentials(text: string): string {
  return text.replace(/([a-z][a-z0-9+.-]*:\/\/[^/\s:@]+):([^/\s@]+)@/gi, '$1:***@')
}

/**
 * A bounded text buffer that keeps the first and last slice of streamed
 * output. Remote commands can emit unbounded data; the job record must stay
 * small enough to persist, audit, and ship over IPC.
 */
export function createBoundedBuffer(maxBytes: number) {
  const head = Math.floor(maxBytes / 2)
  const tail = maxBytes - head
  let headText = ''
  let tailText = ''
  let truncated = false
  let pending = ''
  let inPrivateKey = false
  const store = (text: string): void => {
    const clean = redactUrlCredentials(redactOutput(text))
    if (headText.length < head) {
      const room = head - headText.length
      headText += clean.slice(0, room)
      if (clean.length <= room) return
      tailText = (tailText + clean.slice(room)).slice(-tail)
      truncated = true
      return
    }
    tailText = (tailText + clean).slice(-tail)
    truncated = true
  }
  const line = (text: string): void => {
    if (/-----BEGIN .*PRIVATE KEY-----/.test(text)) {
      inPrivateKey = true
      store('[redacted private key]\n')
    }
    if (inPrivateKey) {
      if (/-----END .*PRIVATE KEY-----/.test(text)) inPrivateKey = false
      return
    }
    store(text)
  }
  return {
    append(chunk: string): void {
      pending += chunk
      let newline: number
      while ((newline = pending.indexOf('\n')) >= 0) {
        line(pending.slice(0, newline + 1))
        pending = pending.slice(newline + 1)
      }
      // Oversized incomplete lines are withheld rather than exposing split secrets.
      if (pending.length > maxBytes) { pending = ''; store('[oversized line withheld]\n'); truncated = true }
    },
    flush(): void {
      if (pending) line(pending)
      pending = ''
    },
    value(): { text: string; truncated: boolean } {
      if (!truncated) return { text: headText, truncated: false }
      return { text: `${headText}\n…[output truncated]…\n${tailText}`, truncated: true }
    },
  }
}

export type BoundedBuffer = ReturnType<typeof createBoundedBuffer>
