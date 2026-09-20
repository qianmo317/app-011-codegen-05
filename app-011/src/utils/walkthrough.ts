import type {
  ChangeOrder,
  Outlet,
  OutletKind,
  Plan,
  Room,
  SheetRow,
  SignRole,
  WalkthroughSheet,
} from '../types';

export const KIND_LABEL: Record<OutletKind, string> = {
  socket: '插座',
  switch: '开关',
  net: '网口',
  light: '灯位',
  water: '水口',
};

export const ROLE_LABEL: Record<SignRole, string> = {
  worker: '师傅',
  owner: '业主',
};

export function parseWallKey(wallKey: string): { roomId: string; wallIndex: number } | null {
  const idx = wallKey.lastIndexOf('-');
  if (idx < 0) return null;
  const roomId = wallKey.slice(0, idx);
  const wallIndex = parseInt(wallKey.slice(idx + 1), 10);
  if (!roomId || Number.isNaN(wallIndex)) return null;
  return { roomId, wallIndex };
}

export function makeWallKey(roomId: string, wallIndex: number): string {
  return `${roomId}-${wallIndex}`;
}

/** 没起名的点位给个兜底叫法：「客厅 墙2 插座 #3」 */
export function outletDefaultName(
  outlet: Outlet,
  rooms: Room[],
  sameKindIndex?: number
): { label: string; roomName: string; wallName: string } {
  const parsed = parseWallKey(outlet.wallKey);
  const room = parsed ? rooms.find((r) => r.id === parsed.roomId) : undefined;
  const roomName = room?.name || '未知房间';
  const wallName = parsed ? `墙${parsed.wallIndex + 1}` : '未知墙面';
  const base = outlet.label?.trim();
  if (base) return { label: base, roomName, wallName };
  const suffix = sameKindIndex && sameKindIndex > 0 ? ` #${sameKindIndex + 1}` : '';
  return { label: `${wallName}${KIND_LABEL[outlet.kind]}${suffix}`, roomName, wallName };
}

/** 把当前方案里的点位摊平成确认单行；carryFrom 用于沿用上一版的签名 */
export function buildRows(
  plan: Pick<Plan, 'rooms' | 'outlets'>,
  carryFrom?: SheetRow[]
): SheetRow[] {
  const carryMap = new Map<string, SheetRow>();
  carryFrom?.forEach((r) => carryMap.set(r.outletId, r));
  const kindCounter: Record<string, number> = {};

  const rows: SheetRow[] = [];
  for (const o of plan.outlets) {
    const parsed = parseWallKey(o.wallKey);
    const room = parsed ? plan.rooms.find((r) => r.id === parsed.roomId) : undefined;
    const roomName = room?.name || '未知房间';
    const wallIndex = parsed?.wallIndex ?? 0;
    const wallName = parsed ? `墙${parsed.wallIndex + 1}` : '未知墙面';
    const key = `${roomName}-${wallName}-${o.kind}`;
    const nth = kindCounter[key] ?? 0;
    kindCounter[key] = nth + 1;
    const { label } = outletDefaultName(o, plan.rooms, nth);
    const previous = carryMap.get(o.id);

    rows.push({
      outletId: o.id,
      label: o.label?.trim() || label,
      kind: o.kind,
      roomId: parsed?.roomId || '',
      roomName,
      wallIndex,
      wallName,
      xMm: o.xMm,
      heightMm: o.heightMm,
      circuit: o.circuit || '',
      // 点位属性完全没变才沿用旧签名；任何一项变了都要重签
      confirmation:
        previous && isSamePoint(previous, o)
          ? {
              worker: previous.confirmation.worker
                ? { ...previous.confirmation.worker }
                : undefined,
              owner: previous.confirmation.owner
                ? { ...previous.confirmation.owner }
                : undefined,
            }
          : {},
    });
  }
  return sortRows(rows);
}

