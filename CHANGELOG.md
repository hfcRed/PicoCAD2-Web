# Changelog

## Unreleased

### Added

- **Material effects** — Four new effects that render inside the model shader instead of the post-process chain, so they work in every render path, use the model's true normals, and leave the palette index buffer intact for post-effect masks:
  - **Rim light (`extras.rimLight`)** — Fresnel silhouette rim.
  - **Gradient light (`extras.gradientLight`)** — Two-color tint ramp.
  - **Specular (`extras.specular`)** — Blinn-Phong highlight from the headlight with an `anisotropy` stretch, plus an optional procedural environment reflection (`environment`)..
  - **Glitter (`extras.glitter`)** — View-angle triggered sparkle cells..

  Every material effect has a `style` setting: `"palette"` (default) renders using only palette colors. The effect colors snap to the nearest palette color and soft edges use the same checkerboard dithering as the shading system. `"smooth"` does plain RGB blending.

- **Dissolve (`extras.dissolve`)** — Dissolves the model texel by texel as `progress` runs from 0 to 1, punching holes that outlines, depth effects and post-effect masks all see. Modes: `"noise"` (random mesh-space cells, sized by `scale`), `"directional"` (world-space sweep along `direction`), `"point"` (sphere growing from `point`) and `"proximity"` (front-to-back from the camera). All normalized to the model's bounds and reversible with `invert`. `softness` dithers the boundary, and survivors near the cut show an `edgeColor` band (`edgeWidth`), snapped and dithered in palette style. Fur strands dissolve with their base surface.
- **Emission (`extras.emission`)** — The masked palette colors ignore shading and render fullbright. Palette style claims the lit shade row through the checkerboard dither gate (the index buffer's shade row follows), so the render stays palette-pure. Smooth style blends toward the lit color. `blinkRate`/`blinkMode`/`blinkMin` pulse the emission, and `scrollGap`/`scrollWidth`/`scrollDirection`/`scrollSpeed` run lit band waves through the model. Pairs with `bloom.maskedColors` on the same indices for a glow halo.
- **Geometry effects** — Three new effects that reshape the model's geometry:
  - **Mesh deform (`extras.meshDeform`)** — Stackable closed-form deforms: `rounding` (vertex snap / voxelation), `barrel` bulge, `spherify`, and `twist` (animatable into a tornado via `speed`). World space after the node transform, so hierarchy and animation stay correct.
  - **Triangle flash (`extras.triangleFlash`)** — Random triangles blink a color for a moment. Supports the material `style` setting allowing flashing triangles keep their base palette index.
  - **Triangle shatter (`extras.triangleShatter`)** — Blows the model apart into its triangles.
- **Fur (`extras.fur`)** — Shell-textured fur grown from the model's surfaces. The model is drawn again as a stack of instanced shells (`layers`) into strands of varying height. `length` and `density` size the coat, `gravity` combs and drops it, and `rootShade` darkens roots through the palette's shade rows with checkerboard dithering. The fur stays palette-pure. Hides during a triangle shatter.
- **Billboard (`extras.billboard`)** — Turns selected scene nodes toward the camera, keeping translation and scale. `nodes` selects nodes by name (`[]` = all top-level mesh nodes) and `mode` chooses `"full"` (face the camera on all axes) or `"yaw"` (spin around world Y only). Children inherit the billboarded frame, billboard wins over animated rotation on the same node.
- **Procedural background (`extras.proceduralBackground`)** — Fills background pixels with a procedural pattern (`"voronoi"`, `"truchet"`, `"stars"`, `"constellations"`, `"lava"`, `"dust"` or `"grid"`). Runs early in the post chain, so fog, outlines and other effects apply over the pattern. `cameraParallax` rotates the pattern with the orbit camera, turning it into a skybox.
- **Video effects (`extras.videoEffects`)** — Unified whole-display screen simulation with a `screenType` of `"crt"`, `"lcd"`, `"tn"`, `"oled"`, `"gameboy"` or `"projector"`. Shared controls set up a virtual pixel grid (`resolution` quantizes color per virtual pixel while the subpixel/grid structure renders at full output resolution), tone (`brightness`, `saturation`, `contrastBoost`) and `gridStrength`. CRT curvature, scanlines, rolling refresh flicker and phosphor ghosting. Gameboy 4-shade palettes (`"dmg"`, `"pocket"` or custom) with LCD smear. TN viewing-angle shift. OLED black crush and pentile layout. Projector keystone, hotspot and lens halo.
- **Particles (`extras.particles`)** — Snow, rain, embers, sparkles or dust motes around the model. A single instanced draw of hashed, stateless, looping particles. Shapes `"pixel"` (constant screen size), `"quad"`, `"cube"` and `"triangle"`. Motions `"drift"`, `"rise"`, `"fall"`, `"orbit"` and `"swirl"`; `paletteIndices` colors particles from the model's palette.
- **Interior effect (`extras.interior`)** — Fake depth behind selected palette colors. For masked texels the view ray is marched into the surface and a procedural field (`"stars"`, `"dust"`, `"voronoi"`, `"lava"`, `"grid"`, `"truchet"` or `"constellations"`) is sampled at each depth, with parallax that tracks the camera. The pattern library is shared with the procedural background, both effects expose all seven patterns.
- **Ambient occlusion (`extras.ssao`)** — Palette-aware screen-space ambient occlusion. Crevices and contact areas darken based on the surrounding geometry, sampled from the depth buffer (`radius` in world units, `samples` 8/16/32, `intensity`, `power`). The default `"palette"` style darkens by re-indexing pixels to deeper shade rows of the palette with checkerboard dithering, so the occlusion stays within the model's 16 colors; `"smooth"` multiplies RGB. `maskedColors` selects which colors receive occlusion. Works in all three projection modes and runs early in the post chain, so fog and color effects apply over it.
- **Directional outlines and drop shadows** — `extras.gradientOutline` gains `growthDirection` (degrees) and `growthFactor` (0 = uniform, the previous behavior and default; 1 = one-sided) to grow the outline toward one side, plus a `mode` of `"outline"` or `"dropShadow"` with a `shadowOffset` in pixels — the drop shadow repeats the whole silhouette displaced by the offset for a sticker look. Old saved states load unchanged.
- **Palette swap & color cycling (`extras.paletteSwap`)** — Recolors the model PICO-8 `pal()` style by rewriting the palette lookup table on the CPU. A sparse `map` displays one palette index as another, keeping the target's shade ramp so recolored materials shade correctly; `cycleIndices` + `cycleSpeed` rotate a set of colors through each other over time (perfect loop). The model, particles, and palette-style effects all follow the swap; effect masks keep matching the original indices.
- **`clampCameraDistance` viewer option** — When enabled, the camera's distance to target is clamped so the camera stays outside the model's bounds, preventing the view from clipping into the geometry when zooming in. Available as a constructor option and `viewer.clampCameraDistance`, included in the viewer state.
- **Palette color masks (`maskedColors`)** — Bloom, dithering, posterization, color grading, color tint, halftone, noise, glitch, depth fog, edge detection and sharpen now accept a `maskedColors` array of base palette indices (0-15) selecting which colors the effect applies to. An empty array (the default) applies the effect everywhere, preserving existing behavior. Masks match the base palette index, so a color is selected whether lit or in shadow, and non-empty masks only ever match model pixels. Masked bloom acts as an emission mask (`extras.bloom.maskedColors = [10]` makes palette color 10 glow). Masked glitch only displaces and smears the selected colors. Included in options and the viewer state.
- **Color cutout effect (`extras.colorCutout`)** — Renders the selected palette colors as additional transparent colors. Applied in the model shader, so it produces real holes that outlines and depth-based effects see. Unlike effect masks, an empty `maskedColors` array cuts nothing.
- **Palette index buffer for custom effects** — The scene pass now writes a screen-space palette index buffer (R = base palette index, 255 = no model pixel, G = shade row) available to post-process effects as `EffectContext.indexTexture`. `FullscreenEffect` passes it to shaders as `u_indexTexture` together with a `u_colorMask` bitmask packed from the effect's `maskedColors` (helper exported as `packColorMask`).
- **`modelInfo.palette`** — The model's full color palette as an array of `Color3` values in palette index order, at the full precision of the model source.

### Changed

- **Render statistics count the whole frame** — `context.stats` now includes every draw a frame issues, not just the base model. Fur shells, wireframe lines, particles, the outline, every post-processing pass and the final composite. `polyCount` includes effect geometry. Fur shells multiply the model's triangles by the layer count and particles add their shapes, while fullscreen passes and wireframe lines add draw calls only. Custom effects can add their own draws through the new `EffectContext.stats`.

### Deprecated

- **`extras.crt`** — Superseded by `extras.videoEffects` with `screenType: "crt"`. The property remains as a forwarding alias. Old saved states load unchanged (their `crt` settings map onto `videoEffects` and render identically). New states save only `videoEffects`. The old CRT's `maskedColors` is no longer supported.

### Fixed

- **`modelInfo.backgroundColor` full precision** — Now returns the color at the full precision of the model source again when no background color override is set.

## 1.4.0-beta.2

### Added

- **`maxFps` viewer option** — Caps how often `startRenderLoop()` draws (default: 60). Previously the loop drew on every animation frame, so high refresh rate displays rendered caused periodic GC stutter in Firefox. Set to 0 to draw at the display refresh rate as before. Also available as `viewer.maxFps` and included in the viewer state (`settings.maxFps`).

### Changed

- **Batched shared-context rendering** — All viewers sharing a `PicoCAD2Context` are now driven by a single render loop that draws every due viewer into one atlas frame and captures the drawing buffer with a single `transferToImageBitmap()` per frame, instead of one capture per viewer. Capturing is the dominant per-viewer cost on Firefox, so multi-viewer pages scale dramatically better there.
- **Reduced per-frame allocations** — Render settings, shader uniform objects, and effect contexts are now reused across frames instead of rebuilt every draw, reducing garbage collection pressure in the render loop.
- **`onFrame` follows the frame cap** — With `maxFps` set, the `onFrame` callback now fires once per drawn frame with the elapsed time since the previous drawn frame, instead of once per display refresh.

### Fixed

- **Non-square resolutions no longer stretch** — The projection was fed the aspect ratio as width / height, but PicoCAD 2's projection matrices expect height / width. Non-square viewports now match PicoCAD 2.
- **UVs outside the texture clamp instead of tiling** — UVs mapped outside the 128x128 texture space now repeat the texture's edge pixels, matching PicoCAD 2 (LÖVE's default "clamp" wrap mode). Previously the texture tiled.

