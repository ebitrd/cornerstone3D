import normalizeVoiLut from '../src/utilities/normalizeVoiLut';
import createVoiLUTRGBTransferFunction from '../src/utilities/createVoiLUTRGBTransferFunction';

describe('normalizeVoiLut', () => {
  it('derives the effective bit depth from the data, not the declared bits', () => {
    // Agfa-style data: declared 16 bits per entry, actual 8-bit values
    const result = normalizeVoiLut({
      firstValueMapped: 0,
      numBitsPerEntry: 16,
      lut: [0, 128, 255],
    });

    expect(result.effectiveBits).toBe(8);
    expect(result.outputMax).toBe(255);
  });

  it('computes the mapped input range', () => {
    const result = normalizeVoiLut({
      firstValueMapped: -100,
      lut: [0, 1, 2, 3],
    });

    expect(result.firstValueMapped).toBe(-100);
    expect(result.lastValueMapped).toBe(-97);
  });

  it('reports min and max output entries', () => {
    const result = normalizeVoiLut({
      firstValueMapped: 0,
      lut: [40, 10, 1023, 500],
    });

    expect(result.minOutput).toBe(10);
    expect(result.maxOutput).toBe(1023);
    expect(result.effectiveBits).toBe(10);
    expect(result.outputMax).toBe(1023);
  });
});

describe('createVoiLUTRGBTransferFunction', () => {
  it('maps entries to grayscale nodes at firstValueMapped + index', () => {
    const cfun = createVoiLUTRGBTransferFunction({
      firstValueMapped: 10,
      lut: [0, 512, 1023],
    });

    expect(cfun.getSize()).toBe(3);

    const node = [];
    cfun.getNodeValue(0, node);
    expect(node[0]).toBe(10);
    expect(node[1]).toBeCloseTo(0);
    expect(node[2]).toBeCloseTo(0);
    expect(node[3]).toBeCloseTo(0);

    cfun.getNodeValue(1, node);
    expect(node[0]).toBe(11);
    expect(node[1]).toBeCloseTo(512 / 1023);

    cfun.getNodeValue(2, node);
    expect(node[0]).toBe(12);
    expect(node[1]).toBeCloseTo(1);
  });

  it('downsamples large LUTs but keeps the exact last entry', () => {
    const lut = Array.from({ length: 5000 }, (_, i) => i % 256);
    const cfun = createVoiLUTRGBTransferFunction(
      { firstValueMapped: 0, lut },
      1024
    );

    expect(cfun.getSize()).toBeLessThanOrEqual(1026);

    const node = [];
    cfun.getNodeValue(cfun.getSize() - 1, node);
    expect(node[0]).toBe(4999);
  });

  it('clamps outside the mapped input range', () => {
    const cfun = createVoiLUTRGBTransferFunction({
      firstValueMapped: 100,
      lut: [51, 102, 255],
    });

    const below = [];
    cfun.getColor(0, below);
    expect(below[0]).toBeCloseTo(51 / 255);

    const above = [];
    cfun.getColor(1000, above);
    expect(above[0]).toBeCloseTo(1);
  });
});