function isSamePoint(row: SheetRow, o: Outlet): boolean {
  return (
    row.xMm === o.xMm &&
    row.heightMm === o.heightMm &&
    row.circuit === (o.circuit || '') &&
    row.kind === o.kind &&
    row.label === (o.label?.trim() || row.label)
  );
}

/** 按房间顺序、墙面顺序、离墙距离排序，方便交底时沿墙逐个对 */
export function sortRows(rows: SheetRow[]): SheetRow[] {
  return [...rows].sort((a, b) => {
    if (a.roomName !== b.roomName) return a.roomName.localeCompare(b.roomName, 'zh-Hans-CN');
    if (a.wallIndex !== b.wallIndex) return a.wallIndex - b.wallIndex;
    return a.xMm - b.xMm;
  });
}

/** 按房间、墙面分组 */
export function groupRows(rows: SheetRow[]): Map<string, Map<string, SheetRow[]>> {
  const byRoom = new Map<string, Map<string, SheetRow[]>>();
  for (const row of sortRows(rows)) {
    let byWall = byRoom.get(row.roomName);
    if (!byWall) {
      byWall = new Map();
      byRoom.set(row.roomName, byWall);
    }
    const list = byWall.get(row.wallName) || [];
    list.push(row);
    byWall.set(row.wallName, list);
  }
  return byRoom;
}

export function isRowSigned(row: SheetRow): boolean {
  return Boolean(row.confirmation.worker && row.confirmation.owner);
}

export function sheetProgress(rows: SheetRow[]): { signed: number; total: number } {
  const total = rows.length;
  const signed = rows.filter(isRowSigned).length;
  return { signed, total };
}

/** 整版全部双方签完才算「对完」；空单不算 */
export function isSheetFullyConfirmed(sheet: WalkthroughSheet): boolean {
  return (
    sheet.rows.length > 0 && sheet.rows.every((r) => isRowSigned(r))
  );
}

export interface ChangeDraft {
  kind: ChangeOrder['kind'];
  outletId: string;
  label: string;
  reason: string;
  before?: ChangeOrder['before'];
  after?: ChangeOrder['after'];
  wallKey?: string;
}

