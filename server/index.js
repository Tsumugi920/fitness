'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const store = require('./store');

const app = express();
const PORT = Number(process.env.PORT) || 3010;

const TYPES = ['跑步', '力量训练', '骑行', '游泳', '瑜伽', '篮球'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client')));

const wrap = (fn) => (req, res, next) => {
  try {
    fn(req, res);
  } catch (err) {
    next(err);
  }
};

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function newId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildRecordFields(body, existing) {
  const src = body || {};
  const date = src.date !== undefined ? String(src.date) : existing && existing.date;
  const type = src.type !== undefined ? String(src.type).trim() : existing && existing.type;
  const duration = src.duration !== undefined ? Number(src.duration) : existing && existing.duration;
  const calories = src.calories !== undefined ? Number(src.calories) : existing ? existing.calories : 0;
  const note = src.note !== undefined ? String(src.note).trim() : existing ? existing.note || '' : '';

  const errors = [];
  if (!date || !DATE_RE.test(date)) errors.push('date 必须是 YYYY-MM-DD 格式');
  if (!type) errors.push('type 不能为空');
  if (!Number.isFinite(duration) || duration <= 0 || duration > 1440) errors.push('duration 必须是 1~1440 之间的数字（分钟）');
  if (!Number.isFinite(calories) || calories < 0) errors.push('calories 必须是大于等于 0 的数字');
  if (errors.length) throw httpError(400, errors.join('；'));

  return { date, type, duration: Math.round(duration), calories: Math.round(calories), note };
}

// ---------- 训练记录 增删改查 ----------

app.get('/api/records', wrap((req, res) => {
  const { type } = req.query;
  let records = store.getRecords();
  if (type && type !== 'all') records = records.filter((r) => r.type === type);
  const sorted = [...records].sort((a, b) =>
    b.date.localeCompare(a.date) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  res.json(sorted);
}));

app.get('/api/records/:id', wrap((req, res) => {
  const record = store.findRecord(req.params.id);
  if (!record) throw httpError(404, '记录不存在');
  res.json(record);
}));

app.post('/api/records', wrap((req, res) => {
  const fields = buildRecordFields(req.body);
  const record = { id: newId(), ...fields, createdAt: new Date().toISOString() };
  store.addRecord(record);
  res.status(201).json(record);
}));

app.put('/api/records/:id', wrap((req, res) => {
  const existing = store.findRecord(req.params.id);
  if (!existing) throw httpError(404, '记录不存在');
  const fields = buildRecordFields(req.body, existing);
  res.json(store.updateRecord(existing.id, fields));
}));

app.delete('/api/records/:id', wrap((req, res) => {
  if (!store.deleteRecord(req.params.id)) throw httpError(404, '记录不存在');
  res.json({ ok: true });
}));

// ---------- 统计 ----------

app.get('/api/stats/by-type', wrap((req, res) => {
  const map = new Map();
  for (const r of store.getRecords()) {
    const item = map.get(r.type) || { type: r.type, count: 0, totalMinutes: 0, totalCalories: 0, lastDate: '' };
    item.count += 1;
    item.totalMinutes += r.duration;
    item.totalCalories += r.calories || 0;
    if (r.date > item.lastDate) item.lastDate = r.date;
    map.set(r.type, item);
  }
  const list = [...map.values()].sort((a, b) => b.totalMinutes - a.totalMinutes || b.count - a.count);
  res.json(list);
}));

function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return d;
}

function sumRange(records, startStr, endStr) {
  const totals = { count: 0, duration: 0, calories: 0 };
  for (const r of records) {
    if (r.date >= startStr && r.date <= endStr) {
      totals.count += 1;
      totals.duration += r.duration;
      totals.calories += r.calories || 0;
    }
  }
  return totals;
}

app.get('/api/stats/weekly', wrap((req, res) => {
  const records = store.getRecords();
  const monday = mondayOf(new Date());

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({ date: store.toDateStr(d), weekday: i + 1, count: 0, duration: 0, calories: 0 });
  }
  const byDate = new Map(days.map((d) => [d.date, d]));
  for (const r of records) {
    const day = byDate.get(r.date);
    if (!day) continue;
    day.count += 1;
    day.duration += r.duration;
    day.calories += r.calories || 0;
  }

  const weekEnd = new Date(monday);
  weekEnd.setDate(monday.getDate() + 6);
  const lastMonday = new Date(monday);
  lastMonday.setDate(monday.getDate() - 7);
  const lastWeekEnd = new Date(lastMonday);
  lastWeekEnd.setDate(lastMonday.getDate() + 6);

  const totals = sumRange(records, store.toDateStr(monday), store.toDateStr(weekEnd));
  const lastWeek = sumRange(records, store.toDateStr(lastMonday), store.toDateStr(lastWeekEnd));
  const goals = store.getGoals();

  res.json({
    weekStart: store.toDateStr(monday),
    weekEnd: store.toDateStr(weekEnd),
    days,
    totals,
    lastWeek,
    goals,
    progress: {
      minutes: goals.weeklyMinutes > 0 ? totals.duration / goals.weeklyMinutes : 0,
      sessions: goals.weeklySessions > 0 ? totals.count / goals.weeklySessions : 0,
    },
  });
}));

// ---------- 每周目标 ----------

app.get('/api/goals', wrap((req, res) => res.json(store.getGoals())));

app.put('/api/goals', wrap((req, res) => {
  const body = req.body || {};
  const current = store.getGoals();
  const weeklyMinutes = body.weeklyMinutes !== undefined ? Number(body.weeklyMinutes) : current.weeklyMinutes;
  const weeklySessions = body.weeklySessions !== undefined ? Number(body.weeklySessions) : current.weeklySessions;
  if (!Number.isFinite(weeklyMinutes) || !(weeklyMinutes > 0)) throw httpError(400, 'weeklyMinutes 必须是正数');
  if (!Number.isFinite(weeklySessions) || !(weeklySessions > 0)) throw httpError(400, 'weeklySessions 必须是正数');
  res.json(store.setGoals({ weeklyMinutes: Math.round(weeklyMinutes), weeklySessions: Math.round(weeklySessions) }));
}));

// ---------- 其他 ----------

app.get('/api/types', (req, res) => res.json(TYPES));
app.get('/api/health', (req, res) => res.json({ ok: true, port: PORT }));

app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || '服务器内部错误' });
});

const server = app.listen(PORT, () => {
  console.log(`[server] fitness 健身记录后端已启动: http://localhost:${PORT}`);
  console.log(`[server] 数据文件: ${store.DATA_PATH}`);
});

// Node 默认 5s 就关闭空闲 keep-alive 连接；页面停留一段时间后再提交可能复用已被
// 服务端关闭的连接而报 Failed to fetch，这里把空闲保活时间拉长规避该竞态
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
