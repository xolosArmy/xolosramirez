# Tonalli Memo on the homepages

Status: **IMPLEMENTED / TESTED (automated + live DTO harness) / BROWSER CHECKS EXECUTED / BLOCKED (CORS on served Xolos origins)**.
Keep the PR in **draft**. The homepage feed is not operational in a real browser from Xolos Ramírez origins. Do not treat the screenshots below as a working live feed.

## Scope and source baseline

- Target repository: `xolosArmy/xolosramirez`, clean `main` at `d527ef9fa4c0c6aa62945d1d7dde7338cdc1d2d2`, new branch `feat/tonalli-memo-home-feed`.
- Read the repository README, implementation notes, existing journey documentation, HTMLHint configuration and existing tests. No `AGENTS.md`, `.github` workflow or Canonical Roadmap Operating Instruction was present in the inspected current repository trees. An exact-title search in the three repositories did not locate that instruction. No roadmap, gate or other repository was modified.
- The local checkout was materialized from the GitHub connector because direct Git transport was unavailable. All blobs, the root tree and the signed upstream commit were checked against their original Git object hashes. This is a shallow local snapshot of the exact main commit, not a substitute base commit.
- Only the Teyolías promotional card inside the existing two-column section is replaced. Its sibling guide card, the enclosing section and all other homepage content retain their exact source and order. The only additional homepage changes are the component CSS and deferred script references.
- Both Teyolías pages, navigation links, available pages, profiles, photos, videos, prices and contact flows are untouched. Metadata (including title, canonical, hreflang and JSON-LD) is byte-for-byte preserved.

## Read-only reference evidence (12 September 2026 UTC)

`tonalli-memo` main: `aa58c5f24e0263e6dda54f913791bb94aff33c5a`.
`RMZWallet` main observed: `860e7223cbe74476efdca81b249d2a7d3c147fbb`.

