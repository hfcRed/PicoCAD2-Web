# Changelog

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
