# Desktop Profile Design QA

## Evidence

- Primary visual reference: `/Users/msf/Downloads/已生成图像 1 (2).png`
- Header account reference: `/Users/msf/Downloads/已生成图像 2.png`
- Implementation capture: `/private/tmp/new-chat-profile-transparent-header-v2-1645x956.png`
- Route: `http://localhost:3000/profile/JffWWzlWM3CLfbpTplYUaroBMKTOdlkA`
- Viewport: `1645 × 956`
- State: signed-in owner profile with a real cover image, personal information, privacy shortcut, posts, and no uploaded avatar

The two source images are the visual truth for the desktop profile cover, fade, identity scale, action colors, and account entry. Existing Along product behavior and real user data remain the truth for copy, brand assets, privacy information, and content.

## Final Findings

- No actionable P0, P1, or P2 visual differences remain.
- The 610-pixel cover starts at the viewport top and remains visible through the shared 82-pixel translucent desktop header.
- The cover fades through several low-contrast stops into the warm page background, with the identity block placed at the fade tail rather than over a hard image edge.
- Avatar, name, description, record date, and action buttons now follow the source proportions and visual weight.
- The primary and secondary actions use the sampled grass green and peach colors from the reference.
- The top-right account entry follows the second reference: separate utility buttons, avatar, nickname, and chevron without an enclosing account capsule. Hover keeps the trigger stable and moves only the chevron.
- The navigation indicator now uses a restrained, non-bouncy transform transition and returns to the correct selected route after browser history navigation.

## Expected Product-Data Differences

- The implementation displays the signed-in user's nickname, initial, contact visibility row, and current post data instead of copying the mockup text.
- The personal-information row remains between the record date and actions because it is a previously confirmed product requirement; it makes the lower content begin slightly later than in the mockup.
- The left header mark remains Along's real brand asset instead of the mockup's generated text mark.
- The account and profile avatars show a fallback initial because this test account has no uploaded avatar. The same components render the stored avatar image when one exists.

## Comparison History

1. Initial comparison found a boxed, short cover, an oversized identity block, muted buttons, and an account capsule that did not match the references.
2. The cover was changed to a full-width image with a multi-stop fade into `#f1ede4`, then extended behind the shared translucent header without moving the identity block.
3. The identity was resized to a 94-pixel avatar, 46-pixel title, 18-pixel description, and 15-pixel record date, then positioned at the fade tail.
4. Actions were resized to `154 × 50` pixels and changed to sampled colors: primary `#577a51`, secondary `#f4b99d`.
5. The account entry was changed to a 38-pixel avatar, nickname with truncation, and chevron; desktop utility buttons were normalized to 50 pixels.
6. The navigation spring/shared-layout indicator was replaced with a 240-millisecond `cubic-bezier(0.22, 1, 0.36, 1)` transition to prevent bouncing, cross-control interference, and stale selection after history navigation.
7. Final full-page and focused comparisons confirmed the intended layout, fade, proportions, colors, and header structure.
8. Follow-up pass reduced the shared desktop header from 90 to 82 pixels, removed the profile-only opaque override, and confirmed the same header material on the home and profile routes.

## Interaction Checks

- Clicking a primary navigation item changes route and selected state.
- Browser Back returns to the profile route and restores the correct selected navigation item.
- The account trigger opens a visible menu with the current nickname, real name, profile, drafts, notifications, friends, and sign-out actions.
- Clicking the account trigger again closes the menu and updates `aria-expanded`.
- Hover leaves the account trigger at `transform: none` with a transparent background; only the chevron translates 2 pixels and reverses direction when the menu is expanded.
- The privacy shortcut remains a direct in-place toggle rather than opening profile editing.
- Reduced-motion support remains available through the shared motion styles.
- Browser logs contain no application runtime errors. Development-only React/HMR messages and an existing LCP optimization warning for the Along brand image were observed.

## Responsive Safety

- Desktop-only sizing and positioning are scoped above the mobile breakpoint.
- Mobile profile transforms are reset, so the desktop identity offsets do not leak into the 375-pixel layout.
- Existing mobile actions and header behavior remain structurally unchanged by this desktop visual pass.

final result: passed
