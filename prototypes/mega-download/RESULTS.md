# PROTOTYPE results: MEGA download + decrypt speed

These results answer "MEGA: large-file decryption speed and quota behaviour" (#14). They were measured on 2026-10-22 in Chrome 155 on macOS, from `http://localhost:8765`, against a real Calibre library behind a MEGA folder link.

| Step | Result |
|---|---|
| Load the tree (2,259 files) | 1.6 s |
| 46.2 MB PDF, ciphertext only | 10.0 s (4.6 MB/s) |
| 46.2 MB PDF, WebCrypto AES-CTR decrypt | 0.05 s |
| 46.2 MB PDF, megajs `downloadBuffer()` | 12.2 s (1.22× network) |
| Plaintext SHA-256, megajs vs WebCrypto | match |
| 1 MB ranged read | 1.0 s (not compared against the full download) |
| `metadata.db` (1.9 MB) | 2.5 s |

Run it with `python3 -m http.server 8765 -d prototypes/mega-download`.
