# Browser/mobile compatibility and performance budgets

## Supported browser baseline (v1)

- Chrome/Edge: latest two stable versions
- Firefox: latest two stable versions
- Safari: latest two stable versions on macOS and iOS

## Mobile support target

- iOS Safari on recent iPhone devices
- Chrome on recent Android devices
- Minimum viewport for supported UI: `360x640`

## Accessibility and interaction baseline

- Keyboard navigation for board/task/sprint/settings flows
- Visible focus indicators on all interactive controls
- No horizontal scrolling at `360px` width on core screens

## Performance budgets (cold cache, production build)

- Initial document + critical JS transfer: <= 350 KB gzip
- Largest Contentful Paint (LCP): <= 2.5s on mid-tier mobile network profile
- Interaction to Next Paint (INP): <= 200ms for primary actions
- Cumulative Layout Shift (CLS): <= 0.1
- Route-to-route transition fetch latency budget: <= 500ms p95 on LAN/self-hosted baseline

## CI and release checks

Before `1.0.0` and every patch release:

1. Run the browser end-to-end suite.
2. Verify login/board/backlog/task-detail on desktop and mobile viewport emulation.
3. Capture lighthouse snapshots for `/login`, `/board`, and `/backlog`.
4. Record any budget regressions in release notes.
