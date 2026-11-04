export type LedgerEntry = { kind: 'expense' | 'income'; amount: number; category: string; note: string; occurred_on: string }
export function filterEntries<T extends LedgerEntry>(entries: T[], query: string, kind: string, category: string): T[] {
 const q = query.trim().toLocaleLowerCase()
 return entries.filter(e => (kind === 'all' || e.kind === kind) && (category === 'all' || e.category === category) && (!q || `${e.category} ${e.note} ${e.amount}`.toLocaleLowerCase().includes(q)))
}
export function csvText(entries: LedgerEntry[]): string {
 const cell = (value: string | number) => { let text = String(value); if (/^[\s\u0000-\u001f]*[=+@\-\t\r]/.test(text)) text = "'" + text; return `"${text.replace(/"/g, '""')}"` }
 return '\ufeff' + [['日期','类型','分类','金额（日元）','备注'], ...entries.map(e => [e.occurred_on, e.kind === 'income' ? '收入' : '支出', e.category, e.amount, e.note])].map(row => row.map(cell).join(',')).join('\r\n')
}