## 1.4.0-beta.1

### Added

- **PicoCAD 2.2.0-b16 support** — `COMPATIBLE_VERSION` is now `"2.2.0-b16"`. Files saved by PicoCAD 2.1.0 remain fully supported.
- **Scene graph transform propagation** — Node world matrices now compose with all ancestor matrices, matching PicoCAD 2.2's scene graph and parenting. Animated parent nodes carry their children with them.
- **UV/spritesheet animation** — Motion clips with the new `"tex"` property animate face UVs frame by frame (`face_id`, `frames`, `step`, `return_uv`), including offset accumulation across clips and per-axis u/v shifting.
- **`ExportSettings.animateLoops`** — The loop count from PicoCAD 2.2's `"1x"`/`"2x"` animate setting. Also exposed as `viewer.animation.loops` and included in the viewer state (`settings.animation.loops`).

### Changed

- **Euler rotation order** — Node rotations now compose as Z·Y·X (matching PicoCAD 2.2) instead of X·Y·Z. Models using rotation on more than one axis render differently.
- **Scale motion clips** — Scale clip deltas are now multiplied by the node's base scale, matching PicoCAD 2.2.
- **Orthographic near plane** — Faces at or behind the camera plane are no longer clipped in orthographic projection, matching PicoCAD 2.2.
- **`animate` export setting** — Parses both the 2.1.0 boolean and the 2.2.0 `"off"`/`"1x"`/`"2x"` string forms. `"off"` no longer counts as enabled.
- **`motion_duration` fallback** — Files without a timeline length now default to 6.4 seconds (matching PicoCAD 2.2).
- **Auto-generated shade palettes** — When a file has no `shade_pal_1`/`shade_pal_2`, the second ramp is now derived from the first ramp's matched color darkened by 0.6 matching 2.2.0 (previously approximated with a single 0.42 factor).

