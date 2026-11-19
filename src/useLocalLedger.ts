import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { acknowledge, cacheMonth, queued, readMonth, watchLocal, type Entry, type Queued } from './local-ledger'

export function changeMonth(m: string, step: number) {
 const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1 + step, 1)
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}
export async function remoteEntries(db: SupabaseClient, book: string, month?: string) {
 const rows: Entry[] = []
 for (let offset = 0; ; offset += 1000) {
  let request = db.from('jz_transactions').select('*').eq('book_id', book)
   .order('occurred_on', { ascending: false }).order('created_at', { ascending: false })
   .order('id', { ascending: false }).range(offset, offset + 999)
  if (month) request = request.gte('occurred_on', month + '-01').lt('occurred_on', changeMonth(month, 1) + '-01')
  const { data, error } = await request.abortSignal(AbortSignal.timeout(20000))
  if (error) throw error
  rows.push(...data as Entry[])
  if (data.length < 1000) return rows
 }
}
async function send(db: SupabaseClient, item: Queued, token: string) {
 const table = db.from('jz_transactions')
 const { entry, action } = item
 const { id, created_at, ...fields } = entry
 // A retry after a lost insert response must not overwrite another member's later edit.
 const signal = AbortSignal.timeout(20000)
 const request = action === 'insert' ? table.upsert(entry, { onConflict: 'id', ignoreDuplicates: true }).abortSignal(signal)
  : action === 'update' ? table.update(fields).eq('book_id', entry.book_id).eq('id', id).select('id').abortSignal(signal).single()
  : table.delete().eq('book_id', entry.book_id).eq('id', id).abortSignal(signal)
 const { error } = await request.setHeader('Authorization', 'Bearer ' + token)
 if (error) throw error
}
export function useLocalLedger(db: SupabaseClient | null, owner: string, book: string, month: string, online: boolean) {
 const [view, setView] = useState({ entries: [] as Entry[], budget: null as {amount:number} | null, pending: 0, complete: false })
 const [issue, setIssue] = useState('')
 const run = useRef<(pull?: boolean) => void>(() => {})
 const scope = JSON.stringify([owner, book, month])
 const [viewScope, setViewScope] = useState('')
 useLayoutEffect(() => {
  if (!owner || !book) return
  let active = true, readId = 0
  const reload = async () => {
   const id = ++readId
   try {
    const current = await readMonth(owner, book, month)
    if (active && readId === id) { setView(current); setViewScope(scope) }
   } catch { if (active) setIssue('无法读取本机账本，请检查浏览器存储空间。') }
  }
  const unsubscribe = watchLocal(owner, reload)
  void reload()
  return () => { active = false; unsubscribe() }
 }, [scope])
 useEffect(() => {
  setIssue('')
  if (!db || !owner || !online) return
  let active = true, running = false, again = false, needsPull = false
  async function synchronize(pull = false) {
   again = true
   needsPull ||= pull
   if (running) return
   running = true
   try {
    // Serialize cloud snapshots and uploads across tabs. Local writes never wait on this lock.
    await navigator.locks.request('chaimi-sync:' + owner, async () => {
     while (active && again && navigator.onLine) {
      again = false
      const changes = await queued(owner)
      if (!changes.length && !needsPull) break
      const { data } = await db!.auth.getSession()
      if (!active || data.session?.user.id !== owner) return
      const failed = new Set<string>()
      for (const item of changes) {
       if (!active || !navigator.onLine) return
       if (failed.has(item.entry.id)) continue
       try {
        await send(db!, item, data.session.access_token)
        await acknowledge(item)
       } catch { failed.add(item.entry.id) }
      }
      if (active) setIssue(failed.size ? '部分账目尚未同步，已保存在本机。' : '')
      if (active && book && (needsPull || changes.length)) {
       needsPull = false
       const [entries, budget] = await Promise.all([
        remoteEntries(db!, book, month),
        db!.from('jz_budgets').select('amount').eq('book_id', book).eq('month', month + '-01').abortSignal(AbortSignal.timeout(20000)).maybeSingle(),
       ])
       if (budget.error) throw budget.error
       if (active) await cacheMonth(owner, book, month, { entries, budget: budget.data })
      }
      needsPull = false
     }
    })
   } catch { if (active) setIssue('暂时无法更新云端数据，当前显示本机记录。') }
   finally { running = false; if (active && again) void synchronize(needsPull) }
  }
  run.current = synchronize
  void synchronize(true)
  const retry = () => { if (document.visibilityState === 'visible') void synchronize() }
  const timer = window.setInterval(retry, 30000)
  document.addEventListener('visibilitychange', retry)
  return () => { active = false; run.current = () => {}; clearInterval(timer); document.removeEventListener('visibilitychange', retry) }
 }, [db, owner, book, month, online])
 const current = viewScope === scope ? view : { entries: [], budget: null, pending: 0, complete: false }
 return { ...current, localReady: viewScope === scope, issue, refresh: () => run.current(true), upload: () => run.current() }
}
