# Check Huawei Warranty (ESCP Portal)

Reverse-engineered notes for programmatic warranty lookup via Huawei's ESCP portal. **No public/documented API** exists — these are internal endpoints scraped from the portal's client-side JS. Use at your own risk (may break without notice, possibly against ToS). Intended for **low-volume, internal** use only.

## Portal

- Public page: https://app.huawei.com/escpportal/pub/wechat.html?Language=en&appName=escp&buType=2
  - `buType=1` = Carrier, `buType=2` = Enterprise/Solar inverter, `buType=3` = unknown (JP removed)
  - `appName=escp` identifies the solar inverter flow
- Base URL: `https://app.huawei.com/escpportal/`
- Client JS (reference): `https://app.huawei.com/escpportal/pub/wechat.js`

## Endpoints

All paths relative to base `https://app.huawei.com/escpportal/`. Requires a persistent session cookie (`JSESSIONID`) across the whole flow.

| Method | Path | Purpose |
|---|---|---|
| GET | `servlet/captcha?yzm=<rand>` | CAPTCHA image (JPEG/PNG, 4 chars) |
| POST | `servlet/captchaValidate` | Validate CAPTCHA. Body form-encoded with captcha field. Response body `"yes"` on success. |
| GET | `services/portal/vyborgTask/findHardWareVyborgForWeb` | Hardware warranty lookup (query by SN list). Returns JSON array. |
| GET | `services/portal/vyborgTask/findSoftwareVyborgForWeb` | Software warranty lookup. |
| GET | `services/portal/vyborgTask/findBatchId` | Get batch id (needed before some doc-generation calls). |
| GET | `services/portal/vyborgTask/findCspInfo/{id}?barcode=<sn>` | CSP details for a result row. |
| GET | `services/portal/vyborgTask/findEdocid/{sn}` | Resolve eDoc id for a serial number. |
| POST | `services/portal/vyborgTask/generatedDocument` | Generate warranty document (PDF). |
| GET | `servlet/downloadPdf?edocId=<id>` | Download generated warranty PDF. |
| GET | `servlet/exportExcel?barcode=<sn>&source=escp&language=<LANG>&buType=<n>&batchId=&judgePath=1` | Export warranty result as Excel. |

Languages seen in client code: `CN, EN, JP, DE, IT, FR, ID, PL, PT, ES, TH, RU, TR, HU, GR`.

## Flow — single SN warranty lookup

1. `GET servlet/captcha?yzm=<random>` → save image bytes + `JSESSIONID` cookie.
2. Solve CAPTCHA (see "CAPTCHA strategy" below).
3. `POST servlet/captchaValidate` with the same cookie + solved text. Expect body `yes`.
4. `GET services/portal/vyborgTask/findHardWareVyborgForWeb` with `JSESSIONID` + SN query params. Parse JSON for warranty status / service end date.
5. (Optional) `findSoftwareVyborgForWeb`, `findEdocid/{sn}` → `downloadPdf` for the warranty doc.

⚠️ The **same cookie jar** must be used for steps 1→5. Losing session between captcha-validate and the query endpoint will fail silently (empty result).

## CAPTCHA strategy

The portal uses a 4-character image CAPTCHA. Options for automation:

- **AI vision (recommended)** — send the image to Claude Haiku 4.5 (or equivalent) with prompt like *"Read the 4 characters in this CAPTCHA image. Reply with only the characters, no punctuation."*. Cost ~$0.001/call, accuracy ~near-perfect on short CAPTCHAs. Already aligned with this project's AI tooling.
- **tesseract.js** (already in `package.json`) — free, offline, but distorted CAPTCHAs usually land at ~60–70% accuracy. Requires retry loop; not worth the complexity at this volume.
- **Manual entry** — proxy the image into our own UI and ask the user to type it. Zero risk, zero cost, but adds a human step per lookup.

For this project (low-frequency use), AI vision is the best ratio of effort vs. reliability.

## Planned integration (not yet built)

Rough sketch for a Next.js API route under `src/app/api/huawei/warranty/route.ts`:

```
GET /api/huawei/warranty?sn=<serial>
  1. Open session → fetch captcha image + cookie
  2. Send image to Anthropic SDK (claude-haiku-4-5) to extract 4 chars
  3. POST captchaValidate with cookie + chars
  4. GET findHardWareVyborgForWeb with cookie + sn
  5. Return normalized JSON: { sn, warrantyStart, warrantyEnd, status, ... }
  On failure at step 3 → retry captcha up to N times, then return 502.
```

**Open questions before implementing:**
- Do we also need software warranty + downloadable PDF, or only the hardware end date?
- Where does this get surfaced in the UI (lead detail? separate admin page?)
- Rate limiting — cache results by SN for N hours to avoid re-querying the same device.

## Risks & caveats

- Endpoints are **undocumented** — Huawei may change paths, add tokens, or block bots at any time.
- No ToS allowing programmatic access. Keep volume low and do not redistribute.
- CAPTCHA exists precisely to prevent automation. If lookup volume grows, the correct path is to contact Huawei local office / solar TAC for a partner API, not to scale this.
