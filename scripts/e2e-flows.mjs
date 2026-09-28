#!/usr/bin/env node
/**
 * Kratos contract checks for the flow handling in src/lib/flow-nav.ts
 * (docs/FLOWS.md). Runs against a LOCAL Kratos only — it creates and deletes
 * test identities through the admin API. No dependencies (Node >= 20).
 *
 *   KRATOS=http://localhost:4433 KRATOS_ADMIN=http://localhost:4434 \
 *   RETURN_TO=http://localhost:3001/ npm run test:e2e
 *
 * Each check prints PASS/FAIL; exit code 1 on any failure.
 */
import crypto from 'node:crypto'

const K = process.env.KRATOS || 'http://localhost:4433'
const A = process.env.KRATOS_ADMIN || 'http://localhost:4434'
const RT = process.env.RETURN_TO || 'http://localhost:3001/'
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(A)) {
  console.error('Refusing to run: KRATOS_ADMIN must be a local Kratos.')
  process.exit(2)
}

class Jar {
  c = new Map()
  set(res) {
    for (const s of res.headers.getSetCookie?.() ?? []) {
      const [kv, ...attrs] = s.split(';')
      const i = kv.indexOf('=')
      const k = kv.slice(0, i).trim()
      const v = kv.slice(i + 1)
      if (v === '' || attrs.some((a) => /max-age=0/i.test(a))) this.c.delete(k)
      else this.c.set(k, v)
    }
  }
  header() { return [...this.c].map(([k, v]) => `${k}=${v}`).join('; ') }
}

async function req(jar, url, { method = 'GET', json, accept = 'application/json' } = {}) {
  const headers = { accept, cookie: jar.header() }
  let body
  if (json) { headers['content-type'] = 'application/json'; body = JSON.stringify(json) }
  const res = await fetch(url, { method, headers, body, redirect: 'manual' })
  jar.set(res)
  const t = await res.text()
  let data
  try { data = JSON.parse(t) } catch { data = t }
  return { status: res.status, location: res.headers.get('location'), data }
}

const csrf = (flow) => flow.ui.nodes.find((n) => n.attributes.name === 'csrf_token')?.attributes.value
const groups = (flow) => [...new Set(flow.ui.nodes.map((n) => n.group))]

function totp(secret, t = Date.now()) {
  const alph = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) bits += alph.indexOf(ch).toString(2).padStart(5, '0')
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)))
  const ctr = Buffer.alloc(8)
  ctr.writeBigUInt64BE(BigInt(Math.floor(t / 30000)))
  const h = crypto.createHmac('sha1', key).update(ctr).digest()
  const o = h[19] & 15
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0')
}

async function login(jar, email, password, qs = '') {
  const flow = (await req(jar, `${K}/self-service/login/browser${qs}`)).data
  const r = await req(jar, `${K}/self-service/login?flow=${flow.id}`, {
    method: 'POST',
    json: { method: 'password', identifier: email, password, csrf_token: csrf(flow) },
  })
  return { flow, r }
}

let failed = 0
function check(name, ok, detail = '') {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const email = `e2e-flows-${Date.now()}@example.test`
const password = 'E2e-Flows-Long-Password-4471'
const created = await (await fetch(`${A}/admin/identities`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ schema_id: 'default', traits: { email }, credentials: { password: { config: { password } } } }),
})).json()
if (!created.id) {
  console.error('Could not create the test identity:', created)
  process.exit(2)
}

