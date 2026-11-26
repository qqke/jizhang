import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { savedIdentity, url, key, type Identity } from './connection'
import { enqueue, queued, applyChange, readPreference, writePreference, type Book, type Entry } from './local-ledger'
import { changeMonth, remoteEntries, useLocalLedger } from './useLocalLedger'
import { BarChart3, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, Home, LogOut, Plus, ScanLine, Settings, Trash2, Users, X } from 'lucide-react'
import { categoriesFor, entryCategories, entryForm, fillReceipt, switchKind, type EntryForm } from './entry-form'
import { filterEntries, csvText, sumEntries } from './ledger'

import { ThemePicker, useDeviceTheme } from './ThemePicker'
import { AuthIllustration, CategoryIcon, Empty, LedgerDialog, Overview, Records, money } from './LedgerView'
import './style.css'
import './ledger-ui.css'

const ReceiptScanner = React.lazy(() => import('./ReceiptScanner').then(m => ({ default: m.ReceiptScanner })))
type Client = NonNullable<typeof import('./cloud').cloud>

type Member = { user_id: string; email: string; joined_at: string; is_owner: boolean }
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const monthLabel = (m: string) => `${m.slice(0,4)} 年 ${Number(m.slice(5,7))} 月`
function Bootstrap() {
 const appearance = useDeviceTheme()
 const [session, setSession] = useState(savedIdentity)
 const [client, setClient] = useState<Client | null>(null)
 const [verified, setVerified] = useState('')
 const [ready, setReady] = useState(() => Boolean(session) || !url || !key || (!location.search && !location.hash))
 const [recovery, setRecovery] = useState(false)
 const [online, setOnline] = useState(navigator.onLine)
 useEffect(() => {
  const connection = () => setOnline(navigator.onLine)
  window.addEventListener('online', connection)
  window.addEventListener('offline', connection)
  return () => { window.removeEventListener('online', connection); window.removeEventListener('offline', connection) }
 }, [])
 useEffect(() => {
  if (!url || !key) return
  let active = true
  let unsubscribe: (() => void) | undefined
  const connect = () => import('./cloud').then(({ cloud }) => {
   if (!active || !cloud) return
   setClient(cloud)
   const { data } = cloud.auth.onAuthStateChange((event, current) => {
    if (!active) return
    const identity = current || (event === 'INITIAL_SESSION' ? savedIdentity() : null)
    setSession(identity ? { user: { id: identity.user.id, email: identity.user.email } } : null)
    setVerified(current?.user.id || '')
    setReady(true)
    if (event === 'PASSWORD_RECOVERY') setRecovery(true)
    if (event === 'SIGNED_OUT') setRecovery(false)
   })
   unsubscribe = () => data.subscription.unsubscribe()
  }).catch(() => { if (active) setReady(true) })
  let cancelIdle: (() => void) | undefined
  if (session && !location.search && !location.hash && 'requestIdleCallback' in window) {
   const id = window.requestIdleCallback(connect, { timeout: 300 })
   cancelIdle = () => window.cancelIdleCallback(id)
  } else void connect()
  return () => { active = false; cancelIdle?.(); unsubscribe?.() }
 }, [])
 if (!ready) return <div className="loading">正在打开柴米账本…</div>
 return <App appearance={appearance} key={session?.user.id || 'login'} session={session}
  db={session && verified !== session.user.id ? null : client} online={online}
  recovery={recovery} finishRecovery={()=>setRecovery(false)}/>
}
function App({ appearance, session, db, online, recovery, finishRecovery }: {
 appearance: ReturnType<typeof useDeviceTheme>
 session: Identity | null; db: Client | null; online: boolean; recovery: boolean; finishRecovery: () => void
}) {
 const [authMode,setAuthMode]=useState<'login'|'signup'|'forgot'|'reset'>(recovery?'reset':'login')
 useEffect(()=>{if(recovery)setAuthMode('reset')},[recovery])
 const owner = session?.user.id || ''
 const booksKey = 'jz:books:' + owner
 const selectedKey = 'jz:book:' + owner
 const [scanOpen, setScanOpen] = useState(false)
 const [scanning,setScanning] = useState(false)
 const [email,setEmail]=useState(''), [password,setPassword]=useState(''), [busy,setBusy]=useState(false), [notice,setNotice]=useState('')
 const [query,setQuery]=useState(''), [kindFilter,setKindFilter]=useState('all'), [categoryFilter,setCategoryFilter]=useState('all'), [members,setMembers]=useState<Member[]>([]), [exporting,setExporting]=useState(false)
 const [books,setBooks]=useState<Book[]>(()=>readPreference<Book[]>(booksKey,[]))
 const [book,setBook]=useState<Book|null>(()=>books.find(b=>b.id===readPreference(selectedKey,'')) || books[0] || null)
 const [month,setMonth]=useState(localDate().slice(0,7)), [page,setPage]=useState<'home'|'records'|'stats'|'settings'>('home'), [modal,setModal]=useState<'entry'|'budget'|'book'|null>(null)
 const [editing,setEditing]=useState<Entry|null>(null)
 const [form,setForm]=useState(() => entryForm(localDate(), '', entryCategories.expense[0]))
 const { kind, amount, category, note, date, merchant, customMerchant } = form
 const [budgetAmount,setBudgetAmount]=useState('')
 const [bookName,setBookName]=useState(''), [invite,setInvite]=useState('')
 const [merchants,setMerchants]=useState<string[]>([])
 const drafts = useRef(new Map<string, EntryForm>())
 const initialForm = useRef(form)
 const currentForm = useRef(form)
 const formKey = useRef('')
 const formBook = useRef('')
 const [resumed,setResumed] = useState(false)
 const [closingEntry,setClosingEntry] = useState(false)
 const [receiptNotice,setReceiptNotice] = useState('')
 const [highlight,setHighlight] = useState<{ id: string } | null>(null)
 useEffect(() => {
  if (!closingEntry) return
  const timer = window.setTimeout(() => { setModal(null); setClosingEntry(false) }, 120)
  return () => window.clearTimeout(timer)
 }, [closingEntry])
 useEffect(() => {
  if (!highlight) return
  const timer = window.setTimeout(() => setHighlight(null), 1400)
  return () => window.clearTimeout(timer)
 }, [highlight])
 useEffect(() => {
  if (modal === 'entry' && formBook.current !== book?.id) {
   setModal(null); setClosingEntry(false)
  }
 }, [book?.id, modal])
 useEffect(() => {
  if (!receiptNotice) return
  const timer = window.setTimeout(() => setReceiptNotice(''), 5000)
  return () => window.clearTimeout(timer)
 }, [receiptNotice])
 function clearDraft(key: string) {
  drafts.current.delete(key)
  try { localStorage.removeItem(key) } catch {}
 }
 function updateDraft(next: EntryForm) {
  currentForm.current = next
  setForm(next)
  if (JSON.stringify(initialForm.current) === JSON.stringify(next)) {
   clearDraft(formKey.current)
  } else {
   drafts.current.set(formKey.current, next)
   writePreference(formKey.current, next)
  }
 }
 function changeForm(patch: Partial<EntryForm>, manual?: keyof EntryForm['manual']) {
  const previous = currentForm.current
  updateDraft({ ...previous, ...patch, manual: manual ? { ...previous.manual, [manual]: true } : previous.manual })
 }
 useEffect(()=>{
  if(modal!=='entry'||!book)return
  const cacheKey='jz:merchants:'+owner+':'+book?.id
  setMerchants(readPreference<string[]>(cacheKey,[]))
  if(!db||!online)return
  let active=true
  void db.rpc('jz_list_merchants',{book:book.id}).then(({data,error})=>{
   if(active&&!error){setMerchants(data ?? []);writePreference(cacheKey,data ?? [])}
  })
  return ()=>{active=false}
 },[db,online,book?.id,modal])
 const manualMerchant = customMerchant || (merchant !== '' && !merchants.includes(merchant))
 const booksRequest = useRef(0)
 async function loadBooks() {
  if (!db || !owner || !online) return
  const request = ++booksRequest.current
  const { data, error } = await db.from('jz_books').select('*').order('created_at')
  if (request !== booksRequest.current) return
  if (error) { if (!books.length) setNotice('暂时无法加载家庭账本，请联网后重试。'); return }
  const list = (data || []) as Book[]
  writePreference(booksKey, list)
  setBooks(list)
  setBook(current => list.find(b => b.id === current?.id) || list[0] || null)
 }
 useEffect(()=>{void loadBooks();return ()=>{booksRequest.current++}},[db,owner,online])
 useEffect(()=>{if(book)writePreference(selectedKey,book.id)},[book?.id])
 const { entries, budget, pending, complete, localReady, issue, refresh, upload } = useLocalLedger(db,owner,book?.id || '',month,online)

 useEffect(()=>{ const token=new URLSearchParams(location.search).get('invite'); if(!token || !session || !db || !online) return; db.rpc('jz_join_book',{invite_token:token}).then(({error})=>{ setNotice(error ? '邀请链接无效或已过期。' : '已加入家庭账本。'); if(!error)history.replaceState(null,'',location.pathname); void loadBooks() }) },[db,session?.user.id,online])

 async function loadMembers() { if(!db||!book)return; const {data,error}=await db.rpc('jz_list_members',{book:book.id}); if(error)setNotice('加载成员失败，请重试。'); else setMembers((data||[]) as Member[]) }
 useEffect(()=>{ setInvite(''); setMembers([]); if(book&&page==='settings'&&online)void loadMembers() },[book?.id,page,db,online])
 async function removeMember(member:Member) { if(!db||!book||!session)return; const self=member.user_id===session.user.id; if(!confirm(self?'确定退出这个家庭账本吗？退出后将无法查看账本。':`确定移除 ${member.email} 吗？移除后对方将无法访问账本。`))return; const {error}=await db.rpc('jz_remove_member',{book:book.id,member:member.user_id}); if(error){setNotice('操作失败，请重试。');return} if(self){setBook(null);void loadBooks()}else void loadMembers(); setNotice(self?'已退出账本。':'已移除成员。') }
 async function exportEntries() { if(!book||!db||!online)return; setExporting(true); try { const rows=await navigator.locks.request('chaimi-sync:'+owner,async()=>{let rows=await remoteEntries(db,book.id);for(const change of await queued(owner))if(change.entry.book_id===book.id)rows=applyChange(rows,change);return rows.sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on))}); const file=new Blob([csvText(rows)],{type:'text/csv;charset=utf-8'}); const href=URL.createObjectURL(file); const link=document.createElement('a'); link.href=href; link.download=`柴米账本-${localDate()}.csv`; link.click(); setTimeout(()=>URL.revokeObjectURL(href),1000); setNotice(`已导出 ${rows.length} 条记录。`) } catch { setNotice('导出失败，请检查网络后重试。') } finally {setExporting(false)} }
 const filtered=useMemo(()=>page==='records'?filterEntries(entries,query,kindFilter,categoryFilter):[],[page,entries,query,kindFilter,categoryFilter])

 const {expense,income}=useMemo(()=>sumEntries(entries),[entries])
 const subtotals=useMemo(()=>sumEntries(filtered),[filtered])
 const filterCategories=useMemo(()=>[...new Set([
  ...entryCategories.expense, ...entryCategories.income, ...entries.map(entry=>entry.category),
 ])],[entries])
 const [expenseCategory,setExpenseCategory]=useState('')
 const merchantKey = `jz:last-merchant:${session?.user.id}:${book?.id}`
 const groups=useMemo(()=>{
  if(page!=='stats')return []
  const totals=new Map<string,number>()
  for(const entry of entries)if(entry.kind==='expense'){
   totals.set(entry.category,(totals.get(entry.category)??0)+entry.amount)
  }
  return Array.from(totals,([name,total])=>({name,total})).sort((a,b)=>b.total-a.total)
 },[page,entries])
 async function auth(e:React.FormEvent) { e.preventDefault(); if(!db)return; setBusy(true); setNotice(''); let error; if(authMode==='login') ({error}=await db.auth.signInWithPassword({email,password})); else if(authMode==='signup') { const r=await db.auth.signUp({email,password,options:{emailRedirectTo:location.href}}); error=r.error; if(!error)setNotice('注册成功，请检查邮箱中的确认邮件。') } else if(authMode==='forgot') { const r=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});error=r.error;if(!error)setNotice('重置链接已发送，请检查邮箱。') } else { const r=await db.auth.updateUser({password});error=r.error;if(!error){setNotice('密码已更新。');finishRecovery();setAuthMode('login')} } if(error)setNotice(error.message); setBusy(false) }
 function editEntry(entry?: Entry) {
  if (!book) return
  let lastMerchant = ''
  try { lastMerchant = localStorage.getItem(merchantKey) || '' } catch {}
  const initial = entryForm(localDate(), lastMerchant, entryCategories.expense[0], entry)
  formBook.current = book.id
  formKey.current = 'jz:entry-draft:' + JSON.stringify([owner, book.id, entry?.id ?? 'new'])
  initialForm.current = initial
  const saved = drafts.current.get(formKey.current) ?? readPreference<EntryForm | null>(formKey.current, null)
  setHighlight(null); setReceiptNotice('')
  currentForm.current = saved ?? initial
  setForm(currentForm.current)
  setResumed(Boolean(saved)); setEditing(entry ?? null)
  setScanOpen(false); setScanning(false); setNotice(''); setModal('entry')
 }
 function finishEntry() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setModal(null)
  else setClosingEntry(true)
 }
 function closeDialog() {
  if (busy || closingEntry) return
  if (modal !== 'entry') { setModal(null); return }
  finishEntry()
 }
 function discardDraft() {
  clearDraft(formKey.current)
  currentForm.current = initialForm.current
  setForm(currentForm.current); setResumed(false); setScanOpen(false)
 }
 async function persistEntry(action: 'insert' | 'update' | 'delete', entry: Entry) {
  if (busy || closingEntry || !session || book?.id !== formBook.current) return
  setBusy(true)
  const draftKey = formKey.current
  try {
   await enqueue({ owner, action, entry, previousMonth: editing?.occurred_on.slice(0,7) })
   if (action === 'insert') { try { localStorage.setItem(merchantKey, entry.merchant) } catch {} }
   clearDraft(draftKey)
   finishEntry()
   if (action !== 'delete') setMonth(entry.occurred_on.slice(0,7))
   setHighlight(action === 'delete' ? null : { id: entry.id })
   const label = entry.kind === 'income' ? '收入' : '支出'
   const verb = action === 'delete' ? '已删除' : action === 'update' ? '已更新' : '已记'
   setNotice(''); setReceiptNotice(verb + label + ' ' + money(entry.amount) + ' · 已存本机')
   upload()
  } catch { setNotice('未能保存到本机。请释放存储空间后重试。') }
  finally { setBusy(false) }
 }
 function saveEntry(e: React.FormEvent) {
  e.preventDefault()
  if (!book || !session || scanning || busy) return
  const n = Number(amount)
  if (!Number.isSafeInteger(n) || n <= 0 || n > 2147483647) { setNotice('请输入有效的日元整数金额。'); return }
  if (!categoriesFor(kind, editing).includes(category)) { setNotice('请选择对应收支类型的分类。'); return }
  const entry: Entry = { id: editing?.id || crypto.randomUUID(), book_id: book.id, user_id: editing?.user_id || owner,
   kind, amount:n, category, note, merchant:merchant.trim(), occurred_on:date, created_at:editing?.created_at || new Date().toISOString() }
  void persistEntry(editing ? 'update' : 'insert', entry)
 }
 function removeEntry() {
  if (editing && !busy && confirm('确定删除这笔记录吗？')) void persistEntry('delete', editing)
 }
 async function saveBudget(e:React.FormEvent){e.preventDefault();if(!db||!book)return;const n=Number(budgetAmount);if(!Number.isSafeInteger(n)||n<0||n>2147483647){setNotice('请输入有效的日元整数预算。');return}const {error}=await db.from('jz_budgets').upsert({book_id:book.id,month:month+'-01',amount:n});if(error)setNotice(error.message);else{setModal(null);void refresh()}}
 async function createBook(e:React.FormEvent){e.preventDefault();if(!db)return;const {error}=await db.rpc('jz_create_book',{book_name:bookName});if(error)setNotice(error.message);else{setModal(null);setBookName('');void loadBooks()}}
 async function createInvite(){if(!db||!book)return;const {data,error}=await db.rpc('jz_create_invite',{book:book.id});if(error)setNotice(error.message);else setInvite(`${location.origin}${location.pathname}?invite=${data}`)}

 if(!session || authMode==='reset') return <main className="auth"><section className="auth-art"><Brand/><div className="auth-story"><h1>把日子，<br/>过得有数。</h1><p>一家人的收支，记在同一本账里。</p><AuthIllustration/></div></section><section className="auth-form"><div className="auth-box"><Brand/><h2>{authMode==='signup'?'创建你的账户':authMode==='forgot'?'找回密码':authMode==='reset'?'设置新密码':'欢迎回家'}</h2><p>{authMode==='login'?'登录你的家庭账本。':authMode==='forgot'?'输入注册邮箱，接收密码重置链接。':authMode==='reset'?'输入新密码后即可继续记账。':'使用邮箱创建账户，与家人一起记账。'}</p>{!url||!key?<div className="notice">请先配置 Supabase 项目地址与公开密钥。</div>:<form onSubmit={auth}>{authMode!=='reset'&&<label>邮箱<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label>}{authMode!=='forgot'&&<label>密码<input type="password" autoComplete={authMode==='login'?'current-password':'new-password'} minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="至少 6 位字符"/></label>}<button className="primary wide" disabled={busy||!db||!online}>{busy?'请稍候…':authMode==='signup'?'创建账户':authMode==='forgot'?'发送重置邮件':authMode==='reset'?'保存新密码':'登录账本'}</button></form>}{notice&&<p className="notice" role="status">{notice}</p>}<div className="auth-links">{authMode==='login'?<><button onClick={()=>setAuthMode('signup')}>创建账户</button><button onClick={()=>setAuthMode('forgot')}>忘记密码？</button></>:<button onClick={()=>setAuthMode('login')}>返回登录</button>}</div></div></section></main>
 function navigate(next: typeof page) {
  setPage(next)
  window.scrollTo(0, 0)
 }
 const monthUnavailable = !complete && entries.length === 0
 const monthMessage = issue ? '暂时无法读取完整月度账目' : !localReady ? '正在读取本机账目…'
  : online ? '正在加载本月账目…' : '本机尚无这个月的完整记录，联网后可查看。'
 const hasFilters = Boolean(query || kindFilter !== 'all' || categoryFilter !== 'all')
 function clearFilters() { setQuery(''); setKindFilter('all'); setCategoryFilter('all') }
 const nav=[{id:'home',label:'首页',icon:Home},{id:'records',label:'账目',icon:BookOpen},{id:'stats',label:'统计',icon:BarChart3},{id:'settings',label:'设置',icon:Settings}] as const
 return <div className="app"><aside className="sidebar"><Brand/><div className="workspace"><span className="workspace-icon"><Home size={18}/></span><span><small>当前账本</small><strong>{book?.name||'我的家庭'}</strong></span></div><nav>{nav.map(n=><button key={n.id} className={page===n.id?'active':''} aria-current={page===n.id?'page':undefined} onClick={()=>navigate(n.id)}><n.icon size={19}/>{n.label}</button>)}</nav><div className="sidebar-bottom"><span className="avatar">家</span><span><strong>家庭成员</strong><small>{session.user.email}</small></span></div></aside><main className="main"><header className="topbar"><div className="mobile-brand"><Brand/></div><span className="mobile-book">{book?.name}</span><div className="top-title">{page==='home'?'账本总览':page==='records'?'收支明细':page==='stats'?'收支统计':'账本设置'} <span>/ {book?.name||'我的家庭'}</span></div><button className="top-add" onClick={()=>editEntry()} disabled={!book}><Plus size={17}/> 记一笔</button><span className="top-avatar">家</span></header><div className="content">{(!online||pending>0||issue)&&<div className="notice global" role="status"><span>{[!online&&'离线模式',pending>0&&'待同步 '+pending+' 项更改',issue||(!online&&(complete?'可继续记账':'本月仅显示本机已有记录，可继续记账'))].filter(Boolean).join(' · ')}</span>{online&&issue&&<button type="button" onClick={refresh}>重试</button>}</div>}{notice&&<div className="notice global" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="关闭提示"><X size={16}/></button></div>}{!book?<section className="welcome"><h1>创建家庭账本</h1><p>创建一个家庭账本，邀请家人一起记录生活。</p><button className="primary" disabled={!online||!db} onClick={()=>setModal('book')}><Plus size={18}/> 创建家庭账本</button></section>:<>{page==='settings'?<><div className="page-heading"><div><h1>账本设置</h1><p>管理你的家庭账本与账户。</p></div></div><ThemePicker {...appearance}/><section className="panel settings-panel"><h2>家庭账本</h2><label>当前账本<select value={book.id} onChange={e=>setBook(books.find(b=>b.id===e.target.value)||null)}>{books.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><button className="outline" disabled={!online||!db} onClick={()=>setModal('book')}><Plus size={16}/> 创建新账本</button>{book.owner_id===session.user.id&&<div className="invite"><h3>邀请家人一起记账</h3><p>邀请链接 7 天内有效，仅可使用一次。</p><button className="outline" disabled={!online||!db} onClick={createInvite}><Users size={16}/> 生成邀请链接</button>{invite&&<><input readOnly value={invite} aria-label="邀请链接"/><button className="text-button" onClick={()=>navigator.clipboard.writeText(invite).then(()=>setNotice('邀请链接已复制。')).catch(()=>setNotice('复制失败，请手动复制链接。'))}>复制链接</button></>}</div>}<div className="invite"><h3>家庭成员 <span className="member-count">{members.length} 人</span></h3><p>成员可以查看和管理共享账目。</p><div className="members">{members.map(m=><div className="member-row" key={m.user_id}><span className="avatar">{m.email.slice(0,1).toUpperCase()}</span><span className="member-info"><strong>{m.email}</strong><small>{m.is_owner?'创建者':m.user_id===session.user.id?'我 · 成员':'成员'}</small></span>{!m.is_owner&&(book.owner_id===session.user.id||m.user_id===session.user.id)&&<button className="text-button member-remove" onClick={()=>removeMember(m)}>{m.user_id===session.user.id?'退出账本':'移除'}</button>}</div>)}</div></div></section><section className="panel settings-panel"><h2>数据备份</h2><p>将当前家庭账本的全部记录导出为 CSV 文件。</p><button className="outline" onClick={exportEntries} disabled={exporting||!online||!db}>{exporting?'正在导出…':'导出全部账目'}</button></section><section className="panel settings-panel"><h2>账户</h2><p>{session.user.email}</p><button className="outline" disabled={!online||!db} onClick={()=>db?.auth.signOut()}><LogOut size={16}/> 退出登录</button></section></>:<><div className="page-heading"><div><h1>{page==='home'?'月度总览':page==='records'?'收支明细':'收支统计'}</h1></div><div className="month-switch"><button onClick={()=>setMonth(changeMonth(month,-1))} aria-label="上个月"><ChevronLeft size={18}/></button><CalendarDays size={16}/><strong>{monthLabel(month)}</strong><button onClick={()=>setMonth(changeMonth(month,1))} aria-label="下个月"><ChevronRight size={18}/></button></div></div>{monthUnavailable ? <section className="panel month-placeholder" role="status"><strong aria-hidden="true">—</strong><p>{monthMessage}</p></section> : <>{page==='home'&&<>
    <Overview entries={entries} income={income} expense={expense} month={month} budget={budget?.amount} complete={complete}
      onBudget={()=>{if(!online||!db){setNotice('请联网后调整月度预算。');return}setBudgetAmount(budget?String(budget.amount):'');setModal('budget')}}/>
    <div className="section-title"><h2>最近账目</h2><button className="text-button" onClick={()=>{clearFilters();navigate('records')}}>查看全部 <ChevronRight size={16}/></button></div>
    <Records highlightId={highlight?.id} entries={entries.slice(0,5)} edit={editEntry}/>
  </>}{page==='records'&&<><div className="filters"><label className="filter-search"><span>搜索本月账目</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索店铺、备注、分类或金额"/></label><label><span>收支类型</span><select value={kindFilter} onChange={e=>setKindFilter(e.target.value)}><option value="all">全部收支</option><option value="expense">支出</option><option value="income">收入</option></select></label><label><span>分类</span><select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="all">全部分类</option>{filterCategories.map(c=><option key={c}>{c}</option>)}</select></label></div><div className="filter-count"><div className="filter-summary" role="status"><span>{hasFilters?`找到 ${filtered.length} 笔，共 ${entries.length} 笔`:`共 ${entries.length} 笔记录`}</span>{!complete && <span>仅按本机记录计算</span>}{hasFilters && <span>支出 {money(subtotals.expense)} · 收入 {money(subtotals.income)}</span>}</div>{hasFilters&&<button className="text-button" onClick={clearFilters}>清除筛选</button>}</div><Records highlightId={highlight?.id} entries={filtered} edit={editEntry} emptyText={entries.length?'没有符合条件的记录':'这个月还没有记录'}/></>}{page==='stats'&&<div className="stats-grid"><section className="panel"><h2>支出分类</h2><p className="muted">{complete ? '本月共支出' : '本机已记录支出'} <strong>{money(expense)}</strong></p>{groups.length ? <>
 <ExpensePie groups={groups} total={expense}/>
 {groups.map((group,index)=>{
  const expanded=expenseCategory===group.name
  const details = expanded ? entries.filter(entry => entry.kind === 'expense' && entry.category === group.name) : []
  return <React.Fragment key={group.name}>
   <button type="button" className="expense-category" aria-expanded={expanded} onClick={()=>setExpenseCategory(expanded?'':group.name)}>
    <span className="pie-key" style={{background:pieColors[index % pieColors.length]}}/>
    <strong>{group.name}</strong><span>{expensePercent.format(group.total/expense)}</span><b>{money(group.total)}</b><ChevronRight size={16}/>
   </button>
   {expanded&&<div className="expense-details"><Records highlightId={highlight?.id} entries={details.slice(0,5)} edit={editEntry}/>
    {details.length > 5 && <button className="text-button more-records" onClick={() => {
     setQuery(''); setKindFilter('expense'); setCategoryFilter(group.name); navigate('records')
    }}>查看全部 {details.length} 笔<ChevronRight size={16}/></button>}</div>}
  </React.Fragment>
 })}
 </>:<Empty text="还没有支出记录"/>}</section><section className="panel"><h2>{complete ? '本月收支' : '本机已记录收支'}</h2><div className="summary-line"><span>收入</span><strong>{money(income)}</strong></div><div className="summary-line"><span>支出</span><strong>{money(expense)}</strong></div><div className="summary-line"><span>结余</span><strong>{money(income-expense)}</strong></div></section></div>}</>}</>}</>}</div></main><nav className="mobile-nav">{nav.slice(0,2).map(n=><button key={n.id} aria-current={page===n.id?'page':undefined} onClick={()=>navigate(n.id)} className={page===n.id?'active':''}><n.icon size={20}/>{n.label}</button>)}<button className="mobile-plus" onClick={()=>editEntry()} disabled={!book} aria-label="记一笔"><Plus size={22}/><span>记一笔</span></button>{nav.slice(2).map(n=><button key={n.id} aria-current={page===n.id?'page':undefined} onClick={()=>navigate(n.id)} className={page===n.id?'active':''}><n.icon size={20}/>{n.label}</button>)}</nav>{receiptNotice && <div className="saved-toast" role="status"><Check size={18} aria-hidden="true"/>{receiptNotice}<button type="button" aria-label="关闭提示" onClick={()=>setReceiptNotice('')}><X size={16}/></button></div>}{modal&&<LedgerDialog title={modal==='entry'?(editing?'编辑记录':'记一笔'):modal==='budget'?'设置月度预算':'创建家庭账本'} closing={closingEntry} close={closeDialog}>
  {!closingEntry&&notice&&<div className="notice dialog-notice" role="status">{notice}</div>}{modal==='entry'?<form className="entry-form" onSubmit={saveEntry}>
  <div className="entry-scroll">
  {resumed && <div className="draft-note"><span>已恢复上次填写的内容</span><button type="button" disabled={busy||scanning} onClick={discardDraft}>丢弃草稿</button></div>}
  <fieldset className="entry-fields" disabled={scanning||busy}><div className="segmented" role="group" aria-label="收支类型"><button type="button" aria-pressed={kind==='expense'} className={kind==='expense'?'selected':''} onClick={()=>updateDraft(switchKind(currentForm.current, 'expense'))}>支出</button><button type="button" aria-pressed={kind==='income'} className={kind==='income'?'selected':''} onClick={()=>updateDraft(switchKind(currentForm.current, 'income'))}>收入</button></div><label className="amount-field">金额（日元）<span><b aria-hidden="true">¥</b><input data-initial-focus type="number" inputMode="numeric" min="1" max="2147483647" step="1" required value={amount} onChange={e=>changeForm({amount:e.target.value},'amount')} placeholder="0"/></span></label>
  <fieldset className="category-picker"><legend>分类</legend><div>
    {categoriesFor(kind, editing).map(name=><button type="button" key={name} aria-pressed={category===name} onClick={()=>changeForm({category:name})}><CategoryIcon name={name}/>{name}</button>)}
  </div></fieldset>
  </fieldset>
  {!editing&&<button className="scan-toggle" aria-expanded={scanOpen} type="button" disabled={scanning||busy} onClick={()=>setScanOpen(!scanOpen)}><ScanLine size={18}/>扫描小票<ChevronRight size={16}/></button>}
  {scanOpen&&!editing&&<React.Suspense fallback={<p role="status">正在打开扫描…</p>}><ReceiptScanner disabled={busy} onBusy={setScanning} onResult={draft=>updateDraft(fillReceipt(currentForm.current,draft))}/></React.Suspense>}
  <fieldset className="entry-fields" disabled={scanning||busy}>
  <label>日期<input type="date" required value={date} onChange={e=>changeForm({date:e.target.value},'date')}/></label><label>店铺（选填）
 <select value={manualMerchant?'custom':merchant?`shop:${merchant}`:''} onChange={e=>{
  const selection=e.target.value
  changeForm({customMerchant:selection==='custom',merchant:selection.startsWith('shop:')?selection.slice(5):''},'merchant')
 }}>
  <option value="">请选择店铺</option>
  {merchants.map(name=><option key={name} value={`shop:${name}`}>{name}</option>)}
  <option value="custom">手动输入店铺</option>
 </select>
</label>
{manualMerchant&&<label>店铺名称<input maxLength={100} value={merchant} onChange={e=>{changeForm({customMerchant:true,merchant:e.target.value},'merchant')}} placeholder="输入店铺名称"/></label>}
<label>备注（选填）<input maxLength={200} value={note} onChange={e=>changeForm({note:e.target.value})} placeholder="写点什么吧"/></label>{editing&&<button className="delete" type="button" onClick={removeEntry}><Trash2 size={16}/> 删除记录</button>}
  </fieldset></div><div className="entry-save"><button className="primary wide" disabled={busy||scanning}><Check size={18}/>{busy?'正在保存…':'保存记录'}</button></div></form>:modal==='budget'?<form onSubmit={saveBudget}><p className="muted">为 {monthLabel(month)} 设定一个家庭支出目标。</p><label>预算金额（日元）<input type="number" min="0" max="2147483647" step="1" required value={budgetAmount} onChange={e=>setBudgetAmount(e.target.value)} placeholder="0"/></label><button className="primary wide">保存预算</button></form>:<form onSubmit={createBook}><p className="muted">给你们共同的生活空间起个名字。</p><label>账本名称<input required maxLength={40} value={bookName} onChange={e=>setBookName(e.target.value)} placeholder="例如：我们的家"/></label><button className="primary wide">创建账本</button></form>}</LedgerDialog>}</div>
}
const pieColors = ['#315f4b','#ba6943','#6380a3','#b28b37','#795d93','#397e82','#aa5471','#69764a']
const expensePercent = new Intl.NumberFormat('zh-CN',{style:'percent',maximumFractionDigits:1})
function ExpensePie({groups,total}:{groups:{name:string;total:number}[];total:number}) {
 let end=0
 const stops=groups.map((group,index)=>{
  const start=end
  end+=group.total/total*100
  return `${pieColors[index % pieColors.length]} ${start}% ${index===groups.length-1?100:end}%`
 })
 return <div className="expense-pie" aria-hidden="true" style={{background:groups.length===1?pieColors[0]:`conic-gradient(${stops.join(', ')})`}}/>
}
function Brand(){return <div className="brand"><span className="brand-mark">柴</span><span><strong>柴米账本</strong><small>CHAIMI</small></span></div>}
createRoot(document.getElementById('root')!).render(<Bootstrap/>)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
 window.addEventListener('load', () => { void navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}) }, { once: true })
}

