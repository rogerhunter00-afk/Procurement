import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { ScannerInput } from './ScannerInput';
import { createSeedData, exportFilename, isAppData, loadData, newEvent, safeGetItem, safeSetItem, saveData } from './storage';
import type { AppData, Cage, LocationName, Order, OrderStatus, ScanEvent } from './types';
import { LOCATIONS } from './types';

type Screen =
  | 'Dashboard'
  | 'Assign Cage to Order'
  | 'Pack Cage'
  | 'Move Cage'
  | 'Load Van / Dispatch Check'
  | 'Deliver Cage'
  | 'Return Empty Cage'
  | 'Search / Missing Cage Investigation'
  | 'Import / Export Data';

type Banner = { type: 'success' | 'stop' | 'info'; message: string } | null;
type CommitFn = (updater: (draft: AppData) => AppData, nextBanner?: Banner) => void;

const screens: Screen[] = [
  'Dashboard',
  'Assign Cage to Order',
  'Pack Cage',
  'Move Cage',
  'Load Van / Dispatch Check',
  'Deliver Cage',
  'Return Empty Cage',
  'Search / Missing Cage Investigation',
  'Import / Export Data',
];

const supervisorReasons = ['Short order approved', 'Cage held back', 'Rewash required', 'Customer cancelled item', 'Other'];
const OPERATOR_STORAGE_KEY = 'laundry-cage-tracker-operator';
const operatorDefault = safeGetItem(OPERATOR_STORAGE_KEY) || 'Operator';

const normaliseId = (id: string) => id.trim().toUpperCase();

function loadedCagesForOrder(cages: Cage[], orderId: string) {
  return cages.filter((cage) => cage.linkedOrderId === orderId && ['Loaded on Van', 'Delivered'].includes(cage.status)).length;
}

function cagesForOrder(cages: Cage[], orderId: string) {
  return cages.filter((cage) => cage.linkedOrderId === orderId);
}

function calculateOrderStatus(order: Order, cages: Cage[]): OrderStatus {
  const linked = cagesForOrder(cages, order.orderId);
  const loaded = loadedCagesForOrder(cages, order.orderId);
  const delivered = linked.filter((cage) => cage.status === 'Delivered').length;
  if (linked.some((cage) => cage.status === 'Issue / Quarantine')) return 'Issue';
  if (delivered >= order.expectedCages) return 'Delivered';
  if (loaded >= order.expectedCages) return 'Loaded Complete';
  if (loaded > 0) return 'Part Loaded';
  if (linked.length >= order.expectedCages && linked.every((cage) => cage.status === 'Packed' || cage.status === 'Ready for Dispatch')) return 'Packed';
  if (linked.length > 0) return 'In Packing';
  return order.status === 'Issue' ? 'Issue' : 'Created';
}

