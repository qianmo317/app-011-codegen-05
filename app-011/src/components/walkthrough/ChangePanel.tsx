import { useMemo, useState } from 'react';
import type { ChangeOrder, OutletKind, Plan, SignRole } from '../../types';
import type { AddChangeInput } from '../../store';
import {
  FIELD_LABEL,
  KIND_LABEL,
  ROLE_LABEL,
  changeFieldDiffs,
  describeField,
  formatTime,
} from '../../utils/walkthrough';

const KIND_OPTIONS: OutletKind[] = ['socket', 'switch', 'net', 'light', 'water'];

const KIND_TAG: Record<ChangeOrder['kind'], string> = {
  add: '新增',
  modify: '修改',
  remove: '删除',
};

function StatusTag({ change }: { change: ChangeOrder }) {
  if (change.status === 'applied')
    return <span className="badge badge-ok">已并入第 {change.appliedVersion} 版</span>;
  if (change.status === 'cancelled') return <span className="badge badge-muted">已取消</span>;
  return <span className="badge badge-warn">待发布</span>;
}

function ChangeCard({
  change,
  onCancel,
}: {
  change: ChangeOrder;
  onCancel?: (id: string) => void;
}) {
  const diffs = changeFieldDiffs(change);
  return (
    <div className={`change-card change-${change.status}`}>
      <div className="change-card-head">
        <span className={`change-kind change-kind-${change.kind}`}>{KIND_TAG[change.kind]}</span>
        <span className="change-target">
          {change.roomName} · {change.wallName} · {change.label}
        </span>
        <StatusTag change={change} />
      </div>

      {change.kind !== 'remove' && diffs.length > 0 && (
        <table className="diff-table">
          <tbody>
            {diffs.map((d) => (
              <tr key={d.field}>
                <td className="diff-field">{FIELD_LABEL[d.field]}</td>
                {change.kind === 'add' ? (
                  <td className="diff-after" colSpan={2}>
                    定为 {describeField(d.field, d.after)}
                  </td>
                ) : (
                  <>
                    <td className="diff-before">{describeField(d.field, d.before)}</td>
                    <td className="diff-arrow">→</td>
                    <td className="diff-after">{describeField(d.field, d.after)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {change.kind === 'remove' && <div className="change-remove-note">该点位将从新版确认单中移除</div>}

      <div className="change-reason">
        <span className="change-reason-label">变更原因：</span>
        {change.reason}
      </div>
      <div className="change-meta">
        {ROLE_LABEL[change.raisedBy]} {change.raisedByName} 提出于 {formatTime(change.raisedAt)}
        {change.status === 'pending' && onCancel && (
          <button className="link-btn" onClick={() => onCancel(change.id)}>
            取消该变更
          </button>
        )}
      </div>
    </div>
  );
}

export default function ChangePanel({
  plan,
  onAdd,
  onCancel,
}: {
  plan: Plan;
  onAdd: (input: AddChangeInput) => void;
  onCancel: (id: string) => void;
}) {
  const sheet = plan.sheet!;
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ChangeOrder['kind']>('modify');
  const [targetId, setTargetId] = useState('');
  const [wallKey, setWallKey] = useState('');
  const [label, setLabel] = useState('');
  const [pKind, setPKind] = useState<OutletKind>('socket');
  const [xMm, setXMm] = useState('300');
  const [heightMm, setHeightMm] = useState('300');
  const [circuit, setCircuit] = useState('');
  const [reason, setReason] = useState('');
  const [role, setRole] = useState<SignRole>('owner');
  const [personName, setPersonName] = useState('');
  const [error, setError] = useState('');

  const rows = sheet.rows;
  const targetRow = rows.find((r) => r.outletId === targetId);

  const wallOptions = useMemo(() => {
    const opts: { wallKey: string; label: string }[] = [];
    for (const room of plan.rooms) {
      for (let i = 0; i < room.polygon.length; i++) {
        opts.push({ wallKey: `${room.id}-${i}`, label: `${room.name} · 墙${i + 1}` });
      }
    }
    return opts;
  }, [plan.rooms]);

  const pending = sheet.changes.filter((c) => c.status === 'pending');
  const history = sheet.changes.filter((c) => c.status !== 'pending').reverse();

  const resetForm = () => {
    setKind('modify');
    setTargetId('');
    setWallKey('');
    setLabel('');
    setPKind('socket');
    setXMm('300');
    setHeightMm('300');
    setCircuit('');
    setReason('');
    setError('');
    setOpen(false);
  };

  const submit = () => {
    setError('');
    if (!personName.trim()) {
      setError('请填写提出人姓名（谁提的变更要留名）');
      return;
    }
    if (!reason.trim()) {
      setError('必须写清变更原因');
      return;
    }

    if (kind === 'add') {
      if (!wallKey) {
        setError('请选择新点位所在房间与墙面');
        return;
      }
      onAdd({
        kind: 'add',
        label,
        wallKey,
        reason,
        raisedBy: role,
        raisedByName: personName,
        after: {
          label: label.trim() || undefined,
          kind: pKind,
          xMm: parseInt(xMm, 10) || 0,
          heightMm: parseInt(heightMm, 10) || 0,
          circuit: circuit.trim() || '',
        },
      });
    } else {
      if (!targetRow) {
        setError('请选择要变更的点位');
        return;
      }
      const before = {
        label: targetRow.label,
        kind: targetRow.kind,
        xMm: targetRow.xMm,
        heightMm: targetRow.heightMm,
        circuit: targetRow.circuit,
      };
      if (kind === 'modify') {
        const after = {
          label: label.trim() || targetRow.label,
          kind: pKind,
          xMm: parseInt(xMm, 10) || 0,
          heightMm: parseInt(heightMm, 10) || 0,
          circuit: circuit.trim(),
        };
        if (JSON.stringify(before) === JSON.stringify(after)) {
          setError('内容与原点位一致，没有要改的内容');
          return;
        }
        onAdd({
          kind: 'modify',
          outletId: targetRow.outletId,
          label: targetRow.label,
          reason,
          raisedBy: role,
          raisedByName: personName,
          before,
          after,
        });
      } else {
        onAdd({
          kind: 'remove',
          outletId: targetRow.outletId,
          label: targetRow.label,
          reason,
          raisedBy: role,
          raisedByName: personName,
          before,
        });
      }
    }
    resetForm();
  };

  const pickTarget = (id: string) => {
    setTargetId(id);
    const row = rows.find((r) => r.outletId === id);
    if (row) {
      setLabel(row.label);
      setPKind(row.kind);
      setXMm(String(row.xMm));
      setHeightMm(String(row.heightMm));
      setCircuit(row.circuit);
    }
  };

  return (
    <div className="change-panel">
      <div className="change-panel-head">
        <h3>变更单</h3>
        {!open && (
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            提出变更
          </button>
        )}
      </div>

      {open && (
        <div className="card change-form">
          <div className="change-form-grid">
            <div className="form-group">
              <label>变更类型</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as ChangeOrder['kind'])}>
                <option value="modify">修改点位（改位置/高度/回路等）</option>
                <option value="add">新增点位</option>
                <option value="remove">删除点位</option>
              </select>
            </div>

            {kind === 'add' ? (
              <>
                <div className="form-group">
                  <label>所在房间 / 墙面</label>
                  <select value={wallKey} onChange={(e) => setWallKey(e.target.value)}>
                    <option value="">选择墙面</option>
                    {wallOptions.map((o) => (
                      <option key={o.wallKey} value={o.wallKey}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>点位名称</label>
                  <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="如：餐边柜插座" />
                </div>
                <div className="form-group">
                  <label>类型</label>
                  <select value={pKind} onChange={(e) => setPKind(e.target.value as OutletKind)}>
                    {KIND_OPTIONS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>离墙距离 (mm)</label>
                  <input type="number" value={xMm} onChange={(e) => setXMm(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>离地高度 (mm)</label>
                  <input type="number" value={heightMm} onChange={(e) => setHeightMm(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>归属回路</label>
                  <input value={circuit} onChange={(e) => setCircuit(e.target.value)} placeholder="如 L1" />
                </div>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label>变更哪个点位</label>
                  <select value={targetId} onChange={(e) => pickTarget(e.target.value)}>
                    <option value="">选择点位</option>
                    {rows.map((r) => (
                      <option key={r.outletId} value={r.outletId}>
                        {r.roomName} · {r.wallName} · {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                {targetRow && kind === 'modify' && (
                  <>
                    <div className="form-group">
                      <label>改成名称</label>
                      <input value={label} onChange={(e) => setLabel(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>改成类型</label>
                      <select value={pKind} onChange={(e) => setPKind(e.target.value as OutletKind)}>
                        {KIND_OPTIONS.map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>改成离墙距离 (mm)</label>
                      <input type="number" value={xMm} onChange={(e) => setXMm(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>改成离地高度 (mm)</label>
                      <input type="number" value={heightMm} onChange={(e) => setHeightMm(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>改成回路</label>
                      <input value={circuit} onChange={(e) => setCircuit(e.target.value)} />
                    </div>
                  </>
                )}
                {targetRow && kind === 'remove' && (
                  <div className="form-group change-remove-preview">
                    将删除：{targetRow.roomName} · {targetRow.wallName} · {targetRow.label}（离地
                    {targetRow.heightMm}mm / 离墙{targetRow.xMm}mm
                    {targetRow.circuit ? ` / ${targetRow.circuit} 路` : ''}）
                  </div>
                )}
              </>
            )}

            <div className="form-group form-full">
              <label>变更原因（必填）</label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="如：现场发现此处有水管，不能开槽，右移 300mm"
              />
            </div>
            <div className="form-group">
              <label>提出人身份</label>
              <select value={role} onChange={(e) => setRole(e.target.value as SignRole)}>
                <option value="owner">业主</option>
                <option value="worker">师傅</option>
              </select>
            </div>
            <div className="form-group">
              <label>提出人姓名</label>
              <input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="谁提的" />
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}
          <div className="change-form-actions">
            <button className="btn btn-secondary" onClick={resetForm}>
              取消
            </button>
            <button className="btn btn-primary" onClick={submit}>
              提交变更单
            </button>
          </div>
        </div>
      )}

      <h4 className="change-section-title">待发布（{pending.length}）</h4>
      {pending.length === 0 ? (
        <p className="empty-hint">暂无待发布变更。攒一批后可重出新一版确认单。</p>
      ) : (
        pending.map((c) => <ChangeCard key={c.id} change={c} onCancel={onCancel} />)
      )}

      {history.length > 0 && (
        <>
          <h4 className="change-section-title">历史记录（{history.length}）</h4>
          {history.map((c) => (
            <ChangeCard key={c.id} change={c} />
          ))}
        </>
      )}
    </div>
  );
}
