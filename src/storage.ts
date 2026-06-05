import type { AppData, Cage, Order, ScanEvent } from './types';

export const STORAGE_KEY = 'laundry-cage-tracker-data-v1';

const today = new Date().toISOString().slice(0, 10);

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
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: 'Seeded',
      operatorName: 'System',
      notes: 'Sample cages and orders created for MVP demo.',
    },
  ],
});

export const loadData = (): AppData => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return createSeedData();
  try {
    const parsed = JSON.parse(raw) as AppData;
    if (!Array.isArray(parsed.cages) || !Array.isArray(parsed.orders) || !Array.isArray(parsed.events)) {
      return createSeedData();
    }
    return parsed;
  } catch {
    return createSeedData();
  }
};

export const saveData = (data: AppData) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const exportFilename = () => `laundry-cage-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;

export const isAppData = (value: unknown): value is AppData => {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<AppData>;
  return Array.isArray(data.cages) && Array.isArray(data.orders) && Array.isArray(data.events);
};

export const newEvent = (event: Omit<ScanEvent, 'eventId' | 'timestamp'>): ScanEvent => ({
  eventId: crypto.randomUUID(),
  timestamp: new Date().toISOString(),
  ...event,
});