function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [screen, setScreen] = useState<Screen>('Dashboard');
  const [operatorName, setOperatorName] = useState(operatorDefault);
  const [banner, setBanner] = useState<Banner>(null);

  const routes = useMemo(() => Array.from(new Set(data.orders.map((order) => order.route))).sort(), [data.orders]);

  function commit(updater: (draft: AppData) => AppData, nextBanner?: Banner) {
    setData((current) => {
      const next = updater(current);
      const recalculated = {
        ...next,
        orders: next.orders.map((order) => ({ ...order, status: calculateOrderStatus(order, next.cages) })),
      };
      saveData(recalculated);
      return recalculated;
    });
    safeSetItem(OPERATOR_STORAGE_KEY, operatorName);
    if (nextBanner) setBanner(nextBanner);
  }

  function appendEvent(current: AppData, event: Omit<ScanEvent, 'eventId' | 'timestamp' | 'operatorName'> & { operatorName?: string }) {
    return [...current.events, newEvent({ operatorName, ...event })];
  }

  function updateCageScan(cage: Cage): Cage {
    return { ...cage, lastScannedAt: new Date().toISOString(), lastScannedBy: operatorName };
  }

  return (
    <main>
      <header className="app-header">
        <div>
          <p className="eyebrow">Mobile laundry WMS MVP</p>
          <h1>Cage Dispatch Tracker</h1>
        </div>
        <label className="operator-label">
          Operator
          <input value={operatorName} onChange={(event) => setOperatorName(event.target.value)} />
        </label>
      </header>

      <nav className="tabs" aria-label="Core screens">
        {screens.map((item) => (
          <button key={item} className={screen === item ? 'active' : ''} onClick={() => { setScreen(item); setBanner(null); }}>
            {item}
          </button>
        ))}
      </nav>

      {banner ? <div className={`banner ${banner.type}`}>{banner.type === 'stop' ? 'STOP: ' : ''}{banner.message}</div> : null}

      {screen === 'Dashboard' && <Dashboard data={data} routes={routes} />}
      {screen === 'Assign Cage to Order' && <AssignScreen data={data} commit={commit} />}
      {screen === 'Pack Cage' && <PackScreen data={data} commit={commit} />}
      {screen === 'Move Cage' && <MoveScreen data={data} commit={commit} />}
      {screen === 'Load Van / Dispatch Check' && <DispatchScreen data={data} routes={routes} commit={commit} />}
      {screen === 'Deliver Cage' && <SimpleCageAction data={data} title="Deliver Cage" actionLabel="Mark Delivered" targetStatus="Delivered" targetLocation="Customer Site" eventAction="Deliver Cage" commit={commit} validate={(cage) => cage.status === 'Loaded on Van' ? null : 'Cage must be loaded on a van before delivery.'} />}
      {screen === 'Return Empty Cage' && <SimpleCageAction data={data} title="Return Empty Cage" actionLabel="Return Empty" targetStatus="Returned Empty" targetLocation="Returned Area" eventAction="Return Empty Cage" commit={commit} validate={(cage) => cage.status === 'Delivered' ? null : 'Cage must be delivered before it can be returned empty.'} clearOrder />}
      {screen === 'Search / Missing Cage Investigation' && <SearchScreen data={data} />}
      {screen === 'Import / Export Data' && <ImportExportScreen data={data} setData={(next, message) => { saveData(next); setData(next); setBanner(message); }} />}
    </main>
  );

  function AssignScreen({ data, commit }: { data: AppData; commit: CommitFn }) {
    const [cageId, setCageId] = useState('');
    const [orderId, setOrderId] = useState('');
    const cage = data.cages.find((item) => item.cageId === normaliseId(cageId));
    const order = data.orders.find((item) => item.orderId === normaliseId(orderId));
    return (
      <section className="card">
        <h2>Assign Cage to Order</h2>
        <ScannerInput label="Cage QR" placeholder="CAGE-EK-001" value={cageId} onChange={setCageId} scanRegionId="assign-cage-scan" />
        <ScannerInput label="Order sheet QR" placeholder="ORDER-1001" value={orderId} onChange={setOrderId} scanRegionId="assign-order-scan" />
        <button className="primary" onClick={() => {
          if (!cage) return setBanner({ type: 'stop', message: 'Cage does not exist.' });
          if (!order) return setBanner({ type: 'stop', message: 'Order does not exist.' });
          commit((current) => ({
            ...current,
            cages: current.cages.map((item) => item.cageId === cage.cageId ? updateCageScan({ ...item, linkedOrderId: order.orderId, status: 'Assigned', currentLocation: 'Packing Area' }) : item),
            events: appendEvent(current, { action: 'Assign Cage', cageId: cage.cageId, orderId: order.orderId, location: 'Packing Area', route: order.route, notes: `Linked ${cage.cageId} to ${order.orderId}.` }),
          }), { type: 'success', message: `${cage.cageId} assigned to ${order.orderId}.` });
        }}>Assign Cage</button>
      </section>
    );
  }

  function PackScreen({ data, commit }: { data: AppData; commit: CommitFn }) {
    const [cageId, setCageId] = useState('');
    const cage = data.cages.find((item) => item.cageId === normaliseId(cageId));
    return <section className="card"><h2>Pack Cage</h2><ScannerInput label="Cage QR" placeholder="CAGE-EK-001" value={cageId} onChange={setCageId} scanRegionId="pack-cage-scan" /><button className="primary" onClick={() => {
      if (!cage) return setBanner({ type: 'stop', message: 'Cage does not exist.' });
      if (!cage.linkedOrderId) return setBanner({ type: 'stop', message: 'This cage is not linked to any order.' });
      const order = data.orders.find((item) => item.orderId === cage.linkedOrderId);
      commit((current) => ({ ...current, cages: current.cages.map((item) => item.cageId === cage.cageId ? updateCageScan({ ...item, status: 'Packed', currentLocation: 'Holding Area' }) : item), events: appendEvent(current, { action: 'Pack Cage', cageId: cage.cageId, orderId: cage.linkedOrderId, location: 'Holding Area', route: order?.route, notes: 'Cage packed and moved to holding.' }) }), { type: 'success', message: `${cage.cageId} packed.` });
    }}>Mark Packed</button></section>;
  }

  function MoveScreen({ data, commit }: { data: AppData; commit: CommitFn }) {
    const [cageId, setCageId] = useState('');
    const [location, setLocation] = useState<LocationName>('Dispatch Lane 1');
    const cage = data.cages.find((item) => item.cageId === normaliseId(cageId));
    return <section className="card"><h2>Move Cage</h2><ScannerInput label="Cage QR" placeholder="CAGE-EK-001" value={cageId} onChange={setCageId} scanRegionId="move-cage-scan" /><label>Destination<select value={location} onChange={(event) => setLocation(event.target.value as LocationName)}>{LOCATIONS.map((item) => <option key={item}>{item}</option>)}</select></label><button className="primary" onClick={() => {
      if (!cage) return setBanner({ type: 'stop', message: 'Cage does not exist.' });
      const status = location.startsWith('Dispatch Lane') && ['Packed', 'Assigned'].includes(cage.status) ? 'Ready for Dispatch' : cage.status;
      const order = data.orders.find((item) => item.orderId === cage.linkedOrderId);
      commit((current) => ({ ...current, cages: current.cages.map((item) => item.cageId === cage.cageId ? updateCageScan({ ...item, status, currentLocation: location }) : item), events: appendEvent(current, { action: 'Move Cage', cageId: cage.cageId, orderId: cage.linkedOrderId, location, route: order?.route, notes: `Moved to ${location}.` }) }), { type: 'success', message: `${cage.cageId} moved to ${location}.` });
    }}>Move Cage</button></section>;
  }

  function DispatchScreen({ data, routes, commit }: { data: AppData; routes: string[]; commit: CommitFn }) {
    const [route, setRoute] = useState(routes[0] || 'EK Van 1');
    const [cageId, setCageId] = useState('');
    const [overrideReason, setOverrideReason] = useState(supervisorReasons[0]);
    const [otherReason, setOtherReason] = useState('');
    const routeOrders = data.orders.filter((order) => order.route === route);
    const missing = routeOrders.reduce((total, order) => total + Math.max(order.expectedCages - loadedCagesForOrder(data.cages, order.orderId), 0), 0);
    return <section className="card"><h2>Load Van / Dispatch Check</h2><label>Route<select value={route} onChange={(event) => setRoute(event.target.value)}>{routes.map((item) => <option key={item}>{item}</option>)}</select></label><ScannerInput label="Cage QR" placeholder="CAGE-EK-001" value={cageId} onChange={setCageId} scanRegionId="dispatch-cage-scan" /><button className="primary" onClick={() => loadCage(route, cageId)}>Load Cage</button><RouteSummary orders={routeOrders} cages={data.cages} /><div className="override"><h3>Complete Dispatch</h3>{missing > 0 ? <p className="stop-text">{missing} cage(s) missing. Supervisor override is required.</p> : <p className="success-text">All expected cages are loaded.</p>}<label>Override reason<select value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)}>{supervisorReasons.map((item) => <option key={item}>{item}</option>)}</select></label>{overrideReason === 'Other' ? <input value={otherReason} onChange={(event) => setOtherReason(event.target.value)} placeholder="Enter override reason" /> : null}<button className="primary" onClick={() => {
      const reason = overrideReason === 'Other' ? otherReason.trim() : overrideReason;
      if (missing > 0 && !reason) return setBanner({ type: 'stop', message: 'Supervisor override requires a reason.' });
      if (missing > 0 && reason.length < 3) return setBanner({ type: 'stop', message: 'Supervisor override reason is too short.' });
      commit((current) => ({ ...current, events: appendEvent(current, { action: missing > 0 ? 'Supervisor Override' : 'Complete Dispatch', route, notes: missing > 0 ? `Dispatch completed with ${missing} missing cage(s). Reason: ${reason}` : 'Dispatch completed with all cages loaded.' }) }), { type: missing > 0 ? 'info' : 'success', message: missing > 0 ? `Supervisor override saved: ${reason}` : `${route} dispatch complete.` });
    }}>{missing > 0 ? 'Supervisor Override Complete' : 'Complete Dispatch'}</button></div></section>;

    function loadCage(selectedRoute: string, scannedCageId: string) {
      const cage = data.cages.find((item) => item.cageId === normaliseId(scannedCageId));
      if (!cage) return setBanner({ type: 'stop', message: 'Cage does not exist.' });
      if (!cage.linkedOrderId) return setBanner({ type: 'stop', message: 'This cage is not linked to any order.' });
      const order = data.orders.find((item) => item.orderId === cage.linkedOrderId);
      if (!order) return setBanner({ type: 'stop', message: 'Linked order does not exist.' });
      if (order.route !== selectedRoute) return setBanner({ type: 'stop', message: `This cage is assigned to ${order.route}, not ${selectedRoute}.` });
      if (cage.status === 'Loaded on Van') return setBanner({ type: 'stop', message: 'This cage has already been loaded.' });
      if (!['Packed', 'Ready for Dispatch'].includes(cage.status)) return setBanner({ type: 'stop', message: 'This cage must be packed or ready for dispatch before loading.' });
      commit((current) => ({ ...current, cages: current.cages.map((item) => item.cageId === cage.cageId ? updateCageScan({ ...item, status: 'Loaded on Van', currentLocation: 'Van' }) : item), events: appendEvent(current, { action: 'Load Van', cageId: cage.cageId, orderId: order.orderId, location: 'Van', route: selectedRoute, notes: `Loaded onto ${selectedRoute}.` }) }), { type: 'success', message: `${cage.cageId} cleared for ${selectedRoute}.` });
    }
  }
}

