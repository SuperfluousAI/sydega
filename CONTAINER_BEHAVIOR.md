# Container behavior — requirements

The five rules that govern how a parent container reacts to its children
moving in/out/around. Each rule is independently testable and the test
suite (`src/lib/containerBehavior.test.js`) enforces them.

## R1 — Frame extension on the overlapping side

When a child's bounding box pokes past an edge of its parent, the parent's
visible frame extends past that edge by `overshootAmount + 16px padding`,
so the frame visually *covers* the child (not just touches its edge).

- Trigger: the child's `min`/`max` coordinate is past the parent's `0` or
  `width`/`height`.
- Magnitude: distance past the edge, plus a 16px padding.
- Sides are independent — each of `top`/`right`/`bottom`/`left` is computed
  separately and either zero or covering.

## R2 — Other sides do not move

If a child is overlapping only one side, only that side's frame extension
is non-zero. The other three sides return zero overshoot. (This is a
direct consequence of R1 being per-side, but I'm calling it out because the
operator specifically asked for it.)

## R3 — Parent's underlying position and size never change

The parent's `position.x/y` and `style.width/height` never change in
response to children moving around. They stay at whatever the puzzle's
`initialNodes` set them to. Visual resize is purely through the frame
extension (R1).

This is what keeps the header text in place — it's positioned relative to
the parent's stable underlying bounds, not relative to the (visually
extended) frame.

## R4 — Child detaches when its center crosses the parent's baseline edge

A child becomes unparented when its center crosses any of the parent's
baseline edges (the static bounds from R3 — *not* the visually-extended
frame). This must work symmetrically on all four sides.

## R6 — Banner (header) resizes with the frame

The container's banner — the colored title bar at the top with the label
and ⋯ menu — is rendered *inside* the frame, not anchored to the parent's
underlying bounds. When the frame extends in any direction, the banner
extends with it:

- Frame extends LEFT → banner's left edge extends left
- Frame extends RIGHT → banner's right edge extends right
- Frame extends TOP → banner moves up with the frame's new top edge (the
  banner is always at the top of the visible container)
- Frame extends BOTTOM → banner stays at top of frame (no change)

Underlying parent position/size still doesn't change (R3 is unaffected).
The banner's visible movement is purely a consequence of being a child of
the visually-extended frame element.

## R5 — Vibrate fires only on a "leaving" drag

The vibrate / shake animation on a side fires only when the child's center
has crossed that side's baseline edge — i.e. the same threshold as detach.
Small overshoots where the child is still mostly inside (center still
within the parent) do not trigger vibrate; they only trigger R1 (frame
extension).
