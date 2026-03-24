// popup.js — Browser Doctor

const memUsedEl = document.getElementById('memory-used');
const tabsCountEl = document.getElementById('tabs-count');
const extCountEl = document.getElementById('ext-count');
const heavyTabsEl = document.getElementById('heavy-tabs');
const recsEl = document.getElementById('recommendations');
const extListEl = document.getElementById('ext-list');
const dailyStatsEl = document.getElementById('daily-stats');
const weeklyStatsEl = document.getElementById('weekly-stats');
const optimizeBtn = document.getElementById('optimize-btn');
const refreshBtn = document.getElementById('refresh-btn');
const notifyTestBtn = document.getElementById('notify-test-btn');
const healthBadge = document.getElementById('health-badge');
const refreshIcon = document.getElementById('refresh-icon');
const resizeHandle = document.getElementById('resize-handle');

let totalMemoryBytes = 0;
let currentHeavyTabs = [];
const selectedTabIds = new Set();
const SIZE_STORAGE_KEY = 'browserDoctorPopupSize';
const POPUP_MIN_WIDTH = 340;
const POPUP_MAX_WIDTH = 800;
const POPUP_MIN_HEIGHT = 520;
const POPUP_MAX_HEIGHT = 900;
const DEFAULT_POPUP_WIDTH = 400;
const DEFAULT_POPUP_HEIGHT = 680;

/* ---- UTILS ---- */
function mb(bytes) {
  if (!bytes) return 0;
  return Math.round(bytes / (1024 * 1024));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function applyPopupSize(width, height) {
  const normalizedWidth = clamp(Math.round(width), POPUP_MIN_WIDTH, POPUP_MAX_WIDTH);
  const normalizedHeight = clamp(Math.round(height), POPUP_MIN_HEIGHT, POPUP_MAX_HEIGHT);

  document.documentElement.style.setProperty('--popup-width', `${normalizedWidth}px`);
  document.documentElement.style.setProperty('--popup-height', `${normalizedHeight}px`);

  return { width: normalizedWidth, height: normalizedHeight };
}

function loadPopupSize() {
  try {
    const raw = localStorage.getItem(SIZE_STORAGE_KEY);
    if (!raw) return applyPopupSize(DEFAULT_POPUP_WIDTH, DEFAULT_POPUP_HEIGHT);
    const parsed = JSON.parse(raw);
    return applyPopupSize(parsed.width, parsed.height);
  } catch {
    return applyPopupSize(DEFAULT_POPUP_WIDTH, DEFAULT_POPUP_HEIGHT);
  }
}

function savePopupSize(size) {
  try {
    localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(size));
  } catch {
    // Ignore storage errors in popup context.
  }
}

