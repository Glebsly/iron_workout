// ─────────────────────────────────────────────────────────────────────────────
// workout-logic.js
// Вся логика подбора упражнений и работы с предпочтениями.
// Никакого UI, никакого хранилища — только чистые функции.
// ─────────────────────────────────────────────────────────────────────────────
import { ALL_EXERCISES } from "./exercises.js";
// Сколько последних упражнений учитывать при расчёте антиповтора
const HISTORY_LOOKBACK = 30;
// Количество упражнений в каждом блоке тренировки
const WORKOUT_SHAPE = {
warmup: 3, // mobility
main: 5, // kettlebell + bodyweight
cooldown: 3, // stretching
};
// ── Скоринг ───────────────────────────────────────────────────────────────────
/**
* Рассчитать приоритетный балл для упражнения.
* Чем выше — тем больше шансов попасть в тренировку.
*
* +40 если упражнение в liked
* -20 за каждое недавнее появление в истории
* +0–15 случайный шум (чтобы не было одинаковых тренировок)
*/
function score(exercise, liked, recentIds) {
let s = 0;
if (liked.includes(exercise.id)) s += 40;
const recentCount = recentIds.filter((id) => id === exercise.id).length;
s -= recentCount * 20;
s += Math.random() * 15;
return s;
}
/**
* Выбрать `count` упражнений из пула по скорингу.
*/
function pickTop(pool, count, liked, recentIds) {
return [...pool]
.sort((a, b) => score(b, liked, recentIds) - score(a, liked, recentIds))
.slice(0, count);
}
// ── Генератор тренировки ──────────────────────────────────────────────────────
/**
* Сгенерировать тренировку с учётом предпочтений и истории.
*
* Структура: разминка (mobility) → основная часть (kettlebell + bodyweight) → заминка *
* @param {{ liked: string[], disliked: string[] }} preferences
* @param {Array} history — массив сессий [{ date, exerciseIds[] }]
* @returns {Array} массив упражнений для текущей тренировки
*/
export function generateWorkout(preferences, history) {
const { liked, disliked } = preferences;
// Упражнения которые пользователь скрыл — убираем полностью
const available = ALL_EXERCISES.filter((e) => !disliked.includes(e.id));
// Последние N упражнений для штрафа за повтор
const recentIds = history
.flatMap((s) => s.exerciseIds)
.slice(-HISTORY_LOOKBACK);
const warmup = pickTop(
available.filter((e) => e.type === "mobility"),
WORKOUT_SHAPE.warmup,
liked,
recentIds
);
const main = pickTop(
available.filter((e) => e.type === "kettlebell" || e.type === "bodyweight"),
WORKOUT_SHAPE.main,
liked,
recentIds
);
const cooldown = pickTop(
available.filter((e) => e.type === "stretching"),
WORKOUT_SHAPE.cooldown,
liked,
recentIds
);
return [...warmup, ...main, ...cooldown];
}
/**
* Индексы блоков тренировки (для отображения фазы в UI).
*/
export const BLOCK_RANGES = {
warmup: [0, WORKOUT_SHAPE.warmup - 1],
main: [WORKOUT_SHAPE.warmup, WORKOUT_SHAPE.warmup + WORKOUT_SHAPE.main - 1],
cooldown: [WORKOUT_SHAPE.warmup + WORKOUT_SHAPE.main, Infinity],
};
export function getPhaseLabel(index) {
if (index <= BLOCK_RANGES.warmup[1]) return "Разминка";
if (index <= BLOCK_RANGES.main[1]) return "Основная часть";
return "Заминка";
}
// ── Предпочтения ─────────────────────────────────────────────────────────────
/**
* Применить лайки/дизлайки накопленные за тренировку к постоянным предпочтениям.
*
* @param {{ liked: string[], disliked: string[] }} currentPrefs
* @param {{ [id: string]: "like" | "dislike" | null }} sessionFeedback
* @returns {{ liked: string[], disliked: string[] }} обновлённые предпочтения
*/
export function applySessionFeedback(currentPrefs, sessionFeedback) {
const prefs = {
liked: [...currentPrefs.liked],
disliked: [...currentPrefs.disliked],
};
Object.entries(sessionFeedback).forEach(([id, value]) => {
if (value === "like") {
prefs.liked = [...new Set([...prefs.liked, id])];
prefs.disliked = prefs.disliked.filter((x) => x !== id);
} else if (value === "dislike") {
prefs.disliked = [...new Set([...prefs.disliked, id])];
prefs.liked = prefs.liked.filter((x) => x !== id);
}
});
return prefs;
}
/**
* Переключить лайк на упражнение (для каталога).
*/
export function toggleLike(prefs, id) {
const liked = prefs.liked.includes(id)
? prefs.liked.filter((x) => x !== id)
: [...new Set([...prefs.liked, id])];
const disliked = prefs.disliked.filter((x) => x !== id);
return { liked, disliked };
}
/**
* Переключить дизлайк на упражнение (для каталога).
*/
export function toggleDislike(prefs, id) {
const disliked = prefs.disliked.includes(id)
? prefs.disliked.filter((x) => x !== id)
: [...new Set([...prefs.disliked, id])];
const liked = prefs.liked.filter((x) => x !== id);
return { liked, disliked };
}
/**

* Посчитать примерное время тренировки в минутах.
*/
export function estimateDuration(exercises) {
const totalSec = exercises.reduce(
(sum, e) => sum + e.duration_sec + e.rest_sec,
0
);
return Math.round(totalSec / 60);
}