/** 生成新点位 id */
export function newOutletId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function newChangeId(): string {
  return 'chg_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * 发布新版本：应用全部待处理变更到底层点位，重建行快照（未变动点位沿用签名），
 * 旧版本整体封存。返回新 sheet 与应用后的方案点位（由 store 一并落库）。
 */
export function publishVersion(
  sheet: WalkthroughSheet,
  plan: Pick<Plan, 'rooms' | 'outlets'>,
  params: { name: string; role: SignRole; note: string; at: number }
): { sheet: WalkthroughSheet; outlets: Outlet[] } {
  const pending = sheet.changes.filter((c) => c.status === 'pending');

  // 先把待处理变更应用到 outlets 上
  let outlets = plan.outlets.map((o) => ({ ...o }));
  const modifySet = new Map<string, ChangeOrder>();
  for (const c of pending) {
    if (c.kind === 'add') {
      const after = c.after || {};
      outlets.push({
        id: c.outletId,
        wallKey: c.wallKey || '',
        label: after.label || c.label,
        kind: after.kind || 'socket',
        xMm: after.xMm ?? 0,
        heightMm: after.heightMm ?? 300,
        circuit: after.circuit || undefined,
      });
    } else if (c.kind === 'remove') {
      outlets = outlets.filter((o) => o.id !== c.outletId);
    } else {
      modifySet.set(c.outletId, c);
    }
  }
  outlets = outlets.map((o) => {
    const c = modifySet.get(o.id);
    if (!c || !c.after) return o;
    const a = c.after;
    return {
      ...o,
      label: a.label !== undefined ? a.label : o.label,
      kind: a.kind !== undefined ? a.kind : o.kind,
      xMm: a.xMm !== undefined ? a.xMm : o.xMm,
      heightMm: a.heightMm !== undefined ? a.heightMm : o.heightMm,
      circuit: a.circuit !== undefined ? a.circuit || undefined : o.circuit,
    };
  });

  const newVersionNo = sheet.currentVersion + 1;
  const planWithOutlets: Pick<Plan, 'rooms' | 'outlets'> = {
    rooms: plan.rooms,
    outlets,
  };
  const rows = buildRows(planWithOutlets, sheet.rows);

  const changes = sheet.changes.map((c) =>
    c.status === 'pending'
      ? { ...c, status: 'applied' as const, appliedVersion: newVersionNo, appliedAt: params.at }
      : c
  );

  const newSheet: WalkthroughSheet = {
    ...sheet,
    currentVersion: newVersionNo,
    rows,
    changes,
    versions: [
      ...sheet.versions,
      {
        version: newVersionNo,
        createdAt: params.at,
        createdByName: params.name,
        createdByRole: params.role,
        note: params.note.trim(),
        rows: rows.map((r) => ({
          ...r,
          confirmation: {
            worker: r.confirmation.worker ? { ...r.confirmation.worker } : undefined,
            owner: r.confirmation.owner ? { ...r.confirmation.owner } : undefined,
          },
        })),
      },
    ],
  };

  return { sheet: newSheet, outlets };
}

/** 首次建档：基于当前点位出第 1 版 */
export function createSheet(
  plan: Pick<Plan, 'rooms' | 'outlets' | 'id'>,
  params: { name: string; role: SignRole; note: string; at: number }
): WalkthroughSheet {
  const rows = buildRows(plan);
  const sheet: WalkthroughSheet = {
    id: 'sheet_' + Math.random().toString(36).slice(2) + Date.now().toString(36),
    planId: plan.id,
    createdAt: params.at,
    currentVersion: 1,
    rows,
    versions: [
      {
        version: 1,
        createdAt: params.at,
        createdByName: params.name,
        createdByRole: params.role,
        note: params.note.trim(),
        rows: rows.map((r) => ({
          ...r,
          confirmation: {},
        })),
      },
    ],
    changes: [],
  };
  return sheet;
}

/* ---------- 变更内容的可读化（用于确认单上展示） ---------- */

export function describeField(
  field: 'label' | 'xMm' | 'heightMm' | 'circuit' | 'kind',
  value: string | number | OutletKind | undefined
): string {
  if (value === undefined || value === '') return '空';
  switch (field) {
    case 'label':
      return String(value);
    case 'xMm':
      return `离墙 ${value}mm`;
    case 'heightMm':
      return `离地 ${value}mm`;
    case 'circuit':
      return `${value} 路`;
    case 'kind':
      return KIND_LABEL[value as OutletKind];
  }
}

export const FIELD_LABEL: Record<'label' | 'xMm' | 'heightMm' | 'circuit' | 'kind', string> = {
  label: '名称',
  xMm: '离墙距离',
  heightMm: '离地高度',
  circuit: '回路',
  kind: '类型',
};

export function changeFieldDiffs(c: ChangeOrder): Array<{
  field: keyof typeof FIELD_LABEL;
  before?: string | number | OutletKind;
  after?: string | number | OutletKind;
}> {
  const fields: Array<keyof typeof FIELD_LABEL> = ['label', 'kind', 'xMm', 'heightMm', 'circuit'];
  const result: Array<{
    field: keyof typeof FIELD_LABEL;
    before?: string | number | OutletKind;
    after?: string | number | OutletKind;
  }> = [];
  for (const f of fields) {
    const before = c.before?.[f];
    const after = c.after?.[f];
    const norm = (v: unknown) => (v === undefined ? undefined : v);
    if (JSON.stringify(norm(before)) !== JSON.stringify(norm(after))) {
      result.push({ field: f, before: before as never, after: after as never });
    }
  }
  return result;
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-Hans-CN', { hour12: false });
}
