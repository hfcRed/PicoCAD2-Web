/**
 * The voxel sweep's cut between the base mesh and its voxel stand-in.
 * While the mesh deform's progress is partial, the renderer draws a
 * selected node twice, once from each representation, and each draw keeps
 * only the fragments on its side of the front. The cut goes through the
 * shading checkerboard, so the seam is a dithered band the width of the
 * sweep's softness, and the depth test resolves the overlap. Fragment
 * stage only.
 */

#include deform-sweep.glsl;

uniform int u_voxelSide; // -1 = single draw, 0 = base mesh, 1 = voxel stand-in

/** Discards the fragment when the other representation owns this pixel. */
void applyVoxelCut(vec3 worldPos) {
    if (u_voxelSide < 0) return;
    float local = deformProgress(worldPos);
    float checker = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);
    bool voxel = local > (checker < 0.5 ? 0.25 : 0.75);
    if (voxel != (u_voxelSide == 1)) discard;
}
