# SegmentedControl Design QA

## Evidence

- Source visual truth: `/Users/msf/Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/nt_qq_12189cae1bcc404b431935537fed1be0/nt_data/Video/2026-07/Ori/836c79e14d929b2f455215939176f8f2.mp4`
- Source comparison frame: `/private/tmp/along-motion-3.png`
- Desktop implementation capture: `/private/tmp/along-segmented-desktop.png`
- Mobile implementation capture: `/private/tmp/along-segmented-mobile.png`
- Route and state: `http://localhost:3001/`, login tab selected and registration tab selected
- Viewports: 1440 x 900 and 390 x 844

The reference is a motion example rather than an Along visual mockup. The comparison therefore uses its fast initial movement and softly damped landing as motion truth, while the existing Along palette, typography, radii, and spacing remain the visual truth.

## Findings

- No actionable P0, P1, or P2 differences remain.
- The implementation uses one shared capsule indicator per control. Desktop and mobile captures show no duplicate indicator, layout jump, clipping, or horizontal overflow.
- The spring is restrained and settles without a visible bounce. Text color changes separately and does not flash or move the label.

## Fidelity Surfaces

- **Fonts and typography:** Existing system Chinese font stacks, weights, sizes, line heights, and zero letter spacing are unchanged. Labels remain readable at mobile size.
- **Spacing and layout rhythm:** Existing track height, padding, radius, and page spacing are preserved. The indicator animates with `transform` and `width` without changing track dimensions.
- **Colors and visual tokens:** Existing warm paper, muted text, ink green, line color, and shadow tokens are retained. Only the shared selection mechanism changed.
- **Image quality and assets:** No image or icon assets are introduced or replaced by this component. The source video is used only as motion reference.
- **Copy and content:** Existing labels and app copy are unchanged.

## Interaction Checks

- Mouse click switches the selected option and leaves exactly one indicator.
- Horizontal drag continuously moves the indicator and snaps to the nearest enabled option on release.
- Arrow keys switch options and move focus; `Home` and `End` are implemented.
- Disabled options are skipped by keyboard and drag snapping.
- Each mounted control receives its own generated `layoutId`.
- `prefers-reduced-motion` disables spring movement and press scaling, and shortens the text transition.
- Browser console check found no page warnings or errors.

## Comparison History

1. Initial browser pass: click and keyboard behavior passed, but automated drag did not select the target because release handling depended too strictly on pointer-capture state.
2. Fix: kept pointer capture for continuity but made the active drag session the source of truth during move and release.
3. Post-fix evidence: drag from the first to second login option selected “邀请注册”; desktop and 390-pixel mobile captures remained stable with one indicator and no overflow.
4. Follow-up interaction pass: increased the mouse drag threshold so slight cursor movement does not consume a click, and added measured height transitions for conditional publishing, visibility, editing, and authentication content.
5. Desktop pointer compatibility pass: moved pointer capture from the outer track to the pressed option itself. Real-coordinate mouse click and drag now both change the selected state without competing for the final click event.

## Follow-up Polish

- The global route navigation remains semantic links rather than a state selector. When its information architecture is normalized across pages, it can adopt the same moving-indicator primitive without replacing link behavior.

## Implementation Checklist

- [x] Shared measured indicator
- [x] Restrained spring and text transition
- [x] Press feedback
- [x] Unequal-width and responsive measurement
- [x] Drag snapping
- [x] Keyboard and reduced-motion support
- [x] Desktop and mobile visual verification

final result: passed
