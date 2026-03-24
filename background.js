// background.js — Browser Doctor service worker
// Keeps 7-day rolling history for day/week stats in popup.

const HISTORY_KEY = 'statsHistory';
const LEGACY_DAILY_KEY = 'dailyStats';
const NOTIFY_STATE_KEY = 'notifyState';
const MAX_DAYS = 7;
const WARNING_COOLDOWN_MS = 5 * 60 * 1000;
const DANGER_COOLDOWN_MS = 2 * 60 * 1000;

let statsHistory = { days: [] };
let notifyState = { lastLevel: 'good', lastAt: 0 };
let initialized = false;

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function emptyDay(dateKey) {
  return {
    date: dateKey,
    tabsClosed: 0,
    memoryFreed: 0,
    scans: 0
  };
}

function normalizeDays(days) {
  const merged = new Map();

  for (const raw of Array.isArray(days) ? days : []) {
    if (!raw || typeof raw.date !== 'string') continue;
    const base = emptyDay(raw.date);
    merged.set(raw.date, {
      ...base,
      tabsClosed: Number(raw.tabsClosed) || 0,
      memoryFreed: Number(raw.memoryFreed) || 0,
      scans: Number(raw.scans) || 0
    });
  }

  const list = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
  const today = localDateKey();
  if (!list.some((d) => d.date === today)) {
    list.push(emptyDay(today));
  }

  while (list.length > MAX_DAYS) {
    list.shift();
  }

  return list;
}

function getTodayRecord() {
  const today = localDateKey();
  let day = statsHistory.days.find((d) => d.date === today);
  if (!day) {
    day = emptyDay(today);
    statsHistory.days.push(day);
    statsHistory.days = normalizeDays(statsHistory.days);
  }
  return day;
}

function getWeekTotals() {
  return statsHistory.days.reduce(
    (sum, day) => {
      sum.tabsClosed += day.tabsClosed;
      sum.memoryFreed += day.memoryFreed;
      sum.scans += day.scans;
      return sum;
    },
    { tabsClosed: 0, memoryFreed: 0, scans: 0 }
  );
}

function snapshot() {
  return {
    today: { ...getTodayRecord() },
    week: getWeekTotals(),
    days: statsHistory.days.map((d) => ({ ...d }))
  };
}

async function saveHistory() {
  await chrome.storage.local.set({
    [HISTORY_KEY]: statsHistory,
    [NOTIFY_STATE_KEY]: notifyState
  });
}

async function initIfNeeded() {
  if (initialized) return;

  const data = await chrome.storage.local.get([HISTORY_KEY, LEGACY_DAILY_KEY, NOTIFY_STATE_KEY]);
  const savedHistory = data[HISTORY_KEY];
  const legacyDaily = data[LEGACY_DAILY_KEY];
  const savedNotifyState = data[NOTIFY_STATE_KEY];

  if (savedHistory && Array.isArray(savedHistory.days)) {
    statsHistory = { days: normalizeDays(savedHistory.days) };
  } else if (legacyDaily && typeof legacyDaily === 'object') {
    // Migrate old one-day format if it exists.
    let date = localDateKey();
    if (typeof legacyDaily.date === 'string') {
      const parsed = new Date(legacyDaily.date);
      if (!Number.isNaN(parsed.getTime())) {
        date = localDateKey(parsed);
      }
    }
    statsHistory = {
      days: normalizeDays([
        {
          date,
          tabsClosed: Number(legacyDaily.tabsClosed) || 0,
          memoryFreed: Number(legacyDaily.memoryFreed) || 0,
          scans: Number(legacyDaily.scans) || 0
        }
      ])
    };
  } else {
    statsHistory = { days: normalizeDays([]) };
  }

  if (savedNotifyState && typeof savedNotifyState === 'object') {
    notifyState = {
      lastLevel: String(savedNotifyState.lastLevel || 'good'),
      lastAt: Number(savedNotifyState.lastAt) || 0
    };
  }

  initialized = true;
  await saveHistory();
}

