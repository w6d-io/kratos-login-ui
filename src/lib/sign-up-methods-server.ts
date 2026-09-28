import { schemaSignUpMethods, type SignUpMethod } from './sign-up-methods'

/**
 * Server-side: the sign-up methods Kratos' identity schema allows (sign-up-methods.ts), from Kratos'
 * public `GET /schemas`. The default schema (`default`, or the only one) is the one sign-up uses.
 * Cached a minute; a failure answers null (the page then says "choose how to sign in") and is
 * cached shorter.
 */
export function createSignUpMethodsService(o: { baseUrl: string; fetchImpl?: typeof fetch; now?: () => number; ttlMs?: number; errorTtlMs?: number; timeoutMs?: number }) {
  const now = o.now ?? Date.now
  let cached: { at: number; ttl: number; value: SignUpMethod[] | null } | null = null

  return async function current(): Promise<SignUpMethod[] | null> {
    if (cached && now() - cached.at < cached.ttl) return cached.value
    let value: SignUpMethod[] | null = null
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 2000)
    try {
      const res = await (o.fetchImpl ?? fetch)(`${o.baseUrl.replace(/\/+$/, '')}/schemas`, { signal: ctl.signal, redirect: 'error', cache: 'no-store', headers: { accept: 'application/json' } })
      if (res.ok) {
        const list = (await res.json()) as Array<{ id?: string; schema?: unknown }>
        const chosen = Array.isArray(list) ? (list.find((s) => s.id === 'default') ?? (list.length === 1 ? list[0] : undefined)) : undefined
        value = chosen ? schemaSignUpMethods(chosen.schema) : null
      }
    } catch {
      // unknown
    } finally {
      clearTimeout(timer)
    }
    cached = { at: now(), ttl: value ? (o.ttlMs ?? 60_000) : (o.errorTtlMs ?? 5_000), value }
    return value
  }
}

let service: ReturnType<typeof createSignUpMethodsService> | null = null

export function signUpMethodsService(baseUrl: string) {
  if (!service) service = createSignUpMethodsService({ baseUrl })
  return service
}
