/**
 * The mesh deform's progress front. Shared by the vertex warps and the
 * voxel cut in the fragment stage, so both stages of every program that
 * draws the model agree on where the front is.
 */

#include sweep.glsl;

uniform float u_deformProgress; // 0 = untouched, 1 = fully deformed
uniform Sweep u_deformSweep;

/**
 * The local deform progress at a world position. The noise mode hashes
 * world-space cells here, since the base mesh and its voxel stand-in have
 * different mesh-space positions and must agree on the front. Without the
 * deform feature the whole model counts as deformed, which the voxel cut
 * never asks about.
 */
float deformProgress(vec3 worldPos) {
#ifdef FX_DEFORM
    return sweepProgress(u_deformSweep, u_deformProgress, worldPos, worldPos);
#else
    return 1.0;
#endif
}