function Dashboard({ data, routes }: { data: AppData; routes: string[] }) {
  return <section className="grid"><div className="metric"><span>{data.cages.length}</span>Cages</div><div className="metric"><span>{data.orders.length}</span>Orders</div><div className="metric"><span>{data.events.length}</span>Audit events</div><div className="metric"><span>{data.cages.filter((cage) => cage.status === 'Loaded on Van').length}</span>Loaded</div><section className="card wide"><h2>Route dispatch summary</h2>{routes.map((route) => <div key={route}><h3>{route}</h3><RouteSummary orders={data.orders.filter((order) => order.route === route)} cages={data.cages} /></div>)}</section><section className="card wide"><h2>Live cage board</h2><div className="table-list">{data.cages.map((cage) => <article key={cage.cageId}><strong>{cage.cageId}</strong><span>{cage.status}</span><span>{cage.currentLocation}</span><small>{cage.linkedOrderId || 'No order linked'}</small></article>)}</div></section></section>;
}

function RouteSummary({ orders, cages }: { orders: Order[]; cages: Cage[] }) {
  return <div className="summary-list">{orders.map((order) => { const loaded = loadedCagesForOrder(cages, order.orderId); const missing = Math.max(order.expectedCages - loaded, 0); return <article key={order.orderId} className={missing === 0 ? 'complete' : 'incomplete'}><div><strong>{order.customerName}</strong><span>{order.orderId}</span></div><div><span>Expected {order.expectedCages}</span><span>Loaded {loaded}</span><span>Missing {missing}</span></div><b>{missing === 0 ? 'Complete' : 'Incomplete'}</b></article>; })}</div>;
}

