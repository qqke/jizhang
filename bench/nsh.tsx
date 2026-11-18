import { mount, Text, View } from 'nsh'
function App() { return <View style={{padding:20,gap:12}}>
<Text style={{fontSize:24}}>月度总览</Text><Text>本月支出　¥6290</Text>
<Text>最近账目</Text><Text>周末午餐　¥1280</Text>
<Text>超市采购　¥3460</Text>
<Text>电车通勤　¥420</Text>
<Text>咖啡　¥380</Text>
<Text>家庭用品　¥750</Text><View onPress={()=>{}}><Text>记一笔</Text></View></View> }
mount(App)
