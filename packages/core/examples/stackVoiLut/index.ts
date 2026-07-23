import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  metaData,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

const {
  WindowLevelTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const toolGroupId = 'STACK_TOOL_GROUP_ID';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'STACK_VP';

// ======== Set up page ======== //
setTitleAndDescription(
  'Stack VOI LUT Sequence',
  'Applies VOI LUTs (DICOM VOI LUT Sequence, 0028,3010) on a Stack viewport. The DX image carries a native 3-item sequence (NORMAL / HARDER / SOFTER) read from its metadata; a few synthetic LUTs are appended for contrast. Drag with the left mouse button to window-level, which abandons the LUT and falls back to a linear window (per the DICOM standard).'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '512px';
element.style.height = '512px';

content.appendChild(element);

const info = document.createElement('div');
info.id = 'voi-info';
info.style.marginTop = '8px';
content.appendChild(info);

function updateInfo(viewport: Types.IStackViewport) {
  const { voiRange, voiLUT } = viewport.getProperties();
  const range = voiRange
    ? `[${Math.round(voiRange.lower)}, ${Math.round(voiRange.upper)}]`
    : 'n/a';
  info.innerText = voiLUT
    ? `Active: VOI LUT "${voiLUT.id}" (${voiLUT.lut.length} entries, first value mapped ${voiLUT.firstValueMapped}) — voiRange ${range}`
    : `Active: window (linear) — voiRange ${range}`;
}
// ============================= //

/**
 * Builds a few synthetic VOI LUTs over the image's initial VOI input range to
 * contrast with the native sequence items. Entries are 8-bit and step one
 * input unit per entry, as the standard defines.
 */
function buildSyntheticLuts(
  voiRange: Types.VOIRange
): Map<string, Types.VOILUT> {
  const firstValueMapped = Math.round(voiRange.lower);
  const numEntries = Math.min(
    65536,
    Math.max(2, Math.round(voiRange.upper - voiRange.lower) + 1)
  );
  const luts = new Map<string, Types.VOILUT>();
  const ramp = (fn: (t: number) => number) =>
    Array.from({ length: numEntries }, (_, i) =>
      Math.max(0, Math.min(255, Math.round(fn(i / (numEntries - 1)) * 255)))
    );
  const add = (id: string, fn: (t: number) => number) =>
    luts.set(id, { id, firstValueMapped, numBitsPerEntry: 8, lut: ramp(fn) });

  add('Synthetic: inverted ramp', (t) => 1 - t);
  add('Synthetic: gamma 2.5', (t) => Math.pow(t, 2.5));
  add('Synthetic: binary threshold', (t) => (t < 0.5 ? 0 : 1));

  return luts;
}

const luts = new Map<string, Types.VOILUT>();
let initialVoiRange: Types.VOIRange;
let resolveLutOptions: (options: {
  values: string[];
  defaultValue: string;
}) => void;
const lutOptions = new Promise<{ values: string[]; defaultValue: string }>(
  (resolve) => (resolveLutOptions = resolve)
);

function getViewport(): Types.IStackViewport {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  return renderingEngine.getViewport(viewportId) as Types.IStackViewport;
}

addDropdownToToolbar({
  options: lutOptions,
  onSelectedValueChange: (selected) => {
    const viewport = getViewport();
    viewport.setProperties({ voiLUT: luts.get(selected as string) });
    viewport.render();
    updateInfo(viewport);
  },
});

addButtonToToolbar({
  title: 'Clear LUT (back to window)',
  onClick: () => {
    const viewport = getViewport();
    viewport.setProperties({ voiRange: initialVoiRange });
    viewport.render();
    updateInfo(viewport);
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(WindowLevelTool);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });

  // A DX study whose instances carry a native 3-item VOI LUT Sequence
  // (LUT Explanations: NORMAL, HARDER, SOFTER; 16384 entries, 14-bit)
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1.84416332615988066829602832830236187384',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1.12813490248532241348427894598840316826',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  toolGroup.addViewport(viewportId, renderingEngineId);

  const viewportInput = {
    viewportId,
    type: ViewportType.STACK,
    element,
    defaultOptions: {
      background: [0.2, 0, 0.2] as Types.Point3,
    },
  };

  renderingEngine.enableElement(viewportInput);

  const viewport = renderingEngine.getViewport(
    viewportId
  ) as Types.IStackViewport;

  await viewport.setStack([imageIds[0]]);
  viewport.render();

  initialVoiRange = viewport.getProperties().voiRange;

  // Native sequence items from the image metadata
  const voiLutModule = metaData.get(
    Enums.MetadataModules.VOI_LUT,
    viewport.getCurrentImageId()
  );
  for (const item of voiLutModule?.voiLUTSequence ?? []) {
    if (item.lut?.length) {
      luts.set(item.id, item);
    }
  }

  // Synthetic extras for visual contrast
  for (const [id, lut] of buildSyntheticLuts(initialVoiRange)) {
    luts.set(id, lut);
  }

  const values = [...luts.keys()];
  resolveLutOptions({ values, defaultValue: values[0] });

  // Keep the info line in sync with tool-driven VOI changes (e.g. a
  // window-level drag abandoning the LUT)
  element.addEventListener(Enums.Events.VOI_MODIFIED, () =>
    updateInfo(viewport)
  );

  updateInfo(viewport);
}

run();
