import type { LutType } from '../../../types';
import getSequenceItems from './getSequenceItems';

/**
 * A LUT Data (0028,3006) element as it appears in DICOM JSON: decoded numbers,
 * inline base64, a bulkdata reference, or a dicomweb-client retrieve function.
 */
interface LutDataElement {
  vr?: string;
  Value?: number[];
  InlineBinary?: string;
  BulkDataURI?: string;
  retrieveBulkData?: () => Promise<ArrayBuffer | Uint8Array>;
}

type LutSequenceItem = Record<string, LutDataElement>;

/**
 * A parsed VOI/Modality LUT Sequence item. `lut` is undefined when the LUT
 * Data is only available as bulkdata; call `retrieveBulkData` to fetch and
 * decode it.
 */
export type WadoRsLutType = Omit<LutType, 'lut'> & {
  lut?: number[];
  retrieveBulkData?: () => Promise<number[]>;
};

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function toSigned16(value: number): number {
  return value > 32767 ? value - 65536 : value;
}

/**
 * Decodes raw LUT Data bytes into entry values. Data is 16-bit little-endian
 * words (the DICOM JSON encoding) unless the byte count matches the entry
 * count exactly, which indicates 8-bit packed entries.
 */
function decodeLutBytes(
  bytes: Uint8Array,
  numLUTEntries: number,
  pixelRepresentation: number
): number[] {
  if (bytes.byteLength === numLUTEntries) {
    return Array.from(bytes);
  }

  const words = new Uint16Array(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength >> 1
  );
  const length = Math.min(numLUTEntries, words.length);
  const lut = new Array(length);

  for (let i = 0; i < length; i++) {
    lut[i] = pixelRepresentation === 1 ? toSigned16(words[i]) : words[i];
  }

  return lut;
}

function toUint8(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/**
 * Builds a deferred resolver for LUT Data referenced as bulkdata, from either
 * a dicomweb-client retrieveBulkData function or an absolute BulkDataURI.
 */
function makeRetrieveLutData(
  element: LutDataElement,
  numLUTEntries: number,
  pixelRepresentation: number
): (() => Promise<number[]>) | undefined {
  if (typeof element.retrieveBulkData === 'function') {
    return async () => {
      const bulkdata = await element.retrieveBulkData();
      return decodeLutBytes(
        toUint8(bulkdata),
        numLUTEntries,
        pixelRepresentation
      );
    };
  }

  // Only absolute URIs can be resolved here; relative bulkdata references
  // need the study context that dicomweb-client's retrieveBulkData carries
  if (element.BulkDataURI && element.BulkDataURI.indexOf(':') !== -1) {
    const uri = element.BulkDataURI;
    return async () => {
      const response = await fetch(uri);
      const buffer = await response.arrayBuffer();
      return decodeLutBytes(
        new Uint8Array(buffer),
        numLUTEntries,
        pixelRepresentation
      );
    };
  }

  return undefined;
}

function getLUT(
  pixelRepresentation: number,
  item: LutSequenceItem
): WadoRsLutType | undefined {
  const descriptor = item['00283002']?.Value;

  if (!Array.isArray(descriptor) || descriptor.length < 3) {
    return;
  }

  // Per the LUT Descriptor definition, a first value of 0 means 2^16 entries
  let numLUTEntries = Number(descriptor[0]);
  if (numLUTEntries === 0) {
    numLUTEntries = 65536;
  }

  // The descriptor VR is US or SS; servers encoding with US represent a
  // signed first-value-mapped as its uint16 bit pattern
  let firstValueMapped = Number(descriptor[1]);
  if (pixelRepresentation === 1 && firstValueMapped > 32767) {
    firstValueMapped = toSigned16(firstValueMapped);
  }

  const numBitsPerEntry = Number(descriptor[2]);

  const lutDataElement = item['00283006'];
  if (!lutDataElement) {
    return;
  }

  const lut: WadoRsLutType = {
    id: '1',
    firstValueMapped,
    numBitsPerEntry,
    lut: undefined,
  };

  if (Array.isArray(lutDataElement.Value) && lutDataElement.Value.length > 0) {
    lut.lut = lutDataElement.Value.slice(0, numLUTEntries).map(Number);
    return lut;
  }

  if (lutDataElement.InlineBinary) {
    lut.lut = decodeLutBytes(
      base64ToUint8Array(lutDataElement.InlineBinary),
      numLUTEntries,
      pixelRepresentation
    );
    return lut;
  }

  lut.retrieveBulkData = makeRetrieveLutData(
    lutDataElement,
    numLUTEntries,
    pixelRepresentation
  );

  return lut.retrieveBulkData ? lut : undefined;
}

/**
 * Parses a LUT Sequence (e.g. VOI LUT Sequence (0028,3010)) from DICOM JSON
 * metadata.
 *
 * @param pixelRepresentation - Pixel representation of the LUT input values
 * (0 unsigned, 1 signed), i.e. of the modality LUT output
 * @param sequenceElement - The sequence element from the DICOM JSON metadata
 * @returns Parsed LUT items, or undefined when the sequence is absent/empty
 */
function getLUTs(
  pixelRepresentation: number,
  sequenceElement: unknown
): WadoRsLutType[] | undefined {
  const items = getSequenceItems(sequenceElement);

  if (!items.length) {
    return;
  }

  const luts = items
    .map((item) =>
      getLUT(pixelRepresentation, item as unknown as LutSequenceItem)
    )
    .filter(Boolean);

  return luts.length ? luts : undefined;
}

export default getLUTs;
