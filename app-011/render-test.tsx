/* 渲染冒烟：各页面在种子数据下能完整渲染 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import App from './src/App';
import { useStore } from './src/store';

const store = () => useStore.getState();
const planId = store().addPlan('渲染测试');
store().addRoom(planId, {
  id: 'r1',
  name: '主卧',
  polygon: [
    { x: 0, y: 0 },
    { x: 3600, y: 0 },
    { x: 3600, y: 3200 },
    { x: 0, y: 3200 },
  ],
  heightMm: 2800,
  floorMat: 'floor',
  wallMat: 'paint',
});
store().addOutlet(planId, { id: 'o1', wallKey: 'r1-0', xMm: 600, heightMm: 300, kind: 'socket', circuit: 'L1', name: '床头插座' });
store().addOutlet(planId, { id: 'o2', wallKey: 'r1-1', xMm: 150, heightMm: 1300, kind: 'switch' });
store().createSheet(planId);
const sheet = store().getPlan(planId)!.sheets[0];
store().signPoint(planId, sheet.id, 'o1', 'master', '张师傅');
store().signPoint(planId, sheet.id, 'o1', 'owner', '李业主');
store().signPoint(planId, sheet.id, 'o2', 'master', '张师傅');
store().signPoint(planId, sheet.id, 'o2', 'owner', '李业主');
store().addChangeOrder(planId, {
  pointId: 'o1',
  pointName: '主卧·墙1·床头插座',
  changeType: 'modify',
  before: { kind: 'socket', wallKey: 'r1-0', xMm: 600, heightMm: 300, circuit: 'L1', name: '床头插座' },
  after: { kind: 'socket', wallKey: 'r1-0', xMm: 700, heightMm: 350, circuit: 'L1', name: '床头插座' },
  reason: '床头柜挡了',
  createdBy: '李业主',
});
store().createSheet(planId);

const routes = ['/', `/plan/${planId}`, `/plan/${planId}/walls`, `/plan/${planId}/signoff`, `/plan/${planId}/bom`, `/plan/${planId}/print`];
let fail = 0;
for (const r of routes) {
  try {
    const html = renderToString(
      React.createElement(MemoryRouter, { initialEntries: [r] }, React.createElement(App))
    ).replace(/<!-- -->/g, ''); // SSR 在文本节点间插注释，先抹平再断言
    console.log(`  ✓ ${r} (${html.length} chars)`);
    if (r.endsWith('signoff')) {
      // 默认展示最新版 V2（签署中），V1 在版本签里可翻
      const must = ['水电交底确认单', '第2版', '床头插座', '师傅签字', '业主签字', '变更单', '床头柜挡了', 'V1', '李业主', '已生效于V2', '签署中'];
      for (const m of must) {
        if (!html.includes(m)) {
          fail++;
          console.error(`    ✗ 确认单页缺少内容: ${m}`);
        }
      }
    }
  } catch (e) {
    fail++;
    console.error(`  ✗ ${r}:`, e);
  }
}
console.log(fail === 0 ? '渲染全部通过 ✅' : `${fail} 处失败 ❌`);
process.exit(fail ? 1 : 0);
