# 0.3.16 圈子主题色与建立流程 Design QA

- primary source visual truth: `/Users/msf/.codex/generated_images/019f7e98-5d1c-7623-b738-d2d13a458ccf/exec-23a7cba8-f734-4a87-9361-3bab952f73e3.png`
- user-reported implementation evidence: `/var/folders/h2/6h6vyzb97gz3c7hdxcvx67zm0000gn/T/codex-clipboard-2f63ca18-540f-42e2-9edf-a7119930a9f4.png`
- divider and copy feedback: `/var/folders/h2/6h6vyzb97gz3c7hdxcvx67zm0000gn/T/codex-clipboard-2aadafbb-a870-48c7-8387-ef4e5b641dd9.png`
- final desktop screenshot: `/private/tmp/along-circles-final-desktop-full.png`
- final mobile create screenshot: `/private/tmp/along-circles-final-mobile-create.png`
- source/final full-view comparison: `/private/tmp/along-circles-final-comparison.png`
- implementation route: `http://localhost:3000/circles`
- viewport: 1638 × 882 desktop content area; 390 × 844 mobile content area
- state: authenticated user with two active circles, two available friends, one friend selected and one pending creation invitation

## Findings

- No actionable P0, P1 or P2 visual issue remains in the inspected create and list states.
- [P3] The generated reference used a wider experimental composition. The implementation intentionally restores the product's existing 1180 px page container and 820 px create panel after user review, so the final comparison records this as a product constraint rather than a fidelity defect.
- [P3] The existing Next.js LCP warning for `/branding/along-mark.png` remains outside this change; no circle-page runtime error was observed.

## Required fidelity surfaces

- Fonts and typography: the redundant “小圈子” eyebrow was removed; the page title is now 46–54 px, the section title 25–31 px, and the circle title 25–31 px. Chinese wrapping is clean at desktop and narrow widths.
- Spacing and layout rhythm: the page container remains 1180 px; the desktop create reveal is capped at 820 px and remains visually attached to the existing page rhythm instead of widening the full experience. Mobile create uses a dedicated route and fits a 390 px viewport without horizontal overflow.
- Colors and visual tokens: six restrained theme gradients use the existing warm paper, ink, muted, sage and coral vocabulary. Each circle stores one theme; fallback cover, initial-based avatar and row surface derive from it. Rows have a quiet tinted base and a deeper same-family hover without translation.
- Image quality and asset fidelity: active circles still prefer authenticated thumbnails from the latest published circle photo. Without a cover, the large rounded-square fallback and initial-based avatar use the selected theme while member avatars remain separately visible.
- Copy and content: the page retains “圈子”“我的圈子” and “建立圈子”; the redundant category eyebrow is gone. The introduction now directly says that the page contains the user's circles, invitations and shared records. Empty descriptions, empty lists, create guidance and the reminder rail state use specific product language instead of abstract warmth cues.

## Open Questions

- None for the inspected state.

## Implementation Checklist

- [x] Remove the “小圈子” eyebrow.
- [x] Compress the full-width introduction without beginning the split immediately below navigation.
- [x] Keep the outlined plus-button treatment and make it align with the compact introduction.
- [x] Remove the duplicated “1 个” count beside “我的圈子”.
- [x] Reduce and rebalance the rounded-square cover while preserving separate member avatars.
- [x] Merge fully empty “待回应邀请 / 圈子消息” sections into one quiet rail state.
- [x] Replace repeated right-rail top rules with one desktop vertical divider and remove it in single-column layouts.
- [x] Replace abstract fallback and empty-state copy with concrete object, state and action language.
- [x] Keep non-empty action and message sections independent and data-backed.
- [x] Move the empty rail after the circle content at narrow widths.
- [x] Restore the pre-existing 1180 px page width and cap the desktop create panel at 820 px.
- [x] Persist a circle theme from creation request to the established circle.
- [x] Use the theme for fallback cover, initial avatar and list-row surface/hover.
- [x] Keep desktop creation inline and provide `/circles/new` as the mobile create page.
- [x] Apply transitions.dev Checkbox Check with a real accessible checkbox, 150 ms fill, 350 ms path draw and reduced-motion handling.
- [x] Reuse the same native-input checkbox component across all nine project checkbox instances.
- [x] Apply transitions.dev Avatar Group Hover without moving the whole circle row.
- [x] Pass TypeScript, ESLint, photo-layout invariants, documentation links and the production build.

## Comparison History

