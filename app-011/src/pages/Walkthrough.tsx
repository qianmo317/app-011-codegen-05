import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useStore } from '../store';
import type { SheetVersion, SignRole } from '../types';
import SheetTable from '../components/walkthrough/SheetTable';
import ChangePanel from '../components/walkthrough/ChangePanel';
import {
  ROLE_LABEL,
  formatTime,
  isSheetFullyConfirmed,
  sheetProgress,
} from '../utils/walkthrough';

function Tabs({ id, active }: { id: string; active: string }) {
  const tab = (to: string, key: string, label: string) => (
    <Link to={to} className={`tab ${active === key ? 'active' : ''}`}>
      {label}
    </Link>
  );
  return (
    <div className="tabs no-print">
      {tab(`/plan/${id}`, 'plan', '平面绘制')}
      {tab(`/plan/${id}/walls`, 'walls', '墙面点位')}
      {tab(`/plan/${id}/walkthrough`, 'walkthrough', '交底确认')}
      {tab(`/plan/${id}/bom`, 'bom', '材料清单')}
      {tab(`/plan/${id}/print`, 'print', '导出打印')}
    </div>
  );
}

/** 建档 / 发版共用的信息条 */
function IssueBar({
  submitLabel,
  onSubmit,
  disabled,
  hint,
}: {
  submitLabel: string;
  onSubmit: (p: { name: string; role: SignRole; note: string }) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<SignRole>('worker');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  return (
    <div className="issue-bar">
      <div className="issue-bar-row">
        <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
          <label>出单人身份</label>
          <select value={role} onChange={(e) => setRole(e.target.value as SignRole)}>
            <option value="worker">师傅</option>
            <option value="owner">业主</option>
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
          <label>出单人姓名</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="谁出这一版" />
        </div>
        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
          <label>版次说明</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：水电交底现场首版" />
        </div>
        <button
          className="btn btn-primary"
          disabled={disabled}
          onClick={() => {
            if (!name.trim()) {
              setErr('请填出单人姓名——谁出的单要留名');
              return;
            }
            setErr('');
            onSubmit({ name: name.trim(), role, note });
          }}
        >
          {submitLabel}
        </button>
      </div>
      {hint && <div className="issue-hint">{hint}</div>}
      {err && <div className="form-error">{err}</div>}
    </div>
  );
}

function VersionPrintSheet({
  planName,
  version,
}: {
  planName: string;
  version: SheetVersion;
}) {
  const { signed, total } = sheetProgress(version.rows);
  return (
    <div className="print-sheet">
      <h1 className="print-sheet-title">水电交底点位确认单</h1>
      <div className="print-sheet-meta">
        <span>项目：{planName}</span>
        <span>版本：第 {version.version} 版</span>
        <span>出具：{ROLE_LABEL[version.createdByRole]} {version.createdByName}</span>
        <span>出具时间：{formatTime(version.createdAt)}</span>
        {version.note && <span>说明：{version.note}</span>}
      </div>
      <div className="print-sheet-status">
        本版共 {total} 个点位，双方已签 {signed} 个{signed === total && total > 0 ? '——本版已全部对完' : '——尚未对完'}
      </div>
      <PrintRowsTable version={version} />
      <div className="print-sheet-foot">
        师傅签字：________________　　业主签字：________________　　日期：______年____月____日
      </div>
    </div>
  );
}

function PrintRowsTable({ version }: { version: SheetVersion }) {
  const groups = new Map<string, Map<string, typeof version.rows>>();
  const sorted = [...version.rows].sort((a, b) => {
    if (a.roomName !== b.roomName) return a.roomName.localeCompare(b.roomName, 'zh-Hans-CN');
    if (a.wallIndex !== b.wallIndex) return a.wallIndex - b.wallIndex;
    return a.xMm - b.xMm;
  });
  for (const r of sorted) {
    let byWall = groups.get(r.roomName);
    if (!byWall) {
      byWall = new Map();
      groups.set(r.roomName, byWall);
    }
    const list = byWall.get(r.wallName) || [];
    list.push(r);
    byWall.set(r.wallName, list);
  }
  return (
    <table className="print-point-table">
      <thead>
        <tr>
          <th>房间</th>
          <th>墙面</th>
          <th>点位名称</th>
          <th>类型</th>
          <th>离地(mm)</th>
          <th>离墙(mm)</th>
          <th>回路</th>
          <th>师傅签名/日期</th>
          <th>业主签名/日期</th>
        </tr>
      </thead>
      <tbody>
        {[...groups.entries()].map(([roomName, byWall]) =>
          [...byWall.entries()].map(([wallName, list]) =>
            list.map((r, i) => (
              <tr key={r.outletId}>
                {i === 0 && <td rowSpan={list.length}>{roomName}</td>}
                <td>{wallName}</td>
                <td>{r.label}</td>
                <td>{r.kind}</td>
                <td>{r.heightMm}</td>
                <td>{r.xMm}</td>
                <td>{r.circuit || '—'}</td>
                <td className="print-sign-cell">
                  {r.confirmation.worker
                    ? `${r.confirmation.worker.name}\n${formatTime(r.confirmation.worker.time)}`
                    : ''}
                </td>
                <td className="print-sign-cell">
                  {r.confirmation.owner
                    ? `${r.confirmation.owner.name}\n${formatTime(r.confirmation.owner.time)}`
                    : ''}
                </td>
              </tr>
            ))
          )
        )}
      </tbody>
    </table>
  );
}

export default function Walkthrough() {
  const { id } = useParams<{ id: string }>();
  const store = useStore();
  const plan = store.getPlan(id!);
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [printing, setPrinting] = useState(false);

  // 调起打印前只保留正式单据，打印/取消后恢复交互界面
  const handlePrint = () => setPrinting(true);
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    const t = window.setTimeout(() => {
      window.print();
      // print() 在多数浏览器里会阻塞到对话框关闭；兜底恢复，防止 afterprint 不触发
      done();
    }, 50);
    return () => {
      window.removeEventListener('afterprint', done);
      window.clearTimeout(t);
    };
  }, [printing]);

  if (!plan) return <div className="card">方案不存在</div>;

  const sheet = plan.sheet;

  const printSheet = (() => {
    if (!sheet) return undefined;
    if (viewVersion !== null) return sheet.versions.find((v) => v.version === viewVersion);
    return sheet.versions.find((v) => v.version === sheet.currentVersion);
  })();

  /* ---------- 尚未建档 ---------- */
  if (!sheet) {
    const outletCount = plan.outlets.length;
    return (
      <div>
        <h2 className="page-title">{plan.name} · 水电交底确认</h2>
        <Tabs id={plan.id} active="walkthrough" />
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>还没有确认单</h3>
          <p className="empty-hint" style={{ marginBottom: 16 }}>
            交底当天，先按当前方案里的 <strong>{outletCount}</strong> 个点位出第 1 版确认单。
            出单后师傅和业主沿墙逐个对、逐个签字；全部签完才算对完。签过字的点位不允许原地改，只能提变更单、再出新版本。
          </p>
          {outletCount === 0 ? (
            <div className="form-error">当前方案还没有任何点位，请先到「墙面点位」里标注后再出单。</div>
          ) : (
            <IssueBar
              submitLabel="出第 1 版确认单"
              hint="首版会把每个点位的名称、离地高度、离墙距离、回路按房间/墙面列成表。"
              onSubmit={(p) => {
                store.createWalkthrough(plan.id, p);
              }}
            />
          )}
        </div>
      </div>
    );
  }

  /* ---------- 已建档 ---------- */
  const pendingCount = sheet.changes.filter((c) => c.status === 'pending').length;
  const { signed, total } = sheetProgress(sheet.rows);
  const fullyConfirmed = isSheetFullyConfirmed(sheet);
  const viewed =
    viewVersion !== null ? sheet.versions.find((v) => v.version === viewVersion) : undefined;

  /* 打印模式：页面上只渲染正式确认单，其余交给 @media 之外的打印样式 */
  if (printing && printSheet) {
    return (
      <div className="walkthrough-printing">
        <VersionPrintSheet planName={plan.name} version={printSheet} />
      </div>
    );
  }

  return (
    <div>
      <h2 className="page-title">{plan.name} · 水电交底确认</h2>
      <Tabs id={plan.id} active="walkthrough" />

      {/* 进度总览 */}
      <div className={`sheet-banner ${fullyConfirmed ? 'banner-done' : 'banner-doing'}`}>
        <div className="banner-main">
          当前第 <strong>{sheet.currentVersion}</strong> 版 · 点位 {total} 个 · 双方已签 {signed} 个
        </div>
        <div className="banner-sub">
          {fullyConfirmed
            ? '本版点位已全部对完并双方签字。之后要改，一律走变更单重出版本。'
            : `还有 ${total - signed} 个点位没签完——没签完不算对完。`}
          {pendingCount > 0 && `　待发布变更 ${pendingCount} 条。`}
        </div>
      </div>

      {viewed ? (
        /* ---------- 历史版本翻阅 ---------- */
        <div className="card">
          <div className="version-header no-print">
            <button className="btn btn-secondary" onClick={() => setViewVersion(null)}>
              ← 返回当前版
            </button>
            <h3>
              第 {viewed.version} 版
              {viewed.version === sheet.currentVersion && <span className="badge badge-ok">当前版</span>}
            </h3>
            <span className="version-meta">
              {ROLE_LABEL[viewed.createdByRole]} {viewed.createdByName} 出具于 {formatTime(viewed.createdAt)}
            </span>
          </div>
          <div className="version-note">{viewed.note && `版次说明：${viewed.note}`}</div>
          <div className="no-print" style={{ marginBottom: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={handlePrint}>
              打印该版 / 存PDF
            </button>
          </div>
          <SheetTable rows={viewed.rows} editable={false} />
        </div>
      ) : (
        <>
          {/* 当前确认单 */}
          <div className="card">
            <div className="sheet-card-head">
              <h3>当前确认单（第 {sheet.currentVersion} 版）</h3>
              <button className="btn btn-secondary btn-sm no-print" onClick={handlePrint}>
                打印 / 存PDF
              </button>
            </div>
            <SheetTable
              rows={sheet.rows}
              editable
              onSign={(outletId, role, name) => store.signPoint(plan.id, outletId, role, name)}
              onClear={(outletId, role) => store.unsignPoint(plan.id, outletId, role)}
            />
          </div>

          {/* 变更与发版 */}
          <div className="card">
            <ChangePanel
              plan={plan}
              onAdd={(input) => {
                const result = store.addChange(plan.id, input);
                if (result === null) {
                  if (input.kind === 'modify') {
                    window.alert('该点位还没有任何一方签字，直接在「墙面点位」页调整即可，无需提变更。');
                  } else {
                    window.alert('提交失败：该点位已有一条待发布变更，请先发布或取消后再提。');
                  }
                }
              }}
              onCancel={(changeId) => {
                if (window.confirm('取消这条待发布变更？')) store.cancelChange(plan.id, changeId);
              }}
            />

            {pendingCount > 0 && (
              <div className="publish-block">
                <h4>变更攒够了？重出一版确认单</h4>
                <p className="empty-hint">
                  发布后会生成第 {sheet.currentVersion + 1} 版：未变动的点位沿用已签的名，
                  改动和新增点位需要重新逐个签字；第 {sheet.currentVersion} 版原样留档，随时可翻。
                </p>
                <IssueBar
                  submitLabel={`发布第 ${sheet.currentVersion + 1} 版`}
                  onSubmit={(p) => {
                    if (window.confirm(`确认把 ${pendingCount} 条变更并入新版？发布后旧版将封存不可改。`)) {
                      store.publishNewVersion(plan.id, p);
                    }
                  }}
                />
              </div>
            )}
          </div>

          {/* 版本档案 */}
          <div className="card">
            <h3 style={{ marginBottom: 12 }}>历史版本（旧版留档，随时可翻）</h3>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 80 }}>版本</th>
                  <th>出具人</th>
                  <th>出具时间</th>
                  <th>点位数</th>
                  <th>签字进度</th>
                  <th>说明</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {[...sheet.versions].reverse().map((v) => {
                  const p = sheetProgress(v.rows);
                  return (
                    <tr key={v.version}>
                      <td>
                        第 {v.version} 版
                        {v.version === sheet.currentVersion && (
                          <span className="badge badge-ok" style={{ marginLeft: 6 }}>
                            当前
                          </span>
                        )}
                      </td>
                      <td>
                        {ROLE_LABEL[v.createdByRole]} {v.createdByName}
                      </td>
                      <td>{formatTime(v.createdAt)}</td>
                      <td>{p.total}</td>
                      <td>
                        {p.signed}/{p.total}
                        {p.total > 0 && p.signed === p.total ? '（已对完）' : '（未对完）'}
                      </td>
                      <td>{v.note || '—'}</td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => setViewVersion(v.version)}>
                          翻阅
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
