---
name: zxing-wasm escapes control chars in .text
description: Why AAMVA/PDF417 parsing must read zxing-wasm .bytes, not .text
---

# zxing-wasm `.text` escapes non-printable bytes

`readBarcodes(...)` from `zxing-wasm/reader` returns each result with both
`.text` (string) and `.bytes` (Uint8Array). For PDF417 payloads that contain
control characters — e.g. AAMVA driver's-license data delimited by LF/CR/RS —
`.text` renders those bytes as **escaped placeholders** like `<LF>`, `<CR>`,
`<RS>` (literal 4-char strings), NOT real control characters.

**Consequence:** any parser that keys on real `\n`/`\r` (e.g. `parseAamvaName`,
which matches field tags DCS/DAC/DAD at line starts) will silently fail on the
zxing path even for a perfectly-decoded barcode → "barcode read but no AAMVA
name". This affected the iOS/Safari scan path (no native BarcodeDetector, so it
falls back to zxing). The Android native BarcodeDetector path is unaffected —
its `rawValue` contains real control chars.

**Fix / rule:** decode `result.bytes` as Latin-1 and parse THAT; only fall back
to `.text` when bytes are absent. See `readBarcodeText()` in
`artifacts/studio-gms/src/pages/scan.tsx`. Latin-1 is safe because AAMVA data is
ASCII.

**Why:** empirically confirmed by round-tripping a generated AAMVA PDF417 image
through zxing-wasm — `.text` had zero real newlines, `.bytes` had 22 and parsed
correctly to DOE/JOHN/QUINCY.

**Test asset:** `scripts/src/gen-test-pdf417.mjs` generates a valid AAMVA PDF417
PNG (uses bwip-js, `toBuffer` is async — must `await`). Output default
`attached_assets/pdf417-aamva-test.png`.