### Fixed

- **Obfuscated bookmark keys** — Camera bookmarks saved by some PicoCAD 2.2 beta builds under an obfuscated key instead of `"bookmark"` are now recognized, and files without any bookmark fall back to the default camera state instead of failing to load.
- **Malformed motion clips** — Clips missing a `prop` are skipped on load instead of producing broken animation state, matching PicoCAD 2.2's load guard.
- **`instant` easing at clip start** — The jump now happens at exactly the clip start time, matching PicoCAD 2.
- **Stale pose after stopping animation** — Stopping the animation with `animation.stop()` now restores the model's static pose instead of freezing the last animated frame.

## 1.3.0

### Changed

- **Full-viewport effects preserve transparent backgrounds** — Effects with `modelOnly` disabled no longer force the background opaque when it matches the transparent color.
- **`useFixedOnInteract` hold behavior** — Holding a pointer down now keeps the fixed camera mode indefinitely. The restore delay counts from the pointer release instead of the last movement event.

### Fixed

- **Stuck camera pointers** — Cancelled pointer events (`pointercancel`) now release their pointer state, preventing stuck pinch or hold tracking.
- **Halftone dots mode** — No longer renders a tonally inverted image. Dark ink dots on a light ground now match the polarity of the lines and crosshatch modes.
- **Color grading hue** — Degree values now produce the documented shift. Previously the shader read the value as full turns, making every integer degree value a silent no-op.
- **Depth fog distances** — `near` and `far` now behave as world-space distances. Previously depth was linearized with the fog range instead of the camera projection planes, so full fog was unreachable and the ramp was compressed.
- **Depth fog in orthographic projection** — Fog now renders in orthographic mode. Previously the perspective depth inversion collapsed the whole scene to the near plane, disabling the effect entirely.
- **Bloom during resize** — The model no longer disappears while the canvas is being resized with bloom enabled, and enabling bloom no longer shows one corrupted frame.
- **CRT curvature** — The barrel distortion is now symmetric on both axes, and curved-off corners show the background instead of smearing the clamped edge pixels.
- **Glitch line shift** — Displaced lines now jitter in both directions with varied magnitude. Previously the direction was correlated with the selection hash, so lines only ever shifted right.
- **Noise animation** — Grain now re-randomizes every frame instead of drifting a frozen pattern across the screen.
- **Dithering amount** — Now fades the dither pattern in and out around the rounding midpoint. Previously values below 1 biased the quantizer toward black, with 0 rendering the image fully black.
- **Chromatic aberration on non-square canvases** — Fringe width and the radial falloff ring are now uniform in every direction, and the exact center pixel no longer produces undefined output.
- **Vignette roundness** — The setting now works: 1 gives a circular vignette, 0 an ellipse following the viewport shape. Previously it had no effect.
- **Degenerate effect settings** — Posterization levels below 2, pixelation sizes below 1, and a vignette smoothness of 0 no longer produce undefined or broken output.

