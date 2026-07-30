// build/line-health-check.mjs — is the LINE bot actually alive?
//
// Why this exists: every failure mode this integration has is SILENT. The webhook
// is only ever called by LINE, and its errors are deliberately opaque (the catch
// block logs nothing, by design). So an expired channel access token, a redeployed
// function that lost its secrets, or a Supabase project paused for inactivity all
// look identical from the outside: you tap Menu, nothing comes back, and you have
// no idea how long it has been that way.
//
// Supabase's free tier pauses a project after 7 days with no activity. This repo's
// PROJECT_CONTEXT has carried "add a keepalive cron" as a backlog item for exactly
// that reason. A scheduled liveness check IS that keepalive — hitting the database
// on a schedule is what stops the pause — so this is one job, not two.
//
// Everything here is PUBLIC. The project URL and publishable key are already in
// auth.js and ship to every browser; there is no secret to leak, which is why this
// can run in CI with no repository secrets configured at all. Do not add one: if a
// check ever seems to need the service-role key or a LINE token, that check belongs
// somewhere else.
//
// Run: node build/line-health-check.mjs            check production
//      node build/line-health-check.mjs --selftest prove the checks still bite

// Source of truth for both values is auth.js. They are duplicated rather than
// imported because auth.js is browser code that assumes `window`.
const SUPABASE_URL = process.env.MTP_SUPABASE_URL || 'https://qjaywadzvwvcspdsjxth.supabase.co';
const PUBLISHABLE_KEY = process.env.MTP_SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_qJxPQAYlwBZnfXtVSqQnPQ_0RrKvSlB';

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/line-todo-webhook`;
const SNAPSHOT_URL = `${SUPABASE_URL}/rest/v1/mtp_line_snapshots?select=updated_at&limit=1`;

// Each check returns { ok, detail }. `detail` is printed on both paths, so it must
// never contain a task title, a LINE user id, or a token — the same rule the Edge
// Function follows. Status codes and array lengths only.
const CHECKS = [
  {
    name: 'function responds to GET with 405',
    why: 'the function is deployed, routable, and its method gate is intact',
    async run(fetchImpl) {
      const res = await fetchImpl(FUNCTION_URL, { method: 'GET' });
      return { ok: res.status === 405, detail: `status ${res.status}, expected 405` };
    },
  },
  {
    name: 'function rejects an unsigned POST with 401',
    why: 'raw-body HMAC verification still runs before anything is parsed',
    async run(fetchImpl) {
      // No x-line-signature header. verifyLineSignature() returns false on a missing
      // signature without touching the body, so this never reaches event handling.
      const res = await fetchImpl(FUNCTION_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      return { ok: res.status === 401, detail: `status ${res.status}, expected 401` };
    },
  },
  {
    // This check asserts DENIAL, not a successful read, and the distinction is the
    // whole design. The activation migration does
    //   revoke all on table public.mtp_line_snapshots from anon;
    // so an anonymous caller never gets rows and never gets 200 — it gets a
    // privilege error. Expecting "200 with an empty array" would fail forever.
    //
    // Asserting denial is also the stronger assertion: a 200 here, empty array or
    // not, means the revoke was undone and anonymous callers can reach owner
    // snapshots. That is Critical, and this is the only automated thing watching
    // for it.
    //
    // It doubles as the keepalive because the privilege check happens inside
    // Postgres — the request reaches the database even though it is refused. A
    // paused project cannot refuse it: it fails to connect, or answers 5xx from
    // the gateway, which is why "denied" and "down" stay distinguishable.
    name: 'database refuses anonymous access to snapshots',
    why: 'the project is awake, PostgREST is up, and the anon revoke still holds',
    async run(fetchImpl) {
      const res = await fetchImpl(SNAPSHOT_URL, {
        headers: { apikey: PUBLISHABLE_KEY, authorization: `Bearer ${PUBLISHABLE_KEY}` },
      });
      if (res.status === 200) {
        return { ok: false, detail: 'status 200 — anon can read mtp_line_snapshots, GRANT/RLS REGRESSION' };
      }
      // PostgREST answers insufficient_privilege as 401 or 403 depending on role
      // and version. Both mean the same thing here, so accept either rather than
      // pinning a code that an upgrade could legitimately change.
      const denied = res.status === 401 || res.status === 403;
      return {
        ok: denied,
        detail: denied
          ? `status ${res.status} (anon denied, database reachable)`
          : `status ${res.status}, expected 401 or 403 — project paused or PostgREST down`,
      };
    },
  },
];

export async function runChecks(fetchImpl = globalThis.fetch) {
  const results = [];
  for (const check of CHECKS) {
    try {
      const { ok, detail } = await check.run(fetchImpl);
      results.push({ name: check.name, why: check.why, ok, detail });
    } catch (error) {
      // A thrown fetch is a real result: DNS failure, TLS failure and connection
      // refused are all ways the bot is down. Report the message, not the stack.
      results.push({ name: check.name, why: check.why, ok: false, detail: `request failed: ${error.message}` });
    }
  }
  return results;
}

function report(results) {
  for (const r of results) {
    console.log(`${r.ok ? '  ok  ' : ' FAIL '} ${r.name}`);
    console.log(`       ${r.detail}`);
    if (!r.ok) console.log(`       expected to prove: ${r.why}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed === 0
    ? `\nLINE health: PASS (${results.length}/${results.length})`
    : `\nLINE health: FAIL (${failed}/${results.length} checks failed)`);
  return failed;
}

