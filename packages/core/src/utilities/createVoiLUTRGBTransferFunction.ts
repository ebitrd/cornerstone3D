import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import type VOILUT from '../types/VOILUT';
import normalizeVoiLut from './normalizeVoiLut';

/**
 * Builds an RGB transfer function from a tabular VOI LUT (one item of the
 * DICOM VOI LUT Sequence (0028,3010)).
 *
 * Each sampled LUT entry becomes a grayscale node at
 * x = firstValueMapped + index. vtk clamps to the first/last node outside the
 * mapped range, which matches the standard's clamping semantics.
 *
 * @param voiLUT - Tabular VOI LUT
 * @param approximationNodes - Maximum number of nodes; larger LUTs are
 * downsampled (humans can perceive no more than ~900 shades of gray,
 * doi: 10.1007/s10278-006-1052-3)
 */
export default function createVoiLUTRGBTransferFunction(
  voiLUT: VOILUT,
  approximationNodes: number = 1024
): vtkColorTransferFunction {
  const { firstValueMapped, outputMax } = normalizeVoiLut(voiLUT);
  const { lut } = voiLUT;

  const step = Math.max(1, Math.ceil(lut.length / approximationNodes));

  const table: number[] = [];
  for (let i = 0; i < lut.length; i += step) {
    const x = firstValueMapped + i;
    const y = lut[i] / outputMax;
    table.push(x, y, y, y, 0.5, 0.0);
  }

  // ensure the exact last entry is present so the upper clamp value is right
  const lastIndex = lut.length - 1;
  if (lastIndex % step !== 0) {
    const y = lut[lastIndex] / outputMax;
    table.push(firstValueMapped + lastIndex, y, y, y, 0.5, 0.0);
  }

  const cfun = vtkColorTransferFunction.newInstance();
  cfun.buildFunctionFromArray(
    vtkDataArray.newInstance({
      values: table,
      numberOfComponents: 6,
    })
  );

  return cfun;
}
