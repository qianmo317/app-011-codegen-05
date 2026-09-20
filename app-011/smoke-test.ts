/* 冒烟测试：确认单全流程（生成→签字→变更→新版→旧版留存） */
import { useStore } from './src/store';

let failures = 0;
function check(cond: boolean, label: string) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}`);
  }
}

const store = () => useStore.getState();
const plan = () => store().getPlan(planId)!;

// 1. 建方案、房间、点位
const planId = store().addPlan('测试户型');
store().addRoom(planId, {
  id: 'r1',
  name: '客厅',
  polygon: [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 3000 },
    { x: 0, y: 3000 },
  ],
  heightMm: 2800,
  floorMat: 'floor',
  wallMat: 'paint',
});
store().addOutlet(planId, { id: 'o1', wallKey: 'r1-0', xMm: 500, heightMm: 300, kind: 'socket', circuit: 'L1' });
store().addOutlet(planId, { id: 'o2', wallKey: 'r1-0', xMm: 1500, heightMm: 300, kind: 'socket' });
store().addOutlet(planId, { id: 'o3', wallKey: 'r1-1', xMm: 200, heightMm: 1300, kind: 'switch', circuit: 'L2' });

console.log('1. 出具首版确认单');
let r = store().createSheet(planId);
check(r.ok, '首版出具成功');
check(plan().sheets.length === 1, '现有 1 版确认单');
const v1 = plan().sheets[0];
check(v1.points.length === 3, '确认单含 3 个点位');
check(v1.status === 'signing', '状态=签署中');
check(v1.points[0].name === '插座1' && v1.points[1].name === '插座2', '同墙同类自动编号(插座1/插座2)');
check(v1.points[0].roomName === '客厅' && v1.points[2].wallLabel === '墙2', '按房间/墙面归组信息正确');

console.log('2. 未确认完的限制');
r = store().createSheet(planId);
check(!r.ok, '签署中不能再出新版');
r = store().addChangeOrder(planId, {
  pointId: 'o1',
  pointName: '客厅·墙1·插座1',
  changeType: 'modify',
  before: { kind: 'socket', wallKey: 'r1-0', xMm: 500, heightMm: 300, circuit: 'L1' },
  after: { kind: 'socket', wallKey: 'r1-0', xMm: 500, heightMm: 350, circuit: 'L1' },
  reason: '测试',
  createdBy: '王业主',
});
check(!r.ok, '没确认完不能提变更');

console.log('3. 双方逐点签字');
for (const p of v1.points) {
  store().signPoint(planId, v1.id, p.outletId, 'master', '张师傅');
}
check(plan().sheets[0].status === 'signing', '只有师傅签完还不算对完');
for (const p of v1.points) {
  store().signPoint(planId, v1.id, p.outletId, 'owner', '王业主');
}
const v1done = plan().sheets[0];
check(v1done.status === 'confirmed', '双方签齐后状态=已确认');
check(typeof v1done.confirmedAt === 'number', '记录了确认完成时间');
check(v1done.points.every((p) => p.masterSign?.name === '张师傅' && p.ownerSign?.name === '王业主'), '每个点位都留了双方签名');

// 签名不可覆盖
const firstSignAt = v1done.points[0].masterSign!.signedAt;
store().signPoint(planId, v1done.id, v1done.points[0].outletId, 'master', '冒名者');
check(plan().sheets[0].points[0].masterSign!.name === '张师傅', '已确认的签名不可覆盖');
check(plan().sheets[0].points[0].masterSign!.signedAt === firstSignAt, '签名时间未被篡改');

console.log('4. 登记变更（改/增/删）');
r = store().addChangeOrder(planId, {
  pointId: 'o1',
  pointName: '客厅·墙1·插座1',
  changeType: 'modify',
  before: { kind: 'socket', wallKey: 'r1-0', xMm: 500, heightMm: 300, circuit: 'L1' },
  after: { kind: 'socket', wallKey: 'r1-0', xMm: 500, heightMm: 350, circuit: 'L1' },
  reason: '被沙发挡住',
  createdBy: '王业主',
});
check(r.ok, '确认后可登记修改变更');
r = store().addChangeOrder(planId, {
  pointId: 'newp1',
  pointName: '客厅·墙2·网口',
  changeType: 'add',
  after: { kind: 'net', wallKey: 'r1-1', xMm: 800, heightMm: 300, circuit: 'N1' },
  reason: '电视要接网线',
  createdBy: '张师傅',
});
check(r.ok, '可登记新增变更');
r = store().addChangeOrder(planId, {
  pointId: 'o2',
  pointName: '客厅·墙1·插座2',
  changeType: 'remove',
  before: { kind: 'socket', wallKey: 'r1-0', xMm: 1500, heightMm: 300 },
  reason: '和插座1重复',
  createdBy: '王业主',
});
check(r.ok, '可登记删除变更');
check(plan().changeOrders.length === 3, '共 3 条变更记录');
check(plan().changeOrders.every((o) => o.appliedInVersion == null), '变更均未生效');
check(plan().outlets.find((o) => o.id === 'o1')!.heightMm === 300, '变更登记后图纸尚未改动(攒着)');

console.log('5. 变更攒齐出新版');
r = store().createSheet(planId);
check(r.ok, '出具第 2 版成功');
check(plan().sheets.length === 2, '现有 2 版确认单');
const v2 = plan().sheets[1];
check(v2.version === 2 && v2.status === 'signing', 'V2 状态=签署中');
check(v2.changeOrderIds.length === 3, 'V2 记录了纳入的 3 项变更');
check(plan().changeOrders.every((o) => o.appliedInVersion === 2), '3 项变更均标记生效于 V2');
check(plan().outlets.find((o) => o.id === 'o1')!.heightMm === 350, '修改变更已应用到图纸(300→350)');
check(!plan().outlets.find((o) => o.id === 'o2'), '删除的点位已从图纸移除');
check(!!plan().outlets.find((o) => o.id === 'newp1'), '新增点位已进图纸');
check(v2.points.length === 3, 'V2 快照 3 个点位(改1删1增1)');
check(v2.points.every((p) => !p.masterSign && !p.ownerSign), '新版需重新签字');

console.log('6. 旧版留存可查');
const v1again = plan().sheets[0];
check(v1again.status === 'confirmed', 'V1 仍是已确认状态');
check(v1again.points.length === 3 && v1again.points[1].outletId === 'o2', 'V1 快照保留被删点位');
check(v1again.points[0].heightMm === 300, 'V1 快照保留改前高度(300)');

console.log('7. 无新变更不能再出水版');
r = store().createSheet(planId);
check(!r.ok, 'V2 未确认完不能出新版');
for (const p of plan().sheets[1].points) {
  store().signPoint(planId, v2.id, p.outletId, 'master', '张师傅');
  store().signPoint(planId, v2.id, p.outletId, 'owner', '王业主');
}
check(plan().sheets[1].status === 'confirmed', 'V2 签齐确认');
r = store().createSheet(planId);
check(!r.ok, '没有待生效变更时不出新版');

console.log(failures === 0 ? '\n全部通过 ✅' : `\n${failures} 项失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
