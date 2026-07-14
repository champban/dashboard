# Dashboard

A single-file React dashboard application (`index.html`) for personal/work task planning, calendar views, Gantt timelines, activity history, local/profile JSON storage, and optional cloud integrations.

## Six-dimension audit

This audit captures the current state of the app across six dimensions and should be updated when material behavior changes.

### 1. Product scope and UX
- **Strength:** The app exposes a broad planner workflow: Overview, Calendar, Gantt, Personal, Work, Activity, Config, and About areas are represented in the bundled UI.
- **Risk:** `README.md` previously did not explain the app purpose, primary workflows, or review criteria, making handoff and regression review difficult.
- **Recommendation:** Keep this audit and any future release notes aligned with the visible navigation and changelog in `index.html`.

### 2. Data durability and portability
- **Strength:** The app stores planner data in browser storage and supports JSON backup/profile file flows.
- **Risk:** Browser storage can be cleared by users, privacy tools, browser resets, or device changes; users may assume data is remotely backed up when it is only local.
- **Recommendation:** Continue emphasizing explicit Save/Save As/profile export behavior in the UI and docs before adding features that create more user data.

### 3. Security and privacy
- **Strength:** Most data appears to stay client-side unless the user connects an external service.
- **Risk:** Client-side API integration values and prompts can expose sensitive data if third-party calls are made directly from the browser.
- **Recommendation:** Prefer user-owned OAuth flows or a backend proxy for provider secrets; do not place long-lived private API keys in client code.

### 4. Reliability and error recovery
- **Strength:** The app includes activity history and restore-oriented behavior in recent changelog entries.
- **Risk:** Because the production artifact is a minified single-file bundle, small logic regressions are hard to isolate and review.
- **Recommendation:** Preserve a source build pipeline or source map in development; test backup, restore, profile switching, and recurring task flows before release.

### 5. Maintainability and release hygiene
- **Strength:** The in-app changelog records versions and notable behavior changes.
- **Risk:** Committing only a generated/minified `index.html` limits code review quality and makes targeted fixes slower.
- **Recommendation:** Track the human-readable source files and build instructions, then treat `index.html` as a generated release artifact when possible.

### 6. Performance and accessibility
- **Strength:** The app is self-contained and avoids a large multi-file runtime deployment surface.
- **Risk:** A large inline bundle can delay first load and makes accessibility review harder without component-level source.
- **Recommendation:** Audit keyboard navigation, focus states, color contrast, and bundle size before major releases; the app now includes a global keyboard focus indicator and reduced-motion safeguard in `index.html`.

## Quick review checklist

Before shipping a release, verify:

- The dashboard loads from `index.html` in a clean browser profile.
- Creating, editing, completing, pinning, and deleting tasks works for both Personal and Work data.
- Save, Save As, profile open, and restore paths preserve all expected data.
- Calendar and Gantt views render dated, no-date, and recurring tasks correctly.
- Config changes persist after refresh.
- External integrations fail gracefully when credentials, network access, or provider permissions are unavailable.
- Keyboard users can see focus on buttons, links, inputs, selects, textareas, editable areas, and custom tab stops.
