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
  xMm: number;
  heightMm: number;
  kind: OutletKind;
  circuit?: string;
  name?: string;
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
  sheets: ConfirmSheet[];
  changeOrders: ChangeOrder[];
}

/** 签名留痕：谁、什么时候签的 */
export interface Signature {
  name: string;
  signedAt: number;
}

/** 确认单中的点位快照（生成后不可原地改） */
export interface SheetPoint {
  outletId: string;
  name: string;
  kind: OutletKind;
  roomName: string;
  wallLabel: string;
  xMm: number;
  heightMm: number;
  circuit?: string;
  masterSign?: Signature;
  ownerSign?: Signature;
}

/** 点位的规格描述（变更前/后的状态） */
export interface PointSpec {
  name?: string;
  kind: OutletKind;
  wallKey: string;
  xMm: number;
  heightMm: number;
  circuit?: string;
}

export type ChangeType = 'modify' | 'add' | 'remove';

/** 变更单：改的是哪一个、改成什么样、因为什么改 */
export interface ChangeOrder {
  id: string;
  pointId: string;
  pointName: string;
  changeType: ChangeType;
  before?: PointSpec;
  after?: PointSpec;
  reason: string;
  createdBy: string;
  createdAt: number;
  appliedInVersion?: number;
}

/** 水电交底确认单（按版本留存，旧版可翻查） */
export interface ConfirmSheet {
  id: string;
  version: number;
  createdAt: number;
  points: SheetPoint[];
  changeOrderIds: string[];
  status: 'signing' | 'confirmed';
  confirmedAt?: number;
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
