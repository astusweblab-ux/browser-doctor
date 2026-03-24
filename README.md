# Browser Doctor

Browser Doctor is a Chrome extension that helps users diagnose browser slowdowns, find heavy tabs/extensions, and free resources quickly.
Created by ASTUS LAB.

## Features

- Quick diagnostics from Chrome Side Panel in one click
- Heavy tab analysis by RAM and CPU score
- Extension list with resource hints
- Actionable recommendations for cleanup
- One-click optimization for selected tabs
- Daily and 7-day history of scans and freed memory
- Desktop notifications when browser load is high

## Stable Channel Note

The `chrome.processes` API is not available in Chrome Stable.

This extension automatically uses a safe fallback model on Stable:
- Heuristic RAM/CPU estimates for tabs
- Progressive recommendations based on current tab patterns
- Explicit note in UI when exact process metrics are unavailable

If you run Developer/Canary and enable relevant APIs, the extension can use exact process metrics.

## Local Install (Developer Mode)

1. Open `chrome://extensions/`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this project folder (`browser-doctor`)

## Build Release ZIP

PowerShell:

```powershell
./scripts/package.ps1
```

The archive is generated in `dist/` as `browser-doctor-v<version>.zip`.

## Files Included in Release

- `manifest.json`
- `background.js`
- `popup.html`
- `popup.css`
- `popup.js`
- `icons/*`

## Privacy

See [PRIVACY.md](PRIVACY.md).

## License

MIT — see [LICENSE](LICENSE).
