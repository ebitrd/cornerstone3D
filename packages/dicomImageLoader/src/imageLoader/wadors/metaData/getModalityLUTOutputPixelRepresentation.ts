import type { WADORSMetaData } from '../../../types';
import getValue from './getValue';
import getNumberValue from './getNumberValue';

function getMinStoredPixelValue(metaData: WADORSMetaData): number {
  const pixelRepresentation = getNumberValue(metaData['00280103']);
  const bitsStored = getNumberValue(metaData['00280101']);

  if (pixelRepresentation === 0) {
    return 0;
  }

  // eslint-disable-next-line no-bitwise
  return -1 << (bitsStored - 1);
}

/**
 * Determines the pixel representation of the modality LUT output (the input
 * of the VOI LUT): 0 = unsigned, 1 = signed. Mirrors the wadouri
 * implementation, operating on DICOM JSON metadata.
 */
function getModalityLUTOutputPixelRepresentation(
  metaData: WADORSMetaData
): number {
  // CT SOP Classes are always signed
  const sopClassUID = getValue<string>(metaData['00080016']);

  if (
    sopClassUID === '1.2.840.10008.5.1.4.1.1.2' ||
    sopClassUID === '1.2.840.10008.5.1.4.1.1.2.1'
  ) {
    return 1;
  }

  // if rescale intercept and rescale slope are present, pass the minimum stored
  // pixel value through them to see if we get a signed output range
  const rescaleIntercept = getNumberValue(metaData['00281052']);
  const rescaleSlope = getNumberValue(metaData['00281053']);

  if (rescaleIntercept !== undefined && rescaleSlope !== undefined) {
    const minStoredPixelValue = getMinStoredPixelValue(metaData);
    const minModalityLutValue =
      minStoredPixelValue * rescaleSlope + rescaleIntercept;

    return minModalityLutValue < 0 ? 1 : 0;
  }

  // Output of a non-linear modality LUT is always unsigned
  const modalityLUTSequence = metaData['00283000'];
  if (
    Array.isArray(modalityLUTSequence?.Value) &&
    modalityLUTSequence.Value.length > 0
  ) {
    return 0;
  }

  // If no modality LUT transform, output is same as pixel representation
  return getNumberValue(metaData['00280103']);
}

export default getModalityLUTOutputPixelRepresentation;
