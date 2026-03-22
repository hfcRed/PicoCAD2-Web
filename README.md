# picocad2-web

A JavaScript library for viewing [PicoCAD 2](https://picocad.itch.io/) models in the browser using WebGL 2.

## Installation

```bash
npm install picocad2-web
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
  shading: true,                  // Enable lighting (default: true)
  renderMode: "texture",          // "texture" | "color" | "none" (default: "texture")
  projectionMode: "perspective",  // "perspective" | "orthographic" | "fisheye" (default: "perspective")

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

  // Animation
  animationSpeed: 1,              // Animation playback speed multiplier (default: 1)
});
```

## Loading Models

```typescript
// From a string
viewer.load(modelString);

// From a File object
await viewer.loadFromFile(file);
```

Loading a model applies its export settings (camera position, outline, scanlines, etc.) to the viewer.

## Viewer Properties

All properties can be read and modified at any time after construction:

```typescript
// Rendering
viewer.shading = false;
viewer.renderMode = "color";
viewer.projectionMode = "orthographic";

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

// Tags (watermark text in viewport corners)
viewer.leftTag = { text: "picocad2-web", color: [1, 1, 1] };
viewer.rightTag = { text: "v0.2.0" };

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
```

## Camera Controls

```typescript
// Enable mouse/touch orbit controls
viewer.enableCameraControls();
viewer.disableCameraControls();

// Access the camera directly
viewer.camera.theta = Math.PI / 4;
viewer.camera.omega = Math.PI / 6;
viewer.camera.distanceToTarget = 5;
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
```

## Resolution

```typescript
// Update resolution at any time (width, height, scale)
viewer.setResolution(256, 256, 2);
```

## Post-Processing Effects

All effects are available through `viewer.extras`. They are disabled by default and use lazy shader compilation (no GPU cost until first enabled).

```typescript
// Enable an effect
viewer.extras.noise.enabled = true;
viewer.extras.noise.amount = 0.1;

// Disable it
viewer.extras.noise.enabled = false;
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

### CRT

Barrel distortion and scanline effect simulating a CRT monitor.

```typescript
viewer.extras.crt.enabled = true;
viewer.extras.crt.curvature = 0.5;           // Barrel distortion amount (default: 0.5)
viewer.extras.crt.scanlineIntensity = 0.3;   // Scanline opacity (default: 0.3)
```

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

```typescript
viewer.extras.gradientOutline.enabled = true;
viewer.extras.gradientOutline.size = 1;                      // Outline radius (default: 1)
viewer.extras.gradientOutline.colorFrom = [1, 0.5, 0];       // Gradient start color (default: [1, 1, 1])
viewer.extras.gradientOutline.colorTo = [0, 0.5, 1];         // Gradient end color (default: [0, 0, 0])
viewer.extras.gradientOutline.gradient = 1.0;                // Gradient intensity (default: 1.0)
viewer.extras.gradientOutline.gradientDirection = Math.PI;   // Direction angle in radians (default: 0)
```

### Wireframe

Renders wireframe edges over the model. This is a scene effect (renders geometry) rather than a post-process effect.

```typescript
viewer.extras.wireframe.enabled = true;
viewer.extras.wireframe.color = [0, 1, 0];    // Wireframe color (default: [1, 1, 1])
```

### Effect Chain Order

When multiple effects are active, they are applied in this fixed order:

1. Gradient Outline
2. Color Grading
3. Posterization
4. Bloom
5. Dithering
6. CRT
7. Pixelation
8. Lens Distortion
9. Noise
10. Chromatic Aberration

Wireframe is a scene effect and renders into the scene before any post-processing.

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

When sharing a context, `stats` reflects the most recent `draw()` call on any viewer.

## Cleanup

```typescript
// Dispose a single viewer (frees its pipeline and effect resources)
viewer.dispose();

// Dispose the shared context (frees the WebGL context and renderer)
context.dispose();
```

## License

MIT
