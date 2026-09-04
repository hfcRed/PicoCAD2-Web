# Changelog

## 2.0.0

Major release. It brings PicoCAD 2.2 support, a bag full of new effects, and a new viewer state format. The two 1.4.0 betas are folded into this entry.

### Breaking

- **Shading and render mode are the file's values** — `shading` is replaced by `shadingMode`, the file's `shading_mode` (`SHADING_MODE.off` 0, `.on` 1), and `renderMode` is now the file's `face_mode` as a number (`RENDER_MODE.none` 0, `.color` 1, `.texture` 2) instead of `"texture" | "color" | "none"`. Loading a model applies both from the file.
- **Viewer states are `{ source, model, viewer, extras }`** — The flat `settings` object is replaced by two groups that store only what differs. `model` holds the settings the file carries (`ModelSettings`) where they differ from the loaded file. `viewer` holds the viewer's own settings (`ViewerSettings`) where they differ from `VIEWER_SETTINGS_DEFAULTS`. `extras` holds only the effects that differ from their defaults. `getState()` writes those differences, `setState()` loads the source and lays them over the file's settings, the viewer defaults and the effect defaults, so the source alone is a valid state and a state written by hand only needs what it changes. `AnimationSettings` is now `{ time, playing, loops }`. States saved by earlier versions are not migrated. Their model and effects still load, their settings are ignored.
- **`source` is the parsed file** — `PicoCAD2ViewerState.source` is typed as the raw file object (`RawPicoCAD2File`) that `getState()` always returned, instead of a string.
- **`extras.crt` is gone** — The CRT screen is `extras.videoEffects` with `screenType: "crt"`. `CRTEffect`, `CRTOptions` and the `crt` state key are removed. The old effect's `maskedColors` has no counterpart.
- **Inert `modelOnly` settings removed** — The `wireframe` and `particles` effects no longer carry a `modelOnly` property, and `gradientOutline` no longer accepts one in its options or saved state. None of them ever read the value.
- **Euler rotation order** — Node rotations now compose as Z·Y·X (matching PicoCAD 2.2) instead of X·Y·Z. Models using rotation on more than one axis render differently.
- **`onFrame` follows the frame cap** — With `maxFps` set, the `onFrame` callback fires once per drawn frame with the elapsed time since the previous drawn frame, instead of once per display refresh.

### Added

- **PicoCAD 2.2.0-b16 support** — `COMPATIBLE_VERSION` is now `"2.2.0-b16"`. Files saved by PicoCAD 2.1.0 remain fully supported.
- **Scene graph transform propagation** — Node world matrices now compose with all ancestor matrices, matching PicoCAD 2.2's scene graph and parenting. Animated parent nodes carry their children with them.
- **UV/spritesheet animation** — Motion clips with the new `"tex"` property animate face UVs frame by frame (`face_id`, `frames`, `step`, `return_uv`), including offset accumulation across clips and per-axis u/v shifting.
- **`ExportSettings.animateLoops`** — The loop count from PicoCAD 2.2's `"1x"`/`"2x"` animate setting. Also exposed as `viewer.animation.loops` and included in the viewer state (`model.animation.loops`).
- **`maxFps` viewer option** — Caps how often `startRenderLoop()` draws (default: 60). Previously the loop drew on every animation frame, so high refresh rate displays rendered caused periodic GC stutter in Firefox. Set to 0 to draw at the display refresh rate as before. Also available as `viewer.maxFps` and included in the viewer state (`viewer.maxFps`).
- **Settings defaults and helpers** — `MODEL_SETTINGS_DEFAULTS` and `VIEWER_SETTINGS_DEFAULTS` with `getDefaultModelSettings()` and `getDefaultViewerSettings()`, `modelInfo.settings` with the settings the loaded file carries, `mergeDefaults()` to resolve a state group into complete settings, and `SHADING_MODE` and `RENDER_MODE` naming the file's values.
- **Material effects** — Four new effects that render inside the model shader instead of the post-process chain, so they work in every render path, use the model's true normals, and leave the palette index buffer intact for post-effect masks:
  - **Rim light (`extras.rimLight`)** — Fresnel silhouette rim.
  - **Gradient light (`extras.gradientLight`)** — Two-color tint ramp.
  - **Specular (`extras.specular`)** — Blinn-Phong highlight from the headlight with an `anisotropy` stretch, plus an optional procedural environment reflection (`environment`)..
  - **Glitter (`extras.glitter`)** — View-angle triggered sparkle cells..

  Every material effect has a `style` setting: `"palette"` (default) renders using only palette colors. The effect colors snap to the nearest palette color and soft edges use the same checkerboard dithering as the shading system. `"dithered"` keeps the checkerboard crunch but uses the configured colors as-is, allowing out-of-palette colors. `"smooth"` does plain RGB blending.

