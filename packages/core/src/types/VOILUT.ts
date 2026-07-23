/**
 * One item of the DICOM VOI LUT Sequence (0028,3010).
 * https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.11.2.html
 */
interface VOILUT {
  /**
   * First input value mapped by the LUT (second value of LUT Descriptor
   * (0028,3002)), in modality-LUT-output units. Inputs below this map to the
   * first entry, inputs past the end map to the last entry.
   */
  firstValueMapped: number;
  /**
   * Declared bits per stored entry (third value of LUT Descriptor). Known to
   * be wrong in some vendor data; renderers should derive the effective bit
   * depth from the entries instead (see normalizeVoiLut).
   */
  numBitsPerEntry?: number;
  /** LUT Data (0028,3006) entries */
  lut: number[];
  /** Optional identifier, e.g. LUT Explanation (0028,3003) */
  id?: string;
}

export type { VOILUT as default };
