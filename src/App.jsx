// ─────────────────────────────────────────────────────────────────────────────
// App.jsx — только UI. Логика и данные в отдельных модулях.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import { ALL_EXERCISES, TYPE_LABELS, TYPE_COLORS, INTENSITY_LABEL } from "./exercises.js";
import { generateWorkout, getPhaseLabel, applySessionFeedback, toggleLike, toggleDislike } fr
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
if (!timerActive || timer <= 0) { if (timerActive && timer <= 0) setTimerActive(false); r
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
if (next < workout.length) { setPhase("exercise"); setTimer(workout[next].duration_sec)
else { finishWorkout(); return idx; }
});
}, [workout]);
const handleNext = useCallback(() => {
const ex = workout[currentIdx];
if (phase === "exercise" && ex?.rest_sec > 0) { setPhase("rest"); setTimer(ex.rest_sec);
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
const handleCatalogLike = (id) => { const p = toggleLike(preferences, id); setPreferences(p
const handleCatalogDislike = (id) => { const p = toggleDislike(preferences, id); setPrefere
const ex = workout[currentIdx];
if (screen === "loading") return <div style={s.root}><div style={s.center}><div style={s.sp
if (screen === "home") return <HomeScreen history={history} preferences={preferences} onSta
if (screen === "workout" && ex) return <WorkoutScreen exercise={ex} phase={phase} timer={ti
if (screen === "done") return <DoneScreen workout={workout} sessionFeedback={sessionFeedbac
if (screen === "catalog") return <CatalogScreen exercises={ALL_EXERCISES} preferences={pref
return null;
}
function HomeScreen({ history, preferences, onStart, onCatalog }) {
const last = history[history.length - 1];
return (
<div style={s.root}><div style={s.page}>
<div style={s.homeHeader}>
<div><div style={s.appTitle}>ЖЕЛЕЗО</div><div style={s.appSub}>Тренировки с гирей</di
<button style={s.iconBtn} onClick={onCatalog}>
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="2
</button>
</div>
<div style={s.statsRow}>
{[{ v: history.length, l: "тренировок" }, { v: preferences.liked.length, l: "любимых"
<div key={l} style={s.statCard}><div style={{ ...s.statNum, ...(c ? { color: c } :
))}
</div>
{last && (
<div style={s.lastWorkout}>
<div style={s.sectionLabel}>Последняя тренировка</div>
<div style={s.lastDate}>{new Date(last.date).toLocaleDateString("ru", { day: "numer
<div style={s.tagRow}>{last.exerciseIds.slice(0, 5).map((id) => { const e = ALL_EXE
</div>
)}
<div style={{ flex: 1 }} />
<button style={s.primaryBtn} onClick={onStart}>
<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" style={{ marginRi
Начать тренировку
</button>
<div style={s.hint}>~25 минут · 11 упражнений</div>
</div></div>
);
}
function WorkoutScreen({ exercise, phase, timer, timerActive, currentIdx, total, feedback, on
const isRest = phase === "rest";
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStar
return (
<div style={s.root}><div style={s.page}>
<div style={s.topBar}>
<button style={s.quitBtn} onClick={onQuit}>✕</button>
<div style={s.progressWrap}>
<div style={s.progressBg}><div style={{ ...s.progressFill, width: `${(currentIdx /
<span style={s.progressText}>{currentIdx + 1} / {total}</span>
</div>
</div>
<div style={s.phaseLabel}>{isRest ? "Отдых" : getPhaseLabel(currentIdx)}</div>
<div style={{ ...s.exCard, borderColor: isRest ? "#374151" : TYPE_COLORS[exercise.type]
{isRest ? (
<div style={s.restContent}>
<div style={{ fontSize: 44, marginBottom: 10 }}> </div>
<div style={{ fontSize: 22, fontWeight: 700 }}>Отдых</div>
<div style={{ fontSize: 13, color: "#9ca3af", marginTop: 6 }}>Следующее: {exercis
</div>
) : (
<>
<div style={s.exMeta}>
<span style={{ ...s.typeBadge, background: TYPE_COLORS[exercise.type] + "22", c
{exercise.weight_kg && <span style={s.weightBadge}>⚖ {exercise.weight_kg} кг</s
<span style={{ ...s.intensityDot, background: exercise.intensity === "high" ? "
</div>
<div style={s.exName}>{exercise.name}</div>
<div style={s.exReps}>{exercise.sets_reps}</div>
<div style={s.exNotes}>{exercise.notes}</div>
</>
)}
</div>
<div style={s.timerRow}>
<div style={{ ...s.timerDisplay, color: isRest ? "#6b7280" : timer < 10 && timerActiv
<button style={{ ...s.timerBtn, background: timerActive ? "#374151" : "#e85d26" }} on
{timerActive ? " </button>
Пауза" : timer === 0 ? "↺ Сброс" : "▶ Старт"}
</div>
{!isRest && (
<div style={s.feedRow}>
{[{ type: "dislike", label: "Убрать", as: s.dislikeActive }, { type: "like", <button key={type} style={{ ...s.feedBtn, ...(feedback === type ? as : {}) {type === "like"
? <svg viewBox="0 0 24 24" fill={feedback === "like" ? "currentColor" : "none
: <svg viewBox="0 0 24 24" fill={feedback === "dislike" ? "currentColor" : "n
{label}
</button>
label:
}} onC
))}
</div>
)}
<div style={{ flex: 1 }} />
<button style={s.nextBtn} onClick={onNext}>
{currentIdx === total - 1 && !isRest ? "Завершить тренировку ✓" : isRest ? "Пропустит
</button>
</div></div>
);
}
function DoneScreen({ workout, sessionFeedback, onHome, onAgain }) {
const liked = Object.values(sessionFeedback).filter((v) => v === "like").length;
const disliked = Object.values(sessionFeedback).filter((v) => v === "dislike").length;
return (
<div style={s.root}><div style={s.page}>
<div style={{ fontSize: 56, textAlign: "center", marginTop: 24 }}> <div style={s.doneTitle}>Тренировка завершена!</div>
</div>
<div style={s.doneSub}>{workout.length} упражнений выполнено</div>
{(liked > 0 || disliked > 0) && (
<div style={s.doneTagRow}>
{liked > 0 && <span style={s.doneLikeTag}> {liked} в приоритете</span>}
{disliked > 0 && <span style={s.doneDislikeTag}>✕ {disliked} скрыто</span>}
</div>
)}
<div style={s.doneList}>
{workout.map((ex) => (
<div key={ex.id} style={s.doneRow}>
<span style={{ ...s.doneDot, background: TYPE_COLORS[ex.type] }} />
<span style={s.doneExName}>{ex.name}</span>
{sessionFeedback[ex.id] === "like" && <span style={{ color: "#e85d26", marginLeft
{sessionFeedback[ex.id] === "dislike" && <span style={{ color: "#6b7280", marginL
</div>
))}
</div>
<div style={{ flex: 1 }} />
<button style={s.primaryBtn} onClick={onAgain}>Ещё раз</button>
<button style={{ ...s.primaryBtn, background: "transparent", border: "1px solid #374151
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
<button key={t} style={{ ...s.filterBtn, ...(filter === t ? s.filterBtnActive : {})
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
<span style={{ ...s.typeBadge, background: TYPE_COLORS[ex.type] + "22", color
{ex.weight_kg && <span style={s.weightBadge}>⚖ {ex.weight_kg} кг</span>}
</div>
<div style={s.catalogName}>{ex.name}</div>
<div style={s.catalogMeta}>{ex.sets_reps} · {INTENSITY_LABEL[ex.intensity]}</di
<div style={s.exNotes}>{ex.notes}</div>
<div style={s.catalogActions}>
<button style={{ ...s.catBtn, ...(isDisliked ? s.catBtnDislikeActive : {}) }}
<button style={{ ...s.catBtn, ...(isLiked ? s.catBtnLikeActive : {}) }} onCli
</div>
</div>
);
})}
</div>
</div></div>
);
}
const s = {
root: { background: "#0f1117", minHeight: "100vh", color: "#f9fafb", fontFamily: "'DM Sans'
page: { width: "100%", maxWidth: 420, padding: "20px 16px 28px", display: "flex", flexDirec
center: { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", h
spinner: { width: 12, height: 12, borderRadius: "50%", background: "#e85d26" },
homeHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", m
appTitle: { fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em" },
appSub: { fontSize: 13, color: "#6b7280", marginTop: 2 },
iconBtn: { background: "none", border: "none", color: "#6b7280", cursor: "pointer", padding
statsRow: { display: "flex", gap: 10, marginBottom: 24 },
statCard: { flex: 1, background: "#1a1d27", borderRadius: 12, padding: "14px 12px", textAli
statNum: { fontSize: 26, fontWeight: 700 },
statLabel: { fontSize: 11, color: "#6b7280", marginTop: 2, textTransform: "uppercase", lett
lastWorkout: { background: "#1a1d27", borderRadius: 14, padding: 16 },
sectionLabel: { fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing:
lastDate: { fontSize: 15, fontWeight: 600, marginBottom: 10 },
tagRow: { display: "flex", flexWrap: "wrap", gap: 6 },
miniTag: { fontSize: 11, padding: "3px 8px", borderRadius: 20, fontWeight: 500 },
primaryBtn: { width: "100%", padding: "16px 0", background: "#e85d26", color: "#fff", borde
hint: { textAlign: "center", color: "#6b7280", fontSize: 12, marginTop: 8 },
topBar: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 },
quitBtn: { background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSiz
progressWrap: { flex: 1, display: "flex", alignItems: "center", gap: 10 },
progressBg: { flex: 1, height: 4, background: "#1f2937", borderRadius: 2, overflow: "hidden
progressFill: { height: "100%", background: "#e85d26", borderRadius: 2, transition: "width
progressText: { fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" },
phaseLabel: { fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0
exCard: { background: "#1a1d27", borderRadius: 18, padding: "22px 20px", border: "1.5px sol
gap: 7
exMeta: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 },
typeBadge: { fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 600, textTran
weightBadge: { fontSize: 11, color: "#9ca3af", background: "#111827", padding: "3px 8px", b
intensityDot: { width: 8, height: 8, borderRadius: "50%" },
exName: { fontSize: 22, fontWeight: 700, lineHeight: 1.2, marginBottom: 8, letterSpacing: "
exReps: { fontSize: 15, color: "#e85d26", fontWeight: 600, marginBottom: 10 },
exNotes: { fontSize: 13, color: "#9ca3af", lineHeight: 1.5 },
restContent: { display: "flex", flexDirection: "column", alignItems: "center", padding: "10
timerRow: { display: "flex", alignItems: "center", gap: 16, marginBottom: 16 },
timerDisplay: { fontSize: 44, fontWeight: 800, letterSpacing: "-0.03em", fontVariantNumeric
timerBtn: { padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", font
feedRow: { display: "flex", gap: 10, marginBottom: 8 },
feedBtn: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", likeActive: { background: "#7c2d1222", borderColor: "#e85d26", color: "#e85d26" },
dislikeActive: { background: "#1f2937", borderColor: "#374151", color: "#6b7280" },
nextBtn: { width: "100%", padding: "15px 0", background: "#1a1d27", border: "1.5px solid #2
doneTitle: { fontSize: 26, fontWeight: 800, textAlign: "center", marginTop: 12, letterSpaci
doneSub: { color: "#9ca3af", textAlign: "center", marginTop: 6, marginBottom: 16 },
doneTagRow: { display: "flex", gap: 10, justifyContent: "center", marginBottom: 16 },
doneLikeTag: { background: "#7c2d1222", color: "#e85d26", padding: "4px 12px", borderRadius
doneDislikeTag: { background: "#1f2937", color: "#9ca3af", padding: "4px 12px", borderRadiu
doneList: { background: "#1a1d27", borderRadius: 14, overflow: "hidden", marginBottom: 20 }
doneRow: { display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBott
doneDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
doneExName: { fontSize: 14, color: "#d1d5db" },
filterRow: { display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" },
filterBtn: { padding: "6px 12px", background: "#1a1d27", border: "none", borderRadius: 20,
filterBtnActive: { background: "#e85d26", color: "#fff" },
catalogList: { display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", catalogCard: { background: "#1a1d27", borderRadius: 14, padding: "14px 14px 12px" },
catalogName: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
catalogMeta: { fontSize: 12, color: "#6b7280", marginBottom: 6 },
catalogActions: { display: "flex", gap: 8, marginTop: 10 },
catBtn: { flex: 1, padding: "7px 0", background: "#111827", border: "none", borderRadius: 8
catBtnLikeActive: { background: "#e85d26", color: "#fff" },
catBtnDislikeActive: { background: "#374151", color: "#9ca3af" },
paddin
};
