import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { savedIdentity, url, key, type Identity } from './connection'
import { enqueue, queued, applyChange, readPreference, writePreference, type Book, type Entry } from './local-ledger'
import { changeMonth, remoteEntries, useLocalLedger } from './useLocalLedger'
import { BarChart3, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, Home, LogOut, Plus, ScanLine, Settings, Trash2, Users, X } from 'lucide-react'
import { filterEntries, csvText } from './ledger'

import { AuthIllustration, CategoryIcon, Empty, LedgerDialog, Overview, Records, categories, money } from './LedgerView'
import './style.css'
import './ledger-ui.css'

const ReceiptScanner = React.lazy(() => import('./ReceiptScanner').then(m => ({ default: m.ReceiptScanner })))
type Client = NonNullable<typeof import('./cloud').cloud>

type Member = { user_id: string; email: string; joined_at: string; is_owner: boolean }
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const monthLabel = (m: string) => `${m.slice(0,4)} 年 ${Number(m.slice(5,7))} 月`
function Bootstrap() {
 const [session, setSession] = useState(savedIdentity)
 const [client, setClient] = useState<Client | null>(null)
 const [verified, setVerified] = useState('')
 const [ready, setReady] = useState(() => Boolean(savedIdentity()) || !url || !key)
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
  import('./cloud').then(({ cloud }) => {
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
  return () => { active = false; unsubscribe?.() }
 }, [])
 if (!ready) return <div className="loading">正在打开柴米账本…</div>
 return <App key={session?.user.id || 'login'} session={session}
  db={session && verified !== session.user.id ? null : client} online={online}
  recovery={recovery} finishRecovery={()=>setRecovery(false)}/>
}
function App({ session, db, online, recovery, finishRecovery }: {
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
 const [editing,setEditing]=useState<Entry|null>(null), [kind,setKind]=useState<'expense'|'income'>('expense'), [amount,setAmount]=useState(''), [category,setCategory]=useState(categories[0]), [note,setNote]=useState(''), [date,setDate]=useState(localDate()), [bookName,setBookName]=useState(''), [invite,setInvite]=useState('')
 const [merchant,setMerchant]=useState(''), [customMerchant,setCustomMerchant]=useState(false), [merchants,setMerchants]=useState<string[]>([])
 useEffect(()=>{
  const cacheKey='jz:merchants:'+owner+':'+book?.id
  setMerchants(readPreference<string[]>(cacheKey,[]))
  if(!db||!book||!online||modal!=='entry')return
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
 const { entries, budget, pending, complete, issue, refresh, upload } = useLocalLedger(db,owner,book?.id || '',month,online)

 useEffect(()=>{ const token=new URLSearchParams(location.search).get('invite'); if(!token || !session || !db || !online) return; db.rpc('jz_join_book',{invite_token:token}).then(({error})=>{ setNotice(error ? '邀请链接无效或已过期。' : '已加入家庭账本。'); if(!error)history.replaceState(null,'',location.pathname); void loadBooks() }) },[db,session?.user.id,online])

 async function loadMembers() { if(!db||!book)return; const {data,error}=await db.rpc('jz_list_members',{book:book.id}); if(error)setNotice('加载成员失败，请重试。'); else setMembers((data||[]) as Member[]) }
 useEffect(()=>{ setInvite(''); setMembers([]); if(book&&page==='settings'&&online)void loadMembers() },[book?.id,page,db,online])
 async function removeMember(member:Member) { if(!db||!book||!session)return; const self=member.user_id===session.user.id; if(!confirm(self?'确定退出这个家庭账本吗？退出后将无法查看账本。':`确定移除 ${member.email} 吗？移除后对方将无法访问账本。`))return; const {error}=await db.rpc('jz_remove_member',{book:book.id,member:member.user_id}); if(error){setNotice('操作失败，请重试。');return} if(self){setBook(null);void loadBooks()}else void loadMembers(); setNotice(self?'已退出账本。':'已移除成员。') }
 async function exportEntries() { if(!book||!db||!online)return; setExporting(true); try { const rows=await navigator.locks.request('chaimi-sync:'+owner,async()=>{let rows=await remoteEntries(db,book.id);for(const change of await queued(owner))if(change.entry.book_id===book.id)rows=applyChange(rows,change);return rows.sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on))}); const file=new Blob([csvText(rows)],{type:'text/csv;charset=utf-8'}); const href=URL.createObjectURL(file); const link=document.createElement('a'); link.href=href; link.download=`柴米账本-${localDate()}.csv`; link.click(); setTimeout(()=>URL.revokeObjectURL(href),1000); setNotice(`已导出 ${rows.length} 条记录。`) } catch { setNotice('导出失败，请检查网络后重试。') } finally {setExporting(false)} }
 const filtered=useMemo(()=>filterEntries(entries,query,kindFilter,categoryFilter),[entries,query,kindFilter,categoryFilter])

 const expense=entries.filter(e=>e.kind==='expense').reduce((a,e)=>a+e.amount,0), income=entries.filter(e=>e.kind==='income').reduce((a,e)=>a+e.amount,0)
 const [expenseCategory,setExpenseCategory]=useState('')
 const merchantKey = `jz:last-merchant:${session?.user.id}:${book?.id}`
 const groups=useMemo(()=>categories.map(name=>({name,total:entries.filter(e=>e.kind==='expense'&&e.category===name).reduce((a,e)=>a+e.amount,0)})).filter(x=>x.total>0).sort((a,b)=>b.total-a.total),[entries])
 async function auth(e:React.FormEvent) { e.preventDefault(); if(!db)return; setBusy(true); setNotice(''); let error; if(authMode==='login') ({error}=await db.auth.signInWithPassword({email,password})); else if(authMode==='signup') { const r=await db.auth.signUp({email,password,options:{emailRedirectTo:location.href}}); error=r.error; if(!error)setNotice('注册成功，请检查邮箱中的确认邮件。') } else if(authMode==='forgot') { const r=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});error=r.error;if(!error)setNotice('重置链接已发送，请检查邮箱。') } else { const r=await db.auth.updateUser({password});error=r.error;if(!error){setNotice('密码已更新。');finishRecovery();setAuthMode('login')} } if(error)setNotice(error.message); setBusy(false) }
 function editEntry(e?:Entry) {setScanOpen(false);setScanning(false);setNotice('');setEditing(e||null);setKind(e?.kind||'expense');setAmount(e?String(e.amount):'');setCategory(e?.category||categories[0]);setNote(e?.note||'');let lastMerchant='';if(!e){try{lastMerchant=localStorage.getItem(merchantKey)||''}catch{}}setMerchant(e?e.merchant:lastMerchant);setCustomMerchant(false);setDate(e?.occurred_on||localDate());setModal('entry')}
 async function persistEntry(action: 'insert' | 'update' | 'delete', entry: Entry) {
  if (busy || !session) return
  setBusy(true)
  try {
   await enqueue({ owner, action, entry, previousMonth: editing?.occurred_on.slice(0,7) })
   if (action === 'insert') { try { localStorage.setItem(merchantKey, entry.merchant) } catch {} }
   setModal(null)
   if (action !== 'delete') setMonth(entry.occurred_on.slice(0,7))
   setNotice(action === 'delete' ? '删除操作已保存到本机。' : '已保存到本机。')
   upload()
  } catch { setNotice('未能保存到本机。请释放存储空间后重试。') }
  finally { setBusy(false) }
 }
 function saveEntry(e: React.FormEvent) {
  e.preventDefault()
  if (!book || !session || scanning || busy) return
  const n = Number(amount)
  if (!Number.isSafeInteger(n) || n <= 0 || n > 2147483647) { setNotice('请输入有效的日元整数金额。'); return }
  const entry: Entry = { id: editing?.id || crypto.randomUUID(), book_id: book.id, user_id: editing?.user_id || owner,
   kind, amount:n, category, note, merchant:merchant.trim(), occurred_on:date, created_at:editing?.created_at || new Date().toISOString() }
  void persistEntry(editing ? 'update' : 'insert', entry)
 }
 function removeEntry() {
  if (editing && !busy && confirm('确定删除这笔记录吗？')) void persistEntry('delete', editing)
 }
 async function saveBudget(e:React.FormEvent){e.preventDefault();if(!db||!book)return;const n=Number(amount);if(!Number.isSafeInteger(n)||n<0||n>2147483647){setNotice('请输入有效的日元整数预算。');return}const {error}=await db.from('jz_budgets').upsert({book_id:book.id,month:month+'-01',amount:n});if(error)setNotice(error.message);else{setModal(null);void refresh()}}
 async function createBook(e:React.FormEvent){e.preventDefault();if(!db)return;const {error}=await db.rpc('jz_create_book',{book_name:bookName});if(error)setNotice(error.message);else{setModal(null);setBookName('');void loadBooks()}}
 async function createInvite(){if(!db||!book)return;const {data,error}=await db.rpc('jz_create_invite',{book:book.id});if(error)setNotice(error.message);else setInvite(`${location.origin}${location.pathname}?invite=${data}`)}

 if(!session || authMode==='reset') return <main className="auth"><section className="auth-art"><Brand/><div className="auth-story"><h1>把日子，<br/>过得有数。</h1><p>一家人的收支，记在同一本账里。</p><AuthIllustration/></div></section><section className="auth-form"><div className="auth-box"><Brand/><h2>{authMode==='signup'?'创建你的账户':authMode==='forgot'?'找回密码':authMode==='reset'?'设置新密码':'欢迎回家'}</h2><p>{authMode==='login'?'登录你的家庭账本。':authMode==='forgot'?'输入注册邮箱，接收密码重置链接。':authMode==='reset'?'输入新密码后即可继续记账。':'使用邮箱创建账户，与家人一起记账。'}</p>{!url||!key?<div className="notice">请先配置 Supabase 项目地址与公开密钥。</div>:<form onSubmit={auth}>{authMode!=='reset'&&<label>邮箱<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label>}{authMode!=='forgot'&&<label>密码<input type="password" autoComplete={authMode==='login'?'current-password':'new-password'} minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="至少 6 位字符"/></label>}<button className="primary wide" disabled={busy||!db||!online}>{busy?'请稍候…':authMode==='signup'?'创建账户':authMode==='forgot'?'发送重置邮件':authMode==='reset'?'保存新密码':'登录账本'}</button></form>}{notice&&<p className="notice" role="status">{notice}</p>}<div className="auth-links">{authMode==='login'?<><button onClick={()=>setAuthMode('signup')}>创建账户</button><button onClick={()=>setAuthMode('forgot')}>忘记密码？</button></>:<button onClick={()=>setAuthMode('login')}>返回登录</button>}</div></div></section></main>
 function navigate(next: typeof page) {
  setPage(next)
  window.scrollTo(0, 0)
 }
 const hasFilters = Boolean(query || kindFilter !== 'all' || categoryFilter !== 'all')
 function clearFilters() { setQuery(''); setKindFilter('all'); setCategoryFilter('all') }
 const nav=[{id:'home',label:'首页',icon:Home},{id:'records',label:'账目',icon:BookOpen},{id:'stats',label:'统计',icon:BarChart3},{id:'settings',label:'设置',icon:Settings}] as const
 return <div className="app"><aside className="sidebar"><Brand/><div className="workspace"><span className="workspace-icon"><Home size={18}/></span><span><small>当前账本</small><strong>{book?.name||'我的家庭'}</strong></span></div><nav>{nav.map(n=><button key={n.id} className={page===n.id?'active':''} aria-current={page===n.id?'page':undefined} onClick={()=>navigate(n.id)}><n.icon size={19}/>{n.label}</button>)}</nav><div className="sidebar-bottom"><span className="avatar">家</span><span><strong>家庭成员</strong><small>{session.user.email}</small></span></div></aside><main className="main"><header className="topbar"><div className="mobile-brand"><Brand/></div><span className="mobile-book">{book?.name}</span><div className="top-title">{page==='home'?'账本总览':page==='records'?'收支明细':page==='stats'?'收支统计':'账本设置'} <span>/ {book?.name||'我的家庭'}</span></div><button className="top-add" onClick={()=>editEntry()} disabled={!book}><Plus size={17}/> 记一笔</button><span className="top-avatar">家</span></header><div className="content">{(!online||pending>0||issue)&&<div className="notice global" role="status"><span>{[!online&&'离线模式',pending>0&&'待同步 '+pending+' 项更改',issue||(!online&&(complete?'可继续记账':'本月仅显示本机已有记录，可继续记账'))].filter(Boolean).join(' · ')}</span>{online&&issue&&<button type="button" onClick={refresh}>重试</button>}</div>}{notice&&<div className="notice global" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="关闭提示"><X size={16}/></button></div>}{!book?<section className="welcome"><h1>创建家庭账本</h1><p>创建一个家庭账本，邀请家人一起记录生活。</p><button className="primary" disabled={!online||!db} onClick={()=>setModal('book')}><Plus size={18}/> 创建家庭账本</button></section>:<>{page==='settings'?<><div className="page-heading"><div><h1>账本设置</h1><p>管理你的家庭账本与账户。</p></div></div><section className="panel settings-panel"><h2>家庭账本</h2><label>当前账本<select value={book.id} onChange={e=>setBook(books.find(b=>b.id===e.target.value)||null)}>{books.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><button className="outline" disabled={!online||!db} onClick={()=>setModal('book')}><Plus size={16}/> 创建新账本</button>{book.owner_id===session.user.id&&<div className="invite"><h3>邀请家人一起记账</h3><p>邀请链接 7 天内有效，仅可使用一次。</p><button className="outline" disabled={!online||!db} onClick={createInvite}><Users size={16}/> 生成邀请链接</button>{invite&&<><input readOnly value={invite} aria-label="邀请链接"/><button className="text-button" onClick={()=>navigator.clipboard.writeText(invite).then(()=>setNotice('邀请链接已复制。')).catch(()=>setNotice('复制失败，请手动复制链接。'))}>复制链接</button></>}</div>}<div className="invite"><h3>家庭成员 <span className="member-count">{members.length} 人</span></h3><p>成员可以查看和管理共享账目。</p><div className="members">{members.map(m=><div className="member-row" key={m.user_id}><span className="avatar">{m.email.slice(0,1).toUpperCase()}</span><span className="member-info"><strong>{m.email}</strong><small>{m.is_owner?'创建者':m.user_id===session.user.id?'我 · 成员':'成员'}</small></span>{!m.is_owner&&(book.owner_id===session.user.id||m.user_id===session.user.id)&&<button className="text-button member-remove" onClick={()=>removeMember(m)}>{m.user_id===session.user.id?'退出账本':'移除'}</button>}</div>)}</div></div></section><section className="panel settings-panel"><h2>数据备份</h2><p>将当前家庭账本的全部记录导出为 CSV 文件。</p><button className="outline" onClick={exportEntries} disabled={exporting||!online||!db}>{exporting?'正在导出…':'导出全部账目'}</button></section><section className="panel settings-panel"><h2>账户</h2><p>{session.user.email}</p><button className="outline" disabled={!online||!db} onClick={()=>db?.auth.signOut()}><LogOut size={16}/> 退出登录</button></section></>:<><div className="page-heading"><div><h1>{page==='home'?'月度总览':page==='records'?'收支明细':'收支统计'}</h1></div><div className="month-switch"><button onClick={()=>setMonth(changeMonth(month,-1))} aria-label="上个月"><ChevronLeft size={18}/></button><CalendarDays size={16}/><strong>{monthLabel(month)}</strong><button onClick={()=>setMonth(changeMonth(month,1))} aria-label="下个月"><ChevronRight size={18}/></button></div></div>{page==='home'&&<>
    <Overview entries={entries} income={income} expense={expense} month={month} budget={budget?.amount}
      onBudget={()=>{if(!online||!db){setNotice('请联网后调整月度预算。');return}setAmount(budget?String(budget.amount):'');setModal('budget')}}/>
    <div className="section-title"><h2>最近账目</h2><button className="text-button" onClick={()=>{clearFilters();navigate('records')}}>查看全部 <ChevronRight size={16}/></button></div>
    <Records entries={entries.slice(0,5)} edit={editEntry}/>
  </>}{page==='records'&&<><div className="filters"><label className="filter-search"><span>搜索账目</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索店铺、备注、分类或金额"/></label><label><span>收支类型</span><select value={kindFilter} onChange={e=>setKindFilter(e.target.value)}><option value="all">全部收支</option><option value="expense">支出</option><option value="income">收入</option></select></label><label><span>分类</span><select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="all">全部分类</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label></div><div className="filter-count" role="status"><span>{hasFilters?`找到 ${filtered.length} 笔，共 ${entries.length} 笔`:`共 ${entries.length} 笔记录`}</span>{hasFilters&&<button className="text-button" onClick={clearFilters}>清除筛选</button>}</div><Records entries={filtered} edit={editEntry} emptyText={entries.length?'没有符合条件的记录':'这个月还没有记录'}/></>}{page==='stats'&&<div className="stats-grid"><section className="panel"><h2>支出分类</h2><p className="muted">本月共支出 <strong>{money(expense)}</strong></p>{groups.length ? <>
 <ExpensePie groups={groups} total={expense}/>
 {groups.map((group,index)=>{
  const expanded=expenseCategory===group.name
  return <React.Fragment key={group.name}>
   <button type="button" className="expense-category" aria-expanded={expanded} onClick={()=>setExpenseCategory(expanded?'':group.name)}>
    <span className="pie-key" style={{background:pieColors[index]}}/>
    <strong>{group.name}</strong><span>{expensePercent.format(group.total/expense)}</span><b>{money(group.total)}</b><ChevronRight size={16}/>
   </button>
   {expanded&&<div className="expense-details"><Records entries={entries.filter(entry=>entry.kind==='expense'&&entry.category===group.name)} edit={editEntry}/></div>}
  </React.Fragment>
 })}
 </>:<Empty text="还没有支出记录"/>}</section><section className="panel"><h2>本月收支</h2><div className="summary-line"><span>收入</span><strong>{money(income)}</strong></div><div className="summary-line"><span>支出</span><strong>{money(expense)}</strong></div><div className="summary-line"><span>结余</span><strong>{money(income-expense)}</strong></div></section></div>}</>}</>}</div></main><nav className="mobile-nav">{nav.slice(0,2).map(n=><button key={n.id} aria-current={page===n.id?'page':undefined} onClick={()=>navigate(n.id)} className={page===n.id?'active':''}><n.icon size={20}/>{n.label}</button>)}<button className="mobile-plus" onClick={()=>editEntry()} disabled={!book} aria-label="记一笔"><Plus size={22}/><span>记一笔</span></button>{nav.slice(2).map(n=><button key={n.id} aria-current={page===n.id?'page':undefined} onClick={()=>navigate(n.id)} className={page===n.id?'active':''}><n.icon size={20}/>{n.label}</button>)}</nav>{modal&&<LedgerDialog title={modal==='entry'?(editing?'编辑记录':'记一笔'):modal==='budget'?'设置月度预算':'创建家庭账本'} close={()=>{if(!busy)setModal(null)}}>
  {notice&&<div className="notice dialog-notice" role="status">{notice}</div>}{modal==='entry'?<form className="entry-form" onSubmit={saveEntry}>
  <div className="entry-scroll">
  <fieldset className="entry-fields" disabled={scanning||busy}><div className="segmented" role="group" aria-label="收支类型"><button type="button" aria-pressed={kind==='expense'} className={kind==='expense'?'selected':''} onClick={()=>{setKind('expense');if(category==='工资收入')setCategory(categories[0])}}>支出</button><button type="button" aria-pressed={kind==='income'} className={kind==='income'?'selected':''} onClick={()=>{if(kind!=='income')setCategory('工资收入');setKind('income')}}>收入</button></div><label className="amount-field">金额（日元）<span><b aria-hidden="true">¥</b><input data-initial-focus type="number" inputMode="numeric" min="1" max="2147483647" step="1" required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"/></span></label>
  <fieldset className="category-picker"><legend>分类</legend><div>
    {categories.map(name=><button type="button" key={name} aria-pressed={category===name} onClick={()=>setCategory(name)}><CategoryIcon name={name}/>{name}</button>)}
  </div></fieldset>
  </fieldset>
  {!editing&&<button className="scan-toggle" aria-expanded={scanOpen} type="button" disabled={scanning||busy} onClick={()=>setScanOpen(!scanOpen)}><ScanLine size={18}/>扫描小票<ChevronRight size={16}/></button>}
  {scanOpen&&!editing&&<React.Suspense fallback={<p role="status">正在打开扫描…</p>}><ReceiptScanner disabled={busy} onBusy={setScanning} onResult={draft=>{setKind('expense');setAmount(draft.amount===undefined?'':String(draft.amount));setDate(draft.date||'');if(draft.merchant){setMerchant(draft.merchant);setCustomMerchant(false)}setCategory('其他')}}/></React.Suspense>}
  <fieldset className="entry-fields" disabled={scanning||busy}>
  <label>日期<input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label><label>店铺（选填）
 <select value={manualMerchant?'custom':merchant?`shop:${merchant}`:''} onChange={e=>{
  const selection=e.target.value
  setCustomMerchant(selection==='custom')
  setMerchant(selection.startsWith('shop:')?selection.slice(5):'')
 }}>
  <option value="">请选择店铺</option>
  {merchants.map(name=><option key={name} value={`shop:${name}`}>{name}</option>)}
  <option value="custom">手动输入店铺</option>
 </select>
</label>
{manualMerchant&&<label>店铺名称<input maxLength={100} value={merchant} onChange={e=>{setCustomMerchant(true);setMerchant(e.target.value)}} placeholder="输入店铺名称"/></label>}
<label>备注（选填）<input maxLength={200} value={note} onChange={e=>setNote(e.target.value)} placeholder="写点什么吧"/></label>{editing&&<button className="delete" type="button" onClick={removeEntry}><Trash2 size={16}/> 删除记录</button>}
  </fieldset></div><div className="entry-save"><button className="primary wide" disabled={busy||scanning}><Check size={18}/>{busy?'正在保存…':'保存记录'}</button></div></form>:modal==='budget'?<form onSubmit={saveBudget}><p className="muted">为 {monthLabel(month)} 设定一个家庭支出目标。</p><label>预算金额（日元）<input type="number" min="0" max="2147483647" step="1" required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"/></label><button className="primary wide">保存预算</button></form>:<form onSubmit={createBook}><p className="muted">给你们共同的生活空间起个名字。</p><label>账本名称<input required maxLength={40} value={bookName} onChange={e=>setBookName(e.target.value)} placeholder="例如：我们的家"/></label><button className="primary wide">创建账本</button></form>}</LedgerDialog>}</div>
}
const pieColors = ['#315f4b','#ba6943','#6380a3','#b28b37','#795d93','#397e82','#aa5471','#69764a']
const expensePercent = new Intl.NumberFormat('zh-CN',{style:'percent',maximumFractionDigits:1})
function ExpensePie({groups,total}:{groups:{name:string;total:number}[];total:number}) {
 let end=0
 const stops=groups.map((group,index)=>{
  const start=end
  end+=group.total/total*100
  return `${pieColors[index]} ${start}% ${index===groups.length-1?100:end}%`
 })
 return <div className="expense-pie" aria-hidden="true" style={{background:groups.length===1?pieColors[0]:`conic-gradient(${stops.join(', ')})`}}/>
}
function Brand(){return <div className="brand"><span className="brand-mark">柴</span><span><strong>柴米账本</strong><small>CHAIMI</small></span></div>}
createRoot(document.getElementById('root')!).render(<Bootstrap/>)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
 window.addEventListener('load', () => { void navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}) }, { once: true })
}