## 1.2.15

### Added

- **`sourceColors` in `TextureData`** — The palette colors at the full precision of the model source, alongside the float32 `colors` used for the GPU palette.

### Changed

- **`modelInfo.backgroundColor` and `modelInfo.transparentColor`** — Now return the colors at the full precision of the model source. Previously they returned float32-rounded values from the GPU palette, so a background color set from `modelInfo` did not compare equal to the color in the model source.

## 1.2.14

### Fixed

- **Transparent background bleeding on Firefox** — Backgrounds matching the transparent color no longer bleed their color additively into the page on Firefox.

## 1.2.13

### Fixed

- **Double-sided face shading** — Faces with both double-sided rendering and shading enabled now shade correctly on both sides. Previously, the backside always rendered in the darkest shading color regardless of light direction.

## 1.2.12

### Added

- **`resolution` in `ViewerSettings`** — `getState()` now captures the render resolution (`width`, `height`, `scale`) and `setState()` restores it.
- **`bookmark` in `ViewerSettings`** — `getState()` now captures the camera bookmark and `setState()` restores it directly, without requiring the bookmark to be embedded in the model source.
- **`ResolutionSettings` type** — New exported type for resolution state (`width`, `height`, `scale`).
- **`BookmarkSettings` type** — New exported type for serialized bookmark state (`omega`, `theta`, `distanceToTarget`, `target`).