function applyDelta(message) {
  const day = getTodayRecord();
  day.tabsClosed += Math.max(0, Number(message.tabsClosed) || 0);
  day.memoryFreed += Math.max(0, Number(message.memoryFreed) || 0);
  day.scans += Math.max(0, Number(message.scans) || 0);
  statsHistory.days = normalizeDays(statsHistory.days);
}

async function maybeNotifyHealth(level, text) {
  const normalizedLevel = level === 'danger' ? 'danger' : level === 'warning' ? 'warning' : 'good';

  if (normalizedLevel === 'good') {
    notifyState.lastLevel = 'good';
    notifyState.lastAt = 0;
    await saveHistory();
    return { success: true, notified: false, reason: 'GOOD_STATE' };
  }

  const now = Date.now();
  const cooldown = normalizedLevel === 'danger' ? DANGER_COOLDOWN_MS : WARNING_COOLDOWN_MS;
  const changedLevel = notifyState.lastLevel !== normalizedLevel;
  const expired = now - notifyState.lastAt >= cooldown;
  const canNotify = changedLevel || expired;

  if (!canNotify) {
    return { success: true, notified: false, reason: 'COOLDOWN' };
  }

  const title = normalizedLevel === 'danger'
    ? 'Browser Doctor: критическая нагрузка'
    : 'Browser Doctor: высокая нагрузка';
  const message = String(text || 'Обнаружены ресурсоемкие вкладки. Откройте Browser Doctor для оптимизации.');

  await chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    priority: normalizedLevel === 'danger' ? 2 : 1
  });

  notifyState.lastLevel = normalizedLevel;
  notifyState.lastAt = now;
  await saveHistory();

  return { success: true, notified: true };
}

async function showTestNotification(text) {
  await chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Browser Doctor: тест',
    message: String(text || 'Тестовое оповещение Browser Doctor.'),
    priority: 1
  });

  return { success: true, notified: true };
}

async function configureSidePanelBehavior() {
  if (!chrome.sidePanel || !chrome.sidePanel.setPanelBehavior) return;
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (err) {
    console.warn('Browser Doctor side panel behavior setup failed:', err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  initIfNeeded().catch((err) => console.error('Browser Doctor init error:', err));
  configureSidePanelBehavior().catch((err) => console.error('Browser Doctor side panel init error:', err));
});

chrome.runtime.onStartup.addListener(() => {
  initIfNeeded().catch((err) => console.error('Browser Doctor startup init error:', err));
  configureSidePanelBehavior().catch((err) => console.error('Browser Doctor side panel startup error:', err));
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!chrome.sidePanel || !chrome.sidePanel.open) return;
  try {
    if (tab && tab.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
    } else {
      await chrome.sidePanel.open({});
    }
  } catch (err) {
    console.warn('Browser Doctor side panel open failed:', err);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    await initIfNeeded();
    statsHistory.days = normalizeDays(statsHistory.days);

    if (!message || !message.type) {
      sendResponse({ success: false, error: 'EMPTY_MESSAGE' });
      return;
    }

    if (message.type === 'UPDATE_STATS') {
      applyDelta(message);
      await saveHistory();
      sendResponse({ success: true, snapshot: snapshot() });
      return;
    }

    if (message.type === 'GET_STATS') {
      sendResponse({ success: true, snapshot: snapshot() });
      return;
    }

    if (message.type === 'NOTIFY_HEALTH') {
      const result = await maybeNotifyHealth(message.level, message.text);
      sendResponse(result);
      return;
    }

    if (message.type === 'TEST_NOTIFICATION') {
      const result = await showTestNotification(message.text);
      sendResponse(result);
      return;
    }

    sendResponse({ success: false, error: 'UNKNOWN_MESSAGE' });
  })().catch((err) => {
    console.error('Browser Doctor message error:', err);
    sendResponse({ success: false, error: String(err) });
  });

  return true;
});
