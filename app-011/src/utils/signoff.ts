import type {
  ChangeOrder,
  ConfirmSheet,
  Outlet,
  OutletKind,
  Plan,
  PointSpec,
  SheetPoint,
} from '../types';

export const KIND_LABELS: Record<OutletKind, string> = {
  socket: '插座',
  switch: '开关',
  net: '网口',
  light: '灯位',
  water: '水口',
};

export function kindLabel(kind: OutletKind): string {
  return KIND_LABELS[kind] ?? kind;
}

/** 由 wallKey (`${roomId}-${wallIndex}`) 找到所属房间与墙序号 */
export function locateWall(plan: Plan, wallKey: string): { roomName: string; wallLabel: string } {
  const room = plan.rooms.find((r) => wallKey.startsWith(`${r.id}-`));
  if (!room) return { roomName: '未知房间', wallLabel: '未知墙' };
  const wallIndex = parseInt(wallKey.slice(room.id.length + 1), 10);
  return { roomName: room.name, wallLabel: `墙${Number.isNaN(wallIndex) ? '?' : wallIndex + 1}` };
}

/** 点位的完整称呼：房间·墙面·名称 */
export function pointFullName(p: { roomName: string; wallLabel: string; name: string }): string {
  return `${p.roomName}·${p.wallLabel}·${p.name}`;
}

/**
 * 把当前点位列表转成确认单快照。
 * 未命名的点位按「同墙同类」自动编号：插座1、插座2……
 */
export function buildSheetPoints(plan: Plan, outlets: Outlet[]): SheetPoint[] {
  const counters = new Map<string, number>();
  return outlets.map((o) => {
    const { roomName, wallLabel } = locateWall(plan, o.wallKey);
    let name = o.name?.trim();
    if (!name) {
      const key = `${o.wallKey}-${o.kind}`;
      const n = (counters.get(key) ?? 0) + 1;
      counters.set(key, n);
      name = `${kindLabel(o.kind)}${n}`;
    }
    return {
      outletId: o.id,
      name,
      kind: o.kind,
      roomName,
      wallLabel,
      xMm: o.xMm,
      heightMm: o.heightMm,
      circuit: o.circuit,
    };
  });
}

export function specFromOutlet(o: Outlet): PointSpec {
  return {
    name: o.name,
    kind: o.kind,
    wallKey: o.wallKey,
    xMm: o.xMm,
    heightMm: o.heightMm,
    circuit: o.circuit,
  };
}

/** 一张确认单是否「对完」：每个点位都有师傅和业主双方签名 */
export function isSheetComplete(sheet: ConfirmSheet): boolean {
  return sheet.points.length > 0 && sheet.points.every((p) => p.masterSign && p.ownerSign);
}

export function sheetSignProgress(sheet: ConfirmSheet): { signed: number; total: number } {
  const total = sheet.points.length * 2;
  const signed = sheet.points.reduce(
    (s, p) => s + (p.masterSign ? 1 : 0) + (p.ownerSign ? 1 : 0),
    0
  );
  return { signed, total };
}

/** 已进入任意一版确认单的点位，不许在点位编辑里原地删改 */
export function lockedOutletIds(plan: Plan): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of plan.sheets ?? []) {
    for (const p of s.points) {
      if (!map.has(p.outletId)) map.set(p.outletId, s.version);
    }
  }
  return map;
}

/** 变更内容的人话描述：改成什么样 */
export function describeChange(order: ChangeOrder, plan?: Plan): string {
  const loc = (wallKey: string) => {
    if (!plan) return '';
    const { roomName, wallLabel } = locateWall(plan, wallKey);
    return `${roomName}·${wallLabel} `;
  };
  if (order.changeType === 'add' && order.after) {
    const a = order.after;
    return `新增 ${loc(a.wallKey)}${a.name || kindLabel(a.kind)}，离地${a.heightMm}mm，离墙${a.xMm}mm${a.circuit ? `，回路${a.circuit}` : ''}`;
  }
  if (order.changeType === 'remove' && order.before) {
    const b = order.before;
    return `删除 ${loc(b.wallKey)}${b.name || kindLabel(b.kind)}（离地${b.heightMm}mm，离墙${b.xMm}mm）`;
  }
  if (order.changeType === 'modify' && order.before && order.after) {
    const diffs: string[] = [];
    const b = order.before;
    const a = order.after;
    if ((b.name || '') !== (a.name || '')) diffs.push(`名称 ${b.name || kindLabel(b.kind)}→${a.name || kindLabel(a.kind)}`);
    if (b.kind !== a.kind) diffs.push(`类型 ${kindLabel(b.kind)}→${kindLabel(a.kind)}`);
    if (b.heightMm !== a.heightMm) diffs.push(`离地 ${b.heightMm}→${a.heightMm}mm`);
    if (b.xMm !== a.xMm) diffs.push(`离墙 ${b.xMm}→${a.xMm}mm`);
    if ((b.circuit || '') !== (a.circuit || '')) diffs.push(`回路 ${b.circuit || '无'}→${a.circuit || '无'}`);
    return diffs.length > 0 ? diffs.join('；') : '内容不变';
  }
  return '';
}

/** 把积攒的变更应用到点位列表上，返回新列表 */
export function applyChangeOrders(outlets: Outlet[], orders: ChangeOrder[]): Outlet[] {
  let result = [...outlets];
  for (const o of orders) {
    if (o.changeType === 'add' && o.after) {
      result.push({ id: o.pointId, ...o.after });
    } else if (o.changeType === 'remove') {
      result = result.filter((x) => x.id !== o.pointId);
    } else if (o.changeType === 'modify' && o.after) {
      result = result.map((x) => (x.id === o.pointId ? { ...x, ...o.after } : x));
    }
  }
  return result;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
