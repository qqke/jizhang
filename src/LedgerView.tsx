import { useLayoutEffect, useRef, type ReactNode } from 'react'
import {
  ArrowDownLeft, ArrowUpRight, Banknote, BookOpen, ChevronRight, Gamepad2,
  HeartPulse, House, Pencil, ReceiptText, Shapes, ShoppingBag, TrainFront,
  Utensils, Wallet, X,
} from 'lucide-react'
import type { LedgerEntry } from './ledger'

const categoryIcons = {
  '餐饮美食': Utensils, '日常购物': ShoppingBag, '交通出行': TrainFront, '居家生活': House,
  '休闲娱乐': Gamepad2, '医疗健康': HeartPulse, '工资收入': Banknote, '其他': Shapes,
}
export const categories = Object.keys(categoryIcons)
const yen = new Intl.NumberFormat('ja-JP')
let weekday: Intl.DateTimeFormat | undefined
function weekdayLabel(date: string) {
  weekday ??= new Intl.DateTimeFormat('zh-CN', { weekday: 'short' })
  return weekday.format(new Date(date + 'T12:00:00'))
}
export const money = (amount: number) => `¥${yen.format(amount)}`

export function CategoryIcon({ name }: { name: string }) {
  const Icon = categoryIcons[name as keyof typeof categoryIcons] ?? Shapes
  return <span aria-hidden="true" className="category-icon" data-category={name}><Icon size={18}/></span>
}

export function Empty({ text }: { text: string }) {
  return <div className="empty"><ReceiptText aria-hidden="true" size={26}/><strong>{text}</strong></div>
}

export function Records<T extends LedgerEntry & { id: string }>({ entries, edit, highlightId, emptyText = '这个月还没有记录' }: {
  entries: T[]; edit: (entry: T) => void; emptyText?: string; highlightId?: string
}) {
  if (!entries.length) return <div className="records"><Empty text={emptyText}/></div>
  const days = new Map<string, T[]>()
  for (const entry of entries) {
    const day = days.get(entry.occurred_on)
    if (day) day.push(entry)
    else days.set(entry.occurred_on, [entry])
  }
  return <div className="records">{Array.from(days, ([date, rows]) =>
    <section key={date} className="record-day">
      <h3><time dateTime={date}>{Number(date.slice(5, 7))}月{Number(date.slice(8))}日</time>
        <span>{weekdayLabel(date)}</span></h3>
      {rows.map(entry => <button className="record" data-saved={entry.id === highlightId || undefined} key={entry.id} onClick={() => edit(entry)}>
        <CategoryIcon name={entry.category}/>
        <span className="record-name"><strong>{entry.merchant || entry.category}</strong>
          {(entry.merchant || entry.note) && <small>{[entry.merchant && entry.category, entry.note].filter(Boolean).join(' · ')}</small>}
        </span>
        <span className={entry.kind}>{entry.kind === 'income' ? '+' : '−'}{money(entry.amount)}</span>
        <ChevronRight size={15} className="record-arrow"/>
      </button>)}
    </section>)}</div>
}

export function Overview({ entries, income, expense, month, budget, onBudget }: {
  entries: LedgerEntry[]; income: number; expense: number; month: string; budget: number | undefined; onBudget: () => void
}) {
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()
  const totals = Array<number>(days).fill(0)
  for (const entry of entries) {
    if (entry.kind === 'expense') totals[Number(entry.occurred_on.slice(8)) - 1] += entry.amount
  }
  const peak = Math.max(0, ...totals)
  const overBudget = budget !== undefined && expense > budget
  const spent = budget ? Math.min(100, expense / budget * 100) : overBudget ? 100 : 0
  return <div className="overview">
    <section className="overview-main">
      <div className="balance-block"><span>月度结余</span><strong className="balance">{money(income - expense)}</strong></div>
      <figure className="daily-chart" aria-label={`每日支出，单日最高 ${money(peak)}`}>
        <figcaption>每日支出</figcaption><div className="daily-bars" aria-hidden="true">
          {totals.map((total, index) => <i key={index} data-empty={total === 0}
            style={{ height: total ? `${Math.max(8, total / peak * 100)}%` : '2px' }} title={`${index + 1}日 · ${money(total)}`}/>)}
        </div><div className="chart-axis"><span>1日</span><span>{days}日</span></div>
      </figure>
      <div className="overview-bottom">
        <div><span><ArrowDownLeft size={15}/>月收入</span><b>{money(income)}</b></div>
        <div><span><ArrowUpRight size={15}/>月支出</span><b>{money(expense)}</b></div>
      </div>
    </section>
    <section className="budget-card" data-over={overBudget}>
      <div className="card-heading"><h2><Wallet size={18}/> 月度预算</h2>
        <button className="text-button" onClick={onBudget}><Pencil size={14}/>{budget === undefined ? '设置预算' : '调整预算'}</button></div>
      <div className="budget-number">{budget === undefined ? '尚未设置' : money(Math.abs(budget - expense))}
        {budget !== undefined && <small>{overBudget ? '已超支' : '可用'}</small>}</div>
      <div className="progress"><span style={{ width: spent + '%' }}/></div>
      <div className="budget-meta"><span>已用 {money(expense)}</span><span>预算 {budget === undefined ? '—' : money(budget)}</span></div>
    </section>
  </div>
}

export function AuthIllustration() {
  return <div className="sample-paper" aria-hidden="true">
    <div className="sample-title"><BookOpen size={19}/><b>家庭账页</b><span>示例</span></div>
    {[['餐饮美食', '周末午餐', '−¥1,280'], ['日常购物', '超市采购', '−¥3,460'], ['交通出行', '电车通勤', '−¥420']].map(([category, title, price]) =>
      <div className="sample-line" key={category}><CategoryIcon name={category}/><span>{title}</span><b>{price}</b></div>)}
  </div>
}

export function LedgerDialog({ title, close, closing, children }: { title: string; closing: boolean; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    dialog.showModal()
    const target = window.matchMedia('(pointer: fine)').matches
      ? dialog.querySelector<HTMLElement>('[data-initial-focus]') : null
    ;(target ?? dialog.querySelector<HTMLElement>('h2'))?.focus({ preventScroll: true })
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={ref} className="dialog" inert={closing} data-closing={closing || undefined} aria-labelledby="dialog-title"
    onCancel={event => { event.preventDefault(); close() }}
    onClick={event => { if (event.target === ref.current) {
      const rect = ref.current.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
    } }}>
    <div className="dialog-head"><h2 tabIndex={-1} id="dialog-title">{title}</h2>
      <button type="button" onClick={close} aria-label="关闭"><X size={20}/></button></div>
    {children}
  </dialog>
}
