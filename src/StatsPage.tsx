import React, { useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { Empty, Records, money } from './LedgerView'
import type { Entry } from './local-ledger'

type Props = {
 entries: Entry[]
 income: number
 expense: number
 complete: boolean
 expenseCategory: string
 setExpenseCategory: (category: string) => void
 highlightId?: string
 editEntry: (entry: Entry) => void
 showRecords: (category: string) => void
}

export default function StatsPage({ entries, income, expense, complete, expenseCategory, setExpenseCategory,
 highlightId, editEntry, showRecords }: Props) {
 const groups=useMemo(()=>{
  const totals=new Map<string,number>()
  for(const entry of entries)if(entry.kind==='expense'){
   totals.set(entry.category,(totals.get(entry.category)??0)+entry.amount)
  }
  return Array.from(totals,([name,total])=>({name,total})).sort((a,b)=>b.total-a.total)
 },[entries])
 return <div className="stats-grid"><section className="panel"><h2>支出分类</h2><p className="muted">{complete ? '本月共支出' : '本机已记录支出'} <strong>{money(expense)}</strong></p>{groups.length ? <>
 <ExpensePie groups={groups} total={expense}/>
 {groups.map((group,index)=>{
  const expanded=expenseCategory===group.name
  const details = expanded ? entries.filter(entry => entry.kind === 'expense' && entry.category === group.name) : []
  return <React.Fragment key={group.name}>
   <button type="button" className="expense-category" aria-expanded={expanded} onClick={()=>setExpenseCategory(expanded?'':group.name)}>
    <span className="pie-key" style={{background:pieColors[index % pieColors.length]}}/>
    <strong>{group.name}</strong><span>{expensePercent.format(group.total/expense)}</span><b>{money(group.total)}</b><ChevronRight size={16}/>
   </button>
   {expanded&&<div className="expense-details"><Records highlightId={highlightId} entries={details.slice(0,5)} edit={editEntry}/>
    {details.length > 5 && <button className="text-button more-records" onClick={()=>showRecords(group.name)}>查看全部 {details.length} 笔<ChevronRight size={16}/></button>}</div>}
  </React.Fragment>
 })}
 </>:<Empty text="还没有支出记录"/>}</section><section className="panel"><h2>{complete ? '本月收支' : '本机已记录收支'}</h2><div className="summary-line"><span>收入</span><strong>{money(income)}</strong></div><div className="summary-line"><span>支出</span><strong>{money(expense)}</strong></div><div className="summary-line"><span>结余</span><strong>{money(income-expense)}</strong></div></section></div>
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