### Changed

- **`setBookmark()` method** — No longer modifies the model source string. The bookmark is now stored only on the parsed model and preserved through `getState()` / `setState()` serialization.

## 1.2.11

### Fixed

- **`setBookmark()` model source format** — Bookmark `target` and `pos` are now written as `{x, y, z}` objects matching the raw model format. Previously they were written as arrays, causing `NaN` camera values when restoring state with `useBookmark`.

## 1.2.10

### Changed

- **`setBookmark()` method** — Now writes the bookmark into the model source in addition to updating the parsed model, so the bookmark is preserved in `getState()` serialization.

## 1.2.9

### Changed

- **`setState()` method** — Now accepts an optional `useBookmark` boolean (default: `false`). When `true`, initializes the camera from the model's bookmark instead of the default camera state.

## 1.2.8

### Added

- **`advanceTime()` method** - Method on the PicoCAD2Viewer class that allows you to advance the internal clock by the given delta time. Useful when creating a custom render loop.

## 1.2.7

### Fixed

- **Camera interaction during restore** — Interacting with the camera while it is restoring to its original position no longer causes erratic behavior. The in-progress interpolation is now resolved to its current position before handling the new interaction.
- **Camera restore with animation** - Restoring the camera when the models camera speed was not synced with the animation speed no longer causes the camera to jump around.

## 1.2.6

### Changed

- **`draw()` method** — Now accepts an optional `syncWithAnimation` boolean (default: `true`). When `false`, camera mode offset uses its own timer instead of syncing to animation playback.
- **`startRenderLoop()` method** — Now accepts an optional `syncWithAnimation` boolean (default: `true`), passed through to `draw()` on each frame.

## 1.2.5

### Added

- **`COMPATIBLE_VERSION` constant** — Exported constant containing the PicoCAD 2 software version that the library is compatible with. Currently `"2.1.0"`.

### Fixed

- **Invisible folder rendering** — Folders with `visible` set to `false` now correctly hide all of their children. Previously, child meshes with `visible: true` inside an invisible folder would still render.

## 1.2.4

### Added

- **`spinInertiaFactor` camera control option** — Controls how quickly rotation spin decays after releasing. `0` = instant stop, `1` = never loses velocity. Defaults to `0.92`.
- **`useFixedOnInteract` camera control option** — When enabled, interacting with the canvas temporarily switches the camera mode to `"fixed"`. After a configurable delay following the last interaction, the original camera mode and position are restored with smooth interpolation.
- **`initFromState()` interpolation** — The camera's `initFromState()` method now accepts an optional second parameter for interpolation time in milliseconds. The camera smoothly interpolates from its current position to the target state using smoothstep easing.
- **Transparent background** — When the background color matches the transparent color, the background is now rendered as transparent instead of opaque.

### Fixed

- **Pan control bypass** — Disabling pan via `enableCameraControls({ pan: false })` now correctly prevents middle/right-click mouse panning.
- **Camera mode switching jump** — Switching between camera modes (e.g. `"spin"` to `"fixed"`) no longer causes a visual jump. The current rotation offset is absorbed into the camera angle on switch.

## 1.2.3

### Changed

- **`getState()` method** - Now returns the unstringified model.
- **`setState()` method** - Now expects an unstringified model.

