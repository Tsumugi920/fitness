'use strict';

// fitness 健身记录 前端逻辑：调用同源 /api 接口，无第三方依赖

const $ = (sel) => document.querySelector(sel);

const KNOWN_TYPES = ['跑步', '力量训练', '骑行', '游泳', '瑜伽', '篮球'];

const state = {
  records: [],
  types: [],
  weekly: null,
  byType: [],
  filter: 'all',
  editingId: null,
};

// ---------- 工具 ----------

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function typeClass(type) {
  const i = KNOWN_TYPES.indexOf(type);
  return 't-' + (i >= 0 ? i : Math.abs(String(type).charCodeAt(0) || 0) % KNOWN_TYPES.length);
}

let toastTimer = null;
function toast(message, isError = false) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = 'toast show' + (isError ? ' toast-error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 2600);
}

async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* 无响应体 */ }
  if (!res.ok) throw new Error((data && data.error) || `请求失败（${res.status}）`);
  return data;
}

// ---------- 数据加载 ----------

async function refreshAll() {
  const [records, types, weekly, byType] = await Promise.all([
    api('/records'),
    api('/types'),
    api('/stats/weekly'),
    api('/stats/by-type'),
  ]);
  state.records = records;
  state.types = types;
  state.weekly = weekly;
  state.byType = byType;
  renderAll();
}

// ---------- 渲染 ----------

function renderAll() {
  renderTypeOptions('#f-type', false);
  renderTypeOptions('#filter-type', true);
  renderList();
  renderWeekly();
  renderByType();
}

function renderTypeOptions(selector, withAll) {
  const el = $(selector);
  const current = el.value;
  const options = (withAll ? ['all'] : []).concat(state.types);
  el.innerHTML = options
    .map((t) => `<option value="${esc(t)}">${t === 'all' ? '全部' : esc(t)}</option>`)
    .join('');
  if (options.includes(current)) el.value = current;
}

function renderList() {
  const list = state.filter === 'all'
    ? state.records
    : state.records.filter((r) => r.type === state.filter);
  $('#list-summary').textContent = `共 ${state.records.length} 条记录，当前显示 ${list.length} 条`;

  const box = $('#record-list');
  if (list.length === 0) {
    box.innerHTML = '<div class="empty">暂无记录，先在左侧添加一条吧</div>';
    return;
  }
  box.innerHTML = list.map((r) => `
    <div class="record-item" data-id="${esc(r.id)}">
      <span class="record-date">${esc(r.date)}</span>
      <span class="badge ${typeClass(r.type)}">${esc(r.type)}</span>
      <div class="record-main">
        <span class="record-duration">${r.duration} 分钟 · ${r.calories || 0} 千卡</span>
        ${r.note ? `<span class="record-note" title="${esc(r.note)}">${esc(r.note)}</span>` : ''}
      </div>
      <div class="record-actions">
        <button class="btn btn-small" data-action="edit">编辑</button>
        <button class="btn btn-small btn-danger" data-action="delete">删除</button>
      </div>
    </div>`).join('');
}

function renderWeekly() {
  const w = state.weekly;
  if (!w) return;

  $('#week-range').textContent = `${w.weekStart} ~ ${w.weekEnd}（周一至周日）`;
  $('#w-count').textContent = w.totals.count;
  $('#w-minutes').textContent = w.totals.duration;
  $('#w-calories').textContent = w.totals.calories;

  const maxDay = Math.max(...w.days.map((d) => d.duration), 1);
  $('#week-chart').innerHTML = w.days.map((d) => `
    <div class="chart-col" title="${esc(d.date)}：${d.duration} 分钟 / ${d.count} 次">
      <span class="chart-value">${d.duration || ''}</span>
      <div class="chart-area">
        <div class="chart-bar" style="height:${Math.max(4, Math.round((d.duration / maxDay) * 100))}%"></div>
      </div>
      <span class="chart-label">${'一二三四五六日'[d.weekday - 1]}</span>
    </div>`).join('');

  const minutesPct = Math.round(w.progress.minutes * 100);
  const sessionsPct = Math.round(w.progress.sessions * 100);
  $('#goal-minutes-text').textContent = `${w.totals.duration} / ${w.goals.weeklyMinutes} 分钟（${minutesPct}%）`;
  $('#goal-minutes-bar').style.width = `${Math.min(100, minutesPct)}%`;
  $('#goal-sessions-text').textContent = `${w.totals.count} / ${w.goals.weeklySessions} 次（${sessionsPct}%）`;
  $('#goal-sessions-bar').style.width = `${Math.min(100, sessionsPct)}%`;
  for (const [selector, value] of [
    ['#goal-minutes-input', w.goals.weeklyMinutes],
    ['#goal-sessions-input', w.goals.weeklySessions],
  ]) {
    const el = $(selector);
    if (document.activeElement !== el) el.value = value;
  }

  const diff = w.totals.duration - w.lastWeek.duration;
  let compare;
  if (w.lastWeek.duration > 0) {
    compare = `上周训练 ${w.lastWeek.duration} 分钟，本周${diff >= 0 ? '多' : '少'} ${Math.abs(diff)} 分钟`;
  } else if (w.totals.duration > 0) {
    compare = '上周没有训练记录，继续保持！';
  } else {
    compare = '本周还没有训练记录';
  }
  $('#week-compare').textContent = compare;
}

