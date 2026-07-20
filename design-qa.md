# 0.3.14 自然照片拼贴 Design QA

- approved visual truth: `/Users/msf/.codex/generated_images/019f7e98-5d1c-7623-b738-d2d13a458ccf/call_6lRTsWpBUXb6QqEszgAnYxGF.png`
- reported editor gap: `/var/folders/h2/6h6vyzb97gz3c7hdxcvx67zm0000gn/T/codex-clipboard-ed1dc679-b53e-40ba-b1d5-cb3483222d2a.png`
- implementation URL: `http://localhost:3000/posts/a8e29267-4031-436f-9e06-81b86ba522b0/edit`
- desktop editor screenshot: `/private/tmp/along-0314-editor-updated-page.png`
- mobile editor screenshot: `/private/tmp/along-0314-editor-updated-mobile-top.png`
- approved-source/editor comparison: `/private/tmp/along-0314-editor-source-vs-updated.jpg`
- previous/editor comparison: `/private/tmp/along-0314-editor-before-vs-updated.jpg`
- viewport: desktop browser window approximately 1024 × 640 CSS px; responsive width 375 CSS px
- state: authenticated personal-post editor with the same four published mixed-ratio photos as the reported screenshot

## Findings

- No P0, P1, or P2 visual defect remains in the publisher, post stream, or published-post editor photo layout.
- [P3] The approved source is a desktop launcher modal with eight lifestyle photos; the final editor evidence is the desktop task-page shell with four real photos. The shared content region now matches the approved hierarchy: order strip on the left, final natural collage on the right, visibility below, and restrained “换个排法” action.
- [P3] The published editor intentionally omits add and remove controls. Its helper copy states that order and layout may change while the published photo set remains fixed.

## Required fidelity surfaces

- Fonts and typography: existing Along type stack, optical weights, muted helper hierarchy and Chinese wrapping are preserved.
- Spacing and layout rhythm: the editor now uses the same header, scroll region, two-column photo board, section gaps and sticky actions as the full composer; 375 px collapses the board vertically with a four-column order strip.
- Colors and tokens: paper, ink, muted, mint action and divider tokens come from the existing design system with no new palette.
- Image quality and assets: authenticated thumbnail assets are reused directly; final layout uses `object-fit: contain` and source ratios, with no crop or stretch.
- Copy and content: “调整顺序”“发布效果”“换个排法” match the approved source; editor-only copy clearly explains the no-add/no-delete constraint.

## Open Questions

- None.

## Implementation Checklist

- [x] Full composer supports drag, keyboard reorder, removal and layout cycling.
- [x] Published-post editor reuses the same order/final-effect board.
- [x] Published-post editor supports drag, keyboard reorder and layout cycling without add/remove controls.
- [x] Save payload includes ordered media IDs and versioned photo layout.
- [x] Server locks the post, verifies that the media set is identical, then atomically rewrites positions and layout.
- [x] Desktop and 375 px editor states render without crop, stretch, overflow, or hidden persistent actions.
- [x] Layout invariants, lint, TypeScript, documentation, diff checks and production build pass.

## Comparison History

- Pass 1: browser evidence was blocked by the macOS lock screen.
- Pass 2: publisher comparison found extra nested card surfaces and mismatched labels; labels and surfaces were corrected.
- Pass 3: publisher desktop and 375 px evidence passed with no P0/P1/P2 mismatch.
- Pass 4: the user-provided editor screenshot exposed a P1 feature-consistency gap: the post editor only displayed the mosaic and could not reorder or switch layouts. The editor was moved onto the shared photo board and the update API gained locked media-order/layout persistence.
- Pass 5: desktop and 375 px editor captures show the shared order/final-effect hierarchy, no add/remove affordance, natural aspect ratios and usable persistent actions. The P1 gap is resolved.

## Primary interactions tested

- Browser render: authenticated four-photo editor, desktop geometry, 375 px responsive geometry, scroll region and sticky save actions.
- Automated logic: deterministic topology selection, preferred-layout retention, stable remapping after reorder, alternate candidates, extreme ratios, nine-photo visibility limit and geometry performance.
- Edge could not automation-click pointer drag, keyboard reorder or layout-cycle controls because macOS Accessibility and Edge JavaScript automation are disabled. The controls are wired through the same previously rendered `ComposerPhotoBoard`; the real user post was not mutated merely for QA.

## Console errors checked

- Edge console access was unavailable because browser JavaScript automation is disabled. TypeScript, ESLint, production build, layout tests and documentation checks are clean, and neither rendered editor state showed a browser error overlay.

final result: passed
