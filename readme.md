# Bruno Lucena's portfolio

A one-page portfolio hosted at [brunlucen.github.io](https://brunlucen.github.io/). The site is intentionally a compact greeting and overview rather than a collection of subpages.

## Accessibility

The implementation targets WCAG 2.2 Level AA. It includes:

- an always-visible keyboard-accessible header and skip link;
- semantic landmarks, headings, project articles, and testimonial quotations;
- visible focus indicators and AA-compliant text colors;
- decorative media that is hidden from assistive technology;
- synchronized overlay controls for pausing or playing both decorative loops;
- viewport-aware playback that stops offscreen and a still experience when `prefers-reduced-motion: reduce` is active or JavaScript is unavailable; and
- an authored LinkedIn contact fallback when Typeform or third-party scripts are blocked.

Automated checks support the accessibility work, but they do not replace keyboard and screen-reader testing.

## Local development

Requirements: Node.js 22.22 or newer in the Node 22 line, or Node.js 24.8 or newer.

```sh
npm ci
npx playwright install chromium
npm run styles:build
npm test
```

The repository root can be opened directly with VS Code Live Server; the committed `assets/css/style.css` and local fonts make a zero-build preview render correctly.

Useful commands:

- `npm run styles:build` regenerates the committed root CSS from SCSS.
- `npm run styles:watch` keeps the generated CSS current while editing SCSS.
- `npm run styles:check` fails when the generated CSS has drifted from SCSS.
- `npm run build` verifies the root CSS and creates the production-only `dist/` directory.
- `npm run preview:source` serves the repository-root preview on port 4174.
- `npm run preview` serves the built `dist/` preview on port 4173.
- `npm run check:html` validates the generated HTML.
- `npm run check:links` checks local files, fragments, assets, and CSS references.
- `npm run test:a11y` runs axe, keyboard, reduced-motion, reflow, route, and performance checks in desktop and 320px Chromium viewports.
- `npm run check` builds the site and runs the complete suite.

SCSS under `assets/css/` is the only hand-edited stylesheet source. Generated CSS and local fonts are committed so the root preview works immediately; the build copies that verified CSS byte-for-byte into `dist/` with only referenced production assets.

## Deployment

GitHub Actions validates pull requests. Pushes to `master` deploy `dist/` only after the same locked build and test suite passes. The production artifact contains the homepage, its referenced assets, metadata files, and an accessible 404 page.
