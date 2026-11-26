import { LogOut, Plus, Users } from 'lucide-react'
import type { Identity } from './connection'
import type { Book } from './local-ledger'
import { ThemePicker, type useDeviceTheme } from './ThemePicker'

export type Member = { user_id: string; email: string; joined_at: string; is_owner: boolean }

type Props = {
 appearance: ReturnType<typeof useDeviceTheme>
 book: Book
 books: Book[]
 user: Identity['user']
 connected: boolean
 members: Member[]
 invite: string
 exporting: boolean
 setBook: (book: Book | null) => void
 createBook: () => void
 createInvite: () => void
 removeMember: (member: Member) => void
 exportEntries: () => void
 setNotice: (notice: string) => void
 signOut: () => void
}

export default function SettingsPage({ appearance, book, books, user, connected, members, invite, exporting,
 setBook, createBook, createInvite, removeMember, exportEntries, setNotice, signOut }: Props) {
 return <>
  <div className="page-heading">
   <div><h1>账本设置</h1><p>管理你的家庭账本与账户。</p></div>
  </div>
  <ThemePicker {...appearance}/>
  <section className="panel settings-panel">
   <h2>家庭账本</h2>
   <label>当前账本
    <select value={book.id} onChange={e=>setBook(books.find(b=>b.id===e.target.value)||null)}>
     {books.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
   </label>
   <button className="outline" disabled={!connected} onClick={createBook}><Plus size={16}/> 创建新账本</button>
   {book.owner_id===user.id&&<div className="invite">
    <h3>邀请家人一起记账</h3>
    <p>邀请链接 7 天内有效，仅可使用一次。</p>
    <button className="outline" disabled={!connected} onClick={createInvite}><Users size={16}/> 生成邀请链接</button>
    {invite&&<>
     <input readOnly value={invite} aria-label="邀请链接"/>
     <button className="text-button" onClick={()=>navigator.clipboard.writeText(invite)
      .then(()=>setNotice('邀请链接已复制。'))
      .catch(()=>setNotice('复制失败，请手动复制链接。'))}>复制链接</button>
    </>}
   </div>}
   <div className="invite">
    <h3>家庭成员 <span className="member-count">{members.length} 人</span></h3>
    <p>成员可以查看和管理共享账目。</p>
    <div className="members">
     {members.map(m=><div className="member-row" key={m.user_id}>
      <span className="avatar">{m.email.slice(0,1).toUpperCase()}</span>
      <span className="member-info">
       <strong>{m.email}</strong><small>{m.is_owner?'创建者':m.user_id===user.id?'我 · 成员':'成员'}</small>
      </span>
      {!m.is_owner&&(book.owner_id===user.id||m.user_id===user.id)&&
       <button className="text-button member-remove" onClick={()=>removeMember(m)}>
        {m.user_id===user.id?'退出账本':'移除'}
       </button>}
     </div>)}
    </div>
   </div>
  </section>
  <section className="panel settings-panel">
   <h2>数据备份</h2>
   <p>将当前家庭账本的全部记录导出为 CSV 文件。</p>
   <button className="outline" onClick={exportEntries} disabled={exporting||!connected}>
    {exporting?'正在导出…':'导出全部账目'}
   </button>
  </section>
  <section className="panel settings-panel">
   <h2>账户</h2>
   <p>{user.email}</p>
   <button className="outline" disabled={!connected} onClick={signOut}><LogOut size={16}/> 退出登录</button>
  </section>
 </>
}
