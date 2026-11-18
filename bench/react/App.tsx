import React from 'react'
import {createRoot} from 'react-dom/client'
function App() { return <main style={{padding:20,display:'grid',gap:12,fontFamily:'system-ui'}}>
<div style={{fontSize:24}}>月度总览</div><div>本月支出　¥6290</div><div>最近账目</div>
<div>周末午餐　¥1280</div>
<div>超市采购　¥3460</div>
<div>电车通勤　¥420</div>
<div>咖啡　¥380</div>
<div>家庭用品　¥750</div><button>记一笔</button></main> }
createRoot(document.querySelector('#root')).render(<App/>)
