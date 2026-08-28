/**
 * Shell-textured fur grown from the model's surfaces. The renderer draws
 * the model again as a stack of instanced shells offset along smoothed
 * (position-averaged) normals. A hash-noise cutout in the fragment
 * stage carves the shells into strand cross-sections.
 *
 * Unlike the other geometry effects, the mask is per texel. The strand
 * cutout samples the index texture, so fur only grows where the surface
 * is painted with the masked colors. Fur follows the mesh deform and
 * hides while a triangle shatter is in progress.
 */
export class FurEffect {
	enabled = false;
	length = 0.1;
	layers = 8;
	density = 40;
	gravity: [number, number, number] = [0, 0, 0];
	rootShade = 1;
	maskedColors: number[] = [];
}
