// ─────────────────────────────────────────────────────────────────────────────
// App.jsx — один файл, никаких внешних зависимостей кроме React.
// Хранилище: localStorage (работает везде, потом меняешь на Telegram CloudStorage)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from "react";
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

const DEFAULT_SETTINGS = {
  kettlebell: true, dumbbells: false, pullup: false,
  stretching: true, mobility: true,
  kettlebell_kg: 16,
};
function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(storage.get("iron_settings") || "{}") }; } catch { return DEFAULT_SETTINGS; }
}
function saveSettings(s) { storage.set("iron_settings", JSON.stringify(s)); }
function hasSeenOnboarding() { return storage.get("iron_onboarded") === "1"; }
function markOnboardingDone() { storage.set("iron_onboarded", "1"); }
function loadWeights() { try { return JSON.parse(storage.get("iron_weights") || "{}"); } catch { return {}; } }
function saveWeights(w) { storage.set("iron_weights", JSON.stringify(w)); }

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
  const [screen, setScreen] = useState(() => hasSeenOnboarding() ? "home" : "onboarding");
  const [settings, setSettings] = useState(() => loadSettings());
  const updateSettings = (s) => { setSettings(s); saveSettings(s); };
  const [preferences, setPreferences] = useState(() => loadUserState().preferences);
  const [history, setHistory] = useState(() => loadUserState().history);
  const [workout, setWorkout] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timer, setTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [sessionFeedback, setSessionFeedback] = useState({});
  const [viewingSession, setViewingSession] = useState(null);
  const [workoutStartTime, setWorkoutStartTime] = useState(null);
  const [weights, setWeights] = useState(() => loadWeights());
  const updateWeight = (id, kg) => { const w = { ...weights, [id]: kg }; setWeights(w); saveWeights(w); };

  // таймер
  useEffect(() => {
    if (!timerActive || timer <= 0) { if (timerActive && timer <= 0) setTimerActive(false); return; }
    const t = setTimeout(() => setTimer((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timerActive, timer]);

  const startWorkout = useCallback(() => {
    const w = generateWorkout(preferences, history);
    setWorkout(w); setCurrentIdx(0);
    setTimer(w[0].duration_sec); setTimerActive(false); setSessionFeedback({});
    setWorkoutStartTime(new Date().toISOString());
    setScreen("workout");
  }, [preferences, history]);

  const advance = useCallback(() => {
    setCurrentIdx((idx) => {
      const next = idx + 1;
      if (next < workout.length) {
        setTimer(workout[next].duration_sec); setTimerActive(false);
        return next;
      }
      finish(); return idx;
    });
  }, [workout]);

  const handleNext = useCallback(() => {
    if (currentIdx < workout.length - 1) advance(); else finish();
  }, [currentIdx, workout]);

  const finish = useCallback(() => {
    const newPrefs = applyFeedback(preferences, sessionFeedback);
    const endTime = new Date().toISOString();
    const newHistory = [...history, { date: workoutStartTime || endTime, endTime, exerciseIds: workout.map((e) => e.id) }].slice(-20);
    setPreferences(newPrefs); setHistory(newHistory);
    savePreferences(newPrefs); saveHistory(newHistory);
    setScreen("done");
  }, [preferences, sessionFeedback, history, workout, workoutStartTime]);

  const setFeedback = (id, type) => {
    const newType = sessionFeedback[id] === type ? null : type;
    setSessionFeedback((p) => ({ ...p, [id]: newType }));
    // применяем сразу в preferences
    setPreferences((prefs) => {
      const p = { liked: [...prefs.liked], disliked: [...prefs.disliked] };
      if (newType === "like") { p.liked = [...new Set([...p.liked, id])]; p.disliked = p.disliked.filter((x) => x !== id); }
      else if (newType === "dislike") { p.disliked = [...new Set([...p.disliked, id])]; p.liked = p.liked.filter((x) => x !== id); }
      else { p.liked = p.liked.filter((x) => x !== id); p.disliked = p.disliked.filter((x) => x !== id); }
      savePreferences(p);
      return p;
    });
  };

  const updatePrefs = (newP) => { setPreferences(newP); savePreferences(newP); };

  const ex = workout[currentIdx];
  const nextEx = workout[currentIdx + 1] || null;
  if (screen === "onboarding") return <OnboardingScreen onDone={(s) => { updateSettings(s); markOnboardingDone(); setScreen("home"); }} />;
  if (screen === "settings") return <SettingsScreen settings={settings} onSave={(s) => { updateSettings(s); setScreen("home"); }} onBack={() => setScreen("home")} />;
  if (screen === "home") return <HomeScreen history={history} preferences={preferences} onStart={startWorkout} onCatalog={() => setScreen("catalog")} onSettings={() => setScreen("settings")} onViewSession={(s) => setViewingSession(s)} viewingSession={viewingSession} onCloseSession={() => setViewingSession(null)} sessionFeedback={sessionFeedback} onFeedback={(id, type) => setFeedback(id, type)} />;
  if (screen === "workout" && ex) return <WorkoutScreen exercise={ex} nextExercise={nextEx} timer={timer} timerActive={timerActive} currentIdx={currentIdx} total={workout.length} feedback={sessionFeedback[ex.id]} weights={weights} onUpdateWeight={updateWeight} onToggleTimer={() => { if (timer === 0) setTimer(ex.duration_sec); setTimerActive((a) => !a); }} onNext={handleNext} onFeedback={(type) => setFeedback(ex.id, type)} onQuit={() => setScreen("home")} />;
  if (screen === "done") return <DoneScreen workout={workout} sessionFeedback={sessionFeedback} onFeedback={(id, type) => setFeedback(id, type)} onHome={() => setScreen("home")} />;
  if (screen === "catalog") return <CatalogScreen exercises={ALL_EXERCISES} preferences={preferences} onLike={(id) => { const p = { liked: preferences.liked.includes(id) ? preferences.liked.filter((x) => x !== id) : [...new Set([...preferences.liked, id])], disliked: preferences.disliked.filter((x) => x !== id) }; updatePrefs(p); }} onDislike={(id) => { const p = { disliked: preferences.disliked.includes(id) ? preferences.disliked.filter((x) => x !== id) : [...new Set([...preferences.disliked, id])], liked: preferences.liked.filter((x) => x !== id) }; updatePrefs(p); }} onBack={() => setScreen("home")} />;
  return null;
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
function OnboardingScreen({ onDone }) {
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState({
    kettlebell: true, dumbbells: false, pullup: false,
    stretching: true, mobility: true, kettlebell_kg: 16,
  });
  const toggle = (k) => setSettings(s => ({ ...s, [k]: !s[k] }));

  const equipItems = [
    { key: "kettlebell", label: "Гиря", icon: "🏋️" },
    { key: "dumbbells",  label: "Гантели", icon: "💪" },
    { key: "pullup",     label: "Турник", icon: "🔝" },
  ];
  const extraItems = [
    { key: "stretching", label: "Растяжка", color: "#7c3aed" },
    { key: "mobility",   label: "Мобильность", color: "#16a34a" },
  ];

  if (step === 0) return (
    <div style={{ background: "#0f1117", minHeight: "100vh", color: "#f9fafb", fontFamily: "'DM Sans','Segoe UI',sans-serif", display: "flex", flexDirection: "column", padding: "48px 24px 40px" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🏋️</div>
        <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 12, lineHeight: 1.2 }}>Добро пожаловать<br/>в Iron Workout</div>
        <div style={{ fontSize: 16, color: "#9ca3af", lineHeight: 1.7, marginBottom: 36 }}>Тренировки на каждый день — под тебя и твоё оборудование.</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { color: "#e85d26", icon: "🏋️", title: "Силовые", desc: "Упражнения с гирей и весом тела" },
            { color: "#16a34a", icon: "🔄", title: "Мобильность", desc: "Разогрев суставов перед тренировкой" },
            { color: "#7c3aed", icon: "🧘", title: "Растяжка", desc: "Заминка и восстановление после нагрузки" },
          ].map(({ color, icon, title, desc }) => (
            <div key={title} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: color + "11", border: `1px solid ${color}33`, borderRadius: 14 }}>
              <span style={{ fontSize: 26 }}>{icon}</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color }}>{title}</div>
                <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 2 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <button style={{ width: "100%", padding: "16px 0", background: "#e85d26", border: "none", borderRadius: 16, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 32 }} onClick={() => setStep(1)}>
        Далее →
      </button>
    </div>
  );

  return (
    <div style={{ background: "#0f1117", minHeight: "100vh", color: "#f9fafb", fontFamily: "'DM Sans','Segoe UI',sans-serif", display: "flex", flexDirection: "column", padding: "48px 24px 40px" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Шаг 2 из 2</div>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>Что у тебя есть?</div>
        <div style={{ fontSize: 14, color: "#9ca3af", marginBottom: 28 }}>Выбери оборудование — тренировки подстроятся</div>

        <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Оборудование</div>
        {equipItems.map(({ key, label, icon }) => (
          <div key={key} onClick={() => toggle(key)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: settings[key] ? "#e85d2611" : "#1a1d27", border: `1.5px solid ${settings[key] ? "#e85d26" : "#2d3748"}`, borderRadius: 14, marginBottom: 10, cursor: "pointer" }}>
            <span style={{ fontSize: 22 }}>{icon}</span>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{label}</span>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: settings[key] ? "#e85d26" : "#111827", border: `2px solid ${settings[key] ? "#e85d26" : "#374151"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {settings[key] && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✓</span>}
            </div>
          </div>
        ))}

        <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Включить в тренировку</div>
        {extraItems.map(({ key, label, color }) => (
          <div key={key} onClick={() => toggle(key)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: settings[key] ? color + "11" : "#1a1d27", border: `1.5px solid ${settings[key] ? color : "#2d3748"}`, borderRadius: 14, marginBottom: 10, cursor: "pointer" }}>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: settings[key] ? color : "#f9fafb" }}>{label}</span>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: settings[key] ? color : "#111827", border: `2px solid ${settings[key] ? color : "#374151"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {settings[key] && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✓</span>}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 14, color: "#6b7280" }}>Потом можно поменять в</span>
        <span style={{ fontSize: 16 }}>⚙️</span>
      </div>
      <button style={{ width: "100%", padding: "16px 0", background: "#e85d26", border: "none", borderRadius: 16, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" }} onClick={() => onDone(settings)}>
        Начать →
      </button>
    </div>
  );
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function SettingsScreen({ settings, onSave, onBack }) {
  const [s, setS] = useState(settings);
  const toggle = (k) => setS(prev => ({ ...prev, [k]: !prev[k] }));
  const equipItems = [
    { key: "kettlebell", label: "Гиря", icon: "🏋️" },
    { key: "dumbbells",  label: "Гантели", icon: "💪" },
    { key: "pullup",     label: "Турник", icon: "🔝" },
  ];
  const extraItems = [
    { key: "stretching", label: "Растяжка", color: "#7c3aed" },
    { key: "mobility",   label: "Мобильность", color: "#16a34a" },
  ];

  return (
    <div style={{ background: "#0f1117", minHeight: "100vh", color: "#f9fafb", fontFamily: "'DM Sans','Segoe UI',sans-serif", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, padding: "20px 16px 100px", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 18, padding: "4px 8px 4px 0" }}>←</button>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Настройки</div>
        </div>

        <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Оборудование</div>
        {equipItems.map(({ key, label, icon }) => (
          <div key={key} onClick={() => toggle(key)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: s[key] ? "#e85d2611" : "#1a1d27", border: `1.5px solid ${s[key] ? "#e85d26" : "#2d3748"}`, borderRadius: 14, marginBottom: 10, cursor: "pointer" }}>
            <span style={{ fontSize: 22 }}>{icon}</span>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{label}</span>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: s[key] ? "#e85d26" : "#111827", border: `2px solid ${s[key] ? "#e85d26" : "#374151"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {s[key] && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✓</span>}
            </div>
          </div>
        ))}

        <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Включить в тренировку</div>
        {extraItems.map(({ key, label, color }) => (
          <div key={key} onClick={() => toggle(key)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: s[key] ? color + "11" : "#1a1d27", border: `1.5px solid ${s[key] ? color : "#2d3748"}`, borderRadius: 14, marginBottom: 10, cursor: "pointer" }}>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: s[key] ? color : "#f9fafb" }}>{label}</span>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: s[key] ? color : "#111827", border: `2px solid ${s[key] ? color : "#374151"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {s[key] && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✓</span>}
            </div>
          </div>
        ))}
      </div>

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px 32px", background: "linear-gradient(to top, #0f1117 70%, transparent)" }}>
        <button style={{ width: "100%", padding: "15px 0", background: "#e85d26", border: "none", borderRadius: 14, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }} onClick={() => onSave(s)}>
          Сохранить
        </button>
      </div>
    </div>
  );
}


function PrefsListSheet({ type, preferences, onFeedback, onClose }) {
  const ids = type === "liked" ? preferences.liked : preferences.disliked;
  const exercises = ids.map(id => ALL_EXERCISES.find(e => e.id === id)).filter(Boolean);
  const title = type === "liked" ? "👍 Любимые" : "👎 Скрытые";
  const accent = type === "liked" ? "#e85d26" : "#6b7280";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)" }} onClick={onClose} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#161920", borderRadius: "20px 20px 0 0", maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 16px 0", flexShrink: 0 }}>
          <div style={{ width: 40, height: 4, background: "#374151", borderRadius: 2, margin: "0 auto 16px" }} />
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, color: accent }}>{title}</div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
          {exercises.length === 0 && (
            <div style={{ textAlign: "center", color: "#4b5563", fontSize: 14, padding: "32px 0" }}>Список пуст</div>
          )}
          {exercises.map((ex) => {
            const isLiked = preferences.liked.includes(ex.id);
            const isDisliked = preferences.disliked.includes(ex.id);
            return (
              <div key={ex.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#1a1d27", borderRadius: 10, marginBottom: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: TYPE_COLORS[ex.type], flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{ex.name}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{ex.sets_reps}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => onFeedback(ex.id, "like")} style={{ background: isLiked ? "#e85d2622" : "#111827", border: `1px solid ${isLiked ? "#e85d26" : "#2d3748"}`, borderRadius: 8, padding: "5px 10px", color: isLiked ? "#e85d26" : "#6b7280", cursor: "pointer", fontSize: 14 }}>👍</button>
                  <button onClick={() => onFeedback(ex.id, "dislike")} style={{ background: isDisliked ? "#37414122" : "#111827", border: `1px solid ${isDisliked ? "#6b7280" : "#2d3748"}`, borderRadius: 8, padding: "5px 10px", color: isDisliked ? "#9ca3af" : "#6b7280", cursor: "pointer", fontSize: 14 }}>👎</button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: "12px 16px 32px", borderTop: "1px solid #1f2937", flexShrink: 0 }}>
          <button style={{ width: "100%", padding: "14px 0", background: "#1a1d27", border: "1.5px solid #2d3748", borderRadius: 14, color: "#f9fafb", fontSize: 15, fontWeight: 600, cursor: "pointer" }} onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}

function SessionDetailSheet({ session, preferences, sessionFeedback, onFeedback, onClose }) {
  const exercises = session.exerciseIds.map(id => ALL_EXERCISES.find(e => e.id === id)).filter(Boolean);
  const dur = session.duration_min ? `${session.duration_min} мин` : null;
  const date = new Date(session.date).toLocaleDateString("ru", { day: "numeric", month: "long", year: "numeric" });
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)" }} onClick={onClose} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#161920", borderRadius: "20px 20px 0 0", maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 16px 0" }}>
          <div style={{ width: 40, height: 4, background: "#374151", borderRadius: 2, margin: "0 auto 16px" }} />
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{date}</div>
          {dur && <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>⏱ {dur} · {exercises.length} упражнений</div>}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
          {exercises.map((ex) => {
            const fb = sessionFeedback?.[ex.id];
            return (
              <div key={ex.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#1a1d27", borderRadius: 10, marginBottom: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: TYPE_COLORS[ex.type], flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{ex.name}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{ex.sets_reps}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => onFeedback(ex.id, "like")} style={{ background: fb === "like" ? "#e85d2622" : "#111827", border: `1px solid ${fb === "like" ? "#e85d26" : "#2d3748"}`, borderRadius: 8, padding: "5px 10px", color: fb === "like" ? "#e85d26" : "#6b7280", cursor: "pointer", fontSize: 14 }}>👍</button>
                  <button onClick={() => onFeedback(ex.id, "dislike")} style={{ background: fb === "dislike" ? "#37414122" : "#111827", border: `1px solid ${fb === "dislike" ? "#6b7280" : "#2d3748"}`, borderRadius: 8, padding: "5px 10px", color: fb === "dislike" ? "#9ca3af" : "#6b7280", cursor: "pointer", fontSize: 14 }}>👎</button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: "12px 16px 32px", borderTop: "1px solid #1f2937" }}>
          <button style={{ width: "100%", padding: "14px 0", background: "#1a1d27", border: "1.5px solid #2d3748", borderRadius: 14, color: "#f9fafb", fontSize: 15, fontWeight: 600, cursor: "pointer" }} onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}

function HomeScreen({ history, preferences, onStart, onCatalog, onSettings, onViewSession, viewingSession, onCloseSession, sessionFeedback, onFeedback }) {
  const recent = [...history].reverse().slice(0, 5);
  const [prefsSheet, setPrefsSheet] = useState(null); // "liked" | "disliked" | null
  return (
    <div style={{ background: "#0f1117", minHeight: "100vh", color: "#f9fafb", fontFamily: "'DM Sans','Segoe UI',sans-serif", display: "flex", flexDirection: "column" }}>
      {/* Скроллируемый контент */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 120px" }}>
        <div style={s.homeHeader}>
          <div><div style={s.appTitle}>ЖЕЛЕЗО</div><div style={s.appSub}>Тренировки с гирей</div></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={s.iconBtn} onClick={onCatalog}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </button>
            <button style={s.iconBtn} onClick={onSettings}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            </button>
          </div>
        </div>

        <div style={s.statsRow}>
          {[{ v: history.length, l: "тренировок", c: null, key: null }, { v: preferences.liked.length, l: "любимых", c: "#e85d26", key: "liked" }, { v: preferences.disliked.length, l: "скрыто", c: "#6b7280", key: "disliked" }].map(({ v, l, c, key }) => (
            <div key={l} style={{ ...s.statCard, ...(key ? { cursor: "pointer" } : {}) }} onClick={() => key && setPrefsSheet(key)}>
              <div style={{ ...s.statNum, ...(c ? { color: c } : {}) }}>{v}</div>
              <div style={s.statLabel}>{l}</div>
            </div>
          ))}
        </div>

        {recent.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>История</div>
            {recent.map((session, i) => {
              const startDate = new Date(session.date);
              const endDate = session.endTime ? new Date(session.endTime) : null;
              const dateStr = startDate.toLocaleDateString("ru", { day: "numeric", month: "long" });
              const startStr = startDate.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
              const endStr = endDate ? endDate.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" }) : null;
              const durMin = endDate ? Math.round((endDate - startDate) / 60000) : null;
              return (
                <div key={i} style={{ background: "#1a1d27", border: "1px solid #2d3748", borderRadius: 14, padding: "12px 14px", marginBottom: 10, cursor: "pointer" }} onClick={() => onViewSession(session)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{dateStr}</div>
                    <div style={{ fontSize: 12, color: "#4b5563" }}>{session.exerciseIds.length} упр →</div>
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    {startStr}{endStr ? ` — ${endStr}` : ""}{durMin ? ` · ${durMin} мин` : ""}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Фиксированная кнопка внизу */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px 32px", background: "linear-gradient(to top, #0f1117 70%, transparent)" }}>
        <button style={s.primaryBtn} onClick={onStart}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" style={{ marginRight: 8 }}><polygon points="5,3 19,12 5,21"/></svg>
          Начать тренировку
        </button>
      </div>

      {viewingSession && <SessionDetailSheet session={viewingSession} preferences={preferences} sessionFeedback={sessionFeedback} onFeedback={onFeedback} onClose={onCloseSession} />}
      {prefsSheet && <PrefsListSheet type={prefsSheet} preferences={preferences} onFeedback={onFeedback} onClose={() => setPrefsSheet(null)} />}
    </div>
  );
}

// ─── DRAG TO CLOSE ────────────────────────────────────────────────────────────
function DragSheet({ onClose, style, children }) {
  const startY = useRef(null);
  const ref = useRef(null);
  return (
    <div
      ref={ref}
      style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#161920", borderRadius: "20px 20px 0 0", touchAction: "pan-x", transition: "transform 0.15s", ...style }}
      onTouchStart={(e) => { startY.current = e.touches[0].clientY; }}
      onTouchMove={(e) => {
        const dy = e.touches[0].clientY - (startY.current ?? 0);
        if (dy > 0 && ref.current) ref.current.style.transform = `translateY(${dy}px)`;
      }}
      onTouchEnd={(e) => {
        const dy = e.changedTouches[0].clientY - (startY.current ?? 0);
        if (ref.current) ref.current.style.transform = "";
        startY.current = null;
        if (dy > 80) onClose();
      }}
    >
      {children}
    </div>
  );
}



function WorkoutScreen({ exercise, nextExercise, currentIdx, total, timer, timerActive, feedback, weights, onUpdateWeight, onToggleTimer, onNext, onFeedback, onQuit }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingWeight, setEditingWeight] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const hasTimer = /сек|мин/.test(exercise.sets_reps);
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const accent = TYPE_COLORS[exercise.type];
  const thumbEmoji = { kettlebell: "🏋️", bodyweight: "💪", mobility: "🔄", stretching: "🧘" }[exercise.type];
  const isLast = currentIdx === total - 1;
  const currentWeight = weights[exercise.id] ?? exercise.weight_kg;
  const hasWeight = exercise.weight_kg !== null && exercise.weight_kg !== undefined;

  const startEditWeight = (e) => {
    e.stopPropagation();
    setWeightInput(currentWeight?.toString() || "");
    setEditingWeight(true);
  };
  const commitWeight = () => {
    const kg = parseFloat(weightInput);
    if (!isNaN(kg) && kg > 0) onUpdateWeight(exercise.id, kg);
    setEditingWeight(false);
  };

  return (
    <div style={{ background: "#0f1117", height: "100vh", display: "flex", flexDirection: "column", color: "#f9fafb", fontFamily: "'DM Sans','Segoe UI',sans-serif", overflow: "hidden" }}>

      {/* Карточка упражнения — фиксированный размер */}
      <div style={{ flex: 1, padding: "16px 16px 0", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, border: `1.5px solid ${accent}`, borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", cursor: "pointer" }} onClick={() => setSheetOpen(true)}>
          {/* Картинка — cover, без обрезки по краям */}
          <div style={{ flex: 1, background: accent + "11", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
            {exercise.image_url
              ? <img src={exercise.image_url} alt={exercise.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span style={{ fontSize: 72 }}>{thumbEmoji}</span>}
            <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,0.55)", borderRadius: 20, padding: "4px 10px", fontSize: 11, color: "#9ca3af" }}>{currentIdx + 1} / {total}</div>
            <div style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.55)", borderRadius: 20, padding: "4px 10px", fontSize: 11, color: "#9ca3af", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onQuit(); }}>✕</div>
            <div style={{ position: "absolute", bottom: 10, right: 10, background: "rgba(0,0,0,0.55)", borderRadius: 8, padding: "4px 10px", fontSize: 12, color: "#9ca3af" }}>Детали ···</div>
          </div>
          {/* Текст — фиксированная высота */}
          <div style={{ flexShrink: 0, padding: "12px 14px 14px", background: "#161920" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
              <span style={{ ...s.typeBadge, background: accent + "22", color: accent }}>{TYPE_LABELS[exercise.type]}</span>
              {hasWeight && !editingWeight && (
                <span style={{ ...s.weightBadge, cursor: "pointer", border: "1px solid #374151" }} onClick={startEditWeight}>
                  ⚖ {currentWeight} кг ✎
                </span>
              )}
              {hasWeight && editingWeight && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={e => e.stopPropagation()}>
                  <input
                    autoFocus
                    type="number"
                    value={weightInput}
                    onChange={e => setWeightInput(e.target.value)}
                    onBlur={commitWeight}
                    onKeyDown={e => e.key === "Enter" && commitWeight()}
                    style={{ width: 64, padding: "3px 8px", background: "#111827", border: "1.5px solid #e85d26", borderRadius: 8, color: "#f9fafb", fontSize: 13, fontWeight: 600, outline: "none" }}
                  />
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>кг</span>
                  <button onClick={commitWeight} style={{ background: "#e85d26", border: "none", borderRadius: 6, color: "#fff", fontSize: 12, padding: "3px 8px", cursor: "pointer", fontWeight: 600 }}>✓</button>
                </div>
              )}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2, marginBottom: 4, letterSpacing: "-0.02em" }}>{exercise.name}</div>
            <div style={{ fontSize: 14, color: "#e85d26", fontWeight: 700, marginBottom: 6 }}>{exercise.sets_reps}</div>
            {exercise.description && <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.5 }}>{exercise.description}</div>}
          </div>
        </div>
      </div>

      {/* Нижняя зона — таймер (фикс. высота всегда) + кнопка */}
      <div style={{ flexShrink: 0, padding: "12px 16px 28px", background: "#0f1117" }}>
        <div style={{ height: 64, display: "flex", alignItems: "center", marginBottom: 10 }}>
          {hasTimer && <>
            <div style={{ ...s.timerDisplay, color: timer < 10 && timerActive ? "#ef4444" : "#f9fafb" }}>{fmt(timer)}</div>
            <button style={{ ...s.timerBtn, background: timerActive ? "#374151" : "#e85d26", marginLeft: 16 }} onClick={onToggleTimer}>
              {timerActive ? "⏸ Пауза" : timer === 0 ? "↺ Сброс" : "▶ Старт"}
            </button>
          </>}
        </div>
        <button style={s.nextBtn} onClick={onNext}>
          {isLast ? "Завершить ✓" : "Следующее →"}
        </button>
      </div>

      {/* Bottom sheet */}
      {sheetOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)" }} onClick={() => setSheetOpen(false)} />
          <DragSheet onClose={() => setSheetOpen(false)} style={{ padding: "20px 16px 40px", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ width: 40, height: 4, background: "#374151", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <span style={{ ...s.typeBadge, background: accent + "22", color: accent }}>{TYPE_LABELS[exercise.type]}</span>
              {exercise.weight_kg && <span style={s.weightBadge}>⚖ {exercise.weight_kg} кг</span>}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.02em" }}>{exercise.name}</div>
            <div style={{ fontSize: 15, color: "#e85d26", fontWeight: 600, marginBottom: 18 }}>{exercise.sets_reps}</div>
            {exercise.notes && (
              <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "#111827", borderRadius: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
                <span style={{ fontSize: 14, color: "#d1d5db", lineHeight: 1.6 }}>{exercise.notes}</span>
              </div>
            )}
            {exercise.youtube_url && (
              <a href={exercise.youtube_url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "#1a1a2e", border: "1px solid #2d2d44", borderRadius: 10, marginBottom: 16, textDecoration: "none" }}>
                <span style={{ fontSize: 20 }}>▶️</span>
                <span style={{ fontSize: 14, color: "#c084fc", fontWeight: 500 }}>Смотреть шортсы на YouTube</span>
              </a>
            )}
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
          </DragSheet>
        </div>
      )}
    </div>
  );
}

function DoneScreen({ workout, sessionFeedback, onFeedback, onHome }) {
  return (
    <div style={{ background: "#0f1117", height: "100vh", color: "#f9fafb", fontFamily: "'DM Sans','Segoe UI',sans-serif", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 16px 100px" }}>
        <div style={{ fontSize: 48, textAlign: "center", marginBottom: 10 }}>🔥</div>
        <div style={{ fontSize: 24, fontWeight: 800, textAlign: "center", marginBottom: 4, letterSpacing: "-0.02em" }}>Готово!</div>
        <div style={{ fontSize: 14, color: "#6b7280", textAlign: "center", marginBottom: 24 }}>{workout.length} упражнений выполнено</div>

        <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Упражнения</div>
        {workout.map((ex) => {
          const fb = sessionFeedback[ex.id];
          return (
            <div key={ex.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#1a1d27", borderRadius: 10, marginBottom: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: TYPE_COLORS[ex.type], flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{ex.name}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{ex.sets_reps}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => onFeedback(ex.id, "like")} style={{ background: fb === "like" ? "#e85d2622" : "#111827", border: `1px solid ${fb === "like" ? "#e85d26" : "#2d3748"}`, borderRadius: 8, padding: "5px 10px", color: fb === "like" ? "#e85d26" : "#6b7280", cursor: "pointer", fontSize: 14 }}>👍</button>
                <button onClick={() => onFeedback(ex.id, "dislike")} style={{ background: fb === "dislike" ? "#37414122" : "#111827", border: `1px solid ${fb === "dislike" ? "#6b7280" : "#2d3748"}`, borderRadius: 8, padding: "5px 10px", color: fb === "dislike" ? "#9ca3af" : "#6b7280", cursor: "pointer", fontSize: 14 }}>👎</button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px 32px", background: "linear-gradient(to top, #0f1117 70%, transparent)" }}>
        <button style={s.primaryBtn} onClick={onHome}>На главную</button>
      </div>
    </div>
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