- [RMZWallet feed documentation](https://github.com/xolosArmy/RMZWallet/blob/860e7223cbe74476efdca81b249d2a7d3c147fbb/docs/tonalli-memo-feed.md)
- [RMZWallet client](https://github.com/xolosArmy/RMZWallet/blob/860e7223cbe74476efdca81b249d2a7d3c147fbb/src/integrations/tonalliMemo/client.ts), [guards](https://github.com/xolosArmy/RMZWallet/blob/860e7223cbe74476efdca81b249d2a7d3c147fbb/src/integrations/tonalliMemo/guards.ts), [URL handling](https://github.com/xolosArmy/RMZWallet/blob/860e7223cbe74476efdca81b249d2a7d3c147fbb/src/integrations/tonalliMemo/format.ts)
- [RMZWallet production rewrite](https://github.com/xolosArmy/RMZWallet/blob/860e7223cbe74476efdca81b249d2a7d3c147fbb/vercel.json)
- [Indexer API contract](https://github.com/xolosArmy/tonalli-memo/blob/aa58c5f24e0263e6dda54f913791bb94aff33c5a/apps/indexer/src/api/dto.ts), [routes](https://github.com/xolosArmy/tonalli-memo/blob/aa58c5f24e0263e6dda54f913791bb94aff33c5a/apps/indexer/src/api/routes.ts), [CORS](https://github.com/xolosArmy/tonalli-memo/blob/aa58c5f24e0263e6dda54f913791bb94aff33c5a/apps/indexer/src/api/server.ts), [canonical feed order](https://github.com/xolosArmy/tonalli-memo/blob/aa58c5f24e0263e6dda54f913791bb94aff33c5a/apps/indexer/src/db/store.ts)

| Item | Verified evidence / remaining qualification |
| --- | --- |
| Configured public HTTPS API | `https://memo-api.xolosarmy.xyz/api/v1`, from the current wallet production rewrite. Direct HTTP JSON from this environment returned 200 with 4 items. Browser CORS from `https://xolosramirez.com` and from the local preview did not. |
| Six most recent entries | `GET /api/v1/feed?limit=6`; API limit range is 1–100, default 25. The homepage makes only this request, once. |
| Other public routes | `GET /api/v1/health` and `GET /api/v1/tx/:txid` exist in the current API source. The homepage does not need extra health or detail requests. |
| Public interface | `https://app.tonalli.cash/memo` opened successfully in the browser and displayed four posts. No wallet connection or credentials were required. |
| Publication detail | `https://app.tonalli.cash/memo/tx/924874e080de16770921a9e5bb1e0d4603b27157657bc193ebe8063e469bf4b2` opened successfully and showed `VERIFIED`, `confirmed`, block 966360 and the original Trivia Xolo message. |
| API within the wallet | The deployed public JS uses `/tonalli-memo-api/v1`. Navigation to an API URL displayed the wallet onboarding page rather than exposing JSON; this is not API JSON verification. The successful feed UI is evidence for the wallet context only. |
| Existing same-origin Xolos proxy | None found in the repository. The wallet's rewrite belongs to a different origin and is not adopted as a Xolos same-origin proxy. No new proxy or hosting configuration is added. |

The screenshot [tonalli-memo-public-ui.jpg](tonalli-memo-public-ui.jpg) is evidence of the **existing public wallet feed**, not a screenshot of the modified homepages. Four currently visible transactions, in observed order, were `924874e080de16770921a9e5bb1e0d4603b27157657bc193ebe8063e469bf4b2`, `0c96216decc99af759517cf2143e2bd22ea179d48a9280635c8cd1c1eb6b0150`, `8539b6f59912009f8f4fd322bf67266063233c101a4b54aa0a765ad0c9955ff8`, and `fadee1662482e302fcac768686085baa8f67ea9b67d846dfea100a0de1dcd9fd`. These observations are not a production fallback or a response fixture.

## Contract and interpretation

The source contract is `{ items: [{ transaction, verification }], limit: number }`. A live JSON body was retrieved on 12 September 2026 and used to drive the component harness (4 valid records). Automated tests still use explicitly synthetic source-contract fixtures and do not load that capture in production pages.

| Field | Meaning / rendering |
| --- | --- |
| `transaction.txid`, `verification.txid` | Matching lowercase 64-hex IDs are required. Only the fixed HTTPS public UI destination is used for detail links. Post-supplied destinations are ignored. |
| `verification.status` | Only `VERIFIED` rows are displayed. This means indexer protocol/authorization verification, not local verification of consensus. |
| `verification.protocol`, `protocolVersion` | Current TM0/0 and TM1/1 DTOs are accepted. Unsupported or malformed records are skipped. |
| `payload`, `displayPayload` | Original string text is inserted with `textContent`. The current API's `displayPayload` separates text from an NFT wire directive. When absent or empty, the original `payload` is retained, including for attachment-only messages. No translation, linkification, scripts, media, IPFS or iframe loading. |
| `authorizingAddress`, `tm1Authorship` | A structurally valid supplied eCash address or TM1 author hash can identify the author. No invented aliases or project-name mapping. Missing identity is omitted. |
| `transaction.chainStatus` | `confirmed` and a nonnegative integer `blockHeight` permit a chain-confirmed label. `unconfirmed` stays unconfirmed even if `VERIFIED` or `isFinal: true`. Missing confirmation evidence is labeled unavailable. `isFinal` is not repurposed as confirmation. |
| `blockTimestamp`, `firstSeenAt` | Unix seconds. Display block date when available, otherwise first observation, explicitly labeled and in UTC. Missing, invalid or implausibly future dates are omitted. Indexing and last-verification times are never invented as publication dates. |
| Other available DTO fields | `isCoinbase`, `isFinal`, `blockHash`, `firstIndexedAt`, `updatedAt`, `eventType`, `profileCode`, `byteLength`, `candidate`, `authorizingInputIndex`, `evaluationHeight`, `attachment`, `lastVerifiedAt`. No extra network requests are made for them. |

Canonical order is `COALESCE(block_height, 9223372036854775807) DESC, last_verified_at DESC, txid ASC` over `VERIFIED` active records. Thus unconfirmed/no-height records precede confirmed blocks; this is not simply a publication-date sort. The client preserves response order, omits invalid/duplicate records and displays at most six without filtering by project. A nonempty response with no usable records is treated as unavailable, not as an empty feed. The indexed feed is not an exhaustive history of eCash.

## Implementation behavior

- Native deferred JavaScript shared by ES and EN; component styles scoped to `#tonalli-memo`; existing card, typography, colors and button classes retained.
- Load after the initial page load and near the component via `IntersectionObserver`; a single load fallback when that API is unavailable. The initial images and navigation are not delayed by a feed request.
- One public GET with `credentials: omit`, `mode: cors`, `cache: no-store`, no authorization headers, and an eight-second abort timeout covering header and body consumption. No polling, wallet operations, administrative routes, SDK or persistence cache.
- The body is read incrementally from `response.body.getReader()`. The 128 KiB cap is enforced in **bytes**, not UTF-16 code units. A declared `Content-Length` above the cap aborts immediately; a missing or lying `Content-Length` does not disable the byte cap. Exceeding the cap cancels the reader and aborts the request. If no stream reader is available, the request is aborted; there is no fallback to `response.text()` or `arrayBuffer()`. The reader lock is released on every exit.
- API configuration is centralized and validates the known HTTPS origin, strips repeated trailing `/api/v1`, rejects credentials/queries/unexpected paths and never accepts localhost in production.
- At most 100 input records, six displayed cards, 128 KiB response body (bytes) and 16 KiB per-message limits. Long text wraps within grid cells. No raw HTTP, JSON or internal errors are exposed to visitors.
- Localized loading, success, empty, unavailable and no-JS explanations. The real public UI link is ordinary HTML and remains available when scripts or the API fail. Focus has a visible outline and detail links have distinct accessible labels.

## Executed checks (12 September 2026)

```sh
node --test scripts/test-tonalli-memo.mjs scripts/test-journey.mjs scripts/test-generate-lead-tracking.mjs
node --check js/tonalli-memo.js
./node_modules/.bin/htmlhint "**/*.html" --ignore "node_modules/**"
git diff --check
```

- **42/42 tests passed**: 32 component tests plus 10 existing journey/lead checks. Added regressions for chunked bodies without `Content-Length`, missing or lying `Content-Length`, the exact 128 KiB byte limit and overflow, UTF-8 multibyte text and split characters, timeout during body reading, cancel-before-consuming-the-rest, missing streams with no unlimited `text()` fallback, and a localized unavailable state that leaves sibling page content unchanged.
- **HTMLHint: 187 files passed**, including both changed homepages.
- `node --check js/tonalli-memo.js` and `git diff --check` passed.
- Codex P2 on `response.text()` buffering is addressed in `js/tonalli-memo.js` by incremental byte-bounded reads.

## Live JSON and component harness (not a browser CORS pass)

Direct `GET https://memo-api.xolosarmy.xyz/api/v1/feed?limit=6` from this environment returned **HTTP 200**, `content-type: application/json; charset=utf-8`, `content-length: 4795`, `vary: Origin`, and `{ items: [4], limit: 6 }`. Feeding that live JSON into the homepage component harness rendered **4 cards** in API order, with original `displayPayload` text, protocol-verified / chain-confirmed labels, and fixed `https://app.tonalli.cash/memo/tx/<txid>` links:

1. `924874e080de16770921a9e5bb1e0d4603b27157657bc193ebe8063e469bf4b2`
2. `0c96216decc99af759517cf2143e2bd22ea179d48a9280635c8cd1c1eb6b0150`
3. `8539b6f59912009f8f4fd322bf67266063233c101a4b54aa0a765ad0c9955ff8`
4. `fadee1662482e302fcac768686085baa8f67ea9b67d846dfea100a0de1dcd9fd`

This validates the renderer against a real DTO. It is **not** a browser fetch from a Xolos origin and is not presented as a working homepage integration.

## Browser origin checks (CORS not disabled)

Served site origins, from redirects actually followed:

| Request | Final origin |
| --- | --- |
| `https://xolosramirez.com/` | `https://xolosramirez.com/` (200, no redirect) |
| `https://www.xolosramirez.com/` | `https://xolosramirez.com/` (301/redirect, 200) |
| `http://xolosramirez.com/` and `http://www.xolosramirez.com/` | `https://xolosramirez.com/` |
| English equivalents | `https://xolosramirez.com/en/` |

There is no automatic GitHub Pages PR preview. The preview used in this run is `http://127.0.0.1:8765` serving this branch.

Firefox ESR 140 (headless, CORS left on) executed `fetch(API, { mode: 'cors', credentials: 'omit' })`:

| Page origin | Result |
| --- | --- |
| `https://xolosramirez.com` | `TypeError: NetworkError when attempting to fetch resource.` Production HTML does not yet include `#tonalli-memo`. |
| `http://127.0.0.1:8765` (ES and EN) | Same `NetworkError`. Component settled to localized `unavailable`; sibling “Guías e historias del linaje” / “Guides and lineage stories” unchanged. |

Supporting header probes (not a substitute for the browser fetch): `Access-Control-Allow-Origin` is returned for `Origin: https://app.tonalli.cash` and is **absent** for `https://xolosramirez.com`, `https://www.xolosramirez.com`, and `http://127.0.0.1:8765`. `Vary: Origin` is present. No infrastructure was changed.

## Viewport, keyboard, no-JS, links

Firefox screenshots of `#tonalli-memo` from the local preview (actual CORS-blocked state, not a successful live feed):

- [ES 390](tonalli-memo-es-390.png) — requested 390×844; Firefox headless innerWidth was 450. No horizontal overflow.
- [ES 1440](tonalli-memo-es-1440.png) — innerWidth 1440. No horizontal overflow.
- [EN 390](tonalli-memo-en-390.png) — same 450 innerWidth note. No horizontal overflow.
- [EN 1440](tonalli-memo-en-1440.png) — innerWidth 1440. No horizontal overflow.

Other browser observations on the preview:

- Visible focus on the explore control: `outline: rgb(212, 175, 55) solid 3px`.
- Explore link remains `https://app.tonalli.cash/memo` in ES and EN.
- Navigation samples still include contact (`/contacto.html`, `/en/contact.html`), Teyolías, available Xolos, blog and language toggle.
- No-JS profile (`javascript.enabled=false`): noscript copy “JavaScript está desactivado. Lee las publicaciones en Tonalli Memo.” and the explore link remain visible. The component does not crash the rest of the page.
- Console/network: the only component-related network entries are the script/CSS assets and the CORS-blocked `memo-api` fetch. The status text does not leak HTTP/JSON internals.

[tonalli-memo-public-ui.jpg](tonalli-memo-public-ui.jpg) remains evidence of the **existing public wallet feed**, not of these homepages.

## Blocking acceptance checks

1. **Browser CORS from the effective Xolos origin is failing.** `https://xolosramirez.com` is the served origin. A real Firefox `fetch` from that origin to the configured API is a `NetworkError`. The live JSON harness and the wallet UI are not equivalent proof.
2. **Preview origin is also CORS-blocked.** `http://127.0.0.1:8765` cannot read the API in the browser. The four screenshots therefore show the localized unavailable card, not six live posts.
3. **External CORS dependency (separate task, not this PR):** the API allowlist currently includes `https://app.tonalli.cash` and does not include `https://xolosramirez.com`. Adding that exact origin to `CORS_ORIGINS` requires authorization from the API owner. This PR does not change indexer, nginx, wallet rewrites, or hosting config. Localhost preview origins must not be added to production CORS.
4. **Review:** request `@codex review` on the PR's final SHA and inspect the actual result, including the P2 on streaming reads. No comments alone is not approval. Keep draft until a browser fetch from `https://xolosramirez.com` succeeds without disabling CORS.

## Handoff for an authorized environment

If another machine already has `https://xolosramirez.com` allowed (or after the separate CORS change):

1. Open `https://xolosramirez.com/` and `https://xolosramirez.com/en/index.html` once this branch is served there, or use a preview whose origin is in `CORS_ORIGINS`.
2. Confirm DevTools: `GET https://memo-api.xolosarmy.xyz/api/v1/feed?limit=6` is `200` with `Access-Control-Allow-Origin` matching the page origin. Do not disable CORS.
3. Confirm the component leaves `unavailable` and shows up to six cards in indexer order.
4. Re-take the four 390/1440 ES/EN component screenshots of the **successful** state.
5. Only then consider marking the PR ready. Do not merge from this task.

No merge, auto-merge or manual deployment is part of this task.