function renderByType() {
  const box = $('#type-stats');
  if (state.byType.length === 0) {
    box.innerHTML = '<div class="empty">暂无数据</div>';
    return;
  }
  const max = Math.max(...state.byType.map((t) => t.totalMinutes), 1);
  box.innerHTML = state.byType.map((t) => `
    <div class="type-row">
      <span class="badge ${typeClass(t.type)}">${esc(t.type)}</span>
      <div class="type-bar-wrap">
        <div class="type-bar ${typeClass(t.type)}" style="width:${Math.max(4, Math.round((t.totalMinutes / max) * 100))}%"></div>
      </div>
      <span class="type-meta">${t.count} 次 · ${t.totalMinutes} 分钟 · ${t.totalCalories} 千卡 · 最近 ${esc(t.lastDate)}</span>
    </div>`).join('');
}

// ---------- 表单操作 ----------

function resetForm() {
  state.editingId = null;
  $('#record-form').reset();
  $('#f-date').value = todayStr();
  $('#form-title').textContent = '添加训练记录';
  $('#submit-btn').textContent = '添加记录';
  $('#cancel-edit').classList.add('hidden');
  $('#form-error').classList.add('hidden');
}

function startEdit(record) {
  state.editingId = record.id;
  $('#f-date').value = record.date;
  $('#f-type').value = record.type;
  $('#f-duration').value = record.duration;
  $('#f-calories').value = record.calories;
  $('#f-note').value = record.note || '';
  $('#form-title').textContent = '编辑训练记录';
  $('#submit-btn').textContent = '保存修改';
  $('#cancel-edit').classList.remove('hidden');
  $('#form-error').classList.add('hidden');
  $('#form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showFormError(message) {
  const el = $('#form-error');
  el.textContent = message;
  el.classList.remove('hidden');
}

async function onSubmit(event) {
  event.preventDefault();
  const payload = {
    date: $('#f-date').value,
    type: $('#f-type').value,
    duration: Number($('#f-duration').value),
    calories: Number($('#f-calories').value || 0),
    note: $('#f-note').value.trim(),
  };
  try {
    if (state.editingId) {
      await api('/records/' + state.editingId, { method: 'PUT', body: JSON.stringify(payload) });
      toast('记录已更新');
    } else {
      await api('/records', { method: 'POST', body: JSON.stringify(payload) });
      toast('已添加训练记录');
    }
    resetForm();
    await refreshAll();
  } catch (err) {
    showFormError(err.message);
  }
}

async function onListClick(event) {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.closest('.record-item').dataset.id;
  const record = state.records.find((r) => r.id === id);
  if (!record) return;

  if (btn.dataset.action === 'edit') {
    startEdit(record);
    return;
  }
  if (btn.dataset.action === 'delete') {
    if (!window.confirm(`确定删除 ${record.date} 的「${record.type}」记录吗？`)) return;
    try {
      await api('/records/' + id, { method: 'DELETE' });
      if (state.editingId === id) resetForm();
      toast('已删除记录');
      await refreshAll();
    } catch (err) {
      toast('删除失败：' + err.message, true);
    }
  }
}

async function onSaveGoals() {
  const weeklyMinutes = Number($('#goal-minutes-input').value);
  const weeklySessions = Number($('#goal-sessions-input').value);
  if (!(weeklyMinutes > 0) || !(weeklySessions > 0)) {
    toast('目标必须为正数', true);
    return;
  }
  try {
    await api('/goals', {
      method: 'PUT',
      body: JSON.stringify({ weeklyMinutes, weeklySessions }),
    });
    toast('目标已保存');
    await refreshAll();
  } catch (err) {
    toast('保存失败：' + err.message, true);
  }
}

// ---------- 初始化 ----------

function bindEvents() {
  $('#record-form').addEventListener('submit', onSubmit);
  $('#cancel-edit').addEventListener('click', resetForm);
  $('#filter-type').addEventListener('change', (e) => {
    state.filter = e.target.value;
    renderList();
  });
  $('#record-list').addEventListener('click', onListClick);
  $('#save-goals').addEventListener('click', onSaveGoals);
}

async function init() {
  bindEvents();
  $('#f-date').value = todayStr();
  try {
    await refreshAll();
  } catch (err) {
    toast('加载失败：' + err.message, true);
  }
}

init();