## 1.2.2

### Added

- **`toPixelData()` method** — Returns the raw rendered pixel data as a `Uint8Array` (RGBA, 4 bytes per pixel).
- **`modelInfo.backgroundColor`** — The rendered background color as a `Color3`. Returns the viewer's override if set, otherwise the color parsed from the model.
- **`modelInfo.transparentColor`** — The model's transparent color as a `Color3`.
- **`enableCameraControls(options?)` parameter** — Accepts an optional `CameraControlOptions` object with `zoom`, `pan`, and `rotate` booleans. All default to `true`.

### Changed

- **Scroll wheel zoom** — Reduced zoom sensitivity for finer control.

## 1.2.1

### Changed

- **`load()`** - When loading a model, all extra effects will be cleared now.

## 1.2.0

### Added

- **Vignette effect** — Darkens the edges of the viewport with configurable intensity, smoothness, roundness, and color.
- **Depth Fog effect** — Adds atmospheric fog based on scene depth. Supports linear, exponential, and exponential squared falloff modes.
- **Halftone effect** — Converts the scene to a halftone pattern with dots, lines, or crosshatch modes. Configurable dot size, angle, and blend.
- **Glitch effect** — Animated digital distortion with RGB channel splitting, horizontal line displacement, and block corruption.
- **Color Tint effect** — Applies a color tint or duotone mapping. Tint mode multiplies a color, duotone maps luminance between two colors.
- **Sharpen effect** — Sharpens the image using a Laplacian convolution kernel with configurable strength and threshold.
- **Edge Detection effect** — Full-screen Sobel edge detection for a sketch or technical drawing look. Configurable threshold, line color, and background color.
- **`modelOnly` property on all effects** — When `true` (default), effects only apply to model pixels and preserve transparency. When `false`, effects apply to the entire viewport.

### Changed

- **Depth buffer** — The scene framebuffer now uses a depth texture instead of a renderbuffer, enabling depth-based effects like Depth Fog to sample scene depth.

## 1.1.2

### Added

- **Camera bookmark** — The bookmark is now available on the parsed model as `bookmark: CameraBookmark | null`.
- **`useBookmark` load parameter** — `load()` and `loadFromFile()` accept an optional `useBookmark` boolean to initialize the camera from the bookmark instead of the default camera state.
- **`useBookmark()` method** — Resets the camera to the bookmarked state. Returns `true` if applied, `false` if no bookmark exists.
- **`setBookmark()` method** — Updates the model's bookmark with a new `CameraBookmark` value.
- **`CameraBookmark` type** — New exported type for bookmark camera state (`target`, `distanceToTarget`, `theta`, `omega`).

## 1.1.1

### Changed

- **Animation settings** — Animation properties in `ViewerSettings` are now nested in an `animation` object instead of being flattened as `animationSpeed`, `animationTime`, `animationPlaying`, and `animationLoop` to match the structure of the `CameraSettings` and `AnimationController` interface.

### Added

- **`AnimationSettings` type** — New exported type for animation state (`speed`, `time`, `playing`, `loop`).

## 1.1.0

### Added

- **Constructor extras options** — All post-processing effects can now be configured directly in the `PicoCAD2Viewer` constructor via the `extras` option.
- **Background color** — New `backgroundColor` property to override the models default background color. Set to `null` to use the model default.
- **Model info** — New `viewer.modelInfo` getter exposing metadata after loading: `nodeCount`, `polyCount`, `animationDuration`, and `hasAnimation`.
- **Event callbacks** — `onLoad`, `onFrame`, and `onDispose` callbacks on the viewer, also settable via constructor options.
- **State serialization** — `getState()` and `setState()` methods for capturing and restoring the complete viewer state (model source, all settings, camera, animation, extras). Fully JSON serializable.
- **Image export** — `toBlob()` and `toDataURL()` methods to export the last rendered frame as an image.
- **Auto-resize** — `watchResize()` and `unwatchResize()` methods to automatically update resolution when the viewers parent changes size.

## 1.0.0

- Initial release.
