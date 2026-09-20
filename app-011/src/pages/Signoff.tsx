import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useStore } from '../store';
import type { ChangeOrder, OutletKind, SheetPoint, Signature } from '../types';
import { getWallSegments } from '../utils/geometry';
import {
  KIND_LABELS,
  kindLabel,
  pointFullName,
  describeChange,
  sheetSignProgress,
  formatTime,
  specFromOutlet,
} from '../utils/signoff';

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function Signoff() {
  const { id } = useParams<{ id: string }>();
  const { getPlan, createSheet, signPoint, addChangeOrder } = useStore();
  const plan = getPlan(id!);

  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [msg, setMsg] = useState('');

  // 变更单表单
  const [coType, setCoType] = useState<'modify' | 'add' | 'remove'>('modify');
  const [coPointId, setCoPointId] = useState('');
  const [coName, setCoName] = useState('');
  const [coKind, setCoKind] = useState<OutletKind>('socket');
  const [coRoomId, setCoRoomId] = useState('');
  const [coWallIndex, setCoWallIndex] = useState('0');
  const [coX, setCoX] = useState('0');
  const [coH, setCoH] = useState('300');
  const [coCircuit, setCoCircuit] = useState('');
  const [coReason, setCoReason] = useState('');
  const [coBy, setCoBy] = useState('');

  if (!plan) {
    return <div className="card">方案不存在</div>;
  }

  const sheets = plan.sheets ?? [];
  const orders = plan.changeOrders ?? [];
  const latest = sheets[sheets.length - 1];
  const viewing = sheets.find((s) => s.version === viewVersion) ?? latest;
  const isLatest = !!viewing && !!latest && viewing.id === latest.id;
  const canSign = isLatest && viewing.status === 'signing';
  const pendingOrders = orders.filter((o) => o.appliedInVersion == null);
  const progress = viewing ? sheetSignProgress(viewing) : { signed: 0, total: 0 };

  const handleCreateSheet = () => {
    if (latest && pendingOrders.length > 0) {
      const ok = window.confirm(
        `按 ${pendingOrders.length} 项已登记变更出具第${latest.version + 1}版确认单？\n出具后旧版留存可查，新版需双方重新逐点签字。`
      );
      if (!ok) return;
    }
    const r = createSheet(plan.id);
    setMsg(r.message);
    if (r.ok) setViewVersion(null);
  };

  const handlePickPoint = (pid: string) => {
    setCoPointId(pid);
    const pt = latest?.points.find((p) => p.outletId === pid);
    if (pt && coType === 'modify') {
      setCoName(pt.name);
      setCoKind(pt.kind);
      setCoH(String(pt.heightMm));
      setCoX(String(pt.xMm));
      setCoCircuit(pt.circuit ?? '');
    }
  };

  const submitChange = () => {
    if (!latest) return;
    if (!coReason.trim() || !coBy.trim()) {
      setMsg('变更原因和提出人必须填写');
      return;
    }
    let order: Omit<ChangeOrder, 'id' | 'createdAt'>;
    if (coType === 'add') {
      const room = plan.rooms.find((r) => r.id === coRoomId);
      if (!room) {
        setMsg('请选择房间');
        return;
      }
      const wallIdx = parseInt(coWallIndex) || 0;
      order = {
        pointId: genId(),
        pointName: `${room.name}·墙${wallIdx + 1}·${coName.trim() || kindLabel(coKind)}`,
        changeType: 'add',
        after: {
          name: coName.trim() || undefined,
          kind: coKind,
          wallKey: `${room.id}-${wallIdx}`,
          xMm: parseInt(coX) || 0,
          heightMm: parseInt(coH) || 0,
          circuit: coCircuit.trim() || undefined,
        },
        reason: coReason.trim(),
        createdBy: coBy.trim(),
      };
    } else {
      const pt = latest.points.find((p) => p.outletId === coPointId);
      if (!pt) {
        setMsg('请选择要变更的点位');
        return;
      }
      const outlet = plan.outlets.find((o) => o.id === pt.outletId);
      if (!outlet) {
        setMsg('该点位已不在图纸中');
        return;
      }
      const before = specFromOutlet(outlet);
      if (coType === 'remove') {
        order = {
          pointId: pt.outletId,
          pointName: pointFullName(pt),
          changeType: 'remove',
          before,
          reason: coReason.trim(),
          createdBy: coBy.trim(),
        };
      } else {
        order = {
          pointId: pt.outletId,
          pointName: pointFullName(pt),
          changeType: 'modify',
          before,
          after: {
            ...before,
            name: coName.trim() || undefined,
            kind: coKind,
            xMm: parseInt(coX) || 0,
            heightMm: parseInt(coH) || 0,
            circuit: coCircuit.trim() || undefined,
          },
          reason: coReason.trim(),
          createdBy: coBy.trim(),
        };
      }
    }
    const r = addChangeOrder(plan.id, order);
    setMsg(r.message);
    if (r.ok) {
      setCoReason('');
      setCoPointId('');
    }
  };

  const coRoom = plan.rooms.find((r) => r.id === coRoomId);
  const coWallCount = coRoom ? getWallSegments(coRoom).length : 0;

  return (
    <div>
      <h2 className="page-title">{plan.name} - 水电交底确认单</h2>

      <div className="tabs no-print">
        <Link to={`/plan/${id}`} className="tab">
          平面绘制
        </Link>
        <Link to={`/plan/${id}/walls`} className="tab">
          墙面点位
        </Link>
        <Link to={`/plan/${id}/signoff`} className="tab active">
          交底确认
        </Link>
        <Link to={`/plan/${id}/bom`} className="tab">
          材料清单
        </Link>
        <Link to={`/plan/${id}/print`} className="tab">
          导出打印
        </Link>
      </div>

      <div className="info-bar no-print">
        <span>
          当前版本:{' '}
          <strong>{latest ? `V${latest.version}` : '未出具'}</strong>
        </span>
        {latest && (
          <span>
            状态:{' '}
            <strong style={{ color: latest.status === 'confirmed' ? '#27ae60' : '#e67e22' }}>
              {latest.status === 'confirmed' ? '已确认（对完）' : '签署中（未对完）'}
            </strong>
          </span>
        )}
        {viewing && (
          <span>
            签字进度:{' '}
            <strong>
              {progress.signed}/{progress.total}
            </strong>
          </span>
        )}
        <span>
          待生效变更: <strong>{pendingOrders.length}</strong>
        </span>
      </div>

      {msg && (
        <div className="notice no-print" onClick={() => setMsg('')}>
          {msg}
        </div>
      )}

      {sheets.length === 0 ? (
        <div className="card no-print" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: '#666', marginBottom: 16 }}>
            还没有确认单。水电交底时，先在这里出具首版确认单，再和师傅逐个点位对着签。
          </p>
          <button className="btn btn-primary" onClick={handleCreateSheet}>
            出具首版确认单
          </button>
          {plan.outlets.length === 0 && (
            <p style={{ color: '#e74c3c', marginTop: 12, fontSize: 13 }}>
              当前方案还没有点位，请先到「墙面点位」添加插座/开关
            </p>
          )}
        </div>
      ) : (
        <>
          {/* 版本切换 */}
          <div className="version-chips no-print">
            {sheets.map((s) => (
              <button
                key={s.id}
                className={`chip ${viewing?.id === s.id ? 'active' : ''}`}
                onClick={() => setViewVersion(s.version)}
              >
                V{s.version}
                {s.status === 'confirmed' ? ' ✓' : ' …'}
              </button>
            ))}
            {latest.status === 'confirmed' && pendingOrders.length > 0 && (
              <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={handleCreateSheet}>
                按{pendingOrders.length}项变更出具第{latest.version + 1}版
              </button>
            )}
          </div>

          {viewing && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <h3 style={{ fontSize: 16 }}>
                  水电交底确认单 · 第{viewing.version}版
                </h3>
                <button className="btn btn-secondary no-print" onClick={() => window.print()}>
                  打印确认单
                </button>
              </div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
                出具时间: {formatTime(viewing.createdAt)}
                {'　'}状态:{' '}
                {viewing.status === 'confirmed' ? (
                  <span style={{ color: '#27ae60', fontWeight: 500 }}>
                    已确认（{viewing.confirmedAt ? formatTime(viewing.confirmedAt) : ''}全部签齐）
                  </span>
                ) : (
                  <span style={{ color: '#e67e22', fontWeight: 500 }}>签署中，签齐才算对完</span>
                )}
                {viewing.changeOrderIds.length > 0 && (
                  <span>　本版已纳入 {viewing.changeOrderIds.length} 项变更</span>
                )}
              </div>

              {!isLatest && (
                <div className="banner-history no-print">这是历史版本（V{viewing.version}），留存备查，不能再签字。</div>
              )}

              <SheetTable
                sheet={viewing}
                canSign={canSign}
                onSign={(outletId, role, name) => signPoint(plan.id, viewing.id, outletId, role, name)}
              />

              <div style={{ marginTop: 12, fontSize: 12, color: '#999' }}>
                说明：离墙距离指距所在墙面左端的水平距离；每个点位须师傅、业主双方签字，全部签齐本版才算对完。
              </div>
            </div>
          )}

          {/* 变更单 */}
          <div className="card no-print">
            <h3 style={{ marginBottom: 12, fontSize: 16 }}>变更单</h3>
            {latest.status !== 'confirmed' ? (
              <p style={{ color: '#999', fontSize: 13 }}>
                第{latest.version}版确认单还没签完，确认完之后才能登记变更。
              </p>
            ) : (
              <>
                <div className="change-form">
                  <div className="form-group">
                    <label>变更类型</label>
                    <select
                      value={coType}
                      onChange={(e) => {
                        setCoType(e.target.value as 'modify' | 'add' | 'remove');
                        setCoPointId('');
                      }}
                    >
                      <option value="modify">修改点位</option>
                      <option value="add">新增点位</option>
                      <option value="remove">删除点位</option>
                    </select>
                  </div>

                  {coType !== 'add' ? (
                    <div className="form-group">
                      <label>改的是哪一个（第{latest.version}版点位）</label>
                      <select value={coPointId} onChange={(e) => handlePickPoint(e.target.value)}>
                        <option value="">选择点位</option>
                        {latest.points.map((p) => (
                          <option key={p.outletId} value={p.outletId}>
                            {pointFullName(p)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <>
                      <div className="form-group">
                        <label>房间</label>
                        <select value={coRoomId} onChange={(e) => { setCoRoomId(e.target.value); setCoWallIndex('0'); }}>
                          <option value="">选择房间</option>
                          {plan.rooms.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {coRoom && (
                        <div className="form-group">
                          <label>墙面</label>
                          <select value={coWallIndex} onChange={(e) => setCoWallIndex(e.target.value)}>
                            {Array.from({ length: coWallCount }, (_, i) => (
                              <option key={i} value={i}>
                                墙{i + 1}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </>
                  )}

                  {coType !== 'remove' && (
                    <>
                      <div className="form-group">
                        <label>名称（改成什么样）</label>
                        <input value={coName} onChange={(e) => setCoName(e.target.value)} placeholder="如: 电视墙插座" />
                      </div>
                      <div className="form-group">
                        <label>类型</label>
                        <select value={coKind} onChange={(e) => setCoKind(e.target.value as OutletKind)}>
                          {(Object.keys(KIND_LABELS) as OutletKind[]).map((k) => (
                            <option key={k} value={k}>
                              {KIND_LABELS[k]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>离地高度 (mm)</label>
                        <input value={coH} onChange={(e) => setCoH(e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>离墙距离 (mm)</label>
                        <input value={coX} onChange={(e) => setCoX(e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>回路</label>
                        <input value={coCircuit} onChange={(e) => setCoCircuit(e.target.value)} placeholder="如: L1" />
                      </div>
                    </>
                  )}

                  <div className="form-group">
                    <label>因为什么改 *</label>
                    <input value={coReason} onChange={(e) => setCoReason(e.target.value)} placeholder="如: 床头被衣柜挡住" />
                  </div>
                  <div className="form-group">
                    <label>提出人 *</label>
                    <input value={coBy} onChange={(e) => setCoBy(e.target.value)} placeholder="姓名" />
                  </div>
                  <div className="form-group" style={{ alignSelf: 'flex-end' }}>
                    <button className="btn btn-primary" onClick={submitChange}>
                      登记变更
                    </button>
                  </div>
                </div>
              </>
            )}

            {orders.length > 0 && (
              <table style={{ marginTop: 16 }}>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>类型</th>
                    <th>点位</th>
                    <th>改成什么样</th>
                    <th>原因</th>
                    <th>提出人</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatTime(o.createdAt)}</td>
                      <td>
                        <span className={`badge badge-${o.changeType}`}>
                          {o.changeType === 'modify' ? '改' : o.changeType === 'add' ? '增' : '删'}
                        </span>
                      </td>
                      <td>{o.pointName}</td>
                      <td>{describeChange(o, plan)}</td>
                      <td>{o.reason}</td>
                      <td>{o.createdBy}</td>
                      <td>
                        {o.appliedInVersion ? (
                          <span style={{ color: '#27ae60' }}>已生效于V{o.appliedInVersion}</span>
                        ) : (
                          <span style={{ color: '#e67e22' }}>待生效</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {orders.length === 0 && latest.status === 'confirmed' && (
              <p style={{ color: '#999', fontSize: 13, marginTop: 8 }}>暂无变更记录。</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SheetTable({
  sheet,
  canSign,
  onSign,
}: {
  sheet: { points: SheetPoint[] };
  canSign: boolean;
  onSign: (outletId: string, role: 'master' | 'owner', name: string) => void;
}) {
  // 按房间 → 墙面分组
  const groups: { roomName: string; walls: { wallLabel: string; points: typeof sheet.points }[] }[] = [];
  for (const p of sheet.points) {
    let g = groups.find((x) => x.roomName === p.roomName);
    if (!g) {
      g = { roomName: p.roomName, walls: [] };
      groups.push(g);
    }
    let w = g.walls.find((x) => x.wallLabel === p.wallLabel);
    if (!w) {
      w = { wallLabel: p.wallLabel, points: [] };
      g.walls.push(w);
    }
    w.points.push(p);
  }

  return (
    <div>
      {groups.map((g) => (
        <div key={g.roomName} style={{ marginBottom: 16 }}>
          <div className="sheet-room">{g.roomName}</div>
          {g.walls.map((w) => (
            <div key={w.wallLabel} style={{ marginBottom: 12 }}>
              <div className="sheet-wall">{w.wallLabel}</div>
              <table>
                <thead>
                  <tr>
                    <th>点位名称</th>
                    <th>类型</th>
                    <th>离地高度</th>
                    <th>离墙距离</th>
                    <th>回路</th>
                    <th style={{ width: 150 }}>师傅签字</th>
                    <th style={{ width: 150 }}>业主签字</th>
                  </tr>
                </thead>
                <tbody>
                  {w.points.map((p) => (
                    <tr key={p.outletId}>
                      <td>{p.name}</td>
                      <td>{kindLabel(p.kind)}</td>
                      <td>{p.heightMm}mm</td>
                      <td>{p.xMm}mm</td>
                      <td>{p.circuit || '—'}</td>
                      <td>
                        <SignCell
                          sign={p.masterSign}
                          canSign={canSign}
                          onSign={(name) => onSign(p.outletId, 'master', name)}
                        />
                      </td>
                      <td>
                        <SignCell
                          sign={p.ownerSign}
                          canSign={canSign}
                          onSign={(name) => onSign(p.outletId, 'owner', name)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SignCell({
  sign,
  canSign,
  onSign,
}: {
  sign?: Signature;
  canSign: boolean;
  onSign: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  if (sign) {
    return (
      <div>
        <div style={{ fontWeight: 500, color: '#2c3e50' }}>{sign.name}</div>
        <div style={{ fontSize: 11, color: '#999' }}>{formatTime(sign.signedAt)}</div>
      </div>
    );
  }
  if (!canSign) {
    return <span style={{ color: '#bbb' }}>未签</span>;
  }
  if (!editing) {
    return (
      <button className="btn btn-secondary" style={{ padding: '4px 12px' }} onClick={() => setEditing(true)}>
        签字
      </button>
    );
  }
  const commit = () => {
    if (name.trim()) onSign(name.trim());
  };
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        placeholder="姓名"
        style={{ width: 80, padding: '4px 6px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13 }}
      />
      <button className="btn btn-primary" style={{ padding: '4px 10px' }} onClick={commit}>
        ✓
      </button>
    </div>
  );
}