function formatCpu(value) {
  const cpu = Number(value) || 0;
  return Math.round(cpu * 10) / 10;
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function memClass(bytes) {
  const value = mb(bytes);
  if (value >= 220) return 'high';
  if (value >= 110) return 'med';
  return 'low';
}

function cpuClass(cpu) {
  const value = formatCpu(cpu);
  if (value >= 30) return 'high';
  if (value >= 15) return 'med';
  return 'low';
}

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getFaviconUrl(url) {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=16`;
  } catch {
    return null;
  }
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function estimateMemory(tab) {
  const url = String(tab.url || '').toLowerCase();
  let base = 60;

  if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('twitch.tv') || url.includes('netflix.com')) {
    base = 280;
  } else if (url.includes('figma.com') || url.includes('miro.com') || url.includes('canva.com')) {
    base = 220;
  } else if (url.includes('docs.google.com') || url.includes('notion.so')) {
    base = 140;
  } else if (url.includes('x.com') || url.includes('twitter.com') || url.includes('facebook.com') || url.includes('instagram.com')) {
    base = 120;
  }

  const variation = (hashString(url) % 35) - 17;
  const memoryMb = Math.max(25, base + variation);
  return memoryMb * 1024 * 1024;
}

function estimateCpu(tab) {
  const url = String(tab.url || '').toLowerCase();
  let base = 2;

  if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('twitch.tv') || url.includes('meet.google.com')) {
    base = 22;
  } else if (url.includes('figma.com') || url.includes('miro.com') || url.includes('canva.com')) {
    base = 14;
  } else if (url.includes('x.com') || url.includes('twitter.com') || url.includes('facebook.com') || url.includes('instagram.com')) {
    base = 8;
  }

  const variation = (hashString(`cpu:${url}`) % 7) - 3;
  return Math.max(1, base + variation);
}

function sendMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response || null);
      });
    } catch {
      resolve(null);
    }
  });
}

function getAllTabs() {
  return new Promise((resolve) => {
    chrome.tabs.query({}, (tabs) => resolve(tabs || []));
  });
}

function getAllProcesses() {
  return new Promise((resolve) => {
    if (!chrome.processes || !chrome.processes.getProcessInfo) {
      resolve(null);
      return;
    }

    try {
      chrome.processes.getProcessInfo([], true, (processes) => {
        if (chrome.runtime.lastError || !processes) {
          resolve(null);
          return;
        }
        resolve(processes);
      });
    } catch {
      resolve(null);
    }
  });
}

function getProcessIdForTab(tabId) {
  return new Promise((resolve) => {
    if (!chrome.processes || !chrome.processes.getProcessIdForTab) {
      resolve(null);
      return;
    }

    try {
      chrome.processes.getProcessIdForTab(tabId, (pid) => {
        if (chrome.runtime.lastError || !pid || pid === -1) {
          resolve(null);
          return;
        }
        resolve(pid);
      });
    } catch {
      resolve(null);
    }
  });
}

function getAllExtensions() {
  return new Promise((resolve) => {
    if (!chrome.management || !chrome.management.getAll) {
      resolve([]);
      return;
    }

    chrome.management.getAll((extensions) => {
      const enabled = (extensions || []).filter((ext) => ext.enabled && ext.type === 'extension');
      resolve(enabled);
    });
  });
}

/* ---- ANALYSIS ---- */
async function buildTabDiagnostics(allTabs, processMap) {
  const tabs = allTabs.filter((tab) => {
    if (!tab || !tab.id || !tab.url) return false;
    return !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://');
  });

  if (!tabs.length) {
    return { tabs: [], exactMetrics: false };
  }

  const processById = new Map();
  for (const [id, processInfo] of Object.entries(processMap || {})) {
    processById.set(Number(id), processInfo);
  }

  const withPid = await Promise.all(
    tabs.map(async (tab) => {
      const pid = await getProcessIdForTab(tab.id);
      return { tab, pid };
    })
  );

  const tabCountByPid = new Map();
  for (const item of withPid) {
    if (!item.pid) continue;
    tabCountByPid.set(item.pid, (tabCountByPid.get(item.pid) || 0) + 1);
  }

  let exactMetrics = false;
  const tabDiagnostics = withPid.map(({ tab, pid }) => {
    const processInfo = pid ? processById.get(pid) : null;
    if (processInfo) {
      const share = Math.max(1, tabCountByPid.get(pid) || 1);
      const memory = Math.round((Number(processInfo.privateMemory) || 0) / share);
      const cpu = (Number(processInfo.cpu) || 0) / share;
      exactMetrics = exactMetrics || memory > 0 || cpu > 0;
      return {
        ...tab,
        memory,
        cpu,
        source: 'process'
      };
    }

    return {
      ...tab,
      memory: estimateMemory(tab),
      cpu: estimateCpu(tab),
      source: 'estimated'
    };
  });

  return { tabs: tabDiagnostics, exactMetrics };
}

function buildExtensionDiagnostics(extensions, processMap) {
  const rows = extensions.map((ext) => ({
    id: ext.id,
    name: ext.name,
    version: ext.version || '?',
    memory: 0,
    cpu: 0,
    hasMetrics: false
  }));

  if (!rows.length) {
    return { extensions: rows, exactMetrics: false };
  }

  if (!processMap) {
    return { extensions: rows, exactMetrics: false };
  }

  const byNormalizedName = new Map();
  for (const row of rows) {
    byNormalizedName.set(normalizeName(row.name), row);
  }

  const findRowByTaskTitle = (title) => {
    const normalizedTitle = normalizeName(title);
    if (!normalizedTitle) return null;

    if (byNormalizedName.has(normalizedTitle)) {
      return byNormalizedName.get(normalizedTitle);
    }

    for (const row of rows) {
      const normalizedRowName = normalizeName(row.name);
      if (!normalizedRowName) continue;
      if (normalizedTitle.includes(normalizedRowName) || normalizedRowName.includes(normalizedTitle)) {
        return row;
      }
    }

    return null;
  };

  let exactMetrics = false;
  for (const processInfo of Object.values(processMap)) {
    if (!processInfo || processInfo.type !== 'extension') continue;

    const memory = Number(processInfo.privateMemory) || 0;
    const cpu = Number(processInfo.cpu) || 0;
    if (memory <= 0 && cpu <= 0) continue;

    let target = null;
    const tasks = Array.isArray(processInfo.tasks) ? processInfo.tasks : [];
    for (const task of tasks) {
      target = findRowByTaskTitle(task && task.title);
      if (target) break;
    }

    if (!target) continue;

    target.memory += memory;
    target.cpu += cpu;
    target.hasMetrics = true;
    exactMetrics = true;
  }

  rows.sort((a, b) => {
    const aWeight = (a.memory || 0) + (a.cpu || 0) * 3 * 1024 * 1024;
    const bWeight = (b.memory || 0) + (b.cpu || 0) * 3 * 1024 * 1024;
    return bWeight - aWeight;
  });

  return { extensions: rows, exactMetrics };
}

function buildRecommendations(tabs, heavyTabs, context) {
  const recommendations = [];

  if (!context.tabMetricsExact) {
    recommendations.push({
      icon: 'ℹ',
      text: 'Точные RAM/CPU-метрики недоступны в этом канале Chrome. Показаны безопасные оценки.',
      action: null,
      tabs: []
    });
  }

  if (heavyTabs.length > 0) {
    const heavyMemory = heavyTabs.reduce((sum, tab) => sum + (tab.memory || 0), 0);
    const percent = totalMemoryBytes > 0 ? Math.round((heavyMemory / totalMemoryBytes) * 100) : 0;
    recommendations.push({
      icon: '🔥',
      text: `${heavyTabs.length} тяжёлых вкладок занимают около ${percent}% RAM.`,
      action: 'close-heavy',
      tabs: heavyTabs
    });
  }

  const highCpuTabs = tabs.filter((tab) => (tab.cpu || 0) >= 18);
  if (highCpuTabs.length >= 2) {
    recommendations.push({
      icon: '⚙',
      text: `${highCpuTabs.length} вкладки активно грузят CPU. Закройте лишние, чтобы убрать лаги.`,
      action: 'close-cpu',
      tabs: highCpuTabs
    });
  }

  const videoTabs = tabs.filter((tab) => {
    const url = String(tab.url || '').toLowerCase();
    return url.includes('youtube.com') || url.includes('youtu.be') || url.includes('twitch.tv') || url.includes('netflix.com');
  });

  if (videoTabs.length >= 3) {
    recommendations.push({
      icon: '📺',
      text: `Открыто ${videoTabs.length} видео-вкладок. Часто они создают основной расход ресурсов.`,
      action: 'close-video',
      tabs: videoTabs
    });
  }

  if (tabs.length > 20) {
    recommendations.push({
      icon: '📋',
      text: `Сейчас открыто ${tabs.length} вкладок. Для стабильности лучше держать до 15–20.`,
      action: null,
      tabs: []
    });
  }

  return recommendations;
}

function analyzeTabs(tabs) {
  totalMemoryBytes = tabs.reduce((sum, tab) => sum + (tab.memory || 0), 0);

  const sorted = [...tabs].sort((a, b) => {
    const scoreA = (a.memory || 0) + (a.cpu || 0) * 6 * 1024 * 1024;
    const scoreB = (b.memory || 0) + (b.cpu || 0) * 6 * 1024 * 1024;
    return scoreB - scoreA;
  });

  const heavyTabs = sorted
    .filter((tab) => (tab.memory || 0) >= 45 * 1024 * 1024 || (tab.cpu || 0) >= 12)
    .slice(0, 8);

  const memoryMb = mb(totalMemoryBytes);
  const highCpuCount = tabs.filter((tab) => (tab.cpu || 0) >= 20).length;

  let health = 'good';
  if (heavyTabs.length >= 3 || memoryMb >= 900 || highCpuCount >= 3) {
    health = 'danger';
  } else if (heavyTabs.length >= 1 || memoryMb >= 450 || highCpuCount >= 1 || tabs.length > 15) {
    health = 'warning';
  }

  return { heavyTabs, health };
}

/* ---- RENDER ---- */
function setHealth(health) {
  healthBadge.className = `health-badge ${health}`;
  const label = healthBadge.querySelector('.health-label');

  if (health === 'good') {
    label.textContent = 'Здорово!';
  } else if (health === 'warning') {
    label.textContent = 'Есть нагрузка';
  } else {
    label.textContent = 'Критично';
  }
}

function renderHeavyTabs(heavyTabs) {
  currentHeavyTabs = heavyTabs;

  const currentIds = new Set(heavyTabs.map((tab) => tab.id));
  for (const selectedId of [...selectedTabIds]) {
    if (!currentIds.has(selectedId)) {
      selectedTabIds.delete(selectedId);
    }
  }

  if (selectedTabIds.size === 0) {
    for (const tab of heavyTabs.slice(0, 3)) {
      if (!tab.pinned) selectedTabIds.add(tab.id);
    }
  }

  if (!heavyTabs.length) {
    heavyTabsEl.innerHTML = '<div class="all-good">✦ Тяжёлых вкладок нет</div>';
    return;
  }

  heavyTabsEl.innerHTML = '';
  for (const tab of heavyTabs) {
    const faviconUrl = getFaviconUrl(tab.url);
    const memoryText = `${mb(tab.memory)} MB`;
    const cpuText = `${formatCpu(tab.cpu)}% CPU`;
    const isSelected = selectedTabIds.has(tab.id);
    const canClose = !tab.pinned;

    const row = document.createElement('div');
    row.className = 'tab-item';
    row.innerHTML = `
      <input class="tab-select" type="checkbox" ${isSelected ? 'checked' : ''} ${canClose ? '' : 'disabled'}>
      ${faviconUrl
        ? `<img class="tab-favicon" src="${esc(faviconUrl)}" alt="" onerror="this.style.display='none'">`
        : '<div class="tab-favicon-placeholder"></div>'}
      <div class="tab-info">
        <div class="tab-title">${esc(tab.title || 'Без названия')}${tab.pinned ? ' (закреплена)' : ''}</div>
        <div class="tab-url">${esc(tab.url || '')}</div>
      </div>
      <div class="tab-metrics">
        <span class="tab-mem ${memClass(tab.memory)}">${memoryText}</span>
        <span class="tab-cpu ${cpuClass(tab.cpu)}">${cpuText}</span>
      </div>
      <button class="tab-close" title="Закрыть вкладку" ${canClose ? '' : 'disabled'}>✕</button>
    `;

    const checkbox = row.querySelector('.tab-select');
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedTabIds.add(tab.id);
      } else {
        selectedTabIds.delete(tab.id);
      }
    });

    const closeBtn = row.querySelector('.tab-close');
    if (!canClose) {
      closeBtn.style.opacity = '0.45';
      closeBtn.style.cursor = 'not-allowed';
    }

    closeBtn.addEventListener('click', async () => {
      if (!canClose) return;
      await closeTabs([tab]);
    });

    heavyTabsEl.appendChild(row);
  }
}

function renderRecommendations(recommendations) {
  if (!recommendations.length) {
    recsEl.innerHTML = '<div class="all-good">✦ Всё в порядке</div>';
    return;
  }

  recsEl.innerHTML = '';
  for (const rec of recommendations) {
    const row = document.createElement('div');
    row.className = 'rec-item';
    row.innerHTML = `
      <span class="rec-icon">${esc(rec.icon)}</span>
      <div class="rec-content">
        <div class="rec-text">${esc(rec.text)}</div>
        ${rec.action ? '<button class="rec-do">→ ВЫПОЛНИТЬ</button>' : ''}
      </div>
    `;

    if (rec.action) {
      row.querySelector('.rec-do').addEventListener('click', async () => {
        await closeTabs(rec.tabs || []);
      });
    }

    recsEl.appendChild(row);
  }
}

function renderExtensions(extDiagnostics, exactMetrics) {
  extCountEl.textContent = extDiagnostics.length;

  if (!extDiagnostics.length) {
    extListEl.innerHTML = '<div class="all-good">✦ Нет активных расширений</div>';
    return;
  }

  extListEl.innerHTML = '';
  const visible = extDiagnostics.slice(0, 8);

  for (const ext of visible) {
    const metricText = exactMetrics && ext.hasMetrics
      ? `${mb(ext.memory)} MB • ${formatCpu(ext.cpu)}% CPU`
      : 'RAM/CPU: н/д';

    const row = document.createElement('div');
    row.className = 'ext-item';
    row.innerHTML = `
      <span class="ext-name">${esc(ext.name)}</span>
      <span class="ext-metrics">${esc(metricText)}<br><span class="ext-ver">v${esc(ext.version)}</span></span>
    `;
    extListEl.appendChild(row);
  }

  if (extDiagnostics.length > visible.length) {
    const more = document.createElement('div');
    more.className = 'all-good';
    more.style.color = 'var(--text-muted)';
    more.textContent = `+ ещё ${extDiagnostics.length - visible.length}`;
    extListEl.appendChild(more);
  }
}

function renderStatsGrid(target, stats) {
  target.innerHTML = `
    <div class="day-cell">
      <div class="day-val">${stats.scans || 0}</div>
      <div class="day-lbl">диагностик</div>
    </div>
    <div class="day-cell">
      <div class="day-val">${stats.tabsClosed || 0}</div>
      <div class="day-lbl">закрыто</div>
    </div>
    <div class="day-cell">
      <div class="day-val">${mb(stats.memoryFreed || 0)}</div>
      <div class="day-lbl">MB освобождено</div>
    </div>
  `;
}

async function renderHistory() {
  const response = await sendMessage({ type: 'GET_STATS' });

  if (!response || !response.success || !response.snapshot) {
    renderStatsGrid(dailyStatsEl, { scans: 0, tabsClosed: 0, memoryFreed: 0 });
    renderStatsGrid(weeklyStatsEl, { scans: 0, tabsClosed: 0, memoryFreed: 0 });
    return;
  }

  renderStatsGrid(dailyStatsEl, response.snapshot.today || { scans: 0, tabsClosed: 0, memoryFreed: 0 });
  renderStatsGrid(weeklyStatsEl, response.snapshot.week || { scans: 0, tabsClosed: 0, memoryFreed: 0 });
}

/* ---- STATS MESSAGES ---- */
async function pushStatsDelta(delta) {
  await sendMessage({
    type: 'UPDATE_STATS',
    tabsClosed: delta.tabsClosed || 0,
    memoryFreed: delta.memoryFreed || 0,
    scans: delta.scans || 0
  });
}

async function sendHealthNotification(health, heavyTabs) {
  if (health === 'good') {
    await sendMessage({ type: 'NOTIFY_HEALTH', level: 'good' });
    return;
  }

  const worst = heavyTabs[0];
  const tabName = worst ? (worst.title || worst.url || 'Без названия') : 'Несколько вкладок';
  const levelLabel = health === 'danger' ? 'danger' : 'warning';
  const message = health === 'danger'
    ? `Сильная нагрузка: ${tabName}. Рекомендуется оптимизация.`
    : `Повышенная нагрузка: ${tabName}. Проверьте тяжёлые вкладки.`;

  await sendMessage({
    type: 'NOTIFY_HEALTH',
    level: levelLabel,
    text: message
  });
}

/* ---- ACTIONS ---- */
async function closeTabs(tabsToClose) {
  const uniqueClosable = [];
  const seen = new Set();

  for (const tab of tabsToClose || []) {
    if (!tab || !tab.id || tab.pinned || seen.has(tab.id)) continue;
    seen.add(tab.id);
    uniqueClosable.push(tab);
  }

  if (!uniqueClosable.length) {
    alert('Нет подходящих вкладок для закрытия.');
    return;
  }

  const tabIds = uniqueClosable.map((tab) => tab.id);
  const memoryFreed = uniqueClosable.reduce((sum, tab) => sum + (tab.memory || 0), 0);

  await new Promise((resolve) => {
    chrome.tabs.remove(tabIds, () => resolve());
  });

  for (const tabId of tabIds) {
    selectedTabIds.delete(tabId);
  }

  await pushStatsDelta({
    tabsClosed: tabIds.length,
    memoryFreed,
    scans: 0
  });

  await refresh();
}

async function optimize() {
  if (!currentHeavyTabs.length) {
    alert('Нет тяжёлых вкладок для оптимизации.');
    return;
  }

  const selected = currentHeavyTabs.filter((tab) => selectedTabIds.has(tab.id) && !tab.pinned);
  if (!selected.length) {
    alert('Отметьте хотя бы одну вкладку для закрытия.');
    return;
  }

  const toClose = selected;

  if (!toClose.length) {
    alert('Тяжёлые вкладки закреплены и не могут быть закрыты автоматически.');
    return;
  }

  const memToFree = toClose.reduce((sum, tab) => sum + (tab.memory || 0), 0);
  const names = toClose.map((tab) => `• ${tab.title || tab.url || 'Без названия'}`).join('\n');

  const confirmed = confirm(
    `Закрыть ${toClose.length} выбранных вкладок?\n\n${names}\n\nОсвободится около ${mb(memToFree)} MB`
  );

  if (!confirmed) return;
  await closeTabs(toClose);
}

function initResize() {
  const initial = loadPopupSize();
  let currentSize = { ...initial };

  if (!resizeHandle) return;

  let dragState = null;

  const onMouseMove = (event) => {
    if (!dragState) return;
    const width = dragState.startWidth + (event.clientX - dragState.startX);
    const height = dragState.startHeight + (event.clientY - dragState.startY);
    currentSize = applyPopupSize(width, height);
  };

  const onMouseUp = () => {
    if (!dragState) return;
    dragState = null;
    savePopupSize(currentSize);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  resizeHandle.addEventListener('mousedown', (event) => {
    event.preventDefault();
    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: window.innerWidth,
      startHeight: window.innerHeight
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}

/* ---- REFRESH ---- */
let isRefreshing = false;

async function refresh() {
  if (isRefreshing) return;
  isRefreshing = true;

  refreshIcon.classList.add('spinning');
  heavyTabsEl.innerHTML = '<div class="placeholder"><span class="spin">◌</span> Сканирование...</div>';
  recsEl.innerHTML = '<div class="placeholder"><span class="spin">◌</span> Анализ...</div>';

  try {
    const [allTabs, allExtensions, processMap] = await Promise.all([
      getAllTabs(),
      getAllExtensions(),
      getAllProcesses()
    ]);

    const tabDiagnostics = await buildTabDiagnostics(allTabs, processMap);
    const extDiagnostics = buildExtensionDiagnostics(allExtensions, processMap);
    const { heavyTabs, health } = analyzeTabs(tabDiagnostics.tabs);

    const recommendations = buildRecommendations(tabDiagnostics.tabs, heavyTabs, {
      tabMetricsExact: tabDiagnostics.exactMetrics,
      extensionMetricsExact: extDiagnostics.exactMetrics
    });

    memUsedEl.textContent = mb(totalMemoryBytes);
    tabsCountEl.textContent = tabDiagnostics.tabs.length;

    setHealth(health);
    renderHeavyTabs(heavyTabs);
    renderRecommendations(recommendations);
    renderExtensions(extDiagnostics.extensions, extDiagnostics.exactMetrics);

    await pushStatsDelta({ scans: 1 });
    await renderHistory();
    await sendHealthNotification(health, heavyTabs);
  } catch (error) {
    console.error('Browser Doctor refresh failed:', error);
    heavyTabsEl.innerHTML = '<div class="placeholder">Ошибка при анализе</div>';
  }

  refreshIcon.classList.remove('spinning');
  isRefreshing = false;
}

/* ---- EVENTS ---- */
optimizeBtn.addEventListener('click', optimize);
refreshBtn.addEventListener('click', refresh);
notifyTestBtn.addEventListener('click', async () => {
  const result = await sendMessage({
    type: 'TEST_NOTIFICATION',
    text: 'Это тестовое оповещение Browser Doctor.'
  });

  if (!result || !result.success) {
    alert('Не удалось показать тестовое оповещение.');
  }
});

/* ---- START ---- */
initResize();
refresh();
