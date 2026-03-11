// ─────────────────────────────────────────────────────────────────────────────
// storage.js
// Всё что касается сохранения данных — в одном месте.
//
// Сейчас: window.storage (работает в Claude-артефактах для превью).
// Для Telegram: замени 3 функции ниже на cloudStorage из @telegram-apps/sdk.
// Больше ничего менять не нужно — App.jsx и workout-logic.js не знают
// откуда берутся данные.
//
// Как переключить на Telegram CloudStorage:
//   import { cloudStorage } from "@telegram-apps/sdk";
//   Затем замени window.storage.get(key)  → await cloudStorage.getItem(key)
//              window.storage.set(key, v) → await cloudStorage.setItem(key, v)
// ─────────────────────────────────────────────────────────────────────────────

const KEYS = {
  PREFS: "iron_prefs",
  HISTORY: "iron_history",
};

// ── Низкоуровневые операции ───────────────────────────────────────────────────

import { cloudStorage } from "@telegram-apps/sdk";

async function storageGet(key) {
  try {
    return await cloudStorage.getItem(key);
  } catch {
    return null;
  }
}

async function storageSet(key, value) {
  await cloudStorage.setItem(key, value);
}

// ── Публичный API ─────────────────────────────────────────────────────────────

/**
 * Загрузить всё состояние пользователя при старте приложения.
 * @returns {{ preferences: {liked: string[], disliked: string[]}, history: Array }}
 */
export async function loadUserState() {
  const [prefsRaw, historyRaw] = await Promise.all([
    storageGet(KEYS.PREFS),
    storageGet(KEYS.HISTORY),
  ]);

  return {
    preferences: prefsRaw
      ? JSON.parse(prefsRaw)
      : { liked: [], disliked: [] },
    history: historyRaw
      ? JSON.parse(historyRaw)
      : [],
  };
}

/**
 * Сохранить предпочтения пользователя (лайки / дизлайки).
 * @param {{ liked: string[], disliked: string[] }} preferences
 */
export async function savePreferences(preferences) {
  await storageSet(KEYS.PREFS, JSON.stringify(preferences));
}

/**
 * Сохранить историю тренировок. Храним последние 20 сессий.
 * @param {Array} history
 */
export async function saveHistory(history) {
  const trimmed = history.slice(-20);
  await storageSet(KEYS.HISTORY, JSON.stringify(trimmed));
}

/**
 * Добавить запись о завершённой тренировке в историю.
 * @param {Array} currentHistory
 * @param {string[]} exerciseIds — список id упражнений в порядке выполнения
 * @returns {Array} новая история (для обновления state)
 */
export function appendSession(currentHistory, exerciseIds) {
  const session = {
    date: new Date().toISOString(),
    exerciseIds,
  };
  return [...currentHistory, session].slice(-20);
}