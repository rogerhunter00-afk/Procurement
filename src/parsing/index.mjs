import parseItemsModule from '../../parseItems.js';

export {
  inferTotalExVat,
  getTotalsWarning,
  __internal as inferTotalExVatInternal,
} from './inferTotalExVat.mjs';

export const {
  parseItems,
  normalizeOcrText,
  parseNumber,
} = parseItemsModule;
