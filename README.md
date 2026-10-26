# fitness 健身记录

前后端完整项目：Node.js + Express 提供 REST API 并静态托管前端页面，数据持久化在 `server/data.json`；前端为原生 HTML/CSS/JavaScript（无框架、无构建）。

## 功能

- 训练记录列表（按日期倒序），支持按运动类型筛选
- 添加 / 编辑 / 删除训练记录（日期、类型、时长、消耗、备注）
- 本周统计：训练次数、总时长、总消耗、每日柱状图、与上周对比
- 目标进度：每周时长目标、每周次数目标，可在页面直接修改并持久化
- 按运动类型汇总：次数、总时长、总消耗、最近一次训练日期
- 首次启动自动内置 15 条示例训练记录

## 目录结构

```
fitness/
├── client/              # 前端（由后端静态托管）
│   ├── index.html
│   ├── style.css
│   └── app.js
├── server/              # 后端 Node + Express
│   ├── index.js         # 入口：REST 路由、静态托管、端口 3010
│   ├── store.js         # 数据层：读写 data.json、内置示例数据
│   └── data.json        # 数据文件（首次启动自动生成）
├── package.json         # npm start 启动脚本
└── README.md
```

## 安装与启动

要求 Node.js ≥ 16。

```bash
cd fitness
npm install
npm start
```

启动成功后访问前端页面：<http://localhost:3010>

- 后端端口默认 **3010**（启动脚本为 `node server/index.js`；如需换端口可设置环境变量 `PORT`）
- 停止服务：在终端按 `Ctrl+C`
- 请通过 <http://localhost:3010> 访问页面：前端调用同源 `/api` 接口，直接双击打开 `index.html` 无法调用接口

## 数据说明

- 所有数据保存在 `server/data.json`，每次增删改都会写回该文件。
- 首次启动（文件不存在）会自动写入 15 条示例训练记录，日期相对当天往回分布，保证"本周统计"有数据。
- 想重新生成示例数据：停止服务 → 删除 `server/data.json` → `npm start`。
- 文件结构：

```json
{
  "records": [
    { "id": "...", "date": "2026-10-25", "type": "跑步", "duration": 40, "calories": 380, "note": "...", "createdAt": "..." }
  ],
  "goals": { "weeklyMinutes": 480, "weeklySessions": 8 }
}
```

## REST API

Base URL：`http://localhost:3010/api`；除 GET 外请求需带 `Content-Type: application/json`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/records` | 记录列表，按日期倒序；可选 `?type=跑步` 按类型过滤 |
| GET | `/records/:id` | 单条记录 |
| POST | `/records` | 新增记录，返回 201 与新记录 |
| PUT | `/records/:id` | 更新记录（支持只传部分字段） |
| DELETE | `/records/:id` | 删除记录 |
| GET | `/stats/by-type` | 按运动类型汇总（次数 / 总时长 / 总消耗 / 最近日期） |
| GET | `/stats/weekly` | 周统计（周一~周日逐日数据、合计、上周对比、目标进度） |
| GET | `/goals` | 查询每周目标 |
| PUT | `/goals` | 修改每周目标（`weeklyMinutes`、`weeklySessions`） |
| GET | `/types` | 运动类型列表 |
| GET | `/health` | 健康检查 |

记录字段：`date`（YYYY-MM-DD）、`type`（运动类型）、`duration`（分钟，1~1440）、`calories`（千卡，≥0，选填默认 0）、`note`（备注，选填）。

### curl 示例

```bash
# 列出全部记录
curl -s http://localhost:3010/api/records

# 添加一条记录
curl -s -X POST http://localhost:3010/api/records \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-10-25","type":"跑步","duration":30,"calories":300,"note":"晚上慢跑"}'

# 更新（把时长改成 45，其余字段不变）
curl -s -X PUT http://localhost:3010/api/records/<id> \
  -H 'Content-Type: application/json' \
  -d '{"duration":45}'

# 删除
curl -s -X DELETE http://localhost:3010/api/records/<id>

# 按类型汇总
curl -s http://localhost:3010/api/stats/by-type

# 周统计
curl -s http://localhost:3010/api/stats/weekly
```
