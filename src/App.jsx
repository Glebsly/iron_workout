// ─────────────────────────────────────────────────────────────────────────────
// App.jsx — один файл, никаких внешних зависимостей кроме React.
// Хранилище: localStorage (работает везде, потом меняешь на Telegram CloudStorage)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { ALL_EXERCISES, TYPE_LABELS, TYPE_COLORS, INTENSITY_LABEL } from "./exercises.js";

// ─── STORAGE (localStorage — работает локально и на GitHub Pages) ─────────────
// Когда переедешь в Telegram — замени get/set на cloudStorage.getItem/setItem
const storage = {
  get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key, val) => { try { localStorage.setItem(key, val); } catch {} },
};

function loadUserState() {
  return {
    preferences: JSON.parse(storage.get("iron_prefs") || '{"liked":[],"disliked":[]}'),
    history: JSON.parse(storage.get("iron_history") || "[]"),
  };
}
function savePreferences(p) { storage.set("iron_prefs", JSON.stringify(p)); }
function saveHistory(h) { storage.set("iron_history", JSON.stringify(h.slice(-20))); }

// ─── WORKOUT LOGIC ────────────────────────────────────────────────────────────
function generateWorkout(preferences, history) {
  const { liked, disliked } = preferences;
  const recentIds = history.flatMap((s) => s.exerciseIds).slice(-30);
  const score = (e) => {
    let s = liked.includes(e.id) ? 40 : 0;
    s -= recentIds.filter((id) => id === e.id).length * 20;
    return s + Math.random() * 15;
  };
  const pick = (pool, n) => [...pool].sort((a, b) => score(b) - score(a)).slice(0, n);
  const avail = ALL_EXERCISES.filter((e) => !disliked.includes(e.id));
  return [
    ...pick(avail.filter((e) => e.type === "mobility"), 3),
    ...pick(avail.filter((e) => e.type === "kettlebell" || e.type === "bodyweight"), 5),
    ...pick(avail.filter((e) => e.type === "stretching"), 3),
  ];
}

function getPhaseLabel(idx) {
  if (idx < 3) return "Разминка";
  if (idx < 8) return "Основная часть";
  return "Заминка";
}

