# Changelog

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
