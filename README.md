# picocad2-web

![NPM Downloads](https://img.shields.io/npm/dm/picocad2-web?style=flat-square)
![NPM Version](https://img.shields.io/npm/v/picocad2-web?style=flat-square)
![Static Badge](https://img.shields.io/badge/PicoCAD2_Compatibility-v2.2.0--b16-green?style=flat-square)

A JavaScript library for viewing [PicoCAD 2](https://picocad.net/) models in the browser using WebGL 2.

[Live Demo](https://picocad2-web-viewer.hfcred.workers.dev/)

## Compatibility

The library exports a `COMPATIBLE_VERSION` constant indicating the PicoCAD 2 software version it targets. Currently `"2.2.0-b16"` (beta). Files saved by PicoCAD 2.1.0 remain fully supported.

```typescript
import { COMPATIBLE_VERSION } from "picocad2-web";
console.log(COMPATIBLE_VERSION); // "2.2.0-b16"
```

## Installation

```bash
npm install picocad2-web
```

Beta releases targeting PicoCAD 2 beta versions are published under the `beta` dist-tag and are never installed by default. To install beta versions run:

```bash
npm install picocad2-web@beta
```

## Quick Start

```typescript
import { PicoCAD2Viewer } from "picocad2-web";

const viewer = new PicoCAD2Viewer({
  canvas: document.querySelector("canvas"),
  resolution: { width: 256, height: 256, scale: 2 },
});

// Load a model from a .txt file string
viewer.load(modelString);

// Start rendering and enable camera controls
viewer.startRenderLoop();
viewer.enableCameraControls();
```

## Sharing a Context

Browsers limit the number of active WebGL contexts to 16. When displaying multiple models, it is recommended to create a single `PicoCAD2Context` and share it across viewers:

```typescript
import { PicoCAD2Context, PicoCAD2Viewer } from "picocad2-web";

const context = new PicoCAD2Context();

const viewer1 = new PicoCAD2Viewer({ canvas: canvas1, context });
const viewer2 = new PicoCAD2Viewer({ canvas: canvas2, context });
```

Viewers sharing a context also share a single render loop: each frame, all viewers render into one combined framebuffer that is captured once and distributed to their canvases. Capturing the drawing buffer is expensive (especially on Firefox), so sharing a context scales to much more viewers.

## Viewer Options

All options are optional and can be passed to the `PicoCAD2Viewer` constructor:

```typescript
const viewer = new PicoCAD2Viewer({
  // DOM & context
  canvas: document.querySelector("canvas"),   // Uses or creates a canvas if not specified
  context: sharedContext,                     // Share a PicoCAD2Context across viewers

  // Resolution
  resolution: { width: 128, height: 128, scale: 2 },

  // Rendering
  maxFps: 60,                       // Max render loop rate in fps, 0 = display refresh rate (default: 60)
  shading: true,                    // Enable lighting (default: true)
  renderMode: "texture",            // "texture" | "color" | "none" (default: "texture")
  projectionMode: "perspective",    // "perspective" | "orthographic" | "fisheye" (default: "perspective")
  backgroundColor: [0.1, 0.1, 0.1], // Override background color, or null for model default (default: null)

  // Outline
  outlineSize: 0,                 // Outline width in pixels (default: 0, disabled)
  outlineColor: [0, 0, 0],        // Outline RGB color, 0-1 range (default: black)

  // Scanlines
  scanlines: false,               // Enable scanline overlay (default: false)
  scanlineColor: [0, 0, 0],       // Scanline RGB color, 0-1 range (default: black)

  // Camera
  cameraMode: "fixed",            // "fixed" | "spin" | "sway" | "pingpong" (default: "fixed")
  cameraModeSpeed: 5,             // Camera mode cycle duration in seconds (default: 5)
  cameraModeDirection: "left",    // "left" | "right" (default: "left")
  clampCameraDistance: {          // Keep the camera outside the model's surfaces so the view can't clip into the geometry
    enabled: false,               // (default: false)
    minimumDistance: 0,           // Minimum distance to keep to the surfaces the camera stops at, in world units (default: 0)
  },

  // Animation
  animationSpeed: 1,              // Animation playback speed multiplier (default: 1)

  // Effects (all disabled by default)
  extras: {
    bloom: { enabled: true, threshold: 0.6, intensity: 1.5 },
    rimLight: { enabled: true, color: [1, 1, 1] },
    noise: { enabled: true, amount: 0.05 },
  },

  // Callbacks
  onLoad: (info) => console.log("Loaded:", info),
  onFrame: (dt) => { /* called every frame */ },
  onDispose: () => console.log("Disposed"),
});
```

## Loading Models

```typescript
// From a string
viewer.load(modelString);

// From a File object
await viewer.loadFromFile(file);

// Load using the model's bookmarked camera position
viewer.load(modelString, true);
```

Loading a model applies its export settings (camera position, outline, scanlines, etc.) to the viewer.

## Viewer Properties

All properties can be read and modified at any time after construction:

```typescript
// Rendering
viewer.shading = false;
viewer.renderMode = "color";
viewer.projectionMode = "orthographic";
viewer.backgroundColor = [0.2, 0, 0.3];

// Outline
viewer.outlineSize = 2;
viewer.outlineColor = [1, 1, 1];

// Scanlines
viewer.scanlines = true;
viewer.scanlineColor = [0.2, 0, 0.4];

// Camera mode
viewer.cameraMode = "spin";
viewer.cameraModeSpeed = 10;
viewer.cameraModeDirection = "right";
viewer.clampCameraDistance.enabled = true;        // Prevent the view from clipping into the model
viewer.clampCameraDistance.minimumDistance = 0.5; // Keep at least half a unit to the surfaces

// Tags (watermark text in viewport corners)
viewer.leftTag = { text: "picocad2-web", color: [1, 1, 1] };
viewer.rightTag = { text: "v1.2.7" };

// Check if a model is loaded
if (viewer.loaded) { /* ... */ }
```

## Render Loop & Drawing

```typescript
// Continuous rendering
viewer.startRenderLoop();
viewer.stopRenderLoop();

// Single frame (useful for static scenes or custom loops)
viewer.draw();

// Advances the internal clock (useful for custom loops)
viewer.advanceTime(deltaTime)

// By default, camera modes sync their cycle to the animation duration.
// Pass false to use the cameraModeSpeed timer instead.
viewer.startRenderLoop(false);
viewer.draw(false);
```

## Camera Controls

```typescript
// Enable mouse/touch orbit controls
viewer.enableCameraControls();
viewer.disableCameraControls();

// Enable only specific controls (all default to true)
viewer.enableCameraControls({ zoom: true, pan: false, rotate: true });

// Control spin inertia after releasing (0 = instant stop, 1 = never stops, default 0.92)
viewer.enableCameraControls({ spinInertiaFactor: 0.5 });

// Temporarily pause camera mode on interaction, then restore after a delay
viewer.enableCameraControls({
  useFixedOnInteract: {
    enabled: true,
    delayBeforeRestore: 2000, // ms after the last interaction or pointer release before restoring
    restoreTime: 500,         // ms to interpolate back to the original camera position
  },
});

// Access the camera directly
viewer.camera.theta = Math.PI / 4;
viewer.camera.omega = Math.PI / 6;
viewer.camera.distanceToTarget = 5;

// Reset camera to the model's bookmarked position
viewer.useBookmark();

// Save a new bookmark
viewer.setBookmark({
  target: new Float32Array([0, 2, 0]),
  distanceToTarget: 10,
  theta: 0.3,
  omega: 0.8,
});
```

## Animation

```typescript
// Playback controls
viewer.animation.play();
viewer.animation.pause();
viewer.animation.stop();

// Configuration
viewer.animation.speed = 2;     // 2x speed
viewer.animation.loop = false;  // Don't loop
viewer.animation.setTime(1.5);  // Jump to 1.5 seconds

// Loop count requested by the model's export settings (PicoCAD 2.2 "1x"/"2x").
viewer.animation.loops;
```

## Resolution

```typescript
// Update resolution at any time
viewer.setResolution(256, 256, 2); // width, height, scale (default: 1)

// Auto-resize: observe the canvas's parent element and update resolution on size changes
viewer.watchResize(2); // scale factor (default: 1)

// Stop observing
viewer.unwatchResize();
```

## Model Info

After loading a model, metadata is available via the `modelInfo` property:

```typescript
viewer.load(modelString);

const info = viewer.modelInfo;
// info.nodeCount         - Total scene nodes
// info.polyCount         - Total polygon faces
// info.animationDuration - Animation length in seconds
// info.hasAnimation      - Whether the model has animation data
// info.backgroundColor   - Rendered background color as [r, g, b] (0-1 range)
// info.transparentColor  - Transparent color as [r, g, b] (0-1 range)
// info.palette           - Full color palette as an array of [r, g, b] (0-1 range)
```

## Callbacks

```typescript
// Called after a model is loaded, receives ModelInfo
viewer.onLoad = (info) => {
  console.log(`Loaded ${info.polyCount} polygons`);
};

// Called every render loop frame with the delta time in seconds
viewer.onFrame = (dt) => {
  fpsCounter.update(dt);
};

// Called at the start of dispose(), before resources are freed
viewer.onDispose = () => {
  console.log("Viewer disposed");
};
```

Callbacks can also be set via constructor options (`onLoad`, `onFrame`, `onDispose`).

## State Serialization

Capture and restore the entire viewer state for sharing or persistence:

```typescript
// Capture state (JSON-serializable)
const state = viewer.getState();
localStorage.setItem("viewer", JSON.stringify(state));

// Restore state (reloads model, applies all settings, camera, animation, extras)
const saved = JSON.parse(localStorage.getItem("viewer"));
viewer.setState(saved);

// Restore state using the model's bookmarked camera position
viewer.setState(saved, true);
```

The state includes the raw model source string, all rendering settings, camera position, animation state, resolution, bookmark, and extras configuration.

## Image Export

```typescript
// Export current frame as a Blob (async)
const blob = await viewer.toBlob("image/png");

// Export as data URL (sync)
const dataUrl = viewer.toDataURL("image/jpeg", 0.9);

// Export raw RGBA pixel data (Uint8Array, length = width * height * 4)
const pixels = viewer.toPixelData();
```

## Effects

All effects live on `viewer.extras` and are disabled by default. They fall into four categories depending on where they run:

- **Material effects** shade the model's surfaces inside the model shader using the models true normals.
- **Geometry effects** reshape the model's own geometry.
- **Scene effects** draw additional geometry into the 3D scene alongside the model.
- **Post-processing effects** are fullscreen passes over the rendered image, applied in a fixed chain.

```typescript
// Enable an effect
viewer.extras.noise.enabled = true;
viewer.extras.noise.amount = 0.1;

// Disable it
viewer.extras.noise.enabled = false;
```

Post-processing shaders are compiled lazily, so effects have no GPU cost until first enabled.

### Color Masks

Effects that support masking have a `maskedColors` property: an array of base palette indices (0-15) selecting which of the model's colors the effect applies to. An empty array (the default) applies the effect everywhere.

Masks select *materials*, not displayed colors: a color is matched whether it is lit or in shadow, and pixels keep their material identity under warping effects (glitch, pixelation, lens distortion, chromatic aberration, video effects) and under material effects like rim light. Non-empty masks only ever match model pixels, never the background or outline.

Mask granularity follows where the mask is tested. Material and post-processing effects test per pixel, so `maskedColors: [12]` means "texels painted with color 12". Geometry effects run in the vertex stage where texels don't exist yet, so their masks select faces by the face's *assigned* color instead. On textured faces the two can disagree. Fur is the exception, its strand cutout runs per fragment and samples the texture, so its mask is per texel like the material effects. The billboard effect selects whole nodes by name rather than by color.

### Node Selection

Effects that run in the model pass also accept a `nodes` array of scene node names. A named node's descendants are included, so naming a group selects everything in it, and several nodes sharing a name are all selected. Colors and nodes combine, so the effect applies to the selected colors within the selected nodes. An empty array (the default) selects every node.

```typescript
viewer.extras.emission.maskedColors = [10];       // Color 10...
viewer.extras.emission.nodes = ["lamp", "sign"];  // ...but only on these nodes and their children
viewer.extras.fur.nodes = ["body"];               // Fur on the body only, every color
```

Node names come from the model file; `modelInfo.nodeCount` gives the total.

```typescript
// Make palette color 10 glow
viewer.extras.bloom.enabled = true;
viewer.extras.bloom.maskedColors = [10];

// Glitch only the "screen" color of a model
viewer.extras.glitch.enabled = true;
viewer.extras.glitch.maskedColors = [12];
```

All material effects support masking, per texel. These post-processing effects support it: bloom, dithering, posterization, color grading, color tint, halftone, noise, glitch, pixelation, chromatic aberration, depth fog, edge detection, and sharpen. Video effects are unmasked by design (they simulate the entire display), but they carry the palette index through their warps so masked effects later in the chain stay correct.

### Sweeps

Effects that run a `progress` across the model take a `sweep` group deciding where the front is. `mode` picks the order. `"uniform"` applies to the whole model at once, `"noise"` applies to random mesh-space cells, `"directional"` sweeps a plane along `direction`, `"point"` grows a sphere from a world `point`, and `"proximity"` runs front to back from the camera. Every mode is normalized to the model's bounds, so `progress` 0 to 1 always spans the whole model. `softness` is the width of the front as a fraction of that span. `wave` turns the front into a band of that width that enters at progress 0 and has left at 1, so the effect travels through the model and restores it behind the wave. The softness ramps sit inside the band, so a softness wider than half the wave lowers its peak. Waves apply to the directional, point and proximity sweeps. `invert` inverts the progress. At 0 the whole model is swept and it restores as the progress rises, so an inverted shatter assembles the model. A uniform sweep has no front, so `softness` and `wave` do nothing there.

```typescript
viewer.extras.dissolve.sweep.mode = "directional"; // Sweep order (default: "uniform"; the dissolve uses "noise", the triangle shatter and mesh deform "uniform")
viewer.extras.dissolve.sweep.direction = [0, 1, 0]; // Sweep direction for "directional" (default: [0, 1, 0])
viewer.extras.dissolve.sweep.point = [0, 0, 0];     // World center for "point" (default: [0, 0, 0])
viewer.extras.dissolve.sweep.scale = 8;             // Noise cells per mesh unit (default: 8)
viewer.extras.dissolve.sweep.softness = 0.15;       // Width of the front, 0-1 of the sweep range (default: 0.15)
viewer.extras.dissolve.sweep.wave = 0;              // Traveling band width, 0-1 of the sweep range, 0 = a front that stays (default: 0)
viewer.extras.dissolve.sweep.invert = false;        // Invert the progress: swept at 0, restored at 1 (default: false)
```

## Palette Swap & Color Cycling

`extras.paletteSwap` recolors the model PICO-8 `pal()` style, by rewriting the palette lookup table. A swapped index renders with the target's color *and* the target's shade ramp, so recolored materials shade correctly. Everything that reads the palette follows the swap. The model (including shading), particles, and palette-style effects like SSAO. Effect masks keep matching the original palette indices, which the swap does not change.

```typescript
const swap = viewer.extras.paletteSwap;
swap.enabled = true;

// Display palette color 7 as color 12 (sparse, unlisted indices stay unchanged)
swap.map = [];
swap.map[7] = 12;

// Demoscene color cycling: these indices rotate through each other
swap.cycleIndices = [8, 9, 10];    // 8 -> 9 -> 10 -> 8 -> ... (default: [])
swap.cycleSpeed = 2;               // Cycle steps per second, negative reverses (default: 2)
```

Cycling applies on top of `map`, and the cycle loops perfectly.

## Material Effects

Material effects render inside the model shader. Each one has a `style` property choosing how it writes its result:

- `"palette"` (default) — the effect only ever outputs the model's own palette colors: effect colors snap to the nearest palette entry, and soft edges use the same checkerboard dithering as the shading system. The render stays made of palette entries.
- `"smooth"` — plain RGB blending for a modern look.

### Color Cutout

Renders the selected palette colors as additional transparent colors, punching real holes into the model that outlines and depth-based effects see. Unlike effect masks, an empty `maskedColors` array cuts nothing.

```typescript
viewer.extras.colorCutout.enabled = true;
viewer.extras.colorCutout.maskedColors = [3, 7];    // These colors become transparent
viewer.extras.colorCutout.nodes = ["window"];             // Only within these nodes (default: [] = all nodes)
```

### Dissolve

Dissolves the model texel by texel as `progress` runs from 0 (intact) to 1 (gone), punching holes into the mesh. Survivors near the cut show a dithered edge. Fur strands dissolve with their base surface. Drive `progress` from the host for spawn and despawn animations, or let `cycle` run it back and forth automatically, and combine with the triangle shatter for layered destruction.

```typescript
viewer.extras.dissolve.enabled = true;
viewer.extras.dissolve.progress = 0.5;             // 0 = intact, 1 = fully dissolved (default: 0)
viewer.extras.dissolve.cycle.enabled = false;      // Run progress 0 → 1 → 0 automatically (default: false)
viewer.extras.dissolve.cycle.mode = "pingpong";    // How the progress comes back, "pingpong" retraces the sweep, "loop" restores along the same direction (default: "pingpong")
viewer.extras.dissolve.cycle.duration = 4;         // Seconds per full cycle, holds included (default: 4)
viewer.extras.dissolve.cycle.hold = 0.5;           // Seconds to rest at each end (default: 0.5)
viewer.extras.dissolve.sweep.mode = "noise";       // Which texels go first, see Sweeps (default: "noise")
viewer.extras.dissolve.edgeWidth = 0.1;            // Ember edge band width, 0 = no edge (default: 0.1)
viewer.extras.dissolve.edgeColor = [1, 0.65, 0.2]; // Edge color (default: [1, 0.65, 0.2])
viewer.extras.dissolve.maskedColors = [7];         // Only these colors dissolve (default: [] = all)
viewer.extras.dissolve.nodes = ["arm"];            // Only within these nodes (default: [] = all nodes)
```

The `sweep` group decides which texels go first (see [Sweeps](#sweeps)). The dissolve defaults to `"noise"`. A `"uniform"` sweep has no front, so the whole surface fades through the checkerboard instead and shows no edge. While `cycle` is enabled the manual `progress` is ignored. The progress rests at 0 for `hold` seconds. `cycle.mode` decides how the progress comes back. `"pingpong"` runs it from 1 back to 0, so the sweep retraces its path, and `"loop"` runs the sweep forward a second time to restore the model. Timing follows the viewer's elapsed time, so it pauses with the render loop. In palette style the edge color snaps to the nearest palette entry and the edge band dithers. Smooth style blends it.

### Interior

Fake depth behind selected palette colors: for masked texels the view ray is marched a few steps into the surface and a procedural 3D field is sampled at each depth, with parallax that tracks the camera.

```typescript
viewer.extras.interior.enabled = true;
viewer.extras.interior.maskedColors = [7];              // These colors become windows into the pattern
viewer.extras.interior.nodes = ["visor"];               // Only within these nodes (default: [] = all nodes)
viewer.extras.interior.pattern = "stars";               // Pattern behind the surface (default: "stars")
// Available patterns: "stars" | "dust" | "voronoi" | "lava" | "grid" | "truchet" | "constellations"
viewer.extras.interior.depth = 2;                       // World units to the deepest layer (default: 2)
viewer.extras.interior.layers = 3;                      // Pattern layers, 1-5 (default: 3)
viewer.extras.interior.scale = 4;                       // Pattern cells per world unit (default: 4)
viewer.extras.interior.speed = 1;                       // Pattern animation rate, 0 = frozen (default: 1)
viewer.extras.interior.seed = 0;                        // Variant of the random patterns, inert for "grid" (default: 0)
viewer.extras.interior.color = [1, 1, 1];               // Pattern color (default: [1, 1, 1])
viewer.extras.interior.backgroundColor = [0.06, 0.05, 0.13]; // Fill behind the last layer (default: [0.06, 0.05, 0.13])
```

Unlike the other material effects, the masked texels are replaced entirely by the interior. An empty `maskedColors` array applies it to every color, turning the whole model into a hologram.

The pattern library is shared with the Procedural Background effect, both expose all seven patterns. `"truchet"` and `"constellations"` are 2D patterns extruded along the world z axis, so inside the interior they read cleanest on faces looking down that axis.

### Rim Light

Fresnel rim on the model's silhouette. On flat-shaded geometry the rim is chunky per-face, like classic sprite edge-lighting.

```typescript
viewer.extras.rimLight.enabled = true;
viewer.extras.rimLight.color = [1, 1, 1];    // Rim color (default: [1, 1, 1])
viewer.extras.rimLight.width = 0.35;         // How far the rim reaches in from the silhouette, 0-1 (default: 0.35)
viewer.extras.rimLight.sharpness = 0.7;      // Soft dithered falloff to hard cut, 0-1 (default: 0.7)
viewer.extras.rimLight.lightAlign = 0;       // -1 shadow side only, 0 everywhere, +1 lit side only (default: 0)
viewer.extras.rimLight.blend = 1;            // Mix over the base color, 0-1 (default: 1)
viewer.extras.rimLight.invert = false;       // Light camera-facing geometry instead (default: false)
viewer.extras.rimLight.nodes = ["body"];          // Only within these nodes (default: [] = all nodes)
```

The light is attached to the camera, so `lightAlign = -1` gives a backlight: the silhouette rim tilted away from the light.

### Gradient Light

Two-color tint ramp over the model: lit (or high) areas pull toward one color, shadowed (or low) areas toward another.

```typescript
viewer.extras.gradientLight.enabled = true;
viewer.extras.gradientLight.litColor = [1, 0.92, 0.6];       // Color where the source is high (default: [1, 0.92, 0.6])
viewer.extras.gradientLight.shadowColor = [0.35, 0.35, 0.7]; // Color where the source is low (default: [0.35, 0.35, 0.7])
viewer.extras.gradientLight.source = "light";                // "light" | "worldY" | "screenY" (default: "light")
viewer.extras.gradientLight.nodes = ["body"];                     // Only within these nodes (default: [] = all nodes)
viewer.extras.gradientLight.blend = 0.5;                     // Tint amount, 0-1 (default: 0.5)
```

### Specular

Blinn-Phong highlight from the headlight, plus an optional procedural environment reflection: a two-color sky/ground sampled by the reflected view ray.

```typescript
viewer.extras.specular.enabled = true;
viewer.extras.specular.strength = 0.5;       // Highlight intensity, 0-1 (default: 0.5)
viewer.extras.specular.smoothness = 0.5;     // Highlight tightness, 0-1 (default: 0.5)
viewer.extras.specular.color = [1, 1, 1];    // Highlight color (default: [1, 1, 1])
viewer.extras.specular.anisotropy = 0;       // Screen-space highlight stretch, 0-1 (default: 0)
viewer.extras.specular.nodes = ["helmet"];          // Only within these nodes (default: [] = all nodes)

// Environment reflection (off by default)
viewer.extras.specular.environment.strength = 0.5;                  // Reflection amount, 0 = off (default: 0)
viewer.extras.specular.environment.skyColor = [0.62, 0.87, 1];      // Reflected by upward-facing surfaces (default: [0.62, 0.87, 1])
viewer.extras.specular.environment.groundColor = [0.42, 0.28, 0.2]; // Reflected by downward-facing surfaces (default: [0.42, 0.28, 0.2])
viewer.extras.specular.environment.horizon = 0.5;                   // Horizon band sharpness, 0-1 (default: 0.5)
viewer.extras.specular.environment.fresnel = 0.5;                   // Edge weighting of reflections, 0-1 (default: 0.5)
```

### Glitter

View-angle triggered sparkles that pop in and out as the camera orbits, with a per-cell twinkle over time.

```typescript
viewer.extras.glitter.enabled = true;
viewer.extras.glitter.space = "uv";          // Sparkle space (default: "uv")
// Available spaces: "uv" (quantized to the texel grid) | "screen" | "world" (sticks to surfaces under animation)
viewer.extras.glitter.density = 48;          // Sparkle cells per unit (default: 48)
viewer.extras.glitter.size = 0.6;            // Lit fraction of a cell, 0-1 (default: 0.6)
viewer.extras.glitter.nodes = ["gem"];           // Only within these nodes (default: [] = all nodes)
viewer.extras.glitter.color = [1, 1, 1];     // Sparkle color (default: [1, 1, 1])
viewer.extras.glitter.brightness = 1;        // Max sparkle intensity (default: 1)
viewer.extras.glitter.angleRange = 40;       // View-angle window in degrees, larger = more sparkles (default: 40)
viewer.extras.glitter.speed = 1;             // Twinkle rate (default: 1)
viewer.extras.glitter.shape = "square";      // "square" | "circle" (default: "square")
viewer.extras.glitter.randomHue = false;     // Random per-cell hues, smooth style only (default: false)
viewer.extras.glitter.hueRange = 0.5;        // Hue spread for randomHue, 0-1 (default: 0.5)
```

### Emission

Makes the masked palette colors emissive. Their texels ignore shading and render fullbright. In palette style the lit shade row is claimed through the checkerboard dither gate (and the index buffer's shade row follows), so the render stays palette-pure. Smooth style blends toward the lit color instead. Combine with `bloom.maskedColors` on the same indices for a glow halo.

```typescript
viewer.extras.emission.enabled = true;
viewer.extras.emission.maskedColors = [10];         // Emissive colors (default: [] = all)
viewer.extras.emission.nodes = ["lamp"];          // Only within these nodes (default: [] = all nodes)
viewer.extras.emission.strength = 1;                // How fully shading is ignored, 0-1 (default: 1)

// Blinking (off by default)
viewer.extras.emission.blinkRate = 2;               // Blinks per second, 0 = steady (default: 0)
viewer.extras.emission.blinkMode = "smooth";        // "smooth" sine | hard "pulse" (default: "smooth")
viewer.extras.emission.blinkMin = 0;                // Strength floor while blinking, 0-1 (default: 0)

// Scrolling band waves (off by default)
viewer.extras.emission.scrollGap = 2;               // World units between bands, 0 = no bands (default: 0)
viewer.extras.emission.scrollWidth = 0.25;          // Band width in world units (default: 0.25)
viewer.extras.emission.scrollDirection = [0, 1, 0]; // World travel direction (default: [0, 1, 0])
viewer.extras.emission.scrollSpeed = 1;             // World units per second, negative reverses (default: 1)
```

### Projection

Projects a pattern from the shared library onto the model's surfaces along a direction. The pattern is sampled on the plane perpendicular to `direction`, so it stays put while the model moves along the axis, and only faces turned toward the incoming direction receive it. `"light"` lifts shaded surfaces toward their lit color, `"shadow"` pushes them down the shade rows, and `"tint"` paints `color` where the pattern hits. In palette style, light and shadow step through the palette's shade rows with checkerboard dithering, so the render stays palette-pure. That also means light only shows on shaded surfaces, since lit is the palette's brightest. Smooth style blends instead.

```typescript
viewer.extras.projection.enabled = true;
viewer.extras.projection.pattern = "voronoi";       // Projected field (default: "voronoi")
// Available patterns: "stars" | "dust" | "voronoi" | "lava" | "grid" | "truchet" | "constellations"
viewer.extras.projection.direction = [0, -1, 0];    // Travel direction of the projection (default: [0, -1, 0], straight down)
viewer.extras.projection.mode = "shadow";           // "light" | "shadow" | "tint" (default: "shadow")
viewer.extras.projection.color = [1, 1, 1];         // Tint color, snapped in palette style (default: [1, 1, 1])
viewer.extras.projection.scale = 2;                 // Pattern cells per world unit (default: 2)
viewer.extras.projection.speed = 0.5;               // Pattern animation speed (default: 0.5)
viewer.extras.projection.seed = 0;                  // Pattern variant (default: 0)
viewer.extras.projection.strength = 1;              // Intensity, 0-1 (default: 1)
viewer.extras.projection.facing = 0.3;              // How squarely a face must face the direction to receive it, 0-1 (default: 0.3)
viewer.extras.projection.maskedColors = [7];        // Only these colors receive it (default: [] = all)
viewer.extras.projection.nodes = ["floor"];         // Only within these nodes (default: [] = all nodes)
```

## Geometry Effects

Geometry effects reshape or grow the model's own geometry. Masks select by face color (see Color Masks), except fur's, which is per texel.

### Mesh Deform

Stackable closed-form deforms, applied in world space after the node transform so hierarchy and animation stay correct. Applied in a fixed order ending with rounding, so voxelation quantizes the other deforms.

`progress` runs the whole deform from 0 (untouched) to 1 (full), by hand or through `cycle`, and the `sweep` group (see [Sweeps](#sweeps)) decides where the front is. The warps scale by the local progress at each vertex, so a directional sweep with the cycle running turns a twist into a wave that travels up the model and unwinds. Voxelization cannot be weighted per vertex, so while the progress is partial every selected node is drawn from both its base mesh and its voxel stand-in. The cut is decided per voxel cell, so whole cubes appear and disappear as the front passes.

```typescript
viewer.extras.meshDeform.enabled = true;
viewer.extras.meshDeform.progress = 1;             // 0 = untouched, 1 = fully deformed (default: 1)
viewer.extras.meshDeform.cycle.enabled = false;    // Run progress 0 → 1 → 0 automatically (default: false)
viewer.extras.meshDeform.cycle.mode = "pingpong";  // How the progress comes back, "pingpong" retraces the sweep, "loop" restores along the same direction (default: "pingpong")
viewer.extras.meshDeform.cycle.duration = 4;       // Seconds per full cycle, holds included (default: 4)
viewer.extras.meshDeform.cycle.hold = 0.5;         // Seconds to rest at each end (default: 0.5)
viewer.extras.meshDeform.sweep.mode = "uniform";   // Where the front is, see Sweeps (default: "uniform")
viewer.extras.meshDeform.voxel.enabled = true;     // Remesh into grid-aligned cubes (default: false)
viewer.extras.meshDeform.voxel.gridSize = 0.25;    // Voxel edge length in world units (default: 0.25)
viewer.extras.meshDeform.barrel.amount = 0.5;      // Bulge (or pinch when negative) along the axis, -1-1 (default: 0)
viewer.extras.meshDeform.barrel.axis = "y";        // "x" | "y" | "z" (default: "y")
viewer.extras.meshDeform.spherify.amount = 0.5;    // Lerp toward the bounding sphere, 0-1 (default: 0)
viewer.extras.meshDeform.twist.amount = 0.5;       // Rotations across the model height (default: 0)
viewer.extras.meshDeform.twist.axis = "y";         // "x" | "y" | "z" (default: "y")
viewer.extras.meshDeform.nodes = ["propeller"];        // Only within these nodes (default: [] = all nodes)
```

Mesh deform has no `maskedColors` because adjacent faces share positions, so deforming a masked face next to an unmasked face would tear their shared edge open. It does take `nodes`, whole nodes deform (or voxelize) while the rest of the model keeps its real geometry.

### Triangle Flash

Random triangles blink a color for a moment. Flashing triangles keep their base palette index, so a blink does not change the masks of other effects.

```typescript
viewer.extras.triangleFlash.enabled = true;
viewer.extras.triangleFlash.color = [1, 1, 1];     // Flash color (default: [1, 1, 1])
viewer.extras.triangleFlash.rate = 8;              // Flash buckets per second (default: 8)
viewer.extras.triangleFlash.density = 0.15;        // Fraction of triangles per bucket, 0-1 (default: 0.15)
viewer.extras.triangleFlash.duration = 0.12;       // Seconds a flash lasts (default: 0.12)
viewer.extras.triangleFlash.softness = 0;          // 0 = hard on/off, 1 = full fade (default: 0)
viewer.extras.triangleFlash.mode = "replace";      // "replace" | "add" (add is smooth style only, default: "replace")
viewer.extras.triangleFlash.nodes = ["screen"];     // Only within these nodes (default: [] = all nodes)
```

### Triangle Shatter

Blows the model apart into its triangles. Rendering is forced double-sided and the wireframe hides while a shatter is in progress. `cycle` works like the dissolve's. While enabled it runs `progress` from 0 to 1 and back over `duration` seconds, resting `hold` seconds at each end, so the wireframe and fur return during the rest at 0. The `sweep` group (see [Sweeps](#sweeps)) decides which triangles go first.

```typescript
viewer.extras.triangleShatter.enabled = true;
viewer.extras.triangleShatter.progress = 0.5;      // 0 = intact, 1 = fully dispersed (default: 0)
viewer.extras.triangleShatter.cycle.enabled = false; // Run progress 0 → 1 → 0 automatically (default: false)
viewer.extras.triangleShatter.cycle.mode = "pingpong"; // How the progress comes back, "pingpong" retraces the sweep, "loop" restores along the same direction (default: "pingpong")
viewer.extras.triangleShatter.cycle.duration = 4;  // Seconds per full cycle, holds included (default: 4)
viewer.extras.triangleShatter.cycle.hold = 0.5;    // Seconds to rest at each end (default: 0.5)
viewer.extras.triangleShatter.sweep.mode = "uniform"; // Which triangles go first, see Sweeps (default: "uniform")
viewer.extras.triangleShatter.mode = "normal";     // Travel direction (default: "normal")
// Available modes: "normal" (face normals) | "radial" (away from center) | "directional"
viewer.extras.triangleShatter.direction = [0, 1, 0]; // For "directional" mode (default: [0, 1, 0])
viewer.extras.triangleShatter.distance = 2;        // World units traveled at progress 1 (default: 2)
viewer.extras.triangleShatter.spread = 0.3;        // Random cone around the direction, 0-1 (default: 0.3)
viewer.extras.triangleShatter.rotation = 1;        // Tumble revolutions at progress 1 (default: 1)
viewer.extras.triangleShatter.gravity = 0;         // Downward pull scaled by distance, negative lifts (default: 0)
viewer.extras.triangleShatter.shrink = 0;          // Scale toward 0 at progress 1, 0-1 (default: 0)
viewer.extras.triangleShatter.maskedColors = [7];  // Only these face colors explode (default: [] = all)
viewer.extras.triangleShatter.nodes = ["wall"];   // Only within these nodes (default: [] = all nodes)
```

### Vertex Glitch

Rhythmic mesh spikes. Time is cut into beats at `rate` per second, every beat picks a `density` fraction of units at random, and each picked unit spikes out for `duration` seconds, snapping there or easing out and back with `softness`. `unit` decides what moves, `"triangle"` pushes whole triangles along their face normal, which tears the mesh apart and hides the wireframe and fur while it runs, while `"vertex"` pushes every corner at a mesh position outward along the average normal of the faces sharing that position, so welds hold and the wireframe and fur follow. `progress`, `cycle` and the `sweep` group (see [Sweeps](#sweeps)) scale the spikes across the model the way they do for the mesh deform.

```typescript
viewer.extras.vertexGlitch.enabled = true;
viewer.extras.vertexGlitch.unit = "vertex";         // "triangle" | "vertex" (default: "vertex")
viewer.extras.vertexGlitch.strength = 0.2;          // Spike length in world units (default: 0.2)
viewer.extras.vertexGlitch.rate = 8;                // Beats per second (default: 8)
viewer.extras.vertexGlitch.density = 0.3;           // Fraction of units picked per beat, 0-1 (default: 0.3)
viewer.extras.vertexGlitch.duration = 0.1;          // Seconds a spike lasts (default: 0.1)
viewer.extras.vertexGlitch.softness = 0;            // 0 snaps out and back, 1 eases over the whole spike (default: 0)
viewer.extras.vertexGlitch.progress = 1;            // 0 = still, 1 = full (default: 1)
viewer.extras.vertexGlitch.cycle.enabled = false;   // Run progress 0 → 1 → 0 automatically (default: false)
viewer.extras.vertexGlitch.cycle.mode = "pingpong"; // How the progress comes back, "pingpong" retraces the sweep, "loop" restores along the same direction (default: "pingpong")
viewer.extras.vertexGlitch.sweep.mode = "uniform";  // Where the spikes are, see Sweeps (default: "uniform")
viewer.extras.vertexGlitch.maskedColors = [7];      // Only faces of these colors spike (default: [] = all)
viewer.extras.vertexGlitch.nodes = ["antenna"];     // Only within these nodes (default: [] = all nodes)
```

A face-color mask in vertex mode tears the mesh at the mask boundary, since a shared corner moves with its masked face only, and hides the wireframe, which has no face colors.

### Fur

Shell-textured fur grown from the model's surfaces. The model is drawn again as a stack of instanced shells into strands of varying height. Strand roots darken through the palette's shade rows with checkerboard dithering. The fur stays palette-pure. Fur follows the mesh deform and hides while a triangle shatter is in progress.

```typescript
viewer.extras.fur.enabled = true;
viewer.extras.fur.length = 0.1;            // Fur length in world units (default: 0.1)
viewer.extras.fur.layers = 8;              // Shell count, 1-16 (default: 8)
viewer.extras.fur.density = 40;            // Strand cells per world unit (default: 40)
viewer.extras.fur.gravity = [0, -0.5, 0];  // Comb/droop vector, in fur lengths at the tip (default: [0, 0, 0])
viewer.extras.fur.rootShade = 1;           // How hard roots darken through the shade rows, 0-1 (default: 1)
viewer.extras.fur.maskedColors = [9];      // Fur only grows from these colors (default: [] = everywhere)
viewer.extras.fur.nodes = ["body"];       // Only within these nodes (default: [] = all nodes)
```

Unlike the other geometry effects, fur's mask is per texel. The strand cutout samples the texture, so `maskedColors: [9]` grows fur exactly where the surface is painted with color 9.

### Billboard

Turns selected nodes toward the camera, keeping translation and scale. Children inherit the billboarded frame, billboard wins over animated rotation on the same node. The wireframe follows automatically.

```typescript
viewer.extras.billboard.enabled = true;
viewer.extras.billboard.nodes = ["sign"];  // Node names (default: [] = all top-level nodes, groups included)
viewer.extras.billboard.mode = "full";     // "full" (face the camera on all axes) | "yaw" (spin around world Y, default: "full")
```

## Scene Effects

Scene effects render additional geometry into the 3D scene, depth-tested against the model, before any post-processing.

### Wireframe

Renders wireframe edges over the model.

```typescript
viewer.extras.wireframe.enabled = true;
viewer.extras.wireframe.color = [0, 1, 0];    // Wireframe color (default: [1, 1, 1])
```

### Particles

Snow, rain, embers, sparkles or dust motes around the model. One instanced draw of hashed, stateless, looping particles.

```typescript
viewer.extras.particles.enabled = true;
viewer.extras.particles.count = 300;           // Particle count, up to 2000 (default: 300)
viewer.extras.particles.shape = "pixel";       // "pixel" | "quad" | "cube" | "triangle" (default: "pixel")
viewer.extras.particles.size = 2;              // Output pixels for "pixel", world units otherwise (default: 2)
viewer.extras.particles.sizeJitter = 0.5;      // Random per-particle shrink, 0-1 (default: 0.5)
viewer.extras.particles.motion = "drift";      // "drift" | "orbit" | "linear" (default: "drift")
viewer.extras.particles.speed = 1;             // Motion rate (default: 1)
viewer.extras.particles.areaScale = 1.5;       // Particle volume as a multiple of the model bounds (default: 1.5)
viewer.extras.particles.twinkle = 0.3;         // Per-particle brightness flicker, 0-1 (default: 0.3)
viewer.extras.particles.paletteIndices = [7];  // Color source: particles sample these palette colors (default: [] = white)
```

Unlike effect masks, `paletteIndices` is a color source, not a mask: particles are painted with the model's palette colors at those indices.

### Floor

A pedestal plane under the model, placed at the lowest point of its rest-pose bounds and sized from its footprint, or stretched to the horizon with `infinite`. The plate carries optional world-space grid lines, a shadow of the model cast along a direction, and the model's mirror image, and it fades out toward its edge through an ordered dither. Shadow and reflection show through the same ordered dither by their `strength`, or blend in smooth style, and the shadow's `softness` widens its edge into a penumbra shaped the same way. Grid lines inside the shadow take it at half strength, so they read as darker lines, and a grid thins out where its cells shrink toward a pixel instead of flooding the plate. With `surface` off the plate itself is invisible and only the grid, the shadow and the reflection render. The plate is scenery, it writes the no-model palette index, so color masks, ambient occlusion and the drop shadow do not touch it, while depth fog reaches it through the depth buffer and outlines trace its edge like any content. Seen from below, the plate is opaque and shows neither shadow nor reflection.

```typescript
viewer.extras.floor.enabled = true;
viewer.extras.floor.surface = true;                    // Draw the plate surface; off leaves only the grid, shadow and reflection (default: true)
viewer.extras.floor.infinite = false;                  // Extend the plate to the horizon, ignoring size and fade (default: false)
viewer.extras.floor.offset = 0;                        // Distance below the model's lowest point, in world units (default: 0)
viewer.extras.floor.size = 2;                          // Plate width as a multiple of the model's larger horizontal extent (default: 2)
viewer.extras.floor.color = [0.4, 0.4, 0.45];          // Plate color (default: [0.4, 0.4, 0.45])
viewer.extras.floor.fade = 0.5;                        // Outer fraction of the plate that fades out, 0-1 (default: 0.5)
viewer.extras.floor.grid.enabled = true;               // World-space grid lines (default: true)
viewer.extras.floor.grid.spacing = 1;                  // Grid cell size in world units (default: 1)
viewer.extras.floor.grid.thickness = 1;                // Line width in render pixels (default: 1)
viewer.extras.floor.grid.color = [0.55, 0.55, 0.6];    // Grid line color (default: [0.55, 0.55, 0.6])
viewer.extras.floor.shadow.enabled = true;             // Shadow of the model on the plate (default: true)
viewer.extras.floor.shadow.direction = [0.5, -1, 0.3]; // Direction the shadow is cast along, must point down (default: [0.5, -1, 0.3])
viewer.extras.floor.shadow.color = [0.2, 0.2, 0.25];   // Shadow color (default: [0.2, 0.2, 0.25])
viewer.extras.floor.shadow.strength = 1;               // Shadow coverage, dithered below 1 (default: 1)
viewer.extras.floor.shadow.softness = 0;               // Penumbra radius in world units, 0 = hard edge (default: 0)
viewer.extras.floor.reflection.enabled = false;        // Mirror image of the model in the plate (default: false)
viewer.extras.floor.reflection.strength = 0.5;         // 1 = mirror, lower = water, dithered (default: 0.5)
viewer.extras.floor.style = "palette";                 // "palette" | "dithered" | "smooth" (default: "palette")
```

The shadow and reflection each redraw the whole model, so a plate with both costs three model draws per frame.

## Post-Processing Effects

### Procedural Background

Fills background pixels with a procedural pattern, so models stop floating in flat color. Applied at the head of the chain, so fog, outlines and every other effect apply over the pattern. Does nothing over a transparent background. The pattern library is shared with the Interior material effect, both expose all seven patterns.

```typescript
viewer.extras.proceduralBackground.enabled = true;
viewer.extras.proceduralBackground.pattern = "stars";        // Pattern (default: "stars")
// Available patterns: "voronoi" | "truchet" | "stars" | "constellations" | "lava" | "dust" | "grid"
viewer.extras.proceduralBackground.colorA = [0.02, 0.02, 0.07]; // Base color (default: [0.02, 0.02, 0.07])
viewer.extras.proceduralBackground.colorB = [1, 1, 1];       // Feature color (default: [1, 1, 1])
viewer.extras.proceduralBackground.scale = 12;               // Pattern cells across the viewport height (default: 12)
viewer.extras.proceduralBackground.speed = 1;                // Pattern animation rate, 0 = frozen (default: 1)
viewer.extras.proceduralBackground.seed = 0;                 // Selects a different slice of the pattern space (default: 0)
viewer.extras.proceduralBackground.cameraParallax = 0.5;     // 0 = screen-locked, 1 = follows the orbit camera (default: 0.5)
viewer.extras.proceduralBackground.dither = false;           // Checkerboard-quantize the gradients (default: false)
```

### Ambient Occlusion (SSAO)

Screen-space ambient occlusion. Crevices, corners and contact areas darken based on the surrounding geometry, grounding the model. Runs early in the chain, so fog and color work apply over it.

The default `"palette"` style darkens by stepping each pixel to a deeper shade row of the model's palette, dithered with the same checkerboard the shading system uses. The occlusion looks hand-drawn instead of smeared. `"smooth"` multiplies plain RGB instead. `maskedColors` selects which colors receive occlusion.

```typescript
viewer.extras.ssao.enabled = true;
viewer.extras.ssao.radius = 1;             // Sampling radius in world units (default: 1)
viewer.extras.ssao.intensity = 1;          // Occlusion strength (default: 1)
viewer.extras.ssao.power = 1;              // Falloff exponent, higher = darkens crevices only (default: 1)
viewer.extras.ssao.samples = 16;           // Samples per pixel: 8 | 16 | 32 (default: 16)
viewer.extras.ssao.style = "palette";      // "palette" | "smooth" (default: "palette")
```

### Noise

Animated film grain overlay.

```typescript
viewer.extras.noise.enabled = true;
viewer.extras.noise.amount = 0.05;    // Noise intensity, 0-1 (default: 0.05)
```

### Color Grading

Brightness, contrast, saturation, and hue adjustments.

```typescript
viewer.extras.colorGrading.enabled = true;
viewer.extras.colorGrading.brightness = 1.2;    // Brightness multiplier (default: 1.0)
viewer.extras.colorGrading.contrast = 1.1;      // Contrast multiplier (default: 1.0)
viewer.extras.colorGrading.saturation = 0.8;    // Saturation multiplier (default: 1.0)
viewer.extras.colorGrading.hue = 30;            // Hue shift in degrees (default: 0)
```

### Posterization

Reduces color depth for a banded, stylized look.

```typescript
viewer.extras.posterization.enabled = true;
viewer.extras.posterization.levels = 8;                   // Color levels (default: 8)
viewer.extras.posterization.gamma = 1.0;                  // Gamma correction (default: 1.0)
viewer.extras.posterization.colorBanding = false;         // Color banding mode (default: false)
viewer.extras.posterization.channelLevels = [1, 1, 1];    // Per-channel level multiplier (default: [1, 1, 1])
```

### Bloom

Multipass glow effect with threshold, Gaussian blur, and additive compositing.

```typescript
viewer.extras.bloom.enabled = true;
viewer.extras.bloom.threshold = 0.8;    // Brightness threshold (default: 0.8)
viewer.extras.bloom.intensity = 1.0;    // Bloom strength (default: 1.0)
viewer.extras.bloom.blur = 4.0;         // Blur radius (default: 4.0)
```

### Dithering

4x4 Bayer matrix dithering pattern.

```typescript
viewer.extras.dithering.enabled = true;
viewer.extras.dithering.amount = 1.0;                  // Dithering intensity (default: 1.0)
viewer.extras.dithering.blend = 1.0;                   // Blend with original (default: 1.0)
viewer.extras.dithering.channelAmount = [1, 1, 1];    // Per-channel amount (default: [1, 1, 1])
```

### Video Effects

Whole-display screen simulation with six screen types behind one `screenType` switch. Shared controls set up the virtual pixel grid and tone, and each screen type adds its own settings on top.

```typescript
viewer.extras.videoEffects.enabled = true;
viewer.extras.videoEffects.screenType = "crt";       // Screen to simulate (default: "crt")
// Available types: "crt" | "lcd" | "tn" | "oled" | "gameboy" | "projector"
viewer.extras.videoEffects.resolution = 96;          // Virtual pixels along the height, 0 = native (default: 0)
viewer.extras.videoEffects.brightness = 1.0;         // Brightness multiplier (default: 1.0)
viewer.extras.videoEffects.saturation = 1.0;         // Saturation multiplier (default: 1.0)
viewer.extras.videoEffects.contrastBoost = 0.0;      // Extra contrast (default: 0.0)
viewer.extras.videoEffects.gridStrength = 0.5;       // Subpixel / screen-door / grille visibility (default: 0.5)
```

`resolution` defines a virtual pixel grid, color is quantized per virtual pixel while the subpixel and grid structure renders at full output resolution, which is what makes it read as a screen instead of downscaled pixelation. At the default `0` there is no quantization and no grid structure. Because the quantization covers the same ground as pixelation, `videoEffects.resolution` supersedes `pixelation`, prefer it over stacking the two.

Per-type settings:

```typescript
// CRT: curvature warp, scanlines, rolling flicker, phosphor ghosting
viewer.extras.videoEffects.crt.curvature = 0.5;           // Barrel distortion amount (default: 0.5)
viewer.extras.videoEffects.crt.scanlineIntensity = 0.3;   // Scanline opacity (default: 0.3)
viewer.extras.videoEffects.crt.refreshRate = 0;           // Rolling flicker band sweeps in Hz, 0 = off (default: 0)
viewer.extras.videoEffects.crt.pixelFadeTime = 0;         // Phosphor ghosting in seconds, 0 = off (default: 0)

// Gameboy: 4-shade quantization with LCD smear
viewer.extras.videoEffects.gameboy.palette = "dmg";       // "dmg" | "pocket" | "custom" (default: "dmg")
viewer.extras.videoEffects.gameboy.customColors = [       // 4 shades, darkest to lightest, for "custom"
  [0.06, 0.22, 0.06], [0.19, 0.38, 0.19], [0.55, 0.67, 0.06], [0.61, 0.74, 0.06],
];
viewer.extras.videoEffects.gameboy.ghosting = 0.3;        // LCD response smear, 0-1 (default: 0.3)

// TN panel: viewing-angle shift
viewer.extras.videoEffects.tn.angleShift = 0.5;           // Darkened top, washed-out bottom (default: 0.5)

// OLED: perfect blacks and pentile layout
viewer.extras.videoEffects.oled.blackCrush = 0.5;         // Crush near-black to true black (default: 0.5)
viewer.extras.videoEffects.oled.pentile = false;          // Alternate RG/GB subpixel layout (default: false)

// Projector: keystone, hotspot and lens glow
viewer.extras.videoEffects.projector.keystone = 0.2;      // Trapezoid warp toward the top (default: 0.2)
viewer.extras.videoEffects.projector.hotspot = 0.4;       // Radial brightness falloff (default: 0.4)
viewer.extras.videoEffects.projector.halo = 0.3;          // Light spill around bright content (default: 0.3)
```

The plain `lcd` type uses only the shared controls: set a `resolution` and the `gridStrength` draws its RGB subpixels and screen-door gaps.

> **Deprecated:** `viewer.extras.crt` is now an alias forwarding to `videoEffects` (enabling it switches `screenType` to `"crt"`) and will be removed in 2.0. States saved by older versions load correctly — their `crt` settings are mapped onto `videoEffects` and render identically; new states save only `videoEffects`. The one exception: the old CRT's `maskedColors` (which restricted scanlines to masked materials) is no longer supported, since the unified effect simulates the whole display.

### Pixelation

Pixelates the image with configurable pixel shapes.

```typescript
viewer.extras.pixelation.enabled = true;
viewer.extras.pixelation.pixelSize = 4;      // Pixel size in screen pixels (default: 4)
viewer.extras.pixelation.blend = 1.0;        // Blend with original (default: 1.0)
viewer.extras.pixelation.shape = "square";   // Pixel shape (default: "square")
// Available shapes: "square" | "hex" | "circle" | "diamond" | "triangle" | "cross" | "star"
```

### Lens Distortion

Barrel or pincushion lens distortion.

```typescript
viewer.extras.lensDistortion.enabled = true;
viewer.extras.lensDistortion.strength = 0.5;    // Positive = barrel, negative = pincushion (default: 0)
viewer.extras.lensDistortion.zoom = 2.0;        // Zoom compensation (default: 2.0)
```

### Chromatic Aberration

Separates RGB color channels with radial offset.

```typescript
viewer.extras.chromaticAberration.enabled = true;
viewer.extras.chromaticAberration.strength = 1.0;        // Overall strength (default: 1.0)
viewer.extras.chromaticAberration.redOffset = 1.0;       // Red channel offset (default: 1.0)
viewer.extras.chromaticAberration.greenOffset = 0.0;     // Green channel offset (default: 0.0)
viewer.extras.chromaticAberration.blueOffset = -1.0;     // Blue channel offset (default: -1.0)
viewer.extras.chromaticAberration.radialFalloff = 1.5;   // Falloff exponent (default: 1.5)
viewer.extras.chromaticAberration.centerX = 0.5;         // Effect center X (default: 0.5)
viewer.extras.chromaticAberration.centerY = 0.5;         // Effect center Y (default: 0.5)
```

### Gradient Outline

A gradient colored outline effect. When enabled, it automatically replaces the built-in solid outline.

The outline can grow directionally. `growthFactor` 0 (the default) grows it evenly on all sides, 1 grows it only toward `growthDirection`, with a smooth falloff to the sides. The `"dropShadow"` mode instead repeats the whole silhouette displaced by `shadowOffset`, for a sticker-style shadow (`size` still fattens the shadow shape; use `size = 0` for an exact copy).

```typescript
viewer.extras.gradientOutline.enabled = true;
viewer.extras.gradientOutline.size = 1;                      // Outline radius (default: 1)
viewer.extras.gradientOutline.colorFrom = [1, 0.5, 0];       // Gradient start color (default: [1, 1, 1])
viewer.extras.gradientOutline.colorTo = [0, 0.5, 1];         // Gradient end color (default: [0, 0, 0])
viewer.extras.gradientOutline.gradient = 1.0;                // Gradient intensity (default: 1.0)
viewer.extras.gradientOutline.gradientDirection = Math.PI;   // Gradient angle in radians (default: 0)
viewer.extras.gradientOutline.growthDirection = 90;          // Growth direction in degrees, 0 = right, 90 = up (default: 0)
viewer.extras.gradientOutline.growthFactor = 0;              // 0 = uniform outline, 1 = one-sided (default: 0)
viewer.extras.gradientOutline.mode = "outline";              // "outline" | "dropShadow" (default: "outline")
viewer.extras.gradientOutline.shadowOffset = [2, -2];        // Drop shadow offset in pixels, +x = right, +y = up (default: [2, -2])
```

### Vignette

Darkens the edges of the viewport.

```typescript
viewer.extras.vignette.enabled = true;
viewer.extras.vignette.intensity = 1.0;      // Vignette strength (default: 1.0)
viewer.extras.vignette.smoothness = 0.5;     // Falloff gradient width (default: 0.5)
viewer.extras.vignette.roundness = 1.0;      // Circular vs rectangular (default: 1.0)
viewer.extras.vignette.color = [0, 0, 0];    // Tint color (default: [0, 0, 0])
```

### Depth Fog

Adds atmospheric fog based on scene depth.

```typescript
viewer.extras.depthFog.enabled = true;
viewer.extras.depthFog.color = [0.8, 0.85, 0.9];   // Fog color (default: [0.8, 0.85, 0.9])
viewer.extras.depthFog.near = 0.1;                   // Fog start distance (default: 0.1)
viewer.extras.depthFog.far = 50.0;                   // Fog end distance (default: 50.0)
viewer.extras.depthFog.density = 0.05;               // Fog density for exponential modes (default: 0.05)
viewer.extras.depthFog.mode = "linear";              // Falloff mode (default: "linear")
// Available modes: "linear" | "exponential" | "exponentialSquared"
```

### Halftone

Converts the scene to a halftone dot or line pattern.

```typescript
viewer.extras.halftone.enabled = true;
viewer.extras.halftone.dotSize = 6.0;       // Size of halftone elements (default: 6.0)
viewer.extras.halftone.angle = 0.4;         // Grid rotation in radians (default: 0.4)
viewer.extras.halftone.blend = 1.0;         // Blend with original (default: 1.0)
viewer.extras.halftone.mode = "dots";       // Pattern mode (default: "dots")
// Available modes: "dots" | "lines" | "crosshatch"
```

### Glitch

Animated digital distortion with RGB splitting and block corruption.

```typescript
viewer.extras.glitch.enabled = true;
viewer.extras.glitch.intensity = 0.5;       // Overall glitch strength (default: 0.5)
viewer.extras.glitch.speed = 1.0;           // Animation speed (default: 1.0)
viewer.extras.glitch.blockSize = 30.0;      // Size of glitch blocks (default: 30.0)
viewer.extras.glitch.rgbSplit = true;       // Enable RGB channel separation (default: true)
viewer.extras.glitch.lineShift = true;      // Enable horizontal line displacement (default: true)
```

### Color Tint

Applies a color tint or duotone mapping.

```typescript
viewer.extras.colorTint.enabled = true;
viewer.extras.colorTint.mode = "tint";                         // "tint" or "duotone" (default: "tint")
viewer.extras.colorTint.blend = 1.0;                           // Blend with original (default: 1.0)

// Tint mode
viewer.extras.colorTint.color = [1.0, 0.9, 0.7];              // Tint color (default: [1.0, 0.9, 0.7])
viewer.extras.colorTint.intensity = 1.0;                       // Tint intensity (default: 1.0)

// Duotone mode
viewer.extras.colorTint.shadowColor = [0.0, 0.0, 0.2];        // Shadow color (default: [0.0, 0.0, 0.2])
viewer.extras.colorTint.highlightColor = [1.0, 1.0, 0.8];     // Highlight color (default: [1.0, 1.0, 0.8])
```

### Sharpen

Sharpens the image using a Laplacian convolution kernel.

```typescript
viewer.extras.sharpen.enabled = true;
viewer.extras.sharpen.strength = 1.0;      // Sharpening intensity (default: 1.0)
viewer.extras.sharpen.threshold = 0.0;     // Minimum difference to sharpen (default: 0.0)
```

### Edge Detection

Full-screen Sobel edge detection for a sketch or technical drawing look.

```typescript
viewer.extras.edgeDetection.enabled = true;
viewer.extras.edgeDetection.threshold = 0.1;                  // Edge sensitivity (default: 0.1)
viewer.extras.edgeDetection.lineColor = [0, 0, 0];            // Edge color (default: [0, 0, 0])
viewer.extras.edgeDetection.backgroundColor = [1, 1, 1];      // Fill color (default: [1, 1, 1])
viewer.extras.edgeDetection.blend = 1.0;                      // Blend with original (default: 1.0)
```

### Model Only

All post-processing effects except the gradient outline have a `modelOnly` property (default: `true`). When enabled, the effect only applies to model pixels. Set to `false` to apply the effect to the entire viewport including the background. Material, geometry, and scene effects are inherently model-only, and the gradient outline always paints around the model.

```typescript
viewer.extras.noise.modelOnly = false;    // Apply noise to the full viewport
```

### Defaults and Reset

Every effect exports its default settings as a deep-frozen constant, and every effect instance has a `reset()` method that restores those defaults, keeping the effect's enabled state:

```typescript
import { DISSOLVE_DEFAULTS, EXTRAS_DEFAULTS, getDefaultExtras } from "picocad2-web";

DISSOLVE_DEFAULTS.scale;             // 8
EXTRAS_DEFAULTS.bloom.threshold;     // 0.8
const extras = getDefaultExtras();   // fresh mutable ExtrasState copy

viewer.extras.dissolve.reset();      // restore one effect's defaults
viewer.extras.reset();               // restore every effect
```

### Effect Chain Order

When multiple effects are active, they are applied in this fixed order:

1. Gradient Outline
2. Procedural Background
3. Ambient Occlusion (SSAO)
4. Depth Fog
5. Edge Detection
6. Color Grading
7. Color Tint
8. Posterization
9. Sharpen
10. Bloom
11. Dithering
12. Halftone
13. Video Effects
14. Pixelation
15. Lens Distortion
16. Chromatic Aberration
17. Noise
18. Glitch
19. Vignette

Material effects are applied earlier, inside the model shader, in this fixed order: color cutout, dissolve, projection, emission, interior, gradient light, specular, rim light, glitter, triangle flash, and the dissolve's edge on top. Geometry effects run before any of that: billboard on the CPU right after the scene graph update, then mesh deform, vertex glitch and triangle shatter in the vertex stage. Fur shells draw with the model's depth passes. The floor renders its shadow map and reflection before the scene pass and draws its plate right after the model. Scene effects render into the 3D scene after the model. All of them happen before the outline and any post-processing.

## Custom Effects

You can create custom post-process effects using the `FullscreenEffect` base class or by implementing the `PostProcessEffect` / `SceneEffect` interfaces directly.

### Using FullscreenEffect

For single-pass fullscreen shader effects:

```typescript
import { FullscreenEffect } from "picocad2-web";

const invertEffect = new FullscreenEffect(
  "invert",
  `#version 300 es
  precision highp float;
  in vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform float u_strength;
  out vec4 fragColor;
  void main() {
    vec4 col = texture(u_texture, v_texCoord);
    fragColor = vec4(mix(col.rgb, 1.0 - col.rgb, u_strength), col.a);
  }`,
  (ctx) => ({ u_strength: 1.0 }),
);

// Add to a viewer's pipeline
viewer.pipeline.addPostEffect(invertEffect);
invertEffect.enabled = true;
```

The fragment shader receives `v_texCoord` (0-1 UV coordinates) and must write to `fragColor`. The base class automatically binds the input texture as `u_texture`.

Custom effects can also be color-masked: the scene's palette index buffer is available as `EffectContext.indexTexture` (R = base palette index, 255 = no model pixel; G = shade row). `FullscreenEffect` binds it as `u_indexTexture` automatically, together with a `u_colorMask` bitmask packed from the effect's `maskedColors` array (the packing helper is exported as `packColorMask`).

### Implementing PostProcessEffect

For multi-pass effects or effects that manage their own framebuffers:

```typescript
import type { EffectContext, PostProcessEffect } from "picocad2-web";

class MyEffect implements PostProcessEffect {
  readonly id = "myEffect";
  enabled = false;
  initialized = false;

  init(gl: WebGL2RenderingContext): void {
    // Compile shaders, create resources
    this.initialized = true;
  }

  apply(ctx: EffectContext, inputTexture: WebGLTexture): void {
    // Read from inputTexture, write to currently bound framebuffer
  }

  dispose(): void {
    // Free GPU resources
  }
}
```

### Implementing SceneEffect

For effects that render geometry into the scene (like wireframe):

```typescript
import type { EffectContext, SceneEffect } from "picocad2-web";
import type { ModelResources } from "picocad2-web";
import type { mat4 } from "gl-matrix";

class MySceneEffect implements SceneEffect {
  readonly id = "mySceneEffect";
  enabled = false;
  initialized = false;

  init(gl: WebGL2RenderingContext): void {
    this.initialized = true;
  }

  render(ctx: EffectContext, vpMatrix: mat4, resources: ModelResources): void {
    // Render geometry using the view-projection matrix and model buffers
  }

  dispose(): void { }
}
```

## Render Statistics

```typescript
const stats = context.stats;
console.log(`Draw calls: ${stats.drawCalls}, Polygons: ${stats.polyCount}`);
```

The stats count everything a frame actually draws. `drawCalls` includes the model's draws, fur shells, wireframe lines, particles, the outline, every post-processing pass (bloom runs four passes internally) and the final composite. `polyCount` counts the triangles of scene geometry. The model, fur shells multiply that by the layer count, and particles add their shapes. Fullscreen passes and wireframe lines add draw calls but no polygons.

When sharing a context, `stats` reflects the most recent `draw()` call on any viewer. Custom effects should add the draw calls (and any triangles) they issue to `ctx.stats`.

## Cleanup

```typescript
// Dispose a single viewer (frees pipeline, effects, stops render loop, resize observer)
viewer.dispose();

// Dispose the shared context (frees the WebGL context and renderer)
context.dispose();
```

## Development

### Visual Regression Tests

`test/visual/` renders a catalogue of scenarios (every viewer setting, every effect and mode, both alpha paths, stacked combinations) in headless Chromium and compares each frame byte for byte against a baseline PNG. Proves that a refactor or optimization leaves the output pixel-identical.

```bash
pnpm test:visual                 # compare every scenario against its baseline
pnpm test:visual fur post/bloom  # only scenarios whose name contains a filter
pnpm test:visual:update          # accept the current output as the new baselines
pnpm test:visual --audit         # flag scenarios whose effect changed nothing
```

Frames render on SwiftShader (Chromium's software rasterizer) so baselines reproduce across machines. Any mismatch writes `<name>.actual.png` and a three-panel `<name>.diff.png` (baseline, actual, changed pixels in red) to `test/visual/output/`. Scenarios live in `test/visual/scenarios.ts`; a scenario pins the model, settings, effect options, shader clock and animation pose so the frame is fully deterministic. After adding a scenario, run it with `--update` to create its baseline, and check `--audit` to make sure it actually exercises what it claims.

Playwright's Chromium is required once `pnpm exec playwright install chromium`.

## License

MIT
