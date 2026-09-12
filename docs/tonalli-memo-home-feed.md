# Tonalli Memo on the homepages

Status: **IMPLEMENTED / TESTED (automated) / REVIEW pending / BLOCKED (live integration and visual acceptance)**.
Keep the PR in **draft** until the browser and origin checks below are complete. This is a prepared component, not an assertion that the homepage feed is operational.

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
| Configured public HTTPS API | `https://memo-api.xolosarmy.xyz/api/v1`, from the current wallet production rewrite. Direct HTTP/JSON and CORS operation could not be verified in this environment. |
| Six most recent entries | `GET /api/v1/feed?limit=6`; API limit range is 1–100, default 25. The homepage makes only this request, once. |
| Other public routes | `GET /api/v1/health` and `GET /api/v1/tx/:txid` exist in the current API source. The homepage does not need extra health or detail requests. |
| Public interface | `https://app.tonalli.cash/memo` opened successfully in the browser and displayed four posts. No wallet connection or credentials were required. |
| Publication detail | `https://app.tonalli.cash/memo/tx/924874e080de16770921a9e5bb1e0d4603b27157657bc193ebe8063e469bf4b2` opened successfully and showed `VERIFIED`, `confirmed`, block 966360 and the original Trivia Xolo message. |
| API within the wallet | The deployed public JS uses `/tonalli-memo-api/v1`. Navigation to an API URL displayed the wallet onboarding page rather than exposing JSON; this is not API JSON verification. The successful feed UI is evidence for the wallet context only. |
| Existing same-origin Xolos proxy | None found in the repository. The wallet's rewrite belongs to a different origin and is not adopted as a Xolos same-origin proxy. No new proxy or hosting configuration is added. |

The screenshot [tonalli-memo-public-ui.jpg](tonalli-memo-public-ui.jpg) is evidence of the **existing public wallet feed**, not a screenshot of the modified homepages. Four currently visible transactions, in observed order, were `924874e080de16770921a9e5bb1e0d4603b27157657bc193ebe8063e469bf4b2`, `0c96216decc99af759517cf2143e2bd22ea179d48a9280635c8cd1c1eb6b0150`, `8539b6f59912009f8f4fd322bf67266063233c101a4b54aa0a765ad0c9955ff8`, and `fadee1662482e302fcac768686085baa8f67ea9b67d846dfea100a0de1dcd9fd`. These observations are not a production fallback or a response fixture.

## Contract and interpretation

The source contract is `{ items: [{ transaction, verification }], limit: number }`. A live JSON capture remains outstanding; tests use explicitly synthetic source-contract fixtures.

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
- One public GET with `credentials: omit`, `mode: cors`, `cache: no-store`, no authorization headers, and an eight-second abort timeout covering body consumption. No polling, wallet operations, administrative routes, SDK or persistence cache.
- API configuration is centralized and validates the known HTTPS origin, strips repeated trailing `/api/v1`, rejects credentials/queries/unexpected paths and never accepts localhost in production.
- At most 100 input records, six displayed cards, 128 KiB response-text and 16 KiB per-message limits. Long text wraps within grid cells. No raw HTTP, JSON or internal errors are exposed to visitors.
- Localized loading, success, empty, unavailable and no-JS explanations. The real public UI link is ordinary HTML and remains available when scripts or the API fail. Focus has a visible outline and detail links have distinct accessible labels.

## Executed checks

```sh
node --test scripts/test-tonalli-memo.mjs scripts/test-journey.mjs scripts/test-generate-lead-tracking.mjs
node --check js/tonalli-memo.js
npm run lint:html
git diff --check
```

- **33/33 tests passed**: 23 component tests plus 10 existing journey/lead checks. Covers valid source-contract fixtures, empty data, HTTP/network errors, abort and late-response timeout, invalid JSON/DTOs, optional fields, inert HTML/scripts, bad TXIDs and URLs, large messages, duplicate requests/records, author identities, protocol versus confirmation, and URL normalization.
- **HTMLHint: 187 files passed**. The existing lint command's underlying installed CLI was run directly, without installing dependencies. Both changed homepages also passed a focused run.
- Syntax and whitespace checks passed.
- An exact source comparison after excluding the replacement block and the two added asset references found every other byte of both homepages unchanged.
- The real public interface and one real transaction detail were inspected in the browser. The screenshot documents that observation only.

## Blocking acceptance checks

1. **Direct live API JSON and CORS:** the browser returned `net::ERR_BLOCKED_BY_CLIENT` for `https://memo-api.xolosarmy.xyz/api/v1/feed?limit=6`; direct transport and the research fetcher also could not retrieve it. This is an environment access limitation, not evidence that the service is down or that its CORS configuration is wrong. The source disables CORS by default and allows only exact configured `CORS_ORIGINS`. No successful `Access-Control-Allow-Origin` header was observed.
2. **Real site origins:** the CNAME and canonical metadata use `https://xolosramirez.com`; the user also uses `https://www.xolosramirez.com`. Verify actual redirects, the final ES/EN origin(s), and a real browser fetch from each served origin, plus any PR preview origin. Do not infer this from the successful wallet page or curl. If a required origin is not allowed, the API owner must authorize a separate CORS task; this PR makes no external infrastructure change.
3. **Homepages at 390/1440 px:** the browser environment did not permit the local preview. A local listener was denied and localhost navigation failed; local file navigation was explicitly blocked by browser URL policy. No alternate browser, browser-security bypass, fake screenshots or manual production deployment was used. The requested four component screenshots, horizontal-overflow check, keyboard/focus check and live navigation/contact link checks have **not** passed and remain outstanding. The plain HTML no-JS path has been reviewed, but a no-JS browser test also remains outstanding.
4. **Live response test:** source-contract fixture tests are passing; the component has not been validated against captured live JSON. Do not treat the existing wallet screenshot as a passing homepage integration test.
5. **Review:** request `@codex review` on the PR's final SHA and inspect the actual result. No comments alone is not approval. Check any automatic preview provided by the PR; do not manually deploy or mark ready until the outstanding acceptance checks pass.

No merge, auto-merge or manual deployment is part of this task.
