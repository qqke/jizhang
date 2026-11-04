import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { ReceiptScanner } from '../src/ReceiptScanner'
import '../src/style.css'
function Harness(){const [draft,setDraft]=useState({});const [busy,setBusy]=useState(false);return <main style={{maxWidth:440,padding:20,margin:'auto'}}><h2>小票识别测试</h2><ReceiptScanner onBusy={setBusy} onResult={setDraft}/><pre id="result">{JSON.stringify(draft)}</pre><button disabled={busy}>确认并保存记录（测试）</button></main>}
createRoot(document.getElementById('root')!).render(<Harness/> )