// A checker that cannot fail is not a checker. The selftest drives the real check
// bodies with a stub fetch and asserts both directions — that a healthy production
// passes, and that each individual break is actually caught. It makes no network
// call, so it is safe to run in the ordinary test suite.
async function selftest() {
  const healthy = {
    [FUNCTION_URL]: (opts) => ({ status: opts?.method === 'GET' ? 405 : 401 }),
    [SNAPSHOT_URL]: () => ({ status: 401 }),
  };
  const stub = (overrides = {}) => async (url, opts) => {
    const handler = overrides[url] || healthy[url];
    if (!handler) throw new Error(`unexpected url in selftest: ${url}`);
    return handler(opts);
  };

  const cases = [
    ['healthy production passes', stub(), 0],
    // 403 is as valid a denial as 401; a version bump must not turn CI red.
    ['anon denial via 403 also passes', stub({ [SNAPSHOT_URL]: () => ({ status: 403 }) }), 0],
    ['function gone (404) is caught', stub({ [FUNCTION_URL]: () => ({ status: 404 }) }), 2],
    ['HMAC gate bypassed (unsigned POST accepted) is caught',
      stub({ [FUNCTION_URL]: (o) => ({ status: o?.method === 'GET' ? 405 : 200 }) }), 1],
    ['paused project (503) is caught', stub({ [SNAPSHOT_URL]: () => ({ status: 503 }) }), 1],
    // The one this file exists to catch: anon reaching owner snapshots at all.
    ['grant regression (anon read succeeds) is caught',
      stub({ [SNAPSHOT_URL]: () => ({ status: 200, json: async () => [] }) }), 1],
    ['network failure is caught', () => { throw new Error('ECONNREFUSED'); }, 3],
  ];

  let bad = 0;
  for (const [label, fetchImpl, expectedFailures] of cases) {
    const results = await runChecks(fetchImpl);
    const actual = results.filter((r) => !r.ok).length;
    const pass = actual === expectedFailures;
    if (!pass) bad += 1;
    console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${label} (${actual} failure(s), expected ${expectedFailures})`);
  }
  console.log(bad === 0 ? '\nSELFTEST PASS' : `\nSELFTEST FAIL (${bad} case(s))`);
  return bad;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const failed = process.argv.includes('--selftest') ? await selftest() : report(await runChecks());
  process.exit(failed === 0 ? 0 : 1);
}
