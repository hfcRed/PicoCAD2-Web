/**
 * Per-node effect selection. The renderer ORs one bit per effect that
 * selects the node being drawn into u_nodeBits (see node-selection.ts,
 * the constants must match NODE_BIT there). Effects gate on their bit
 * in addition to their color mask, so "these colors within these nodes".
 */

uniform highp int u_nodeBits;

const int NODE_INTERIOR = 1;
const int NODE_GRADIENT_LIGHT = 2;
const int NODE_SPECULAR = 4;
const int NODE_RIM_LIGHT = 8;
const int NODE_GLITTER = 16;
const int NODE_EMISSION = 32;
const int NODE_DISSOLVE = 64;
const int NODE_CUTOUT = 128;
const int NODE_FUR = 256;
const int NODE_FLASH = 512;
const int NODE_SHATTER = 1024;
const int NODE_DEFORM = 2048;

bool inNodeSet(int bit) {
    return (u_nodeBits & bit) != 0;
}