try {
  const qs = `?return_to=${encodeURIComponent(RT)}`

  // 1. Browser redirects carry only ?flow= — return_to lives on the flow.
  const init = await req(new Jar(), `${K}/self-service/login/browser${qs}`, { accept: 'text/html' })
  const flowUrl = init.location ? new URL(init.location) : null
  check('login init lands on ?flow= without return_to', init.status === 303 && flowUrl?.searchParams.get('flow') && !flowUrl.searchParams.get('return_to'), init.location ?? '')

  // 2. Enrol TOTP.
  const j = new Jar()
  await login(j, email, password)
  const sf = (await req(j, `${K}/self-service/settings/browser`)).data
  const secret = sf.ui.nodes.find((n) => n.attributes.id === 'totp_secret_key')?.attributes.text?.text
  const en = await req(j, `${K}/self-service/settings?flow=${sf.id}`, { method: 'POST', json: { method: 'totp', totp_code: totp(secret), csrf_token: csrf(sf) } })
  const cw = en.data.continue_with ?? []
  check('TOTP enrolment succeeds', en.status === 200, `continue_with: ${cw.map((c) => c.action).join(',')}`)
  // The /two-step gate enrols an aal1 session that has no second factor: Kratos must offer the
  // settings flow at aal1 then (step 2 did), and the enrolment itself proves the factor — the gate
  // then sends the person on without a second prompt (else it steps up; see src/lib/two-step.ts).
  const afterEnrol = (await req(j, `${K}/sessions/whoami`)).data
  check('enrolling TOTP at aal1 raises the session to aal2', afterEnrol.authenticator_assurance_level === 'aal2', afterEnrol.authenticator_assurance_level ?? '')

  // 3. First factor for an enrolled identity: aal1 session (whoami aal1) or a
  //    browser_location_change_required to the aal2 flow (highest_available).
  const j2 = new Jar()
  const l = await login(j2, email, password, qs)
  const moved = l.r.status === 422 && l.r.data.error?.id === 'browser_location_change_required'
  const aal1 = l.r.status === 200 && l.r.data.session?.authenticator_assurance_level === 'aal1'
  check('first factor → aal1 session or 422 to aal2', moved || aal1, moved ? 'whoami highest_available' : 'whoami aal1: the UI must prompt the second factor')

  // 4. aal2 flow keeps return_to and offers TOTP; TOTP completes to return_to.
  const up = (await req(j2, `${K}/self-service/login/browser?aal=aal2&return_to=${encodeURIComponent(RT)}`)).data
  check('aal2 flow keeps return_to and offers totp', up.return_to === RT && groups(up).includes('totp'), groups(up).join(','))
  const t = await req(j2, `${K}/self-service/login?flow=${up.id}`, { method: 'POST', json: { method: 'totp', totp_code: totp(secret), csrf_token: csrf(up) } })
  const rbt = (t.data.continue_with ?? []).find((c) => c.action === 'redirect_browser_to')?.redirect_browser_to
  check('TOTP → aal2 session, continue_with to return_to', t.data.session?.authenticator_assurance_level === 'aal2' && rbt === RT, rbt ?? String(t.status))

  // 5. Settings with an aal1 session: JSON 403 session_aal2_required whose
  //    redirect has NO return_to (flow-nav adds it).
  const j3 = new Jar()
  await login(j3, email, password)
  const s3 = await req(j3, `${K}/self-service/settings/browser`)
  const s3u = s3.data.redirect_browser_to ? new URL(s3.data.redirect_browser_to) : null
  check('settings at aal1 → 403 session_aal2_required', s3.status === 403 && s3.data.error?.id === 'session_aal2_required' && s3u?.searchParams.get('aal') === 'aal2', s3.data.redirect_browser_to ?? '')

  // 6. Settings without a session returns to OUR return_to, not settings
  //    (why /settings signs in first itself).
  const s4 = await req(new Jar(), `${K}/self-service/settings/browser${qs}`, { accept: 'text/html' })
  const s4rt = s4.location ? new URL(s4.location).searchParams.get('return_to') : null
  check('settings without session → login returning to return_to', s4.status === 303 && s4rt === RT, s4.location ?? '')

  // 7. A submit without the flow's CSRF cookie → security_csrf_violation (flow-nav restarts).
  const j5 = new Jar()
  const lf = (await req(j5, `${K}/self-service/login/browser${qs}`)).data
  const exp = await req(j5, `${K}/self-service/login?flow=${lf.id}`, { method: 'POST', json: { method: 'password', identifier: email, password: 'x', csrf_token: 'wrong' } })
  check('CSRF mismatch → 403 security_csrf_violation', exp.status === 403 && exp.data.error?.id === 'security_csrf_violation')

  // 8. Plain login init with a session → session_already_available.
  const again = await req(j2, `${K}/self-service/login/browser${qs}`)
  check('login init with a session → 400 session_already_available', again.status === 400 && again.data.error?.id === 'session_already_available')

  // 9. aal2 init without a session → 401 session_aal1_required.
  const n = await req(new Jar(), `${K}/self-service/login/browser?aal=aal2`)
  check('aal2 init without session → 401 session_aal1_required', n.status === 401 && n.data.error?.id === 'session_aal1_required')

  // 10. Unknown and known addresses get the same recovery answer.
  const rj = new Jar()
  const rf = (await req(rj, `${K}/self-service/recovery/browser`)).data
  const method = groups(rf).includes('link') ? 'link' : 'code'
  const known = await req(rj, `${K}/self-service/recovery?flow=${rf.id}`, { method: 'POST', json: { method, email, csrf_token: csrf(rf) } })
  const rj2 = new Jar()
  const rf2 = (await req(rj2, `${K}/self-service/recovery/browser`)).data
  const unknown = await req(rj2, `${K}/self-service/recovery?flow=${rf2.id}`, { method: 'POST', json: { method, email: `nobody-${Date.now()}@example.test`, csrf_token: csrf(rf2) } })
  const ids = (r) => (r.data.ui?.messages ?? []).map((m) => m.id).join(',')
  check('recovery does not reveal whether an address exists', ids(known) === ids(unknown), `${method}: ${ids(known)} vs ${ids(unknown)}`)
} finally {
  await fetch(`${A}/admin/identities/${created.id}`, { method: 'DELETE' })
}
process.exit(failed ? 1 : 0)
