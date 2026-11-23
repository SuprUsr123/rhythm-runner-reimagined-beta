# Camera triggers

This build implements the Canvas 2D camera trigger subset:

- **Zoom (1913):** zoom key 371, move time key 10, easing keys 30/85.
- **Static (1914):** target group key 71, exit key 110, axis key 101, follow key 212, follow easing key 213, smooth velocity key 453, modifier key 454, instant exit key 465, easing keys 30/85.
- **Offset (1916):** X/Y offset keys 28/29, axis key 101, move time key 10, easing keys 30/85.
- **Rotate (2015):** degrees key 68, additive key 70, duration key 10, 360 wrapping key 394, easing keys 30/85.
- **Edge (2062):** target group key 51 and edge selector key 164. Edge selectors 1–4 represent left, right, top, and bottom; target group 0 releases the selected edge.
- **Mode (2925):** free mode key 111, edit-settings key 112, follow easing key 113, and padding key 114.
- **Guide (2016):** editor-only camera preview from the guide object's position and zoom/offset/opacity keys 371/28/29/506. It is not applied during gameplay.

Static camera anchors remain fixed after their entrance tween unless Follow is enabled. With Follow enabled, the target group is sampled as it moves. Axis selection is supported for static and offset controls. Edge constraints are re-evaluated against the current target group position each frame.

The renderer is Canvas 2D; camera rotation rotates the play view visually. Input and hit-testing are not rotated, and rotated view corners expose the background.
