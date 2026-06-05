import type { AppData, Cage, Order, ScanEvent } from './types';

export const STORAGE_KEY = 'laundry-cage-tracker-data-v1';

const today = new Date().toISOString().slice(0, 10);

const createEventId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const safeGetItem = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const safeSetItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Keep the proof-of-concept usable even if browser storage is disabled.
  }
};

export const seedCages: Cage[] = ['001', '002', '003', '004', '005'].map((id) => ({
  cageId: `CAGE-EK-${id}`,
  site: 'Main Laundry',
  status: 'Available',
  currentLocation: 'Returned Area',
}));

export const seedOrders: Order[] = [
  { orderId: 'ORDER-1001', customerName: 'ABC Hotel', route: 'EK Van 1', deliveryDate: today, expectedCages: 2, status: 'Created' },
  { orderId: 'ORDER-1002', customerName: 'Green Care Home', route: 'EK Van 1', deliveryDate: today, expectedCages: 1, status: 'Created' },
  { orderId: 'ORDER-1003', customerName: 'City Gym', route: 'EK Van 2', deliveryDate: today, expectedCages: 2, status: 'Created' },
];

export const createSeedData = (): AppData => ({
  cages: seedCages,
  orders: seedOrders,
  events: [
    {
      eventId: createEventId(),
      timestamp: new Date().toISOString(),
      action: 'Seeded',
      operatorName: 'System',
      notes: 'Sample cages and orders created for MVP demo.',
    },
  ],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isValidCage = (value: unknown): value is Cage =>
  isRecord(value) &&
  typeof value.cageId === 'string' &&
  typeof value.site === 'string' &&
  typeof value.status === 'string' &&
  typeof value.currentLocation === 'string';

const isValidOrder = (value: unknown): value is Order =>
  isRecord(value) &&
  typeof value.orderId === 'string' &&
  typeof value.customerName === 'string' &&
  typeof value.route === 'string' &&
  typeof value.deliveryDate === 'string' &&
  typeof value.expectedCages === 'number' &&
  typeof value.status === 'string';

const isValidEvent = (value: unknown): value is ScanEvent =>
  isRecord(value) &&
  typeof value.eventId === 'string' &&
  typeof value.timestamp === 'string' &&
  typeof value.action === 'string' &&
  typeof value.operatorName === 'string';

const parseStoredData = (raw: string): AppData | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<AppData>;
    if (!Array.isArray(parsed.cages) || !Array.isArray(parsed.orders) || !Array.isArray(parsed.events)) {
      return null;
    }

    if (!parsed.cages.every(isValidCage) || !parsed.orders.every(isValidOrder) || !parsed.events.every(isValidEvent)) {
      return null;
    }

    return parsed as AppData;
  } catch {
    return null;
  }
};

export const loadData = (): AppData => {
  const raw = safeGetItem(STORAGE_KEY);
  if (!raw) return createSeedData();

  return parseStoredData(raw) ?? createSeedData();
};

export const saveData = (data: AppData) => {
  safeSetItem(STORAGE_KEY, JSON.stringify(data));
};

export const exportFilename = () => `laundry-cage-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;

export const isAppData = (value: unknown): value is AppData => {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<AppData>;
  return Array.isArray(data.cages) && Array.isArray(data.orders) && Array.isArray(data.events);
};

export const newEvent = (event: Omit<ScanEvent, 'eventId' | 'timestamp'>): ScanEvent => ({
  eventId: createEventId(),
  timestamp: new Date().toISOString(),
  ...event,
});
