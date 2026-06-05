export type CageStatus =
  | 'Available'
  | 'Assigned'
  | 'Packed'
  | 'Ready for Dispatch'
  | 'Loaded on Van'
  | 'Delivered'
  | 'Returned Empty'
  | 'Issue / Quarantine';

export type OrderStatus =
  | 'Created'
  | 'In Packing'
  | 'Packed'
  | 'Part Loaded'
  | 'Loaded Complete'
  | 'Delivered'
  | 'Issue';

export type LocationName =
  | 'Packing Area'
  | 'Holding Area'
  | 'Dispatch Lane 1'
  | 'Dispatch Lane 2'
  | 'Dispatch Lane 3'
  | 'Van'
  | 'Customer Site'
  | 'Returned Area'
  | 'Quarantine / Issue Area';

export type ScanAction =
  | 'Seeded'
  | 'Assign Cage'
  | 'Pack Cage'
  | 'Move Cage'
  | 'Load Van'
  | 'Complete Dispatch'
  | 'Supervisor Override'
  | 'Deliver Cage'
  | 'Return Empty Cage'
  | 'Issue';

export interface Cage {
  cageId: string;
  site: string;
  status: CageStatus;
  currentLocation: LocationName;
  linkedOrderId?: string;
  lastScannedAt?: string;
  lastScannedBy?: string;
}

export interface Order {
  orderId: string;
  customerName: string;
  route: string;
  deliveryDate: string;
  expectedCages: number;
  status: OrderStatus;
}

export interface ScanEvent {
  eventId: string;
  timestamp: string;
  action: ScanAction;
  cageId?: string;
  orderId?: string;
  operatorName: string;
  location?: LocationName;
  route?: string;
  notes?: string;
}

export interface AppData {
  cages: Cage[];
  orders: Order[];
  events: ScanEvent[];
}

export const CAGE_STATUSES: CageStatus[] = [
  'Available',
  'Assigned',
  'Packed',
  'Ready for Dispatch',
  'Loaded on Van',
  'Delivered',
  'Returned Empty',
  'Issue / Quarantine',
];

export const ORDER_STATUSES: OrderStatus[] = [
  'Created',
  'In Packing',
  'Packed',
  'Part Loaded',
  'Loaded Complete',
  'Delivered',
  'Issue',
];

export const LOCATIONS: LocationName[] = [
  'Packing Area',
  'Holding Area',
  'Dispatch Lane 1',
  'Dispatch Lane 2',
  'Dispatch Lane 3',
  'Van',
  'Customer Site',
  'Returned Area',
  'Quarantine / Issue Area',
];
