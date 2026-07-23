import { createPlanarRGBTransferFunction } from '../src/RenderingEngine/helpers/planarImageRendering';
import { mergePlanarLegacyProperties } from '../src/RenderingEngine/GenericViewport/Planar/planarLegacyCompatibility';

const voiLUT = { firstValueMapped: 100, lut: [0, 128, 255] };

describe('createPlanarRGBTransferFunction with a VOI LUT Sequence LUT', () => {
  it('builds the transfer function from the LUT nodes', () => {
    const cfun = createPlanarRGBTransferFunction({ voiLUT });

    expect(cfun.getSize()).toBe(3);

    const node = [];
    cfun.getNodeValue(0, node);
    expect(node[0]).toBe(100);

    cfun.getNodeValue(2, node);
    expect(node[0]).toBe(102);
    expect(node[1]).toBeCloseTo(1);
  });

  it('prefers the LUT over the window when both are present', () => {
    const cfun = createPlanarRGBTransferFunction({
      voiLUT,
      voiRange: { lower: -5000, upper: 5000 },
    });

    const node = [];
    cfun.getNodeValue(0, node);
    expect(node[0]).toBe(100);
  });

  it('lets a colormap win over the LUT', () => {
    const cfun = createPlanarRGBTransferFunction({
      colormap: { name: 'Grayscale' },
      voiLUT,
      voiRange: { lower: 0, upper: 255 },
    });

    const range = cfun.getMappingRange();
    expect(range[0]).toBe(0);
    expect(range[1]).toBe(255);
  });
});

describe('mergePlanarLegacyProperties VOI LUT semantics', () => {
  it('drops a stored LUT when an explicit window arrives', () => {
    const merged = mergePlanarLegacyProperties(
      { voiLUT },
      { voiRange: { lower: 0, upper: 100 } }
    );

    expect(merged.voiLUT).toBeUndefined();
    expect(merged.voiRange).toEqual({ lower: 0, upper: 100 });
  });

  it('keeps a LUT passed together with a window', () => {
    const merged = mergePlanarLegacyProperties(
      {},
      { voiLUT, voiRange: { lower: 0, upper: 100 } }
    );

    expect(merged.voiLUT).toBe(voiLUT);
  });

  it('carries a stored LUT through unrelated updates', () => {
    const merged = mergePlanarLegacyProperties({ voiLUT }, { invert: true });

    expect(merged.voiLUT).toEqual(voiLUT);
  });
});
