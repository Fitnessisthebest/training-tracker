import { useState, useEffect, useMemo, useRef } from "react";

// ============================================================
// MOCK AUTH & STORAGE (localStorage-based for demo)
// ============================================================
const STORAGE_KEY = "training_tracker_v1";
const save = (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

// ============================================================
// HELPERS
// ============================================================
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fmt = (d) => {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
};
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

// ============================================================
// CYCLE CONFIG & SCHEDULE BUILDER
// ============================================================
// cycleConfig = { startDate: "2026-04-01", days: [{label:"胸"}, {label:"二頭"}, ...] }
// スケジュールはcycleConfigから毎回動的に生成 — localStorageには保存しない

const DEFAULT_CYCLE_CONFIG = {
  startDate: "2026-04-01",
  endDate: "2027-03-31",
  days: [
    { label: "胸" },
    { label: "二頭" },
    { label: "肩" },
    { label: "背中" },
    { label: "三頭" },
    { label: "前腕&腹筋" },
  ],
};

// ローカル日付を "YYYY-MM-DD" に変換（toISOString()はUTC基準でUTC+9では1日前になるため使わない）
const toLocalDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// cycleConfigからスケジュールを動的生成
// 戻り値: { "2026-04-01": { cycleNum:1, dayIndex:0, label:"胸" }, ... }
const buildScheduleFromConfig = (cfg) => {
  if (!cfg || !cfg.days || cfg.days.length === 0) return {};
  const sched = {};
  const start = new Date(cfg.startDate + "T00:00:00");
  const end = new Date(cfg.endDate + "T00:00:00");
  const n = cfg.days.length;
  let idx = 0;
  const d = new Date(start);
  while (d <= end) {
    const dateStr = toLocalDateStr(d); // ← UTC+9ズレ修正
    const cycleNum = Math.floor(idx / n) + 1;
    const dayIndex = idx % n;
    sched[dateStr] = { cycleNum, dayIndex, label: cfg.days[dayIndex].label };
    idx++;
    d.setDate(d.getDate() + 1);
  }
  return sched;
};

// 今日のクール情報
const getCycleInfoFromSchedule = (dateStr, dynSched, cfg) => {
  const entry = dynSched[dateStr];
  if (!entry || !cfg) return null;
  const totalDays = Object.keys(dynSched).length;
  const start = new Date(cfg.startDate + "T00:00:00");
  const d = new Date(dateStr + "T00:00:00");
  const diffDays = Math.floor((d - start) / 86400000);
  const n = cfg.days.length;
  const totalCycles = Math.ceil(totalDays / n);
  const progress = Math.round((diffDays / (totalDays - 1)) * 100);
  return {
    cycleNum: entry.cycleNum,
    dayIndex: entry.dayIndex,
    dayInCycle: entry.dayIndex + 1,
    label: entry.label,
    totalCycles,
    cycleLen: n,
    progress: Math.min(100, progress),
  };
};

// ============================================================
// 部位別プリセット種目
// ============================================================
const PRESET_EXERCISES = {
  "胸": [
    "ベンチプレス", "インクラインベンチプレス", "デクラインベンチプレス",
    "ダンベルフライ", "インクラインDBフライ", "デクラインDBフライ",
    "ペックフライ（マシン）", "ケーブルクロスオーバー", "インクラインケーブルフライ",
    "ディップス", "プッシュアップ", "ワイドプッシュアップ",
    "スミスマシンベンチプレス", "インクラインスミスプレス", "ランドマインプレス",
    "ダンベルプルオーバー", "チェストプレス（マシン）", "ケーブルフライ（低位）",
  ],
  "二頭": [
    "バーベルカール", "EZバーカール", "ダンベルカール",
    "ハンマーカール", "インクラインDBカール", "プリーチャーカール",
    "コンセントレーションカール", "ケーブルカール", "リバースカール",
    "スパイダーカール", "ドラッグカール", "チンアップ（逆手）",
    "ケーブルハンマーカール", "マシンカール", "クロスボディハンマーカール",
    "EZバーリバースカール", "バーベルリバースカール", "ロープハンマーカール",
  ],
  "肩": [
    "バーベルショルダープレス", "DBショルダープレス", "アーノルドプレス",
    "サイドレイズ", "フロントレイズ", "リアレイズ",
    "フェイスプル", "アップライトロウ", "シュラッグ",
    "ケーブルサイドレイズ", "ケーブルリアレイズ", "インクラインサイドレイズ",
    "スミスショルダープレス", "マシンショルダープレス", "マシンリアデルト",
    "ランドマインプレス（肩）", "バーベルフロントレイズ", "DBシュラッグ",
  ],
  "背中": [
    "デッドリフト", "チンアップ（懸垂）", "ラットプルダウン",
    "シーテッドロウ", "ベントオーバーロウ", "Tバーロウ",
    "ワンハンドDBロウ", "ケーブルロウ", "ハイプーリー",
    "スモデッドリフト", "ルーマニアンDL", "ラックプル",
    "ワイドグリップラットプルダウン", "アンダーグリップラットプルダウン", "ストレートアームプルダウン",
    "インクラインDBロウ", "ペンドレイロウ", "マシンロウ",
  ],
  "三頭": [
    "クローズグリップベンチプレス", "ライイングトライセプスエクステ", "プレスダウン（ケーブル）",
    "オーバーヘッドエクステ", "ダンベルキックバック", "スカルクラッシャー",
    "ディップス（三頭）", "ロープトライセプス", "リバースグリッププレスダウン",
    "ダンベルオーバーヘッドエクステ", "ケーブルオーバーヘッドエクステ", "インクラインDBエクステ",
    "スミスクローズグリップ", "トライセプスプッシュアップ", "マシントライセプス",
    "ワンアームケーブルプレスダウン", "バーベルオーバーヘッドエクステ", "ベンチディップス",
  ],
  "前腕": [
    "リストカール", "リバースリストカール", "ハンマーカール",
    "リバースカール", "バーハング", "プレートピンチ",
    "ビハインドバックリストカール", "ケーブルリストカール", "リストローラー",
    "ファーマーズウォーク", "グリッパー", "フィンガーエクステンション",
  ],
  "腹筋": [
    "クランチ", "レッグレイズ", "ハンギングニーレイズ",
    "プランク", "アブローラー", "サイドベント",
    "トーソーローテーション", "バイシクルクランチ", "ドラゴンフラッグ",
    "ケーブルクランチ", "ロシアンツイスト", "リバースクランチ",
    "マウンテンクライマー", "Vシットアップ", "サイドプランク",
    "デクラインクランチ", "ハンギングレッグレイズ", "アブドミナルマシン",
  ],
  "脚": [
    "スクワット", "レッグプレス", "レッグエクステンション",
    "レッグカール", "ルーマニアンデッドリフト", "ランジ",
    "ハックスクワット", "カーフレイズ", "レッグアブダクション",
    "フロントスクワット", "ゴブレットスクワット", "ブルガリアンスプリットスクワット",
    "シーテッドレッグカール", "ライイングレッグカール", "ヒップアダクション",
    "シーテッドカーフレイズ", "スミススクワット", "ステップアップ",
  ],
  "臀部": [
    "ヒップスラスト", "グルートブリッジ", "ケーブルキックバック",
    "サイドウォーク（バンド）", "クラムシェル", "ルーマニアンDL",
    "バーベルヒップスラスト", "シングルレッグヒップスラスト", "ドンキーキックバック",
    "ケーブルヒップアブダクション", "モンスターウォーク", "スモスクワット",
  ],
};

// 部位名に対応するプリセットを返す（部分一致も対応）
const getPresetForLabel = (label) => {
  if (!label) return [];
  // 完全一致
  if (PRESET_EXERCISES[label]) return PRESET_EXERCISES[label];
  // 部分一致（「前腕&腹筋」→「前腕」+「腹筋」をマージ）
  const matched = [];
  Object.entries(PRESET_EXERCISES).forEach(([key, list]) => {
    if (label.includes(key)) matched.push(...list);
  });
  return matched.length > 0 ? [...new Set(matched)] : [];
};

// ============================================================
// DEFAULT MENUS (種目データ — cycleConfigとは分離)
// ============================================================
const DEFAULT_MENUS = {
  menu_chest: { name: "胸", exercises: [{ name: "ベンチプレス", planned: 4 }, { name: "インクラインDB", planned: 3 }, { name: "ペックフライ", planned: 3 }] },
  menu_bicep: { name: "二頭", exercises: [{ name: "バーベルカール", planned: 4 }, { name: "ハンマーカール", planned: 3 }, { name: "インクラインカール", planned: 3 }] },
  menu_shoulder: { name: "肩", exercises: [{ name: "ショルダープレス", planned: 4 }, { name: "サイドレイズ", planned: 4 }, { name: "リアレイズ", planned: 3 }] },
  menu_back: { name: "背中", exercises: [{ name: "デッドリフト", planned: 4 }, { name: "チンニング", planned: 3 }, { name: "ロープロウ", planned: 3 }] },
  menu_tricep: { name: "三頭", exercises: [{ name: "クローズGBP", planned: 4 }, { name: "ライイングエクステ", planned: 3 }, { name: "プレスダウン", planned: 3 }] },
  menu_forearm: { name: "前腕&腹筋", exercises: [{ name: "リストカール", planned: 3 }, { name: "リバースカール", planned: 3 }, { name: "クランチ", planned: 3 }, { name: "レッグレイズ", planned: 3 }] },
};

const DB_VERSION = "v2_clean_menus";

const initDb = () => {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { }

  // 旧形式（menu_day1 / name:"Day1 胸"）が残っていたら完全リセット
  const hasOldFormat = stored.menus && Object.values(stored.menus).some(
    m => m.name && (m.name.startsWith("Day") || m.short !== undefined)
  );

  if (stored.dbVersion !== DB_VERSION || hasOldFormat) {
    const fresh = {
      dbVersion: DB_VERSION,
      menus: DEFAULT_MENUS,
      logs: stored.logs || {},   // ログだけ引き継ぐ
      cycleConfig: stored.cycleConfig && !hasOldFormat
        ? stored.cycleConfig
        : DEFAULT_CYCLE_CONFIG,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
  }
  return stored;
};

// ============================================================
// TIMER EDIT BUTTON — タイマー左側の時間変更ボタン
// ============================================================
function TimerEditButton({ timerSec, timerState, onChangeSec }) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState("");
  const idle = timerState === null;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const applyEdit = () => {
    const v = Math.max(1, Math.min(3600, parseInt(editVal) || timerSec));
    onChangeSec(v);
    setEditing(false);
  };

  if (!idle) return null; // カウント中・DONE中は非表示

  return editing ? (
    <div onClick={e => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        <input
          type="number" value={editVal} autoFocus
          onChange={e => setEditVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") applyEdit(); if (e.key === "Escape") setEditing(false); }}
          style={{ width: 48, background: "#0f172a", border: "1px solid #6366f1", borderRadius: 6, color: "#f1f5f9", padding: "4px 5px", fontSize: 13, textAlign: "center", fontFamily: "'DM Sans',sans-serif" }}
        />
        <span style={{ fontSize: 10, color: "#64748b" }}>秒</span>
      </div>
      <button onClick={applyEdit} style={{ background: "#6366f1", border: "none", borderRadius: 5, color: "#fff", fontSize: 11, padding: "3px 10px", cursor: "pointer" }}>✓</button>
    </div>
  ) : (
    <button
      onClick={e => { e.stopPropagation(); setEditVal(String(timerSec)); setEditing(true); }}
      style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, cursor: "pointer", padding: "6px 10px", fontFamily: "'DM Sans',sans-serif", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
    >
      <span style={{ fontSize: 9, color: "#475569" }}>時間</span>
      <span style={{ fontSize: 14, color: "#94a3b8", fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>{fmt(timerSec)}</span>
      <span style={{ fontSize: 8, color: "#334155" }}>✏️ 変更</span>
    </button>
  );
}

// ============================================================
// EXERCISE TIMER — スタートボタン（時間変更UIは TimerEditButton へ）
// ============================================================
function ExerciseTimer({ timerSec, timerState, onTap, canInput }) {
  if (!canInput) return null;
  const remaining = timerState?.remaining ?? timerSec;
  const done = timerState?.done ?? false;
  const running = timerState !== null && !done;
  const idle = timerState === null;
  const pct = (remaining / timerSec) * 100;
  const color = done ? "#22c55e" : running && remaining <= 15 ? "#06b6d4" : "#a78bfa";
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const R = 30, circ = 2 * Math.PI * R;
  const R_large = 110, circ_large = 2 * Math.PI * R_large;

  return (
    <>
      {/* 拡大オーバーレイ */}
      {!idle && (
        <div onClick={e => { e.stopPropagation(); onTap(); }}
          style={{ position: "fixed", inset: 0, zIndex: 300, background: "#0f172aee", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
          <div style={{ position: "relative", width: 280, height: 280, marginBottom: 24 }}>
            <svg width="280" height="280" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="140" cy="140" r={R_large} fill="none" stroke="#1e293b" strokeWidth="10" />
              <circle cx="140" cy="140" r={R_large} fill="none" stroke={color} strokeWidth="10"
                strokeDasharray={circ_large}
                strokeDashoffset={circ_large * (1 - pct / 100)}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.9s linear, stroke 0.3s" }}
              />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              {done ? (
                <><span style={{ fontSize: 60 }}>✓</span><span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: "#22c55e", letterSpacing: 4, marginTop: 4 }}>DONE</span></>
              ) : (
                <><span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 72, color, lineHeight: 1, letterSpacing: 2 }}>{fmt(remaining)}</span><span style={{ fontSize: 13, color: "#475569", marginTop: 8, letterSpacing: 1 }}>INTERVAL</span></>
              )}
            </div>
          </div>
          <div style={{ fontSize: 13, color: "#475569", letterSpacing: 1 }}>{done ? "タップでリセット" : "タップで閉じる"}</div>
        </div>
      )}

      {/* 小さい円（ヘッダー常設） */}
      <div onClick={e => { e.stopPropagation(); onTap(); }}
        style={{ position: "relative", width: 72, height: 72, cursor: "pointer", flexShrink: 0 }}>
        <svg width="72" height="72" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="36" cy="36" r={R} fill="none" stroke="#0f172a" strokeWidth="5" />
          <circle cx="36" cy="36" r={R} fill="none"
            stroke={idle ? "#6366f133" : color} strokeWidth="5"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - (idle ? 1 : pct / 100))}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.9s linear, stroke 0.3s" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: idle ? "#6366f111" : "transparent", borderRadius: "50%" }}>
          {idle ? (
            <><span style={{ fontSize: 20 }}>▶</span><span style={{ fontSize: 8, color: "#6366f1", fontWeight: 700, letterSpacing: 0.5, marginTop: 1 }}>START</span></>
          ) : done ? (
            <><span style={{ fontSize: 18 }}>✓</span><span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 10, color: "#22c55e", letterSpacing: 1 }}>DONE</span></>
          ) : (
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color, lineHeight: 1 }}>{fmt(remaining)}</span>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================
// DAY SCREEN INNER — App外のトップレベルコンポーネント
// timerMapがApp stateで1秒ごとに更新されても再マウントされない
// ============================================================

function DayScreenInner({ selectedDate, dynSched, logs, menus, fromToday, setDb, updateDb, setScreen, STORAGE_KEY }) {
  const entry = dynSched[selectedDate];
  const log = logs[selectedDate] || {};
  const canInput = fromToday;

  const defaultExercises = () => {
    if (log.exercises) return log.exercises;
    if (!entry) return [];
    const matched =
      Object.values(menus).find(m => m.name === entry.label) ||
      Object.values(menus).find(m => m.short === entry.label) ||
      Object.values(menus).find(m => m.name?.includes(entry.label) || entry.label?.includes(m.name));
    return matched ? matched.exercises.map(e => ({ ...e, sets: null })) : [];
  };

  const localRef = useRef(null);
  if (localRef.current === null) {
    // localStorageから最新データを優先して読み込む
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      const storedLog = stored.logs?.[selectedDate];
      if (storedLog?.exercises) {
        localRef.current = storedLog.exercises;
      } else {
        localRef.current = defaultExercises();
      }
    } catch {
      localRef.current = defaultExercises();
    }
  }
  const openIdxRef = useRef(null);
  const [, forceUpdate] = useState(0);
  const [note, setNote] = useState(log.note || "");

  // 種目ごとのタイマー: { exIdx: { remaining, done } } | undefined
  const [exTimers, setExTimers] = useState({});
  const [exTimerSecs, setExTimerSecs] = useState(() => (localRef.current || []).map(() => 120));
  const intervalRef = useRef(null);
  const activeExIdxRef = useRef(null);

  const tapTimer = (exIdx) => {
    const cur = exTimers[exIdx];

    // done後はリセットして再スタート可能に
    if (cur?.done) {
      setExTimers(prev => ({ ...prev, [exIdx]: null }));
      return;
    }

    if (cur) return; // カウント中は無視

    // 他に動いているタイマーを止める
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    const tSec = exTimerSecs[exIdx] || 120;
    activeExIdxRef.current = exIdx;
    setExTimers(prev => ({ ...prev, [exIdx]: { remaining: tSec, done: false } }));
    intervalRef.current = setInterval(() => {
      setExTimers(prev => {
        const t = prev[activeExIdxRef.current];
        if (!t || t.done) { clearInterval(intervalRef.current); intervalRef.current = null; return prev; }
        if (t.remaining <= 1) {
          clearInterval(intervalRef.current); intervalRef.current = null; activeExIdxRef.current = null;
          return { ...prev, [exIdx]: { remaining: 0, done: true } };
        }
        return { ...prev, [exIdx]: { ...t, remaining: t.remaining - 1 } };
      });
    }, 1000);
  };


  const toggleExercise = (exIdx) => {
    if (openIdxRef.current === exIdx) {
      openIdxRef.current = null;
      forceUpdate(n => n + 1);
      return;
    }
    const ex = localRef.current[exIdx];
    if (ex && ex.sets === null) {
      const blankSets = Array.from({ length: ex.planned }, () => ({ kg: "", reps: "", memo: "" }));
      localRef.current = localRef.current.map((e, i) => i === exIdx ? { ...e, sets: blankSets } : e);
    }
    openIdxRef.current = exIdx;
    forceUpdate(n => n + 1);
  };

  const saveToLocalStorage = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      stored.logs = { ...(stored.logs || {}), [selectedDate]: { exercises: localRef.current, note, savedAt: new Date().toISOString() } };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch { }
  };

  const updateSet = (exIdx, setIdx, field, val) => {
    localRef.current = localRef.current.map((ex, i) => i !== exIdx ? ex : {
      ...ex, sets: ex.sets.map((s, j) => j !== setIdx ? s : { ...s, [field]: val })
    });
    saveToLocalStorage();
    forceUpdate(n => n + 1);
  };

  const addExtraSet = (exIdx) => {
    localRef.current = localRef.current.map((ex, i) => i !== exIdx ? ex : {
      ...ex, sets: [...(ex.sets || []), { kg: "", reps: "", memo: "" }]
    });
    saveToLocalStorage();
    forceUpdate(n => n + 1);
  };

  const isSetCompleteFn = (s) => s.kg !== "" && s.reps !== "";
  const totalPlanned = localRef.current.reduce((s, e) => s + (e.planned || 0), 0);
  const totalDone = localRef.current.reduce((s, e) => s + (e.sets?.filter(isSetCompleteFn).length || 0), 0);
  const diff = totalDone - totalPlanned;
  const allCompleted = totalPlanned > 0 && totalDone >= totalPlanned;

  return (
    <div style={{ paddingBottom: 100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 20px 12px" }}>
        <button onClick={() => {
          setDb(prev => ({
            ...prev,
            logs: { ...prev.logs, [selectedDate]: { exercises: localRef.current, note, savedAt: new Date().toISOString() } }
          }));
          setScreen("calendar");
        }} style={btnGhost}>←</button>
        <div>
          <div style={{ fontSize: 22, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, color: "#f1f5f9" }}>{fmt(selectedDate)}</div>
          {entry
            ? <div style={{ fontSize: 12, color: "#94a3b8" }}>C{entry.cycleNum} — Day{entry.dayIndex + 1}：{entry.label}</div>
            : <div style={{ fontSize: 12, color: "#475569" }}>クール期間外</div>}
        </div>
      </div>

      {localRef.current.length > 0 && (
        <div style={{ margin: "0 16px 14px", background: "#1e293b", borderRadius: 14, padding: "14px 18px", display: "flex", justifyContent: "space-around" }}>
          {[["予定", totalPlanned, "#f1f5f9"], ["実施", totalDone, totalDone >= totalPlanned ? "#22c55e" : "#f59e0b"], ["差分", (diff >= 0 ? "+" : "") + diff, diff >= 0 ? "#22c55e" : "#ef4444"]].map(([label, val, color]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 26, fontFamily: "'Bebas Neue', sans-serif", color, lineHeight: 1 }}>{val}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{label}セット</div>
            </div>
          ))}
        </div>
      )}
      {localRef.current.length === 0 && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "#64748b" }}>メニュー画面で種目を登録してください</div>
      )}

      {localRef.current.map((ex, exIdx) => {
        const sets = ex.sets || [];
        const isOpen = openIdxRef.current === exIdx;
        const planned = ex.planned || 0;
        const filled = sets.filter(isSetCompleteFn).length;
        const allDone = filled >= planned;
        return (
          <div key={exIdx} style={{ margin: "0 16px 10px", background: "#1e293b", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", userSelect: "none", gap: 8 }}>

              {/* 左：種目名エリア（タップで開閉） */}
              <div onClick={() => toggleExercise(exIdx)} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
                <div style={{ fontWeight: 600, color: "#e2e8f0", fontSize: 15, wordBreak: "break-word", overflowWrap: "anywhere", lineHeight: 1.3 }}>
                  {ex.name}
                </div>
                <div style={{ fontSize: 11, marginTop: 3, color: allDone && sets.length > 0 ? "#22c55e" : "#64748b" }}>
                  {ex.sets === null
                    ? `予定 ${planned} セット — タップして開く`
                    : `${filled} / ${planned} セット完了${sets.length > planned ? `（+${sets.length - planned}追加）` : ""}`}
                </div>
              </div>

              {/* 右：時間変更ボタン + タイマー + 開閉矢印 */}
              {canInput && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {/* 時間変更ボタン */}
                  <TimerEditButton
                    timerSec={exTimerSecs[exIdx] ?? 120}
                    timerState={exTimers[exIdx] ?? null}
                    onChangeSec={(v) => setExTimerSecs(prev => { const next = [...prev]; next[exIdx] = v; return next; })}
                  />
                  {/* タイマー本体 */}
                  <ExerciseTimer
                    timerSec={exTimerSecs[exIdx] ?? 120}
                    timerState={exTimers[exIdx] ?? null}
                    onTap={() => tapTimer(exIdx)}
                    canInput={canInput}
                  />
                </div>
              )}
              <span onClick={() => toggleExercise(exIdx)} style={{ color: "#475569", fontSize: 18, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", cursor: "pointer", flexShrink: 0 }}>▾</span>
            </div>

            {isOpen && (
              <div style={{ borderTop: "1px solid #0f172a" }}>
                {sets.map((s, setIdx) => (
                  <div key={setIdx} style={{ padding: "10px 16px", borderBottom: setIdx < sets.length - 1 ? "1px solid #0f172a" : "none", background: setIdx % 2 === 0 ? "transparent" : "#ffffff05" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: setIdx < planned ? "#475569" : "#f59e0b", marginBottom: 7 }}>
                      {setIdx < planned ? `SET ${setIdx + 1}` : `SET ${setIdx + 1}（追加）`}
                    </div>
                    {canInput ? (
                      <>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input type="number" placeholder="0" value={s.kg}
                              onChange={e => updateSet(exIdx, setIdx, "kg", e.target.value)}
                              style={{ width: 60, background: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#f1f5f9", padding: "7px 8px", fontSize: 15, textAlign: "center", fontFamily: "'DM Sans', sans-serif" }} />
                            <span style={{ fontSize: 12, color: "#64748b" }}>kg</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input type="number" placeholder="0" value={s.reps}
                              onChange={e => updateSet(exIdx, setIdx, "reps", e.target.value)}
                              style={{ width: 60, background: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#f1f5f9", padding: "7px 8px", fontSize: 15, textAlign: "center", fontFamily: "'DM Sans', sans-serif" }} />
                            <span style={{ fontSize: 12, color: "#64748b" }}>rep</span>
                          </div>
                        </div>
                        <input placeholder="メモ（任意）" value={s.memo}
                          onChange={e => updateSet(exIdx, setIdx, "memo", e.target.value)}
                          style={{ width: "100%", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, color: "#94a3b8", padding: "6px 10px", fontSize: 12, boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" }} />
                      </>
                    ) : (
                      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                        <span style={{ fontSize: 14, color: s.kg ? "#f1f5f9" : "#334155" }}>{s.kg || "—"} kg</span>
                        <span style={{ fontSize: 14, color: s.reps ? "#f1f5f9" : "#334155" }}>{s.reps || "—"} rep</span>
                        {s.memo ? <span style={{ fontSize: 12, color: "#64748b" }}>{s.memo}</span> : null}
                      </div>
                    )}
                  </div>
                ))}
                {canInput && allDone && (
                  <div style={{ padding: "10px 16px" }}>
                    <button onClick={() => addExtraSet(exIdx)}
                      style={{ width: "100%", background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                      ＋ 追加セット
                    </button>
                  </div>
                )}
                {!canInput && (
                  <div style={{ padding: "10px 16px", textAlign: "center", fontSize: 12, color: "#475569" }}>入力はTODAY画面から</div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ margin: "0 16px 14px" }}>
        <textarea placeholder="全体メモ（任意）" value={note}
          onChange={e => setNote(e.target.value)}
          style={{ width: "100%", background: "#1e293b", border: "none", borderRadius: 12, color: "#e2e8f0", padding: "12px 14px", fontSize: 14, resize: "none", height: 72, boxSizing: "border-box" }} />
      </div>

      {canInput && (
        <div style={{ padding: "0 16px 14px" }}>
          {allCompleted ? (
            <button onClick={() => setDb(prev => ({ ...prev, logs: { ...prev.logs, [selectedDate]: { exercises: localRef.current, note, savedAt: new Date().toISOString() } } }))}
              style={{ width: "100%", border: "none", borderRadius: 14, padding: "18px 20px", cursor: "pointer", background: "linear-gradient(135deg, #14532d, #166534)", boxShadow: "0 4px 24px #22c55e33", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "transform 0.1s, box-shadow 0.1s" }}
              onPointerDown={e => { e.currentTarget.style.transform = "scale(0.97)"; e.currentTarget.style.boxShadow = "0 1px 8px #22c55e22"; }}
              onPointerUp={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 24px #22c55e33"; }}
              onPointerLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 24px #22c55e33"; }}>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 3, color: "#fff" }}>🎉 CONGRATULATIONS!</span>
              <span style={{ fontSize: 11, color: "#86efac", fontWeight: 600, textAlign: "right", lineHeight: 1.4 }}>タップで{"\n"}保存</span>
            </button>
          ) : (
            <div style={{ fontSize: 11, color: "#334155", textAlign: "center" }}>入力すると自動保存されます</div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
const MIN_YM = { year: 2026, month: 2 }; // March 2026
const MAX_YM = { year: 2030, month: 11 }; // December 2030
const ymCmp = (a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month;

export default function App() {
  const [db, setDb] = useState(initDb);
  const [screen, setScreen] = useState("today");
  const [selectedDate, setSelectedDate] = useState(today());
  const nowDate = new Date();
  const [ym, setYm] = useState(() => {
    const y = nowDate.getFullYear();
    const m = nowDate.getMonth();
    const cand = { year: y, month: m };
    if (ymCmp(cand, MIN_YM) < 0) return { ...MIN_YM };
    if (ymCmp(cand, MAX_YM) > 0) return { ...MAX_YM };
    return cand;
  });
  const year = ym.year;
  const month = ym.month;

  const [showMenuForm, setShowMenuForm] = useState(false);
  const [editingMenu, setEditingMenu] = useState(null);
  const [fromToday, setFromToday] = useState(false);

  useEffect(() => { save(db); }, [db]);

  // --- derived data ---
  const menus = db.menus || {};
  const logs = db.logs || {};
  const cycleConfig = db.cycleConfig || DEFAULT_CYCLE_CONFIG;

  // スケジュールをcycleConfigから毎回動的生成（localStorageに依存しない）
  const dynSched = useMemo(() => buildScheduleFromConfig(cycleConfig), [cycleConfig]);

  const updateDb = (patch) => setDb(prev => ({ ...prev, ...patch }));

  const prevMonth = () => setYm(cur => {
    if (ymCmp(cur, MIN_YM) <= 0) return cur;
    return cur.month === 0 ? { year: cur.year - 1, month: 11 } : { year: cur.year, month: cur.month - 1 };
  });
  const nextMonth = () => setYm(cur => {
    if (ymCmp(cur, MAX_YM) >= 0) return cur;
    return cur.month === 11 ? { year: cur.year + 1, month: 0 } : { year: cur.year, month: cur.month + 1 };
  });

  // ============================================================
  // SCREEN: TODAY
  // ============================================================
  const TodayScreen = () => {
    const todayStr = today();
    const entry = dynSched[todayStr];
    const log = logs[todayStr] || {};
    const CYCLE_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#14b8a6", "#8b5cf6", "#f97316", "#06b6d4", "#84cc16"];
    const cycleColor = entry ? CYCLE_COLORS[(entry.cycleNum - 1) % CYCLE_COLORS.length] : "#334155";

    // 今日の達成状況
    const todayMenu = entry ? Object.values(menus).find(m => m.name === entry.label) : null;
    const isSetComplete = (s) => s.kg !== "" && s.reps !== "";
    const totalPlanned = todayMenu ? todayMenu.exercises.reduce((s, e) => s + e.planned, 0) : 0;
    const totalDone = log.exercises
      ? log.exercises.reduce((s, e) => s + (Array.isArray(e.sets) ? e.sets.filter(isSetComplete).length : (e.done || 0)), 0)
      : 0;
    const hasLog = log.exercises && log.exercises.length > 0;
    const allDone = hasLog && totalDone >= totalPlanned && totalPlanned > 0;

    // 直近7日の達成履歴
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(todayStr + "T00:00:00");
      d.setDate(d.getDate() - (6 - i));
      const dateStr = toLocalDateStr(d);
      const e = dynSched[dateStr];
      const l = logs[dateStr];
      const done = l?.exercises
        ? l.exercises.reduce((s, ex) => s + (Array.isArray(ex.sets) ? ex.sets.filter(isSetComplete).length : (ex.done || 0)), 0)
        : 0;
      const planned = e ? (Object.values(menus).find(m => m.name === e.label)?.exercises.reduce((s, ex) => s + ex.planned, 0) || 0) : 0;
      return { dateStr, e, l, done, planned, isToday: dateStr === todayStr };
    });

    const dt = new Date(todayStr + "T00:00:00");
    const dateLabel = dt.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });

    return (
      <div style={{ paddingBottom: 100 }}>
        {/* ヘッダー */}
        <div style={{ padding: "28px 20px 20px" }}>
          <div style={{ fontSize: 13, color: "#475569", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>TODAY</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 34, color: "#f1f5f9", letterSpacing: 2, lineHeight: 1 }}>{dateLabel}</div>
        </div>

        {/* 今日のクール・部位バナー */}
        {entry ? (
          <div style={{
            margin: "0 16px 16px",
            background: `linear-gradient(135deg, ${cycleColor}22, ${cycleColor}11)`,
            border: `1px solid ${cycleColor}44`,
            borderLeft: `4px solid ${cycleColor}`,
            borderRadius: 16, padding: "18px 20px",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: -16, right: -16, width: 80, height: 80, borderRadius: "50%", background: cycleColor + "22", filter: "blur(20px)", pointerEvents: "none" }} />
            <div style={{ fontSize: 11, color: cycleColor, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
              C{entry.cycleNum} — Day{entry.dayIndex + 1}
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 44, color: "#f1f5f9", lineHeight: 1, marginBottom: 8 }}>
              {entry.label}
            </div>
            {todayMenu && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {todayMenu.exercises.map((ex, i) => (
                  <div key={i} style={{ background: cycleColor + "22", border: `1px solid ${cycleColor}33`, borderRadius: 20, padding: "4px 12px", fontSize: 12, color: "#e2e8f0" }}>
                    {ex.name} <span style={{ color: cycleColor, fontWeight: 700 }}>{ex.planned}set</span>
                  </div>
                ))}
              </div>
            )}
            {/* 進捗バー */}
            {totalPlanned > 0 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", marginBottom: 4 }}>
                  <span>{hasLog ? `${totalDone} / ${totalPlanned} set完了` : "未記録"}</span>
                  <span style={{ color: allDone ? "#22c55e" : cycleColor }}>{totalPlanned > 0 ? Math.round((totalDone / totalPlanned) * 100) : 0}%</span>
                </div>
                <div style={{ height: 6, background: "#0f172a", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${totalPlanned > 0 ? Math.min(100, (totalDone / totalPlanned) * 100) : 0}%`, background: allDone ? "#22c55e" : cycleColor, borderRadius: 3, transition: "width 0.4s" }} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ margin: "0 16px 16px", background: "#1e293b", borderRadius: 16, padding: "20px", textAlign: "center", color: "#475569" }}>
            クール期間外です
          </div>
        )}

        {/* 記録ボタン */}
        {entry && (
          <div style={{ padding: "0 16px 16px" }}>
            <button
              onClick={() => { setSelectedDate(todayStr); setFromToday(true); setScreen("day"); }}
              style={{
                width: "100%", border: "none", borderRadius: 14, padding: "18px",
                cursor: "pointer", fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 22, letterSpacing: 3,
                background: allDone
                  ? "linear-gradient(135deg, #14532d, #166534)"
                  : `linear-gradient(135deg, ${cycleColor}, ${cycleColor}aa)`,
                color: "#fff",
                boxShadow: allDone ? "none" : `0 4px 24px ${cycleColor}44`,
              }}
            >
              {allDone ? "COMPLETED — EDIT" : hasLog ? "CONTINUE SESSION" : "START TRAINING"}
            </button>
          </div>
        )}

        {/* 直近7日 */}
        <div style={{ margin: "0 16px 16px", background: "#1e293b", borderRadius: 14, padding: "16px" }}>
          <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>直近7日</div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {last7.map(({ dateStr, e, done, planned, isToday }) => {
              const cc = e ? CYCLE_COLORS[(e.cycleNum - 1) % CYCLE_COLORS.length] : "#1e293b";
              const status = !e ? "off" : done >= planned && planned > 0 ? "done" : done > 0 ? "partial" : logs[dateStr] ? "missed" : "scheduled";
              const bg = status === "done" ? "#22c55e" : status === "partial" ? "#f59e0b" : status === "missed" ? "#ef4444" : e ? cc + "44" : "#0f172a";
              const d = new Date(dateStr + "T00:00:00");
              return (
                <div key={dateStr}
                  onClick={() => { setSelectedDate(dateStr); setFromToday(dateStr === todayStr); setScreen("day"); }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: e ? "pointer" : "default" }}
                >
                  <div style={{ fontSize: 10, color: isToday ? "#f59e0b" : "#475569", fontWeight: isToday ? 700 : 400 }}>
                    {WEEKDAYS[d.getDay()]}
                  </div>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: bg,
                    border: isToday ? "2px solid #f59e0b" : `1px solid ${e ? cc + "66" : "#334155"}`,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 11, color: status === "done" || status === "partial" || status === "missed" ? "#0f172a" : "#94a3b8", fontWeight: 700 }}>
                      {d.getDate()}
                    </span>
                  </div>
                  <div style={{ fontSize: 9, color: "#334155", textAlign: "center", maxWidth: 36, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                    {e ? e.label : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  // SCREEN: CALENDAR
  // ============================================================
  const CalendarScreen = () => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const getStatus = (date) => {
      const entry = dynSched[date];
      if (!entry) return "empty";
      const log = logs[date];
      if (!log) return "scheduled";
      const total = log.exercises?.reduce((s, e) => s + e.planned, 0) || 0;
      const done = log.exercises?.reduce((s, e) => s + e.done, 0) || 0;
      if (done >= total) return "done";
      if (done > 0) return "partial";
      return "missed";
    };

    const statusColor = {
      empty: "transparent", scheduled: "#334155",
      done: "#22c55e", partial: "#f59e0b", missed: "#ef4444",
    };

    const CYCLE_COLORS = [
      "#6366f1", "#ec4899", "#f59e0b", "#14b8a6",
      "#8b5cf6", "#f97316", "#06b6d4", "#84cc16",
    ];
    const getCycleColor = (n) => CYCLE_COLORS[(n - 1) % CYCLE_COLORS.length];

    const todayCycle = getCycleInfoFromSchedule(today(), dynSched, cycleConfig);
    const cycleLen = cycleConfig.days.length;

    return (
      <div style={{ padding: "0 0 80px" }}>
        {/* month nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 12px" }}>
          <button onClick={prevMonth} disabled={ymCmp(ym, MIN_YM) <= 0} style={{ ...btnGhost, opacity: ymCmp(ym, MIN_YM) <= 0 ? 0.3 : 1 }}>‹</button>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2, color: "#f1f5f9" }}>
            {year} / {MONTHS[month]}
          </span>
          <button onClick={nextMonth} disabled={ymCmp(ym, MAX_YM) >= 0} style={{ ...btnGhost, opacity: ymCmp(ym, MAX_YM) >= 0 ? 0.3 : 1 }}>›</button>
        </div>

        {/* CYCLE BANNER */}
        {todayCycle && (
          <div style={{
            margin: "0 16px 14px",
            background: "linear-gradient(135deg, #0f2027 0%, #1a3a4a 50%, #0f2027 100%)",
            border: "1px solid #22c55e33", borderRadius: 16, padding: "14px 18px",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: "#22c55e22", filter: "blur(20px)", pointerEvents: "none" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: "#64748b", letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>TODAY</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
                  <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 38, color: "#f1f5f9", lineHeight: 1 }}>{todayCycle.cycleNum}</span>
                  <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600 }}>/ {todayCycle.totalCycles} クール目</span>
                </div>
                <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 600, marginTop: 2 }}>Day{todayCycle.dayInCycle}：{todayCycle.label}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#64748b", letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>DAY IN CYCLE</div>
                <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end", flexWrap: "wrap", maxWidth: 160 }}>
                  {cycleConfig.days.map((day, n) => (
                    <div key={n} style={{
                      width: 20, height: 20, borderRadius: 5,
                      background: n < todayCycle.dayIndex ? "#22c55e" : n === todayCycle.dayIndex ? "#f59e0b" : "#1e293b",
                      border: n === todayCycle.dayIndex ? "2px solid #f59e0b" : "1px solid #334155",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 8, fontWeight: 700,
                      color: n <= todayCycle.dayIndex ? "#0f172a" : "#475569",
                    }}>{n + 1}</div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${todayCycle.progress}%`, background: "linear-gradient(90deg, #22c55e, #86efac)", borderRadius: 2 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
              <span style={{ fontSize: 10, color: "#475569" }}>START {cycleConfig.startDate}</span>
              <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 600 }}>{todayCycle.progress}% 完了</span>
              <span style={{ fontSize: 10, color: "#475569" }}>END {cycleConfig.endDate}</span>
            </div>
          </div>
        )}

        {/* weekday headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, padding: "0 12px" }}>
          {WEEKDAYS.map(w => (
            <div key={w} style={{ textAlign: "center", fontSize: 11, color: "#64748b", paddingBottom: 6, fontWeight: 600 }}>{w}</div>
          ))}
          {cells.map((day, i) => {
            const date = day ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
            const status = date ? getStatus(date) : null;
            const isToday = date === today();
            const entry = date ? dynSched[date] : null;
            const cycleColor = entry ? getCycleColor(entry.cycleNum) : null;

            return (
              <div key={i} onClick={() => { if (date) { setSelectedDate(date); setFromToday(false); setScreen("day"); } }}
                style={{
                  aspectRatio: "1", borderRadius: 10,
                  background: day ? (cycleColor ? cycleColor + "18" : "#1e293b") : "transparent",
                  border: isToday ? `2px solid ${cycleColor || "#f59e0b"}` : cycleColor ? `1px solid ${cycleColor}44` : "1px solid #1e293b",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  cursor: day ? "pointer" : "default",
                  position: "relative", overflow: "hidden", padding: "2px 1px", boxSizing: "border-box",
                }}
              >
                {cycleColor && (
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: cycleColor, borderRadius: "10px 0 0 10px" }} />
                )}
                {day && (
                  <>
                    <span style={{ fontSize: 11, color: isToday ? (cycleColor || "#f59e0b") : "#e2e8f0", fontWeight: isToday ? 700 : 400, lineHeight: 1.1 }}>{day}</span>
                    {entry && (
                      <span style={{ fontSize: 7, color: cycleColor || "#475569", fontWeight: 700, lineHeight: 1, marginTop: 1, opacity: 0.9 }}>C{entry.cycleNum}</span>
                    )}
                    {entry && (
                      <span style={{ fontSize: 7, color: cycleColor ? cycleColor + "dd" : "#94a3b8", fontWeight: 600, marginTop: 1, lineHeight: 1, textAlign: "center", maxWidth: "100%", overflow: "hidden" }}>
                        {entry.label}
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

      </div>
    );
  };

  // ============================================================
  // SCREEN: DAY DETAIL → DayScreenInnerを直接レンダリング
  // ============================================================

  // ============================================================
  // SCREEN: MENUS
  // ============================================================
  const MenusScreen = () => {
    const [editingPart, setEditingPart] = useState(null);
    const [form, setForm] = useState({ exercises: [] });
    const [customInput, setCustomInput] = useState("");
    const [customPlanned, setCustomPlanned] = useState(3);

    const CYCLE_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#14b8a6", "#8b5cf6", "#f97316", "#06b6d4", "#84cc16"];

    const openEdit = (label) => {
      const existing = Object.values(menus).find(m => m.name === label);
      setForm(existing ? { exercises: existing.exercises.map(e => ({ ...e })) } : { exercises: [] });
      setCustomInput("");
      setCustomPlanned(3);
      setEditingPart(label);
    };

    const isSelected = (name) => form.exercises.some(e => e.name === name);
    const togglePreset = (name) => {
      if (isSelected(name)) {
        setForm(f => ({ exercises: f.exercises.filter(e => e.name !== name) }));
      } else {
        setForm(f => ({ exercises: [...f.exercises, { name, planned: 3 }] }));
      }
    };
    const updatePlanned = (name, val) => setForm(f => ({
      exercises: f.exercises.map(e => e.name === name ? { ...e, planned: Math.max(1, Number(val)) } : e)
    }));
    const addCustom = () => {
      const trimmed = customInput.trim();
      if (!trimmed || isSelected(trimmed)) return;
      setForm(f => ({ exercises: [...f.exercises, { name: trimmed, planned: customPlanned }] }));
      setCustomInput("");
      setCustomPlanned(3);
    };
    const removeExercise = (name) => setForm(f => ({ exercises: f.exercises.filter(e => e.name !== name) }));

    const saveMenu = () => {
      const existingEntry = Object.entries(menus).find(([, m]) => m.name === editingPart);
      const id = existingEntry ? existingEntry[0] : `menu_${Date.now()}`;
      updateDb({ menus: { ...menus, [id]: { name: editingPart, exercises: form.exercises } } });
      setEditingPart(null);
    };

    // ── 編集フォーム ──────────────────────────────────────────
    if (editingPart) {
      const presets = getPresetForLabel(editingPart);
      const color = CYCLE_COLORS[cycleConfig.days.findIndex(d => d.label === editingPart) % CYCLE_COLORS.length] || "#6366f1";

      return (
        <div style={{ paddingBottom: 100 }}>
          {/* ヘッダー */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 20px 16px" }}>
            <button onClick={() => setEditingPart(null)} style={btnGhost}>←</button>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>メニュー編集</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color, lineHeight: 1.2 }}>{editingPart}</div>
            </div>
          </div>

          {/* プリセット選択 */}
          {presets.length > 0 && (
            <div style={{ margin: "0 16px 14px" }}>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>プリセットから選ぶ</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {presets.map(name => {
                  const sel = isSelected(name);
                  return (
                    <button key={name} onClick={() => togglePreset(name)} style={{
                      background: sel ? color + "33" : "#1e293b",
                      color: sel ? color : "#94a3b8",
                      border: `1px solid ${sel ? color : "#334155"}`,
                      borderRadius: 20, padding: "6px 14px",
                      fontSize: 13, fontWeight: sel ? 700 : 400,
                      cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                      transition: "all 0.15s",
                    }}>
                      {sel ? "✓ " : ""}{name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* カスタム追加 */}
          <div style={{ margin: "0 16px 14px", background: "#1e293b", borderRadius: 14, padding: "14px" }}>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>カスタム種目を追加</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                placeholder="種目名を入力"
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addCustom()}
                style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
              />
              <button onClick={addCustom} style={{ ...btnCircle, background: color, width: 36, height: 36, flexShrink: 0, fontSize: 20 }}>+</button>
            </div>
          </div>

          {/* 選択済み種目一覧 */}
          <div style={{ margin: "0 16px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
                選択中の種目 {form.exercises.length > 0 ? `（${form.exercises.length}種目）` : ""}
              </div>
              {form.exercises.length > 0 && (
                <div style={{ fontSize: 12, color, fontWeight: 700 }}>
                  総セット数：{form.exercises.reduce((s, e) => s + e.planned, 0)} set
                </div>
              )}
            </div>
            {form.exercises.length === 0 ? (
              <div style={{ textAlign: "center", color: "#475569", fontSize: 13, padding: "20px 0" }}>種目を選択してください</div>
            ) : (
              form.exercises.map((ex, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "#1e293b", borderRadius: 12, padding: "10px 12px", marginBottom: 8, borderLeft: `3px solid ${color}` }}>
                  <span style={{ flex: 1, fontSize: 14, color: "#e2e8f0", fontWeight: 500 }}>{ex.name}</span>
                  <button onClick={() => updatePlanned(ex.name, ex.planned - 1)} style={{ ...btnCircle, width: 26, height: 26, background: "#334155", fontSize: 14 }}>−</button>
                  <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: "#f1f5f9", width: 28, textAlign: "center" }}>{ex.planned}</span>
                  <button onClick={() => updatePlanned(ex.name, ex.planned + 1)} style={{ ...btnCircle, width: 26, height: 26, background: "#334155", fontSize: 14 }}>+</button>
                  <span style={{ fontSize: 11, color: "#64748b", width: 20 }}>set</span>
                  <button onClick={() => removeExercise(ex.name)} style={{ ...btnCircle, width: 26, height: 26, background: "#7f1d1d", fontSize: 13 }}>×</button>
                </div>
              ))
            )}
          </div>

          <div style={{ padding: "0 16px" }}>
            <button onClick={saveMenu} style={{ ...btnPrimary, width: "100%" }}>保存</button>
          </div>
        </div>
      );
    }

    // ── 一覧画面 ──────────────────────────────────────────────
    return (
      <div style={{ paddingBottom: 100 }}>
        <div style={{ padding: "20px 20px 4px" }}>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2, color: "#f1f5f9" }}>MY MENUS</span>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>クール設定の部位ごとにメニューを作成</div>
        </div>

        {cycleConfig.days.map((day, i) => {
          const label = day.label;
          const color = CYCLE_COLORS[i % CYCLE_COLORS.length];
          const existing = Object.values(menus).find(m => m.name === label);

          return (
            <div key={i} style={{ margin: "10px 16px 0", background: "#1e293b", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderLeft: `4px solid ${color}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: color + "33", border: `1px solid ${color}66`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color }}>
                    {i + 1}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 15 }}>{label}</div>
                    <div style={{ fontSize: 11, color: "#4ade80" }}>
                      {existing
                        ? `${existing.exercises.length}種目 / 総${existing.exercises.reduce((s, e) => s + e.planned, 0)}set`
                        : <span style={{ color: "#ef4444" }}>未作成</span>
                      }
                    </div>
                  </div>
                </div>
                <button onClick={() => openEdit(label)} style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 10, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  {existing ? "編集" : "＋ 作成"}
                </button>
              </div>
              {existing && existing.exercises.length > 0 && (
                <div style={{ borderTop: "1px solid #0f172a", padding: "8px 16px 12px" }}>
                  {existing.exercises.map((ex, j) => (
                    <div key={j} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#94a3b8", paddingTop: 6 }}>
                      <span>{ex.name}</span>
                      <span style={{ color: "#64748b" }}>{ex.planned} set</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ============================================================
  // SCREEN: STATS
  // ============================================================
  const StatsScreen = () => {
    // All days in range: 2026-04-01 to 2030-12-31
    const getAllDaysInRange = () => {
      const days = [];
      const start = new Date(2026, 3, 1);
      const end = new Date(2030, 11, 31);
      const d = new Date(start);
      while (d <= end) {
        days.push(d.toISOString().slice(0, 10));
        d.setDate(d.getDate() + 1);
      }
      return days;
    };
    const allDays = getAllDaysInRange();
    const scheduledDays = allDays.filter(d => dynSched[d]);

    // per-day achievement（新フォーマット: sets配列、旧フォーマット: done数値 の両対応）
    const isSetComplete = (s) => s.kg !== "" && s.reps !== "";
    const getAchRate = (d) => {
      const log = logs[d];
      if (!log?.exercises) return 0;
      const planned = log.exercises.reduce((s, e) => s + (e.planned || 0), 0);
      const done = log.exercises.reduce((s, e) => {
        if (Array.isArray(e.sets)) return s + e.sets.filter(isSetComplete).length;
        return s + (e.done || 0); // 旧フォーマット互換
      }, 0);
      return planned ? Math.min(1, done / planned) : 0;
    };

    // 総実施セット数（kg・reps両方入力済みのセットを集計）
    const totalSets = allDays.reduce((total, d) => {
      const log = logs[d];
      if (!log?.exercises) return total;
      return total + log.exercises.reduce((s, e) => {
        if (Array.isArray(e.sets)) return s + e.sets.filter(isSetComplete).length;
        return s + (e.done || 0);
      }, 0);
    }, 0);

    // streak
    let streak = 0;
    let maxStreak = 0;
    let cur = 0;
    for (const d of allDays) {
      if (dynSched[d] && logs[d] && getAchRate(d) >= 1) {
        cur++;
        maxStreak = Math.max(maxStreak, cur);
      } else if (dynSched[d]) {
        cur = 0;
      }
    }
    const todayStr = today();
    let streakCount = 0;
    for (let i = allDays.indexOf(todayStr); i >= 0; i--) {
      const d = allDays[i];
      if (dynSched[d] && logs[d] && getAchRate(d) >= 1) streakCount++;
      else if (dynSched[d]) break;
    }

    // monthly summary across full range
    const rangeMonths = [];
    for (let y = 2026; y <= 2030; y++) {
      const startM = y === 2026 ? 3 : 0;
      for (let m = startM; m <= 11; m++) {
        rangeMonths.push({ year: y, month: m, label: `${y}/${MONTHS[m]}` });
      }
    }
    const monthlySummary = rangeMonths.map(({ year: ry, month: rm, label }) => {
      const days = allDays.filter(d => {
        const dt = new Date(d);
        return dt.getFullYear() === ry && dt.getMonth() === rm;
      });
      const sched2 = days.filter(d => dynSched[d]);
      const done2 = sched2.filter(d => logs[d] && getAchRate(d) >= 1);
      return { label, sched: sched2.length, done: done2.length };
    });

    const overallRate = scheduledDays.length
      ? Math.round((scheduledDays.filter(d => logs[d] && getAchRate(d) >= 1).length / scheduledDays.length) * 100)
      : 0;

    const barMax = Math.max(...monthlySummary.map(m => m.sched), 1);

    return (
      <div style={{ padding: "0 0 100px" }}>
        <div style={{ padding: "20px 20px 16px" }}>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2, color: "#f1f5f9" }}>STATISTICS</span>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 16px 16px" }}>
          {[
            ["🔥", streakCount, "現在のストリーク", "日"],
            ["🏆", maxStreak, "最大ストリーク", "日"],
            ["📅", scheduledDays.length, "予定日数", "日"],
            ["✅", overallRate, "達成率", "%"],
            ["💪", totalSets, "総実施セット数", "set"],
          ].map(([icon, val, label, unit]) => (
            <div key={label} style={{ background: "#1e293b", borderRadius: 14, padding: "16px 14px" }}>
              <div style={{ fontSize: 22 }}>{icon}</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: "#f1f5f9", lineHeight: 1 }}>{val}<span style={{ fontSize: 16 }}>{unit}</span></div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Monthly bar chart */}
        <div style={{ margin: "0 16px 16px", background: "#1e293b", borderRadius: 14, padding: "16px" }}>
          <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 13, marginBottom: 14 }}>月別達成状況</div>
          {monthlySummary.map(({ label, sched, done }) => (
            <div key={label} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", marginBottom: 3 }}>
                <span>{label}</span>
                <span>{done}/{sched}</span>
              </div>
              <div style={{ height: 8, background: "#0f172a", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${sched ? (sched / barMax) * 100 : 0}%`, background: "#334155", borderRadius: 4, position: "relative" }}>
                  <div style={{ height: "100%", width: `${sched ? (done / sched) * 100 : 0}%`, background: "#22c55e", borderRadius: 4 }} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* weekly view */}
        <div style={{ margin: "0 16px", background: "#1e293b", borderRadius: 14, padding: "16px" }}>
          <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 13, marginBottom: 14 }}>{year}年{MONTHS[month]}の週別</div>
          {[0, 1, 2, 3, 4].map(w => {
            const weekDays = Array.from({ length: 7 }, (_, d) => {
              const dt = new Date(year, month, 1 + w * 7 + d);
              if (dt.getMonth() !== month) return null;
              return dt.toISOString().slice(0, 10);
            }).filter(Boolean);
            if (!weekDays.length) return null;
            return (
              <div key={w} style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "#64748b", width: 40 }}>第{w + 1}週</span>
                <div style={{ display: "flex", gap: 3 }}>
                  {weekDays.map(d => {
                    const inSched = !!dynSched[d];
                    const done = inSched && logs[d] && getAchRate(d) >= 1;
                    const partial = inSched && logs[d] && getAchRate(d) > 0;
                    const color = !inSched ? "#1e293b" : done ? "#22c55e" : partial ? "#f59e0b" : "#334155";
                    return <div key={d} style={{ width: 22, height: 22, borderRadius: 6, background: color }} />;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ============================================================
  // SCREEN: CYCLE CONFIG（クール設定）
  // ============================================================
  const CycleConfigScreen = () => {
    const [cfg, setCfg] = useState(() => JSON.parse(JSON.stringify(cycleConfig)));
    const [saved, setSaved] = useState(false);

    const addDay = () => setCfg(c => ({ ...c, days: [...c.days, { label: "" }] }));
    const removeDay = (i) => setCfg(c => ({ ...c, days: c.days.filter((_, j) => j !== i) }));
    const updateLabel = (i, val) => setCfg(c => ({ ...c, days: c.days.map((d, j) => j === i ? { label: val } : d) }));

    const saveCfg = () => {
      updateDb({ cycleConfig: cfg });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    };

    const totalDays = (() => {
      if (!cfg.startDate || !cfg.endDate) return 0;
      const s = new Date(cfg.startDate + "T00:00:00");
      const e = new Date(cfg.endDate + "T00:00:00");
      return Math.max(0, Math.floor((e - s) / 86400000) + 1);
    })();
    const cycleLen = cfg.days.length;
    const totalCycles = cycleLen > 0 ? Math.ceil(totalDays / cycleLen) : 0;

    const PREVIEW_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#14b8a6", "#8b5cf6", "#f97316", "#06b6d4", "#84cc16"];

    return (
      <div style={{ padding: "0 0 100px" }}>
        <div style={{ padding: "20px 20px 16px" }}>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2, color: "#f1f5f9" }}>クール設定</span>
        </div>

        {/* 期間設定 */}
        <div style={{ margin: "0 16px 12px", background: "#1e293b", borderRadius: 14, padding: "16px" }}>
          <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>期間</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>開始日</div>
              <input type="date" value={cfg.startDate}
                onChange={e => setCfg(c => ({ ...c, startDate: e.target.value }))}
                style={{ ...inputStyle, marginBottom: 0 }} />
            </div>
            <div style={{ color: "#475569", paddingTop: 16 }}>→</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>終了日</div>
              <input type="date" value={cfg.endDate}
                onChange={e => setCfg(c => ({ ...c, endDate: e.target.value }))}
                style={{ ...inputStyle, marginBottom: 0 }} />
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "#475569" }}>
            総日数 <span style={{ color: "#f1f5f9", fontWeight: 700 }}>{totalDays}</span> 日 ／ {cycleLen}日クール × <span style={{ color: "#22c55e", fontWeight: 700 }}>{totalCycles}</span> クール
          </div>
        </div>

        {/* 1クールの構成 */}
        <div style={{ margin: "0 16px 12px", background: "#1e293b", borderRadius: 14, padding: "16px" }}>
          <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
            1クールの構成（{cycleLen}日）
          </div>
          {cfg.days.map((day, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: PREVIEW_COLORS[i % PREVIEW_COLORS.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#0f172a", flexShrink: 0 }}>
                {i + 1}
              </div>
              <input
                placeholder={`Day${i + 1}の部位名`}
                value={day.label}
                onChange={e => updateLabel(i, e.target.value)}
                style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
              />
              {cfg.days.length > 1 && (
                <button onClick={() => removeDay(i)} style={{ ...btnCircle, background: "#7f1d1d", flexShrink: 0 }}>×</button>
              )}
            </div>
          ))}
          <button onClick={addDay} style={{ ...btnGhost, width: "100%", marginTop: 4 }}>＋ Day を追加</button>
        </div>

        {/* プレビュー */}
        <div style={{ margin: "0 16px 16px", background: "#1e293b", borderRadius: 14, padding: "16px" }}>
          <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>プレビュー（C1〜C3）</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {[0, 1, 2].map(c => cfg.days.map((day, i) => (
              <div key={`${c}-${i}`} style={{
                background: PREVIEW_COLORS[c % PREVIEW_COLORS.length] + "22",
                border: `1px solid ${PREVIEW_COLORS[c % PREVIEW_COLORS.length]}44`,
                borderLeft: `3px solid ${PREVIEW_COLORS[c % PREVIEW_COLORS.length]}`,
                borderRadius: 6, padding: "4px 8px", fontSize: 11,
              }}>
                <span style={{ color: PREVIEW_COLORS[c % PREVIEW_COLORS.length], fontWeight: 700 }}>C{c + 1}</span>
                <span style={{ color: "#94a3b8", marginLeft: 4 }}>{day.label || `Day${i + 1}`}</span>
              </div>
            )))}
          </div>
        </div>

        <div style={{ padding: "0 16px" }}>
          <button onClick={saveCfg} style={{ ...btnPrimary, width: "100%" }}>
            {saved ? "✅ 保存しました！" : "設定を保存してスケジュールを再生成"}
          </button>
        </div>
      </div>
    );
  };

  // ============================================================
  // BOTTOM NAV
  // ============================================================
  const tabs = [
    { id: "today", icon: "🏠", label: "TODAY" },
    { id: "calendar", icon: "📅", label: "カレンダー" },
    { id: "menus", icon: "📋", label: "メニュー" },
    { id: "cycle", icon: "⚙️", label: "クール設定" },
    { id: "stats", icon: "📊", label: "統計" },
  ];

  return (
    <div style={{ background: "#0f172a", minHeight: "100vh", maxWidth: 430, margin: "0 auto", fontFamily: "'DM Sans', sans-serif", color: "#e2e8f0", position: "relative" }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* screens */}
      {screen === "today" && <TodayScreen />}
      {screen === "calendar" && <CalendarScreen />}
      {screen === "day" && <DayScreenInner
        selectedDate={selectedDate}
        dynSched={dynSched}
        logs={logs}
        menus={menus}
        fromToday={fromToday}
        setDb={setDb}
        updateDb={updateDb}
        setScreen={setScreen}
        STORAGE_KEY={STORAGE_KEY}
      />}
      {screen === "menus" && <MenusScreen />}
      {screen === "cycle" && <CycleConfigScreen />}
      {screen === "stats" && <StatsScreen />}

      {/* bottom nav */}
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 430,
        background: "#0f172a", borderTop: "1px solid #1e293b",
        display: "flex", justifyContent: "space-around", padding: "10px 0 16px",
        zIndex: 100,
      }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => { setScreen(t.id); setShowMenuForm(false); }}
            style={{
              background: "none", border: "none", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              color: screen === t.id || (screen === "day" && (t.id === "today" || t.id === "calendar")) ? "#22c55e" : "#475569",
              transition: "color 0.2s",
            }}
          >
            <span style={{ fontSize: 22 }}>{t.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 600 }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// SHARED STYLES
// ============================================================
const btnPrimary = {
  background: "#22c55e", color: "#0f172a", border: "none",
  borderRadius: 12, padding: "12px 20px", fontWeight: 700,
  fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
};
const btnGhost = {
  background: "none", color: "#94a3b8", border: "1px solid #334155",
  borderRadius: 10, padding: "8px 14px", fontSize: 14, cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif",
};
const btnCircle = {
  width: 30, height: 30, borderRadius: "50%", border: "none",
  color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  flexShrink: 0,
};
const inputStyle = {
  width: "100%", background: "#0f172a", border: "1px solid #334155",
  borderRadius: 10, color: "#e2e8f0", padding: "12px 14px",
  fontSize: 14, boxSizing: "border-box", marginBottom: 10,
  fontFamily: "'DM Sans', sans-serif",
};
const modal = {
  position: "fixed", inset: 0, background: "#000000cc",
  display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200,
};
const modalCard = {
  background: "#1e293b", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px",
  width: "100%", maxWidth: 430, display: "flex", flexDirection: "column",
};
const menuItem = {
  background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155",
  borderRadius: 10, padding: "14px 16px", textAlign: "left",
  fontSize: 15, cursor: "pointer", marginBottom: 8, fontFamily: "'DM Sans', sans-serif",
};