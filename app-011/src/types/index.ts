export interface Pt {
  x: number;
  y: number;
}

export interface Room {
  id: string;
  name: string;
  polygon: Pt[];
  heightMm: number;
  floorMat: string;
  wallMat: string;
}

export type OpeningType = 'door' | 'window' | 'arch' | 'sliding';

export interface Opening {
  id: string;
  roomId: string;
  wallIndex: number;
  offsetMm: number;
  widthMm: number;
  heightMm: number;
  type: OpeningType;
}

export type OutletKind = 'socket' | 'switch' | 'net' | 'light' | 'water';

export interface Outlet {
  id: string;
  wallKey: string;
  /** 点位名称，如「沙发左插座」 */
  label?: string;
  xMm: number;
  heightMm: number;
  kind: OutletKind;
  circuit?: string;
}

/** 交底现场角色：师傅 / 业主 */
export type SignRole = 'worker' | 'owner';

export interface PointSignature {
  role: SignRole;
  /** 签名（姓名） */
  name: string;
  time: number;
}

/** 一次点位交底确认的留痕（师傅、业主各签各的） */
export interface PointConfirmation {
  worker?: PointSignature;
  owner?: PointSignature;
}

/**
 * 确认单某一版里的一行：某个点位在该版下的全部信息与签名。
 * 快照式存储——房间/墙面名称也一并固化，旧版不随后续编辑而变。
 */
export interface SheetRow {
  outletId: string;
  label: string;
  kind: OutletKind;
  roomId: string;
  roomName: string;
  wallIndex: number;
  wallName: string;
  /** 离墙（墙面左端）距离 mm */
  xMm: number;
  /** 离地高度 mm */
  heightMm: number;
  /** 归属回路 */
  circuit: string;
  confirmation: PointConfirmation;
}

export type ChangeKind = 'add' | 'modify' | 'remove';

/**
 * 变更单：说清改的是哪一个点位、改成什么样、因为什么改。
 * add 时 before 为空；remove 时 after 为空。
 */
export interface ChangeOrder {
  id: string;
  kind: ChangeKind;
  outletId: string;
  /** 点位名称（冗余，便于删除后仍能认出改的是谁） */
  label: string;
  roomName: string;
  wallName: string;
  reason: string;
  before?: Partial<Pick<SheetRow, 'label' | 'xMm' | 'heightMm' | 'circuit' | 'kind'>>;
  after?: Partial<Pick<SheetRow, 'label' | 'xMm' | 'heightMm' | 'circuit' | 'kind'>>;
  /** 提出人（师傅 / 业主）与时间 */
  raisedBy: SignRole;
  raisedByName: string;
  raisedAt: number;
  status: 'pending' | 'applied' | 'cancelled';
  /** add 时记录新点位归属的 wallKey（roomId-wallIndex） */
  wallKey?: string;
  /** 应用到哪一版（applied 后回填） */
  appliedVersion?: number;
  appliedAt?: number;
}

/** 确认单的一个历史版本，整体快照，只读留档 */
export interface SheetVersion {
  version: number;
  createdAt: number;
  createdByName: string;
  createdByRole: SignRole;
  note: string;
  rows: SheetRow[];
}

/** 水电交底确认单：一个方案一份，版本不断累加，旧版永不可改 */
export interface WalkthroughSheet {
  id: string;
  planId: string;
  createdAt: number;
  /** 当前版本号（从 1 开始） */
  currentVersion: number;
  /** 当前在用版本的行（含签名状态） */
  rows: SheetRow[];
  versions: SheetVersion[];
  changes: ChangeOrder[];
}

export type Unit = 'm2' | 'm' | 'kg' | 'roll' | 'pcs';

export interface MatSpec {
  id: string;
  name: string;
  unit: Unit;
  coverage?: number;
  lossRate: number;
  price: number;
}

export interface Plan {
  id: string;
  name: string;
  createdAt: number;
  rooms: Room[];
  openings: Opening[];
  outlets: Outlet[];
  materials: MatSpec[];
  sheet?: WalkthroughSheet;
}

export interface WallSegment {
  roomId: string;
  index: number;
  p1: Pt;
  p2: Pt;
  lengthMm: number;
  angle: number;
}

export interface MaterialResult {
  matId: string;
  name: string;
  unit: Unit;
  quantity: number;
  totalPrice: number;
  details: string;
}