function applyFeedback(prefs, feedback) {
  const p = { liked: [...prefs.liked], disliked: [...prefs.disliked] };
  Object.entries(feedback).forEach(([id, v]) => {
    if (v === "like") { p.liked = [...new Set([...p.liked, id])]; p.disliked = p.disliked.filter((x) => x !== id); }
    if (v === "dislike") { p.disliked = [...new Set([...p.disliked, id])]; p.liked = p.liked.filter((x) => x !== id); }
  });
  return p;
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("home");
  const [preferences, setPreferences] = useState(() => loadUserState().preferences);
  const [history, setHistory] = useState(() => loadUserState().history);
  const [workout, setWorkout] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState("exercise");
  const [timer, setTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [sessionFeedback, setSessionFeedback] = useState({});

  // таймер
  useEffect(() => {
    if (!timerActive || timer <= 0) { if (timerActive && timer <= 0) setTimerActive(false); return; }
    const t = setTimeout(() => setTimer((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timerActive, timer]);

  // авто-переход после отдыха
  useEffect(() => {
    if (phase === "rest" && timer === 0 && !timerActive && screen === "workout") {
      const t = setTimeout(() => advance(), 500);
      return () => clearTimeout(t);
    }
  }, [phase, timer, timerActive, screen]);

  const startWorkout = useCallback(() => {
    const w = generateWorkout(preferences, history);
    setWorkout(w); setCurrentIdx(0); setPhase("exercise");
    setTimer(w[0].duration_sec); setTimerActive(false); setSessionFeedback({});
    setScreen("workout");
  }, [preferences, history]);

  const advance = useCallback(() => {
    setCurrentIdx((idx) => {
      const next = idx + 1;
      if (next < workout.length) {
        setPhase("exercise"); setTimer(workout[next].duration_sec); setTimerActive(false);
        return next;
      }
      finish(); return idx;
    });
  }, [workout]);

  const handleNext = useCallback(() => {
    const ex = workout[currentIdx];
    if (phase === "exercise" && ex?.rest_sec > 0) { setPhase("rest"); setTimer(ex.rest_sec); setTimerActive(true); return; }
    if (currentIdx < workout.length - 1) advance(); else finish();
  }, [phase, currentIdx, workout]);

  const finish = useCallback(() => {
    const newPrefs = applyFeedback(preferences, sessionFeedback);
    const newHistory = [...history, { date: new Date().toISOString(), exerciseIds: workout.map((e) => e.id) }].slice(-20);
    setPreferences(newPrefs); setHistory(newHistory);
    savePreferences(newPrefs); saveHistory(newHistory);
    setScreen("done");
  }, [preferences, sessionFeedback, history, workout]);

  const setFeedback = (id, type) => setSessionFeedback((p) => ({ ...p, [id]: p[id] === type ? null : type }));

  const updatePrefs = (newP) => { setPreferences(newP); savePreferences(newP); };

  const ex = workout[currentIdx];
  const prevEx = workout[currentIdx - 1] || null;

  if (screen === "home") return <HomeScreen history={history} preferences={preferences} onStart={startWorkout} onCatalog={() => setScreen("catalog")} />;
  if (screen === "workout" && ex) return <WorkoutScreen exercise={ex} prevExercise={prevEx} phase={phase} timer={timer} timerActive={timerActive} currentIdx={currentIdx} total={workout.length} feedback={prevEx ? sessionFeedback[prevEx.id] : null} onToggleTimer={() => { if (timer === 0) setTimer(ex.duration_sec); setTimerActive((a) => !a); }} onNext={handleNext} onFeedback={(type) => prevEx && setFeedback(prevEx.id, type)} onQuit={() => setScreen("home")} />;
  if (screen === "done") return <DoneScreen workout={workout} sessionFeedback={sessionFeedback} onHome={() => setScreen("home")} onAgain={startWorkout} />;
  if (screen === "catalog") return <CatalogScreen exercises={ALL_EXERCISES} preferences={preferences} onLike={(id) => { const p = { liked: preferences.liked.includes(id) ? preferences.liked.filter((x) => x !== id) : [...new Set([...preferences.liked, id])], disliked: preferences.disliked.filter((x) => x !== id) }; updatePrefs(p); }} onDislike={(id) => { const p = { disliked: preferences.disliked.includes(id) ? preferences.disliked.filter((x) => x !== id) : [...new Set([...preferences.disliked, id])], liked: preferences.liked.filter((x) => x !== id) }; updatePrefs(p); }} onBack={() => setScreen("home")} />;
  return null;
}

// ─── SCREENS ──────────────────────────────────────────────────────────────────
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
        <div style={s.card}>
          <div style={s.sectionLabel}>Последняя тренировка</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>{new Date(last.date).toLocaleDateString("ru", { day: "numeric", month: "long" })}</div>
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

function WorkoutScreen({ exercise, prevExercise, phase, timer, timerActive, currentIdx, total, feedback, onToggleTimer, onNext, onFeedback, onQuit }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const isRest = phase === "rest";
  const hasTimer = /сек|мин/.test(exercise.sets_reps) || (exercise.duration_sec > 0 && !/×/.test(exercise.sets_reps));
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const accent = TYPE_COLORS[exercise.type];
  const thumbEmoji = exercise.type === "kettlebell" ? "🏋️" : exercise.type === "bodyweight" ? "💪" : exercise.type === "mobility" ? "🔄" : "🧘";
  const timerColor = isRest ? "#6b7280" : timer < 10 && timerActive ? "#ef4444" : "#f9fafb";

  return (
    <div style={{ ...s.root, display: "flex", flexDirection: "column", height: "100vh" }}>

      {/* Скроллируемый контент */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 0" }}>

        {/* Прогресс */}
        <div style={s.topBar}>
          <button style={s.quitBtn} onClick={onQuit}>✕</button>
          <div style={s.progressWrap}>
            <div style={s.progressBg}><div style={{ ...s.progressFill, width: `${(currentIdx / total) * 100}%` }} /></div>
            <span style={s.progressText}>{currentIdx + 1} / {total}</span>
          </div>
        </div>

        <div style={s.phaseLabel}>{getPhaseLabel(currentIdx)}</div>

        {/* Карточка упражнения — тап открывает шит */}
        <div
          style={{ ...s.card, border: `1.5px solid ${isRest ? "#374151" : accent}`, opacity: isRest ? 0.6 : 1, cursor: "pointer", transition: "opacity 0.3s" }}
          onClick={() => setSheetOpen(true)}
        >
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            {/* Мини картинка */}
            <div style={{ flexShrink: 0, width: 72, height: 72, borderRadius: 10, overflow: "hidden", background: accent + "11", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {exercise.image_url
                ? <img src={exercise.image_url} alt={exercise.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 28 }}>{thumbEmoji}</span>}
            </div>
            {/* Текст */}
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <span style={{ ...s.typeBadge, background: accent + "22", color: accent }}>{TYPE_LABELS[exercise.type]}</span>
                {exercise.weight_kg && <span style={s.weightBadge}>⚖ {exercise.weight_kg} кг</span>}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2, marginBottom: 4 }}>{exercise.name}</div>
              <div style={{ fontSize: 14, color: "#e85d26", fontWeight: 600 }}>{exercise.sets_reps}</div>
            </div>
            {/* Иконка "тап для деталей" */}
            <div style={{ color: "#4b5563", fontSize: 18, flexShrink: 0 }}>⋯</div>
          </div>
        </div>

        {/* Баннер отдыха — появляется поверх когда isRest */}
        {isRest && (
          <div style={{ background: "#1a1d27", border: "1.5px solid #374151", borderRadius: 14, padding: "16px 18px", marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>💨</span>
                <span style={{ fontSize: 16, fontWeight: 700 }}>Отдых</span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", color: "#6b7280" }}>{fmt(timer)}</div>
            </div>
            {prevExercise && (
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>Тапни карточку чтобы оценить</div>
            )}
          </div>
        )}
      </div>

      {/* Фиксированная нижняя зона */}
      <div style={{ padding: "14px 16px 24px", borderTop: "1px solid #1f2937", background: "#0f1117" }}>
        {isRest ? (
          /* Таймер отдыха */
          <div style={s.timerRow}>
            <div style={{ ...s.timerDisplay, color: "#6b7280" }}>{fmt(timer)}</div>
            <button style={{ ...s.timerBtn, background: timerActive ? "#374151" : "#4b5563" }} onClick={onToggleTimer}>
              {timerActive ? "⏸ Пауза" : timer === 0 ? "↺ Сброс" : "▶ Старт"}
            </button>
          </div>
        ) : hasTimer ? (
          /* Таймер упражнения */
          <div style={s.timerRow}>
            <div style={{ ...s.timerDisplay, color: timerColor }}>{fmt(timer)}</div>
            <button style={{ ...s.timerBtn, background: timerActive ? "#374151" : "#e85d26" }} onClick={onToggleTimer}>
              {timerActive ? "⏸ Пауза" : timer === 0 ? "↺ Сброс" : "▶ Старт"}
            </button>
          </div>
        ) : null}
        <button style={s.nextBtn} onClick={onNext}>
          {currentIdx === total - 1 ? "Завершить ✓" : isRest ? "Пропустить отдых →" : "Готово →"}
        </button>
      </div>

      {/* Bottom sheet — детали упражнения */}
      {sheetOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100 }} onClick={() => setSheetOpen(false)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)" }} />
          <div
            style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#161920", borderRadius: "20px 20px 0 0", padding: "20px 16px 40px", maxHeight: "85vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Ручка */}
            <div style={{ width: 40, height: 4, background: "#374151", borderRadius: 2, margin: "0 auto 20px" }} />

            {/* Большая картинка */}
            <div style={{ width: "100%", aspectRatio: "1/1", borderRadius: 14, overflow: "hidden", background: accent + "11", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              {exercise.image_url
                ? <img src={exercise.image_url} alt={exercise.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 64 }}>{thumbEmoji}</span>}
            </div>

            {/* Название и мета */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <span style={{ ...s.typeBadge, background: accent + "22", color: accent }}>{TYPE_LABELS[exercise.type]}</span>
              {exercise.weight_kg && <span style={s.weightBadge}>⚖ {exercise.weight_kg} кг</span>}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6, letterSpacing: "-0.02em" }}>{exercise.name}</div>
            <div style={{ fontSize: 16, color: "#e85d26", fontWeight: 600, marginBottom: 16 }}>{exercise.sets_reps}</div>

            {/* Заметка */}
            {exercise.notes && (
              <div style={{ display: "flex", gap: 8, padding: "12px 14px", background: "#111827", borderRadius: 10, marginBottom: 20 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
                <span style={{ fontSize: 14, color: "#9ca3af", lineHeight: 1.6 }}>{exercise.notes}</span>
              </div>
            )}

            {/* Лайк/дизлайк в шите (для упражнения) */}
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Оценить упражнение</div>
            <div style={s.feedRow}>
              {[{ type: "dislike", label: "Убрать из тренировок" }, { type: "like", label: "Нравится" }].map(({ type, label }) => (
                <button key={type} style={{ ...s.feedBtn, ...(feedback === type ? (type === "like" ? s.likeActive : s.dislikeActive) : {}) }} onClick={() => onFeedback(type)}>
                  {type === "like"
                    ? <svg viewBox="0 0 24 24" fill={feedback === "like" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4.72A2.31 2.31 0 012 20V13a2.31 2.31 0 012.72-2H7"/></svg>
                    : <svg viewBox="0 0 24 24" fill={feedback === "dislike" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg>}
                  {label}
                </button>
              ))}
            </div>

            <button style={{ ...s.nextBtn, marginTop: 16 }} onClick={() => setSheetOpen(false)}>Закрыть</button>
          </div>
        </div>
      )}
    </div>
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
            <div key={ex.id} style={{ ...s.card, opacity: isDisliked ? 0.4 : 1, marginBottom: 10 }}>
              <div style={s.exMeta}>
                <span style={{ ...s.typeBadge, background: TYPE_COLORS[ex.type] + "22", color: TYPE_COLORS[ex.type] }}>{TYPE_LABELS[ex.type]}</span>
                {ex.weight_kg && <span style={s.weightBadge}>⚖ {ex.weight_kg} кг</span>}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{ex.name}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>{ex.sets_reps} · {INTENSITY_LABEL[ex.intensity]}</div>
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

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = {
  root: { background: "#0f1117", minHeight: "100vh", color: "#f9fafb", fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  page: { width: "100%", padding: "20px 16px 28px", display: "flex", flexDirection: "column", minHeight: "100vh", boxSizing: "border-box" },
  homeHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 },
  appTitle: { fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em" },
  appSub: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  iconBtn: { background: "none", border: "none", color: "#6b7280", cursor: "pointer", padding: 4 },
  statsRow: { display: "flex", gap: 10, marginBottom: 24 },
  statCard: { flex: 1, background: "#1a1d27", borderRadius: 12, padding: "14px 12px", textAlign: "center" },
  statNum: { fontSize: 26, fontWeight: 700 },
  statLabel: { fontSize: 11, color: "#6b7280", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" },
  card: { background: "#1a1d27", borderRadius: 14, padding: 16 },
  sectionLabel: { fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 },
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
  exImage: { width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 10, marginBottom: 14 },
  exImagePlaceholder: { width: "100%", height: 140, borderRadius: 10, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center" },
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
  catalogList: { display: "flex", flexDirection: "column", overflowY: "auto", paddingBottom: 20 },
  catalogActions: { display: "flex", gap: 8, marginTop: 10 },
  catBtn: { flex: 1, padding: "7px 0", background: "#111827", border: "none", borderRadius: 8, color: "#9ca3af", cursor: "pointer", fontSize: 12, fontWeight: 500 },
  catBtnLikeActive: { background: "#e85d26", color: "#fff" },
  catBtnDislikeActive: { background: "#374151", color: "#9ca3af" },
};
