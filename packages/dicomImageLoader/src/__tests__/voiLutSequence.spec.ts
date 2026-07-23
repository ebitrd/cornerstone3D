import getLUTs from '../imageLoader/wadors/metaData/getLUTs';
import getModalityLUTOutputPixelRepresentation from '../imageLoader/wadors/metaData/getModalityLUTOutputPixelRepresentation';
import wadouriGetLUTs from '../imageLoader/wadouri/metaData/getLUTs';
import type { WADORSMetaData } from '../types';

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function uint16LE(values: number[]): Uint8Array {
  return new Uint8Array(new Uint16Array(values).buffer);
}

function makeSequence(items: unknown[]) {
  return { vr: 'SQ', Value: items };
}

describe('wadors getLUTs (VOI LUT Sequence)', () => {
  it('returns undefined for a missing or empty sequence', () => {
    expect(getLUTs(0, undefined)).toBeUndefined();
    expect(getLUTs(0, makeSequence([]))).toBeUndefined();
  });

  it('parses LUT data provided as a numeric Value array', () => {
    const sequence = makeSequence([
      {
        '00283002': { Value: [3, 100, 16] },
        '00283003': { Value: ['NORMAL'] },
        '00283006': { Value: [0, 512, 1023] },
      },
    ]);

    const [lut] = getLUTs(0, sequence);

    expect(lut.id).toBe('NORMAL');
    expect(lut.firstValueMapped).toBe(100);
    expect(lut.numBitsPerEntry).toBe(16);
    expect(lut.lut).toEqual([0, 512, 1023]);
  });

  it('falls back to the 1-based item number when LUT Explanation is absent', () => {
    const sequence = makeSequence([
      { '00283002': { Value: [1, 0, 8] }, '00283006': { Value: [0] } },
      { '00283002': { Value: [1, 0, 8] }, '00283006': { Value: [1] } },
    ]);

    const [first, second] = getLUTs(0, sequence);

    expect(first.id).toBe('1');
    expect(second.id).toBe('2');
  });

  it('decodes 16-bit little-endian InlineBinary LUT data', () => {
    const sequence = makeSequence([
      {
        '00283002': { Value: [3, 0, 16] },
        '00283006': { InlineBinary: toBase64(uint16LE([1, 2, 65535])) },
      },
    ]);

    const [lut] = getLUTs(0, sequence);

    expect(lut.lut).toEqual([1, 2, 65535]);
  });

  it('treats byte count matching entry count as 8-bit packed data', () => {
    const sequence = makeSequence([
      {
        '00283002': { Value: [3, 0, 8] },
        '00283006': { InlineBinary: toBase64(new Uint8Array([10, 20, 30])) },
      },
    ]);

    const [lut] = getLUTs(0, sequence);

    expect(lut.lut).toEqual([10, 20, 30]);
  });

  it('reinterprets the first value mapped as signed for signed input', () => {
    const sequence = makeSequence([
      {
        // 65520 is the uint16 bit pattern of -16
        '00283002': { Value: [2, 65520, 16] },
        '00283006': { Value: [0, 255] },
      },
    ]);

    expect(getLUTs(1, sequence)[0].firstValueMapped).toBe(-16);
    expect(getLUTs(0, sequence)[0].firstValueMapped).toBe(65520);
  });

  it('decodes binary entries as signed for signed input', () => {
    const sequence = makeSequence([
      {
        '00283002': { Value: [1, 0, 16] },
        '00283006': { InlineBinary: toBase64(uint16LE([65535])) },
      },
    ]);

    expect(getLUTs(1, sequence)[0].lut).toEqual([-1]);
  });

  it('treats a descriptor entry count of 0 as 65536 and tolerates short data', () => {
    const sequence = makeSequence([
      {
        '00283002': { Value: [0, 0, 16] },
        '00283006': { InlineBinary: toBase64(uint16LE([5, 6, 7, 8])) },
      },
    ]);

    // only the available words are decoded
    expect(getLUTs(0, sequence)[0].lut).toEqual([5, 6, 7, 8]);
  });

  it('defers absolute BulkDataURI LUT data to retrieveBulkData', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      arrayBuffer: async () => uint16LE([7, 8]).buffer,
    });
    global.fetch = fetchMock;

    const sequence = makeSequence([
      {
        '00283002': { Value: [2, 0, 16] },
        '00283006': { BulkDataURI: 'http://server/bulk/lut' },
      },
    ]);

    const [lut] = getLUTs(0, sequence);

    expect(lut.lut).toBeUndefined();
    await expect(lut.retrieveBulkData()).resolves.toEqual([7, 8]);
    expect(fetchMock).toHaveBeenCalledWith('http://server/bulk/lut');
  });

  it('uses a dicomweb-client retrieveBulkData function when present', async () => {
    const sequence = makeSequence([
      {
        '00283002': { Value: [1, 0, 16] },
        '00283006': {
          retrieveBulkData: async () => uint16LE([9]).buffer,
        },
      },
    ]);

    const [lut] = getLUTs(0, sequence);

    await expect(lut.retrieveBulkData()).resolves.toEqual([9]);
  });

  it('skips items without a usable data source', () => {
    const sequence = makeSequence([
      {
        '00283002': { Value: [2, 0, 16] },
        // relative bulkdata URI cannot be resolved without study context
        '00283006': { BulkDataURI: 'series/1/bulk' },
      },
    ]);

    expect(getLUTs(0, sequence)).toBeUndefined();
  });

  it('skips items with a malformed descriptor', () => {
    const sequence = makeSequence([
      { '00283002': { Value: [2] }, '00283006': { Value: [0, 1] } },
    ]);

    expect(getLUTs(0, sequence)).toBeUndefined();
  });
});

