import { useState } from 'react';
import type { PointSignature, SheetRow, SignRole } from '../../types';
import { KIND_LABEL, ROLE_LABEL, formatTime, groupRows, isRowSigned, sheetProgress } from '../../utils/walkthrough';

const NAME_STORAGE_KEY: Record<SignRole, string> = {
  worker: 'wt-worker-name',
  owner: 'wt-owner-name',
};

function rememberName(role: SignRole, name: string) {
  try {
    localStorage.setItem(NAME_STORAGE_KEY[role], name);
  } catch {
    // ignore
  }
}

function rememberedName(role: SignRole): string {
  try {
    return localStorage.getItem(NAME_STORAGE_KEY[role]) || '';
  } catch {
    return '';
  }
}

/** 单个签名格：未签时填名字点签；签后显示印章式留痕，可重签 */
function SignCell({
  sig,
  role,
  editable,
  onSign,
  onClear,
}: {
  sig?: PointSignature;
  role: SignRole;
  editable: boolean;
  onSign: (name: string) => void;
  onClear: () => void;
}) {
  const [name, setName] = useState(rememberedName(role));
  const [editing, setEditing] = useState(false);

  if (sig) {
    return (
      <div className="sign-stamp" style={{ borderColor: role === 'worker' ? '#e67e22' : '#27ae60' }}>
        <div className="sign-stamp-name">{sig.name}</div>
        <div className="sign-stamp-meta">
          {ROLE_LABEL[role]} · {formatTime(sig.time)}
        </div>
        {editable && (
          <button
            className="link-btn no-print"
            onClick={() => {
              if (window.confirm(`撤销${ROLE_LABEL[role]}签名？点位属性不会改变。`)) onClear();
            }}
          >
            撤销
          </button>
        )}
      </div>
    );
  }

  if (!editable) {
    return <span className="sign-blank-print">（未签）</span>;
  }

  return editing ? (
    <div className="sign-input">
      <input
        value={name}
        placeholder={`${ROLE_LABEL[role]}姓名`}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) {
            rememberName(role, name.trim());
            onSign(name.trim());
            setEditing(false);
          }
        }}
        autoFocus
      />
      <button
        className="btn btn-primary btn-sm"
        onClick={() => {
          if (!name.trim()) return;
          rememberName(role, name.trim());
          onSign(name.trim());
          setEditing(false);
        }}
      >
        签
      </button>
      <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
        取消
      </button>
    </div>
  ) : (
    <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
      {ROLE_LABEL[role]}签字
    </button>
  );
}

export default function SheetTable({
  rows,
  editable,
  onSign,
  onClear,
}: {
  rows: SheetRow[];
  editable: boolean;
  onSign?: (outletId: string, role: SignRole, name: string) => void;
  onClear?: (outletId: string, role: SignRole) => void;
}) {
  const grouped = groupRows(rows);
  const { signed, total } = sheetProgress(rows);

  return (
    <div className="sheet-table-wrap">
      <div className="sheet-progress-line">
        点位 {total} 个，双方已签 {signed} 个
        {total > 0 && signed === total && <span className="badge badge-ok">本版已全部对完</span>}
      </div>

      {total === 0 && <p className="empty-hint">本版没有点位。</p>}

      {[...grouped.entries()].map(([roomName, byWall]) => (
        <div key={roomName} className="sheet-room-block">
          <h4 className="sheet-room-title">
            {roomName}
            <span className="sheet-room-count">
              {[...byWall.values()].reduce((s, l) => s + l.length, 0)} 个点位
            </span>
          </h4>
          {[...byWall.entries()].map(([wallName, list]) => (
            <div key={wallName} className="sheet-wall-block">
              <div className="sheet-wall-title">{wallName}</div>
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th style={{ width: 110 }}>点位名称</th>
                    <th style={{ width: 56 }}>类型</th>
                    <th style={{ width: 90 }}>离墙距离</th>
                    <th style={{ width: 90 }}>离地高度</th>
                    <th style={{ width: 80 }}>归属回路</th>
                    <th className="sign-col">师傅签名</th>
                    <th className="sign-col">业主签名</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row, i) => {
                    const fullySigned = isRowSigned(row);
                    return (
                      <tr key={row.outletId} className={fullySigned ? 'row-signed' : 'row-pending'}>
                        <td>{i + 1}</td>
                        <td className="cell-name">{row.label}</td>
                        <td>{KIND_LABEL[row.kind]}</td>
                        <td>{row.xMm}mm</td>
                        <td>{row.heightMm}mm</td>
                        <td>{row.circuit || '—'}</td>
                        <td>
                          <SignCell
                            sig={row.confirmation.worker}
                            role="worker"
                            editable={editable}
                            onSign={(name) => onSign?.(row.outletId, 'worker', name)}
                            onClear={() => onClear?.(row.outletId, 'worker')}
                          />
                        </td>
                        <td>
                          <SignCell
                            sig={row.confirmation.owner}
                            role="owner"
                            editable={editable}
                            onSign={(name) => onSign?.(row.outletId, 'owner', name)}
                            onClear={() => onClear?.(row.outletId, 'owner')}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
