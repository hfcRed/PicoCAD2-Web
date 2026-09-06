/**
 * The voxel sweep's cut between the base mesh and its voxel stand-in.
 * While the mesh deform's progress is partial, the renderer draws a
 * selected node twice, once from each representation, and each draw keeps
 * only the fragments on its side of the front. The decision is made per
 * cell of the shared voxel grid, sampled at the cell's center, so whole
 * cubes appear and disappear and the base surface under a cube goes with
 * it. The depth test resolves the overlap.
 *
 * Voxel stand-ins carry every cube face. A face against an occupied
 * neighbor cell (the interior flag) is hidden while both cubes show, and
 * drawn while the neighbor's cell is still the base mesh, so a cube never
 * opens toward a missing neighbor. Fragment stage only. The cut only
 * compiles into program variants that define FX_DEFORM, the others draw
 * every base surface whole.
 */

#include deform-sweep.glsl;

uniform int u_voxelSide; // -1 = single draw, 0 = base mesh, 1 = voxel stand-in
uniform float u_voxelGrid; // voxel edge length in world units

/**
 * Discards the fragment when the other representation owns its cell, or
 * when an interior face's neighbor cube is drawn too. The outward face
 * normal pushes the cell sample into the cube, since cube faces lie
 * exactly on the grid planes, and points at the neighbor cell.
 */
void applyVoxelCut(vec3 worldPos, vec3 outward, bool interior) {
#ifndef FX_DEFORM
    if (interior) discard;
#else
    if (u_voxelSide < 0) {
        if (interior) discard;
        return;
    }
    vec3 inside = worldPos - outward * (u_voxelGrid * 0.25);
    vec3 center = (floor(inside / u_voxelGrid) + 0.5) * u_voxelGrid;
    bool voxel = deformProgress(center) > 0.5;
    if (voxel != (u_voxelSide == 1)) discard;
    if (interior && deformProgress(center + outward * u_voxelGrid) > 0.5) discard;
#endif
}