describe('wadors getModalityLUTOutputPixelRepresentation', () => {
  it('returns signed for CT SOP classes', () => {
    const metaData = {
      '00080016': { Value: ['1.2.840.10008.5.1.4.1.1.2'] },
    } as unknown as WADORSMetaData;

    expect(getModalityLUTOutputPixelRepresentation(metaData)).toBe(1);
  });

  it('returns signed when the rescale output range goes negative', () => {
    const metaData = {
      '00080016': { Value: ['1.2.840.10008.5.1.4.1.1.1'] },
      '00280103': { Value: [1] },
      '00280101': { Value: [12] },
      '00281052': { Value: [-1024] },
      '00281053': { Value: [1] },
    } as unknown as WADORSMetaData;

    expect(getModalityLUTOutputPixelRepresentation(metaData)).toBe(1);
  });

  it('returns unsigned when the rescale output range stays non-negative', () => {
    const metaData = {
      '00080016': { Value: ['1.2.840.10008.5.1.4.1.1.1'] },
      '00280103': { Value: [0] },
      '00280101': { Value: [12] },
      '00281052': { Value: [0] },
      '00281053': { Value: [1] },
    } as unknown as WADORSMetaData;

    expect(getModalityLUTOutputPixelRepresentation(metaData)).toBe(0);
  });

  it('falls back to the pixel representation without a modality transform', () => {
    const metaData = {
      '00280103': { Value: [1] },
    } as unknown as WADORSMetaData;

    expect(getModalityLUTOutputPixelRepresentation(metaData)).toBe(1);
  });
});

describe('wadouri getLUTs descriptor entry count', () => {
  function makeLutSequence(descriptor: number[], data: number[]) {
    const dataSet = {
      uint16: (tag: string, index: number) =>
        tag === 'x00283002' ? descriptor[index] : data[index] & 0xffff,
      int16: (tag: string, index: number) => {
        const value =
          tag === 'x00283002' ? descriptor[index] : data[index] & 0xffff;
        return value > 32767 ? value - 65536 : value;
      },
    };

    return { items: [{ dataSet }] };
  }

  it('treats a descriptor entry count of 0 as 65536 entries', () => {
    const data = new Array(65536).fill(0).map((_, i) => i & 0xffff);
    const lutSequence = makeLutSequence([0, 0, 16], data);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [lut] = wadouriGetLUTs(0, lutSequence as any);

    expect(lut.lut.length).toBe(65536);
    expect(lut.lut[65535]).toBe(65535);
  });
});