function SimpleCageAction({ data, title, actionLabel, targetStatus, targetLocation, eventAction, commit, validate, clearOrder = false }: { data: AppData; title: string; actionLabel: string; targetStatus: Cage['status']; targetLocation: LocationName; eventAction: ScanEvent['action']; commit: CommitFn; validate: (cage: Cage) => string | null; clearOrder?: boolean }) {
  const [cageId, setCageId] = useState('');
  const cage = data.cages.find((item) => item.cageId === normaliseId(cageId));
  return <section className="card"><h2>{title}</h2><ScannerInput label="Cage QR" placeholder="CAGE-EK-001" value={cageId} onChange={setCageId} scanRegionId={`${eventAction.replaceAll(' ', '-').toLowerCase()}-scan`} /><button className="primary" onClick={() => {
    if (!cage) return alert('STOP: Cage does not exist.');
    const validation = validate(cage);
    if (validation) return alert(`STOP: ${validation}`);
    commit((current) => ({ ...current, cages: current.cages.map((item) => item.cageId === cage.cageId ? { ...item, status: targetStatus, currentLocation: targetLocation, linkedOrderId: clearOrder ? undefined : item.linkedOrderId, lastScannedAt: new Date().toISOString(), lastScannedBy: safeGetItem(OPERATOR_STORAGE_KEY) || 'Operator' } : item), events: [...current.events, newEvent({ action: eventAction, cageId: cage.cageId, orderId: cage.linkedOrderId, location: targetLocation, operatorName: safeGetItem(OPERATOR_STORAGE_KEY) || 'Operator', notes: `${title} completed.` })] }), { type: 'success', message: `${cage.cageId} updated to ${targetStatus}.` });
  }}>{actionLabel}</button></section>;
}

