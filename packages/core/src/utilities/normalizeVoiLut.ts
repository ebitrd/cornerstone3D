import type VOILUT from '../types/VOILUT';

export interface NormalizedVoiLut {
  /** First input value mapped by the LUT */
  firstValueMapped: number;
  /** Last input value mapped (firstValueMapped + entries - 1) */
  lastValueMapped: number;
  /** Smallest entry value found in the LUT data */
  minOutput: number;
  /** Largest entry value found in the LUT data */
  maxOutput: number;
  /** Effective bits per entry, derived from the data */
  effectiveBits: number;
  /** Full-scale output denominator: 2^effectiveBits - 1 */
  outputMax: number;
}

/**
 * Derives reliable display parameters from a VOI LUT (a VOI LUT Sequence item).
 *
 * The declared numBitsPerEntry of the LUT Descriptor is wrong in some vendor
 * data (entries stored at a smaller effective depth than declared), so the
 * effective bit depth is re-derived from the largest entry value, matching the
 * long-standing behavior of the CPU rendering path.
 *
 * @param voiLUT - VOI LUT (one VOI LUT Sequence item)
 * @returns Normalized parameters for building display lookup tables
 */
export default function normalizeVoiLut(voiLUT: VOILUT): NormalizedVoiLut {
  const { lut, firstValueMapped } = voiLUT;

  let minOutput = Infinity;
  let maxOutput = -Infinity;

  for (let i = 0; i < lut.length; i++) {
    const entry = lut[i];
    if (entry < minOutput) {
      minOutput = entry;
    }
    if (entry > maxOutput) {
      maxOutput = entry;
    }
  }

  const effectiveBits = Math.max(1, maxOutput).toString(2).length;
  const outputMax = 2 ** effectiveBits - 1;

  return {
    firstValueMapped,
    lastValueMapped: firstValueMapped + lut.length - 1,
    minOutput,
    maxOutput,
    effectiveBits,
    outputMax,
  };
}
