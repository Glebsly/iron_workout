// ─────────────────────────────────────────────────────────────────────────────
// App.jsx — только UI. Логика и данные в отдельных модулях.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { ALL_EXERCISES, TYPE_LABELS, TYPE_COLORS, INTENSITY_LABEL } from "./exercises.js";
import { generateWorkout, getPhaseLabel, applySessionFeedback, toggleLike, toggleDislike } from "./workout-logic.js";
import { loadUserState, savePreferences, saveHistory, appendSession } from "./storage.js";

export default function App() {
  const [screen, setScreen] = useState("loading");
  const [preferences, setPreferences] = useState({ liked: [], disliked: [] });
  const [history, setHistory] = useState([]);
  const [workout, setWorkout] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState("exercise");
  const [timer, setTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [sessionFeedback, setSessionFeedback] = useState({});

  useEffect(() => {
    loadUserState().then(({ preferences: p, history: h }) => {
      setPreferences(p);
      setHistory(h);
      setScreen("home");
    });
  }, []);

  useEffect(() => {
    if (!timerActive || timer <= 0) { if (timerActive && timer <= 0) setTimerActive(false); return; }
    const t = setTimeout(() => setTimer((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timerActive, timer]);

  useEffect(() => {
    if (phase === "rest" && timer === 0 && !timerActive && screen === "workout") {
      const t = setTimeout(() => advanceExercise(), 500);
      return () => clearTimeout(t);
    }
  }, [phase, timer, timerActive, screen]);

  const startWorkout = useCallback(() => {
    const w = generateWorkout(preferences, history);
    setWorkout(w); setCurrentIdx(0); setPhase("exercise");
    setTimer(w[0].duration_sec); setTimerActive(false); setSessionFeedback({});
    setScreen("workout");
  }, [preferences, history]);

  const advanceExercise = useCallback(() => {
    setCurrentIdx((idx) => {
      const next = idx + 1;
      if (next < workout.length) { setPhase("exercise"); setTimer(workout[next].duration_sec); setTimerActive(false); return next; }
      else { finishWorkout(); return idx; }
    });
  }, [workout]);

  const handleNext = useCallback(() => {
    const ex = workout[currentIdx];
    if (phase === "exercise" && ex?.rest_sec > 0) { setPhase("rest"); setTimer(ex.rest_sec); setTimerActive(true); return; }
    if (currentIdx < workout.length - 1) advanceExercise();
    else finishWorkout();
  }, [phase, currentIdx, workout, advanceExercise]);

  const finishWorkout = useCallback(() => {
    const newPrefs = applySessionFeedback(preferences, sessionFeedback);
    const newHistory = appendSession(history, workout.map((e) => e.id));
    setPreferences(newPrefs); setHistory(newHistory);
    savePreferences(newPrefs); saveHistory(newHistory);
    setScreen("done");
  }, [preferences, sessionFeedback, history, workout]);

  const handleFeedback = (id, type) =>
    setSessionFeedback((prev) => ({ ...prev, [id]: prev[id] === type ? null : type }));

  const handleCatalogLike = (id) => { const p = toggleLike(preferences, id); setPreferences(p); savePreferences(p); };
  const handleCatalogDislike = (id) => { const p = toggleDislike(preferences, id); setPreferences(p); savePreferences(p); };

  const ex = workout[currentIdx];

  if (screen === "loading") return <div style={s.root}><div style={s.center}><div style={s.spinner} /></div></div>;
  if (screen === "home") return <HomeScreen history={history} preferences={preferences} onStart={startWorkout} onCatalog={() => setScreen("catalog")} />;
  if (screen === "workout" && ex) return <WorkoutScreen exercise={ex} phase={phase} timer={timer} timerActive={timerActive} currentIdx={currentIdx} total={workout.length} feedback={sessionFeedback[ex.id]} onToggleTimer={() => { if (timer === 0) setTimer(ex.duration_sec); setTimerActive((a) => !a); }} onNext={handleNext} onFeedback={(type) => handleFeedback(ex.id, type)} onQuit={() => setScreen("home")} />;
  if (screen === "done") return <DoneScreen workout={workout} sessionFeedback={sessionFeedback} onHome={() => setScreen("home")} onAgain={startWorkout} />;
  if (screen === "catalog") return <CatalogScreen exercises={ALL_EXERCISES} preferences={preferences} onLike={handleCatalogLike} onDislike={handleCatalogDislike} onBack={() => setScreen("home")} />;
  return null;
}

function HomeScreen({ history, preferences, onStart, onCatalog }) {
  const last = history[history.length - 1];
  return (
    <div style={s.root}><div style={s.page}>
      <div style={s.homeHeader}>
        <div><div style={s.appTitle}>ЖЕЛЕЗО</div><div style={s.appSub}>Тренировки с гирей</div></div>
        <button style={s.iconBtn} onClick={onCatalog}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        </button>
      </div>
      <div style={s.statsRow}>
        {[{ v: history.length, l: "тренировок" }, { v: preferences.liked.length, l: "любимых", c: "#e85d26" }, { v: preferences.disliked.length, l: "скрыто", c: "#6b7280" }].map(({ v, l, c }) => (
          <div key={l} style={s.statCard}><div style={{ ...s.statNum, ...(c ? { color: c } : {}) }}>{v}</div><div style={s.statLabel}>{l}</div></div>
        ))}
      </div>
      {last && (
        <div style={s.lastWorkout}>
          <div style={s.sectionLabel}>Последняя тренировка</div>
          <div style={s.lastDate}>{new Date(last.date).toLocaleDateString("ru", { day: "numeric", month: "long" })}</div>
          <div style={s.tagRow}>{last.exerciseIds.slice(0, 5).map((id) => { const e = ALL_EXERCISES.find((x) => x.id === id); return e ? <span key={id} style={{ ...s.miniTag, background: TYPE_COLORS[e.type] + "22", color: TYPE_COLORS[e.type] }}>{e.name}</span> : null; })}</div>
        </div>
      )}
      <div style={{ flex: 1 }} />
      <button style={s.primaryBtn} onClick={onStart}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" style={{ marginRight: 8 }}><polygon points="5,3 19,12 5,21"/></svg>
        Начать тренировку
      </button>
      <div style={s.hint}>~25 минут · 11 упражнений</div>
    </div></div>
  );
}

function WorkoutScreen({ exercise, phase, timer, timerActive, currentIdx, total, feedback, onToggleTimer, onNext, onFeedback, onQuit }) {
  const isRest = phase === "rest";
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return (
    <div style={s.root}><div style={s.page}>
      <div style={s.topBar}>
        <button style={s.quitBtn} onClick={onQuit}>✕</button>
        <div style={s.progressWrap}>
          <div style={s.progressBg}><div style={{ ...s.progressFill, width: `${(currentIdx / total) * 100}%` }} /></div>
          <span style={s.progressText}>{currentIdx + 1} / {total}</span>
        </div>
      </div>
      <div style={s.phaseLabel}>{isRest ? "Отдых" : getPhaseLabel(currentIdx)}</div>
      <div style={{ ...s.exCard, borderColor: isRest ? "#374151" : TYPE_COLORS[exercise.type] }}>
        {isRest ? (
          <div style={s.restContent}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>💨</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>Отдых</div>
            <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 6 }}>Следующее: {exercise.name}</div>
          </div>
        ) : (
          <>
            <div style={s.exMeta}>
              <span style={{ ...s.typeBadge, background: TYPE_COLORS[exercise.type] + "22", color: TYPE_COLORS[exercise.type] }}>{TYPE_LABELS[exercise.type]}</span>
              {exercise.weight_kg && <span style={s.weightBadge}>⚖ {exercise.weight_kg} кг</span>}
              <span style={{ ...s.intensityDot, background: exercise.intensity === "high" ? "#ef4444" : exercise.intensity === "medium" ? "#f59e0b" : "#22c55e", marginLeft: "auto" }} />
            </div>
            <div style={s.exName}>{exercise.name}</div>
            <div style={s.exReps}>{exercise.sets_reps}</div>
            <div style={s.exNotes}>{exercise.notes}</div>
          </>
        )}
      </div>
      <div style={s.timerRow}>
        <div style={{ ...s.timerDisplay, color: isRest ? "#6b7280" : timer < 10 && timerActive ? "#ef4444" : "#f9fafb" }}>{fmt(timer)}</div>
        <button style={{ ...s.timerBtn, background: timerActive ? "#374151" : "#e85d26" }} onClick={onToggleTimer}>
          {timerActive ? "⏸ Пауза" : timer === 0 ? "↺ Сброс" : "▶ Старт"}
        </button>
      </div>
      {!isRest && (
        <div style={s.feedRow}>
          {[{ type: "dislike", label: "Убрать", as: s.dislikeActive }, { type: "like", label: "Нравится", as: s.likeActive }].map(({ type, label, as }) => (
            <button key={type} style={{ ...s.feedBtn, ...(feedback === type ? as : {}) }} onClick={() => onFeedback(type)}>
              {type === "like"
                ? <svg viewBox="0 0 24 24" fill={feedback === "like" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4.72A2.31 2.31 0 012 20V13a2.31 2.31 0 012.72-2H7"/></svg>
                : <svg viewBox="0 0 24 24" fill={feedback === "dislike" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg>}
              {label}
            </button>
          ))}
        </div>
      )}
      <div style={{ flex: 1 }} />
      <button style={s.nextBtn} onClick={onNext}>
        {currentIdx === total - 1 && !isRest ? "Завершить тренировку ✓" : isRest ? "Пропустить отдых →" : "Следующее →"}
      </button>
    </div></div>
  );
}

function DoneScreen({ workout, sessionFeedback, onHome, onAgain }) {
  const liked = Object.values(sessionFeedback).filter((v) => v === "like").length;
  const disliked = Object.values(sessionFeedback).filter((v) => v === "dislike").length;
  return (
    <div style={s.root}><div style={s.page}>
      <div style={{ fontSize: 56, textAlign: "center", marginTop: 24 }}>🔥</div>
      <div style={s.doneTitle}>Тренировка завершена!</div>
      <div style={s.doneSub}>{workout.length} упражнений выполнено</div>
      {(liked > 0 || disliked > 0) && (
        <div style={s.doneTagRow}>
          {liked > 0 && <span style={s.doneLikeTag}>👍 {liked} в приоритете</span>}
          {disliked > 0 && <span style={s.doneDislikeTag}>✕ {disliked} скрыто</span>}
        </div>
      )}
      <div style={s.doneList}>
        {workout.map((ex) => (
          <div key={ex.id} style={s.doneRow}>
            <span style={{ ...s.doneDot, background: TYPE_COLORS[ex.type] }} />
            <span style={s.doneExName}>{ex.name}</span>
            {sessionFeedback[ex.id] === "like" && <span style={{ color: "#e85d26", marginLeft: "auto" }}>👍</span>}
            {sessionFeedback[ex.id] === "dislike" && <span style={{ color: "#6b7280", marginLeft: "auto" }}>✕</span>}
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <button style={s.primaryBtn} onClick={onAgain}>Ещё раз</button>
      <button style={{ ...s.primaryBtn, background: "transparent", border: "1px solid #374151", color: "#9ca3af", marginTop: 10 }} onClick={onHome}>На главную</button>
    </div></div>
  );
}

function CatalogScreen({ exercises, preferences, onLike, onDislike, onBack }) {
  const [filter, setFilter] = useState("all");
  const types = ["all", "kettlebell", "bodyweight", "mobility", "stretching"];
  const filtered = filter === "all" ? exercises : exercises.filter((e) => e.type === filter);
  return (
    <div style={s.root}><div style={s.page}>
      <div style={s.topBar}>
        <button style={s.quitBtn} onClick={onBack}>←</button>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Каталог упражнений</div>
      </div>
      <div style={s.filterRow}>
        {types.map((t) => (
          <button key={t} style={{ ...s.filterBtn, ...(filter === t ? s.filterBtnActive : {}) }} onClick={() => setFilter(t)}>
            {t === "all" ? "Все" : TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      <div style={s.catalogList}>
        {filtered.map((ex) => {
          const isLiked = preferences.liked.includes(ex.id);
          const isDisliked = preferences.disliked.includes(ex.id);
          return (
            <div key={ex.id} style={{ ...s.catalogCard, opacity: isDisliked ? 0.4 : 1 }}>
              <div style={s.exMeta}>
                <span style={{ ...s.typeBadge, background: TYPE_COLORS[ex.type] + "22", color: TYPE_COLORS[ex.type] }}>{TYPE_LABELS[ex.type]}</span>
                {ex.weight_kg && <span style={s.weightBadge}>⚖ {ex.weight_kg} кг</span>}
              </div>
              <div style={s.catalogName}>{ex.name}</div>
              <div style={s.catalogMeta}>{ex.sets_reps} · {INTENSITY_LABEL[ex.intensity]}</div>
              <div style={s.exNotes}>{ex.notes}</div>
              <div style={s.catalogActions}>
                <button style={{ ...s.catBtn, ...(isDisliked ? s.catBtnDislikeActive : {}) }} onClick={() => onDislike(ex.id)}>{isDisliked ? "✕ Скрыто" : "✕ Скрыть"}</button>
                <button style={{ ...s.catBtn, ...(isLiked ? s.catBtnLikeActive : {}) }} onClick={() => onLike(ex.id)}>{isLiked ? "★ Приоритет" : "☆ Приоритет"}</button>
              </div>
            </div>
          );
        })}
      </div>
    </div></div>
  );
}

const s = {
  root: { background: "#0f1117", minHeight: "100vh", color: "#f9fafb", fontFamily: "'DM Sans','Segoe UI',sans-serif", display: "flex", justifyContent: "center" },
  page: { width: "100%", maxWidth: 420, padding: "20px 16px 28px", display: "flex", flexDirection: "column", minHeight: "100vh", boxSizing: "border-box" },
  center: { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100vh" },
  spinner: { width: 12, height: 12, borderRadius: "50%", background: "#e85d26" },
  homeHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 },
  appTitle: { fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em" },
  appSub: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  iconBtn: { background: "none", border: "none", color: "#6b7280", cursor: "pointer", padding: 4 },
  statsRow: { display: "flex", gap: 10, marginBottom: 24 },
  statCard: { flex: 1, background: "#1a1d27", borderRadius: 12, padding: "14px 12px", textAlign: "center" },
  statNum: { fontSize: 26, fontWeight: 700 },
  statLabel: { fontSize: 11, color: "#6b7280", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" },
  lastWorkout: { background: "#1a1d27", borderRadius: 14, padding: 16 },
  sectionLabel: { fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 },
  lastDate: { fontSize: 15, fontWeight: 600, marginBottom: 10 },
  tagRow: { display: "flex", flexWrap: "wrap", gap: 6 },
  miniTag: { fontSize: 11, padding: "3px 8px", borderRadius: 20, fontWeight: 500 },
  primaryBtn: { width: "100%", padding: "16px 0", background: "#e85d26", color: "#fff", border: "none", borderRadius: 14, fontSize: 17, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  hint: { textAlign: "center", color: "#6b7280", fontSize: 12, marginTop: 8 },
  topBar: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 },
  quitBtn: { background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 18, padding: "4px 8px 4px 0" },
  progressWrap: { flex: 1, display: "flex", alignItems: "center", gap: 10 },
  progressBg: { flex: 1, height: 4, background: "#1f2937", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", background: "#e85d26", borderRadius: 2, transition: "width 0.4s ease" },
  progressText: { fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" },
  phaseLabel: { fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 },
  exCard: { background: "#1a1d27", borderRadius: 18, padding: "22px 20px", border: "1.5px solid", marginBottom: 20 },
  exMeta: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 },
  typeBadge: { fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" },
  weightBadge: { fontSize: 11, color: "#9ca3af", background: "#111827", padding: "3px 8px", borderRadius: 20 },
  intensityDot: { width: 8, height: 8, borderRadius: "50%" },
  exName: { fontSize: 22, fontWeight: 700, lineHeight: 1.2, marginBottom: 8, letterSpacing: "-0.02em" },
  exReps: { fontSize: 15, color: "#e85d26", fontWeight: 600, marginBottom: 10 },
  exNotes: { fontSize: 13, color: "#9ca3af", lineHeight: 1.5 },
  restContent: { display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0" },
  timerRow: { display: "flex", alignItems: "center", gap: 16, marginBottom: 16 },
  timerDisplay: { fontSize: 44, fontWeight: 800, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", minWidth: 116 },
  timerBtn: { padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, color: "#fff" },
  feedRow: { display: "flex", gap: 10, marginBottom: 8 },
  feedBtn: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px 0", background: "#1a1d27", border: "1.5px solid #2d3748", borderRadius: 12, color: "#9ca3af", cursor: "pointer", fontSize: 13, fontWeight: 500 },
  likeActive: { background: "#7c2d1222", borderColor: "#e85d26", color: "#e85d26" },
  dislikeActive: { background: "#1f2937", borderColor: "#374151", color: "#6b7280" },
  nextBtn: { width: "100%", padding: "15px 0", background: "#1a1d27", border: "1.5px solid #2d3748", borderRadius: 14, color: "#f9fafb", fontSize: 15, fontWeight: 600, cursor: "pointer" },
  doneTitle: { fontSize: 26, fontWeight: 800, textAlign: "center", marginTop: 12, letterSpacing: "-0.02em" },
  doneSub: { color: "#9ca3af", textAlign: "center", marginTop: 6, marginBottom: 16 },
  doneTagRow: { display: "flex", gap: 10, justifyContent: "center", marginBottom: 16 },
  doneLikeTag: { background: "#7c2d1222", color: "#e85d26", padding: "4px 12px", borderRadius: 20, fontSize: 13, fontWeight: 600 },
  doneDislikeTag: { background: "#1f2937", color: "#9ca3af", padding: "4px 12px", borderRadius: 20, fontSize: 13 },
  doneList: { background: "#1a1d27", borderRadius: 14, overflow: "hidden", marginBottom: 20 },
  doneRow: { display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: "1px solid #1f2937" },
  doneDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  doneExName: { fontSize: 14, color: "#d1d5db" },
  filterRow: { display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" },
  filterBtn: { padding: "6px 12px", background: "#1a1d27", border: "none", borderRadius: 20, color: "#9ca3af", cursor: "pointer", fontSize: 12, fontWeight: 500 },
  filterBtnActive: { background: "#e85d26", color: "#fff" },
  catalogList: { display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", paddingBottom: 20 },
  catalogCard: { background: "#1a1d27", borderRadius: 14, padding: "14px 14px 12px" },
  catalogName: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  catalogMeta: { fontSize: 12, color: "#6b7280", marginBottom: 6 },
  catalogActions: { display: "flex", gap: 8, marginTop: 10 },
  catBtn: { flex: 1, padding: "7px 0", background: "#111827", border: "none", borderRadius: 8, color: "#9ca3af", cursor: "pointer", fontSize: 12, fontWeight: 500 },
  catBtnLikeActive: { background: "#e85d26", color: "#fff" },
  catBtnDislikeActive: { background: "#374151", color: "#9ca3af" },
};