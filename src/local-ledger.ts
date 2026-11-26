export type Book = { id: string; name: string; owner_id: string }
export type Entry = { id: string; book_id: string; user_id: string; kind: 'expense' | 'income'; amount: number; category: string; note: string; merchant: string; occurred_on: string; created_at?: string }
export type Change = { owner: string; action: 'insert' | 'update' | 'delete'; entry: Entry; previousMonth?: string }
export type Queued = Change & { seq: number }
type Month = { complete?: boolean; entries: Entry[]; budget: { amount: number } | null }

export function applyChange(rows: Entry[], change: Change, month?: string) {
 const { entry, action } = change
 const filtered = rows.filter(row => row.id !== entry.id)
 if (action !== 'delete' && (!month || entry.occurred_on.slice(0, 7) === month)) filtered.push(entry)
 return filtered
}
function latestFirst(a: Entry, b: Entry) {
 return b.occurred_on.localeCompare(a.occurred_on) || (b.created_at || '').localeCompare(a.created_at || '') || b.id.localeCompare(a.id)
}

let opening: Promise<IDBDatabase> | undefined
function database() {
 if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('chaimi-local-ledger', 1)
  request.onupgradeneeded = () => {
   request.result.createObjectStore('months')
   const queue = request.result.createObjectStore('changes', { keyPath: 'seq', autoIncrement: true })
   queue.createIndex('owner', 'owner')
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => { opening = undefined; reject(request.error) }
 })
 return opening
}
function result<T>(request: IDBRequest<T>) {
 return new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
 })
}
function committed(tx: IDBTransaction) {
 return new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve()
  tx.onabort = () => reject(tx.error || new Error('Local write aborted'))
 })
}
const channel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('chaimi-ledger-changes') : null
const events = new EventTarget()
function notify(owner: string) {
 events.dispatchEvent(new CustomEvent('change', { detail: owner }))
 channel?.postMessage(owner)
}
if (channel) channel.onmessage = e => events.dispatchEvent(new CustomEvent('change', { detail: e.data }))
export function watchLocal(owner: string, reload: () => void) {
 const listener = (event: Event) => { if ((event as CustomEvent).detail === owner) reload() }
 events.addEventListener('change', listener)
 return () => events.removeEventListener('change', listener)
}
export async function enqueue(change: Change) {
 const tx = (await database()).transaction('changes', 'readwrite')
 tx.objectStore('changes').add(change)
 await committed(tx)
 notify(change.owner)
}
function queueFor(tx: IDBTransaction, owner: string): Promise<Queued[]> {
 return result(tx.objectStore('changes').index('owner').getAll(owner))
}
export async function queued(owner: string) {
 return queueFor((await database()).transaction('changes'), owner)
}
export async function readMonth(owner: string, book: string, month: string) {
 const tx = (await database()).transaction(['months', 'changes'])
 const [snapshot, changes] = await Promise.all([
  result<Month | undefined>(tx.objectStore('months').get([owner, book, month])), queueFor(tx, owner),
 ])
 const entries = snapshot?.entries ?? []
 const metadata = { budget: snapshot?.budget ?? null, pending: changes.length, complete: snapshot?.complete === true }
 if (!changes.length) {
  // IndexedDB returns a fresh copy. Cloud snapshots are usually already ordered.
  if (entries.some((entry, index) => index > 0 && latestFirst(entries[index - 1], entry) > 0)) entries.sort(latestFirst)
  return { entries, ...metadata }
 }
 const rows = new Map(entries.map(entry => [entry.id, entry]))
 for (const { entry, action } of changes) {
  if (entry.book_id !== book) continue
  rows.delete(entry.id)
  if (action !== 'delete' && entry.occurred_on.startsWith(month + '-')) rows.set(entry.id, entry)
 }
 return { entries: [...rows.values()].sort(latestFirst), ...metadata }
}
export async function cacheMonth(owner: string, book: string, month: string, snapshot: Month) {
 const tx = (await database()).transaction('months', 'readwrite')
 tx.objectStore('months').put({ ...snapshot, complete: true }, [owner, book, month])
 await committed(tx)
 notify(owner)
}
// Apply the acknowledged row and remove its outbox item in the same transaction.
export async function acknowledge(change: Queued) {
 const { entry, owner, previousMonth } = change
 const currentMonth = entry.occurred_on.slice(0, 7)
 const tx = (await database()).transaction(['months', 'changes'], 'readwrite')
 const done = committed(tx)
 const months = tx.objectStore('months')
 for (const month of new Set([previousMonth || currentMonth, currentMonth])) {
  const key = [owner, entry.book_id, month]
  const read = months.get(key)
  read.onsuccess = () => {
   const old = read.result as Month | undefined
   months.put({ complete: old?.complete ?? false, budget: old?.budget ?? null, entries: applyChange(old?.entries ?? [], change, month) }, key)
  }
 }
 tx.objectStore('changes').delete(change.seq)
 await done
 notify(owner)
}

export function readPreference<T>(key: string, fallback: T): T {
 try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}
export function writePreference(key: string, value: unknown) {
 try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* Optional startup hints. */ }
}
