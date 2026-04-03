# Changelog

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