- Pass 0: the user screenshot showed a P1 hierarchy failure: oversized introduction, duplicated headings and counts, a dominant placeholder cover, and two empty reminder sections separated by repeated rules.
- Pass 1: removed the eyebrow, compressed the introduction, moved the body into the first screen, reduced the cover, removed redundant empty sections and captured the authenticated desktop page.
- Pass 2: the first capture still showed a distant duplicate section count and a cover that remained too dominant. Removed the count, capped the cover at 144 px, tightened row padding and metadata, and captured desktop plus 430 px responsive evidence.
- Pass 3: removed the right rail's repeated top rule, added a single vertical divider between desktop columns, and rewrote the introduction, fallback description and empty states in direct product language. Captured desktop and 820 px single-column evidence.
- Pass 4: introduced theme persistence, gradient fallbacks, initial avatars, quiet themed row surfaces, same-family hover and responsive create flows.
- Pass 5: visual review caught that the experimental 1460/960 px composition had widened the existing product. Restored 1180/820 px constraints and replaced the native-looking friend selector with the exact transitions.dev Checkbox Check state treatment while preserving its native input.
- Pass 6: source-level comparison found that the Lucide check path ran from upper-right to left, reversing the intended writing direction. Replaced it with the transitions.dev source path `M1 5.52L3.92 9.17L9.17 1`, restored the 15 px dash length and added explicit native-checkbox labels.
- Pass 7: replaced all remaining browser-default and accent-color checkboxes with the shared native-input component. Verified the circle creator, shared invitation form, profile audience editor, member-history permission and personal composer at desktop and 390 px mobile widths without horizontal overflow.
- Final comparison: desktop and mobile evidence show stable product width, complete controls, no horizontal overflow and no clipped create-page title. The checked visual state matches the native input and the transitions.dev source path completes from 15 px to 0 px in its original left-to-right direction. No P0/P1/P2 issue remains.

## Primary interactions tested

- The desktop “建立圈子” control expands the shared create form; the mobile control routes to `/circles/new`, whose centered title is visible at full opacity.
- Theme radios and friend checkboxes were exercised without submitting the form. The first friend's native checkbox and visible `aria-checked` state both became selected; the second remained unselected.
- The authenticated page was checked at 1638 px desktop width and 390 px mobile width. No horizontal overflow, clipped text, orphaned divider or hidden mobile title was observed; the temporary viewport override was reset after the check.
- Automated checks cover form/action typing, routing and API bindings; production compilation completed every route.

## Console errors checked

- Browser logs contain no page runtime error; the only warning is an existing Next.js LCP suggestion for `/branding/along-mark.png`, unrelated to the circle-page change.
- Neither inspected viewport showed a browser error overlay, failed media placeholder or hydration fallback. TypeScript, ESLint, documentation links, photo-layout invariants and production compilation are clean.

final result: passed

---

# 手机端圈子页列表 Design QA（2026-07-23）

- source visual truth: `/Users/msf/.codex/generated_images/019f7e98-5d1c-7623-b738-d2d13a458ccf/exec-772192fb-3698-4bff-a2db-66ac43aa6a6f.png`
- source pixels: 852 × 1846
- intended CSS viewport: 390 × 844
- implementation route: `http://localhost:3000/circles`
- implementation screenshot: unavailable
- state: authenticated mobile default state with pending invitations and active circles

## Full-view comparison evidence

- The source image was opened at original resolution.
- The in-app browser could not reload the local route after the development server restarted because its URL policy blocked the navigation. No browser-rendered implementation screenshot was available, so a valid normalized side-by-side comparison could not be made.

## Focused region comparison evidence

- Blocked with the full-view capture. The header action, invitation card and circle list therefore remain pending browser-rendered visual confirmation.

## Findings

- [P1] Browser-rendered evidence is missing.
  Location: `/circles` at 390 × 844.
  Evidence: the source visual is available, but the implementation could not be captured.
  Impact: typography, final spacing, image crop and above-the-fold density cannot be accepted from source inspection alone.
  Fix: reload the authenticated local page at 390 × 844, capture it, place it beside the source visual, and repeat the comparison.

## Checks completed

- Targeted ESLint passed for the modified TypeScript files.
- TypeScript passed with `tsc --noEmit`.
- Photo layout invariants passed.
- Documentation link checks passed.
- `git diff --check` passed.
- The final release verification on 2026-07-25 completed the production build successfully; browser-rendered mobile list evidence remains unavailable for this historical comparison pass.

## Comparison history

- Pass 0: implementation completed from the selected mobile visual, including the centered title, direct create action, compact invitation card, neutral list cards, member-first metadata and themed cover fallbacks.
- Pass 1: source inspection found that a later legacy mobile rule would hide member avatars and restore excessive top padding. Added a final scoped mobile override to preserve the intended member-first layout.
- Pass 2: static checks passed; browser capture remained unavailable.

final result: blocked