- **Dissolve (`extras.dissolve`)** — Dissolves the model texel by texel as `progress` runs from 0 to 1, punching holes that outlines, depth effects and post-effect masks all see. The `sweep` group picks the order (see Sweeps), defaulting to `"noise"`. A`"uniform"` sweep fades the whole surface through the checkerboard at once. Survivors near the cut show an `edgeColor` band (`edgeWidth`), snapped and dithered in palette style. Fur strands dissolve with their base surface.
- **Emission (`extras.emission`)** — The masked palette colors ignore shading and render fullbright. Palette style claims the lit shade row through the checkerboard dither gate (the index buffer's shade row follows), so the render stays palette-pure. Smooth style blends toward the lit color. `blinkRate`/`blinkMode`/`blinkMin` pulse the emission, and `scrollGap`/`scrollWidth`/`scrollDirection`/`scrollSpeed` run lit band waves through the model. Pairs with `bloom.maskedColors` on the same indices for a glow halo.
- **Projection (`extras.projection`)** — Projects a pattern (`"stars"`, `"dust"`, `"voronoi"`, `"lava"`, `"grid"`, `"truchet"` or `"constellations"`) onto the model along `direction`. `mode` `"light"` lifts shaded surfaces toward their lit color, `"shadow"` pushes them down the shade rows, and `"tint"` paints `color` where the pattern hits. Palette style steps through the shade rows with checkerboard dithering, so the render stays palette-pure. `facing` keeps faces turned away from the direction untouched, and `scale`, `speed`, `seed`, `strength`, `maskedColors` and `nodes` work as everywhere else.
- **Geometry effects** — Three new effects that reshape the model's geometry:
  - **Mesh deform (`extras.meshDeform`)** — Stackable geometry deforms. `voxel` remeshes the model into strict grid-aligned cubes (`gridSize` sets the voxel edge length, every cube keeps the color of the surface texel it replaced, transparent texels produce no voxels, and all nodes share one grid so overlapping surfaces resolve to a single cube instead of z-fighting), plus the closed-form `barrel` bulge, `spherify`, and `twist` warps, which apply on top so a voxelized model can still bend. World space after the node transform, so hierarchy and animation stay correct. `progress` (default 1) runs the deform from untouched to full, by hand or through `cycle`, and the `sweep` group (see Sweeps) decides where the front is. The warps scale by the local progress at each vertex, and while the progress is partial every selected node is drawn from both its base mesh and its voxel stand-in, each keeping its side of the front per voxel cell, so whole cubes appear as a model voxelizes from one end, or a twist can travel up it as a wave.
  - **Triangle flash (`extras.triangleFlash`)** — Random triangles blink a color for a moment. Supports the material `style` setting allowing flashing triangles keep their base palette index.
  - **Triangle shatter (`extras.triangleShatter`)** — Blows the model apart into its triangles. The `sweep` group (see Sweeps) picks which triangles go first, and `gravity` drops the pieces, or lifts them when negative.
  - **Vertex glitch (`extras.vertexGlitch`)** — Rhythmic mesh spikes. Every beat (`rate`) picks a `density` fraction of triangles or vertices (`unit`) and pushes them out by `strength` for `duration` seconds, snapping or easing with `softness`. Triangle mode pushes whole triangles along their face normal and tears the mesh, vertex mode pushes each vertex outward along the average normal of its faces, so welds hold and the wireframe and fur follow. `progress`, `cycle` and the `sweep` group scale the spikes across the model.
- **Fur (`extras.fur`)** — Shell-textured fur grown from the model's surfaces. The model is drawn again as a stack of instanced shells (`layers`) into strands of varying height. `length` and `density` size the coat, `gravity` combs and drops it, and `rootShade` darkens roots through the palette's shade rows with checkerboard dithering. The fur stays palette-pure. Hides during a triangle shatter.
- **Billboard (`extras.billboard`)** — Turns selected scene nodes toward the camera, keeping translation and scale. `nodes` selects nodes by name (`[]` = all top-level nodes, groups included, so each top-level subtree turns as one piece) and `mode` chooses `"full"` (face the camera on all axes) or `"yaw"` (spin around world Y only). Children inherit the billboarded frame, billboard wins over animated rotation on the same node.
- **Procedural background (`extras.proceduralBackground`)** — Fills background pixels with a procedural pattern (`"voronoi"`, `"truchet"`, `"stars"`, `"constellations"`, `"lava"`, `"dust"` or `"grid"`). Runs early in the post chain, so fog, outlines and other effects apply over the pattern. `cameraParallax` rotates the pattern with the orbit camera, turning it into a skybox. The `style` setting follows the material effects: `"palette"` snaps `colorA`/`colorB` to the model's palette and dithers the field through the checkerboard, `"dithered"` dithers with the configured colors, and `"smooth"` (default) blends them continuously. With `randomHue` + `hueRange` shift `colorB`'s hue like the way glitter does (disabled in palette style).
- **Video effects (`extras.videoEffects`)** — Unified whole-display screen simulation with a `screenType` of `"crt"`, `"lcd"`, `"tn"`, `"oled"`, `"gameboy"` or `"projector"`. Shared controls set up a virtual pixel grid (`resolution` sets the virtual pixels along the height. Color is quantized per virtual pixel while the subpixel/grid structure renders at full output resolution, and the default `0` disables both the quantization and the grid, so the plain `lcd` type needs a `resolution` to show anything), tone (`brightness`, `saturation`, `contrastBoost`) and `gridStrength`. CRT curvature, scanlines, rolling refresh flicker and phosphor ghosting. Gameboy 4-shade palettes (`"dmg"`, `"pocket"` or custom) with LCD smear. TN viewing-angle shift. OLED black crush and pentile layout. Projector keystone, hotspot and lens halo.
- **Particles (`extras.particles`)** — Snow, rain, embers, sparkles or dust motes around the model. A single instanced draw of hashed, stateless, looping particles. Shapes `"pixel"` (constant screen size), `"quad"`, `"cube"` and `"triangle"`. Motion styles `"drift"`, `"orbit"` and `"linear"` layer procedural movement (scaled by `speed`) on top of a constant `velocity` vector per axis. `paletteIndices` colors particles from the model's palette, with `randomHue`/`hueRange` shifting each particle's hue by a random amount. `twinkle` fades particles in and out through alpha, and particles scale in when spawning and back out before despawning instead of popping, shaping the volume into a soft ellipsoid.
- **Floor (`extras.floor`)** — A pedestal plane under the model, placed and sized from its bounds (`offset`, `size`, `color`, `fade`), with world-space `grid` lines, a `shadow` of the model cast along a direction from a depth pass, and a `reflection` that redraws the whole model mirrored in the plate. Shadow and reflection come in through an ordered dither by their `strength`, or blend in smooth style, grid lines take the shadow at half strength so they stay readable inside it, and `shadow.softness` widens the shadow's edge into a penumbra. `infinite` stretches the plate to the horizon and `surface` can hide the plate itself, leaving only the grid, shadow and reflection. The plate writes the no-model palette index, so color masks, ambient occlusion and the drop shadow do not affec it.
- **Interior effect (`extras.interior`)** — Fake depth behind selected palette colors. For masked texels the view ray is marched into the surface and a procedural field (`"stars"`, `"dust"`, `"voronoi"`, `"lava"`, `"grid"`, `"truchet"` or `"constellations"`) is sampled at each depth, with parallax that tracks the camera. The pattern library is shared with the procedural background, both effects expose all seven patterns, `seed` picks the variant of the random patterns, and `randomHue` + `hueRange` shift the interior color's hue (disabled in palette style).
- **Ambient occlusion (`extras.ssao`)** — Palette-aware screen-space ambient occlusion. Crevices and contact areas darken based on the surrounding geometry, sampled from the depth buffer (`radius` in world units, `samples` 8/16/32, `intensity`, `power`). The default `"palette"` style darkens by re-indexing pixels to deeper shade rows of the palette with checkerboard dithering, so the occlusion stays within the model's 16 colors; `"dithered"` darkens RGB in the same stepped checkerboard without re-indexing. `"smooth"` multiplies RGB. `maskedColors` selects which colors receive occlusion. Works in all three projection modes and runs early in the post chain, so fog and color effects apply over it.
- **Directional outlines and drop shadows** — `extras.gradientOutline` gains `growthDirection` (degrees) and `growthFactor` (0 = uniform, the previous behavior and default; 1 = one-sided) to grow the outline toward one side, plus a `mode` of `"outline"` or `"dropShadow"` with a `shadowOffset` in pixels — the drop shadow repeats the whole silhouette displaced by the offset for a sticker look.
- **Palette swap & color cycling (`extras.paletteSwap`)** — Recolors the model PICO-8 `pal()` style by rewriting the palette lookup table on the CPU. A sparse `map` displays one palette index as another, keeping the target's shade ramp so recolored materials shade correctly; `cycleIndices` + `cycleSpeed` rotate a set of colors through each other over time (perfect loop). `cycleStyle` blends each cycle step in over the last `cycleBlendTime` seconds of the previous one. `"dithered"` (default) dissolves pixels to the next colors through an ordered dither, `"smooth"` crossfades the palette RGB, and `"palette"` snaps instantly. The model, particles, and palette-style effects all follow the swap. Effect masks keep matching the original indices.
- **`clampCameraDistance` viewer option** — When enabled, the camera is kept outside the model's surfaces at all times by zooming out, no matter what moved it inside. Configured as `{ enabled, minimumDistance }`. `minimumDistance` sets how much room the camera keeps to the surfaces it is clamped against, in world units, with the automatic near-plane clearance always acting as a lower bound. Available as a constructor option and `viewer.clampCameraDistance`, included in the viewer state.
- **Palette color masks (`maskedColors`)** — Bloom, dithering, posterization, color grading, color tint, halftone, noise, glitch, depth fog, edge detection and sharpen now accept a `maskedColors` array of base palette indices (0-15) selecting which colors the effect applies to. An empty array (the default) applies the effect everywhere, preserving existing behavior. Masks match the base palette index, so a color is selected whether lit or in shadow, and non-empty masks only ever match model pixels. Masked bloom acts as an emission mask (`extras.bloom.maskedColors = [10]` makes palette color 10 glow). Masked glitch only displaces and smears the selected colors. Included in options and the viewer state.
- **Node selection (`nodes`)** — Every effect that runs in the model pass now accepts a `nodes` array of scene node names, next to its `maskedColors`. A named node's descendants are included, so naming a group selects the whole group, and several nodes sharing a name are all selected. Colors and nodes combine so the effect applies to the selected colors within the selected nodes. An empty array (the default) selects every node, so existing states render unchanged.
- **Progress cycling (`cycle`)** — Dissolve, triangle shatter, mesh deform and vertex glitch accept a `cycle: { enabled, mode, duration, hold }` setting that runs their `progress` from 0 to 1 and back automatically over `duration` seconds, resting `hold` seconds at each end. `mode` decides how it comes back. `"pingpong"` runs the progress from 1 back to 0 so the sweep retraces its path, `"loop"` runs the sweep forward a second time to restore the model in the same direction. The manual `progress` is ignored while the cycle is enabled. Timing follows the viewer's elapsed time, so the cycle pauses with the render loop and is deterministic per frame. Off by default and included in the viewer state.
- **Sweeps (`sweep`)** — Effects that run a `progress` across the model share a `sweep` settings group deciding where the front is. `mode` (`"uniform"` = the whole model at once, `"noise"` = random mesh-space cells sized by `scale`, `"directional"` = a plane along `direction`, `"point"` = a sphere growing from `point`, `"proximity"` = front to back from the camera), `softness` as the width of the front, `wave` to turn the front into a band that crosses the model and restores it behind itself, and `invert` to invert the progress so the model is swept at 0 and restored at 1. Every mode is normalized to the model's bounds so the progress always spans the whole model. Exported as `SweepOptions` with `SWEEP_DEFAULTS`.
- **Color cutout effect (`extras.colorCutout`)** — Renders the selected palette colors as additional transparent colors. Applied in the model shader, so it produces real holes that outlines and depth-based effects see. Unlike effect masks, an empty `maskedColors` array cuts nothing.
- **Palette index buffer for custom effects** — The scene pass now writes a screen-space palette index buffer (R = base palette index, 255 = no model pixel, G = shade row) available to post-process effects as `EffectContext.indexTexture`. `FullscreenEffect` passes it to shaders as `u_indexTexture` together with a `u_colorMask` bitmask packed from the effect's `maskedColors` (helper exported as `packColorMask`).
- **`modelInfo.palette`** — The model's full color palette as an array of `Color3` values in palette index order, at the full precision of the model source.
- **Effect defaults and `reset()`** — Every effect exports its default settings as a deep-frozen constant (`DISSOLVE_DEFAULTS`, `BLOOM_DEFAULTS`, …) and has a `reset()` method that restores every setting to its default while keeping the effect's enabled state. `EXTRAS_DEFAULTS` aggregates the defaults of all effects, `getDefaultExtras()` returns a fresh mutable copy (the extras half of a default viewer state), and `viewer.extras.reset()` resets every effect at once, enabled state included.

### Changed

- **Batched shared-context rendering** — All viewers sharing a `PicoCAD2Context` are now driven by a single render loop that draws every due viewer into one atlas frame and captures the drawing buffer with a single `transferToImageBitmap()` per frame, instead of one capture per viewer. Capturing is the dominant per-viewer cost on Firefox, so multi-viewer pages scale dramatically better there.
- **Reduced per-frame allocations** — Render settings, shader uniform objects, and effect contexts are now reused across frames instead of rebuilt every draw, reducing garbage collection pressure in the render loop.
- **Render statistics count the whole frame** — `context.stats` now includes every draw a frame issues, not just the base model. Fur shells, wireframe lines, particles, the outline, every post-processing pass and the final composite. `polyCount` includes effect geometry. Fur shells multiply the model's triangles by the layer count and particles add their shapes, while fullscreen passes and wireframe lines add draw calls only. Custom effects can add their own draws through the new `EffectContext.stats`.
- **Smaller bundle** — Shader sources ship stripped of comments and whitespace, taking about 19% off the raw bundle and 14 KB off the gzipped size. Rendering is unchanged.
- **Scale motion clips** — Scale clip deltas are now multiplied by the node's base scale, matching PicoCAD 2.2.
- **Orthographic near plane** — Faces at or behind the camera plane are no longer clipped in orthographic projection (matching PicoCAD 2.2).
- **`animate` export setting** — Parses both the 2.1.0 boolean and the 2.2.0 `"off"`/`"1x"`/`"2x"` string forms. `"off"` no longer counts as enabled.
- **`motion_duration` fallback** — Files without a timeline length now default to 6.4 seconds (matching PicoCAD 2.2).
- **Auto-generated shade palettes** — When a file has no `shade_pal_1`/`shade_pal_2`, the second ramp is now derived from the first ramp's matched color darkened by 0.6 (matching PicoCAD 2.2, previously approximated with a single 0.42 factor).

### Fixed

- **Camera mode restore after `useFixedOnInteract`** — The restore absorbed the wall-clock camera mode offset into the camera, while a render loop synced to the animation applies the animation-clock offset, so the view jumped by the difference before interpolating back whenever the two clocks disagreed. After a restored animation time, a seek, a pause or a speed change. The restore now uses the clock the frames use.
- **Effects survive `load()`** — Loading a model replaced every effect with a fresh instance, so `extras` passed to the constructor, or any effect configured before the first load, were discarded. Effects now persist across loads, keeping their settings and compiled programs. `setState()` still restores every effect from the state and resets the ones the state does not mention.
- **Glitch bursts on every GPU** — The effect stayed inert for seconds at a time. The hash is now sine-free, so bursts fire at the same steps everywhere.
- **Noise grain on every GPU** — The grain used a sine-based hash with large arguments, which could band on some hardware. It now uses the shared sine-free hash.
- **`modelInfo.backgroundColor` full precision** — Now returns the color at the full precision of the model source again when no background color override is set.
- **Non-square resolutions no longer stretch** — The projection was fed the aspect ratio as width / height, but PicoCAD 2's projection matrices expect height / width. Non-square viewports now match PicoCAD 2.
- **UVs outside the texture clamp instead of tiling** — UVs mapped outside the 128x128 texture space now repeat the texture's edge pixels, matching PicoCAD 2 (LÖVE's default "clamp" wrap mode). Previously the texture tiled.
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