function SearchScreen({ data }: { data: AppData }) {
  const [query, setQuery] = useState('');
  const cage = data.cages.find((item) => item.cageId === normaliseId(query));
  const events = data.events.filter((event) => event.cageId === normaliseId(query) || event.orderId === normaliseId(query)).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return <section className="card"><h2>Search / Missing Cage Investigation</h2><ScannerInput label="Cage or order ID" placeholder="CAGE-EK-001 or ORDER-1001" value={query} onChange={setQuery} scanRegionId="search-scan" />{cage ? <div className="result"><h3>{cage.cageId}</h3><p>Status: <b>{cage.status}</b></p><p>Location: <b>{cage.currentLocation}</b></p><p>Linked order: <b>{cage.linkedOrderId || 'None'}</b></p><p>Last scanned by {cage.lastScannedBy || 'n/a'} at {cage.lastScannedAt ? new Date(cage.lastScannedAt).toLocaleString() : 'n/a'}</p></div> : null}<h3>Audit trail</h3><div className="timeline">{events.length === 0 ? <p>No audit events found.</p> : events.map((event) => <article key={event.eventId}><strong>{event.action}</strong><time>{new Date(event.timestamp).toLocaleString()}</time><p>{[event.cageId, event.orderId, event.location, event.route].filter(Boolean).join(' • ')}</p><small>{event.operatorName}{event.notes ? ` — ${event.notes}` : ''}</small></article>)}</div></section>;
}

function ImportExportScreen({ data, setData }: { data: AppData; setData: (data: AppData, message: Banner) => void }) {
  const [importText, setImportText] = useState('');
  return <section className="card"><h2>Import / Export Data</h2><button className="primary" onClick={() => { const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = exportFilename(); link.click(); URL.revokeObjectURL(url); }}>Export JSON Backup</button><label>Paste JSON backup<textarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Paste exported JSON here" /></label><button className="secondary" onClick={() => { try { const parsed = JSON.parse(importText); if (!isAppData(parsed)) throw new Error('Invalid backup shape'); setData(parsed, { type: 'success', message: 'Backup imported.' }); } catch (error) { setData(data, { type: 'stop', message: error instanceof Error ? error.message : 'Import failed.' }); } }}>Import JSON</button><button className="danger" onClick={() => setData(createSeedData(), { type: 'info', message: 'Demo seed data restored.' })}>Reset to Seed Data</button></section>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
