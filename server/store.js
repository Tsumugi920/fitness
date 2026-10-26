'use strict';

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'data.json');

function toDateStr(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// 内置 15 条示例训练记录；日期相对当天往回分布，保证"本周统计"始终有数据
function buildSeedData() {
  const plan = [
    // [几天前, 类型, 时长(分钟), 消耗(千卡), 备注]
    [0,  '跑步',     40, 380, '晨跑 5 公里，配速稳定'],
    [0,  '力量训练', 50, 300, '练胸 + 三头，渐进加重'],
    [1,  '游泳',     45, 420, '自由泳 1000 米'],
    [2,  '骑行',     70, 520, '夜骑环湖一圈'],
    [2,  '瑜伽',     30, 120, '睡前拉伸，放松肩颈'],
    [3,  '力量训练', 60, 350, '深蹲日 5x5'],
    [4,  '跑步',     35, 330, '间歇跑 400 米 x 8 组'],
    [5,  '篮球',     80, 600, '半场 3v3，打了四局'],
    [6,  '瑜伽',     40, 150, '流瑜伽，微微出汗'],
    [7,  '跑步',     55, 500, '长距离慢跑 8 公里'],
    [8,  '力量训练', 45, 280, '背 + 二头，引体向上 5 组'],
    [9,  '游泳',     50, 450, '蛙泳为主，最后一组冲刺'],
    [11, '骑行',     90, 650, '周末骑行 25 公里'],
    [13, '力量训练', 55, 320, '腿日：腿举 + 罗马尼亚硬拉'],
    [14, '跑步',     30, 280, '轻松跑，恢复为主'],
  ];
  const now = new Date().toISOString();
  const records = plan.map(([daysAgo, type, duration, calories, note], i) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return {
      id: `seed-${String(i + 1).padStart(2, '0')}`,
      date: toDateStr(d),
      type,
      duration,
      calories,
      note,
      createdAt: now,
    };
  });
  return { records, goals: { weeklyMinutes: 480, weeklySessions: 8 } };
}

function normalize(parsed) {
  const data = parsed && typeof parsed === 'object' ? parsed : {};
  if (!Array.isArray(data.records)) data.records = [];
  if (!data.goals || !(Number(data.goals.weeklyMinutes) > 0) || !(Number(data.goals.weeklySessions) > 0)) {
    data.goals = { weeklyMinutes: 480, weeklySessions: 8 };
  }
  return data;
}

let data;

function save() {
  const tmp = `${DATA_PATH}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, DATA_PATH);
}

function load() {
  if (!fs.existsSync(DATA_PATH)) {
    data = buildSeedData();
    save();
    console.log(`[store] 首次启动，已生成 ${data.records.length} 条示例记录 -> ${DATA_PATH}`);
    return;
  }
  try {
    data = normalize(JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')));
  } catch (err) {
    const backup = `${DATA_PATH}.corrupt-${Date.now()}`;
    fs.renameSync(DATA_PATH, backup);
    console.error(`[store] data.json 解析失败(${err.message})，原文件已备份为 ${backup}，重新生成示例数据`);
    data = buildSeedData();
    save();
  }
}
load();

module.exports = {
  DATA_PATH,
  toDateStr,
  getRecords: () => data.records,
  findRecord: (id) => data.records.find((r) => r.id === id),
  addRecord(record) {
    data.records.push(record);
    save();
    return record;
  },
  updateRecord(id, fields) {
    const idx = data.records.findIndex((r) => r.id === id);
    data.records[idx] = { ...data.records[idx], ...fields };
    save();
    return data.records[idx];
  },
  deleteRecord(id) {
    const idx = data.records.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    data.records.splice(idx, 1);
    save();
    return true;
  },
  getGoals: () => ({ ...data.goals }),
  setGoals(goals) {
    data.goals = goals;
    save();
    return { ...goals };
  },
};
