# 在线质量仪表盘 V1.0

> 实时监控 · 风险预警 · 根因分析

## 项目简介

这是一个集成 Git 仓库提交数据与禅道缺陷管理数据的可视化质量仪表盘，支持多项目、多版本监控，提供11项KPI指标和11张可视化图表。

**地址**: `http://localhost:5000`

---

## 快速访问

### 本地访问（开发调试）
1. 在你的电脑运行 `python server.py`
2. 浏览器打开 `http://localhost:5000`

### 让别人访问（需选择方案）

| 方案 | 说明 | 难度 |
|------|------|------|
| **内网穿透** | 用 cpolar/frp 生成公网URL | ⭐⭐ |
| **静态页面** | 只发HTML文件，数据不更新 | ⭐ |
| **公网部署** | 部署到云服务器，7x24访问 | ⭐⭐⭐⭐ |

**详细说明**：请查看《让别人访问这个页面》章节

---

## 项目结构

```
quality-dashboard/
├── server.py                 # Flask 后端 API（Gitea + 禅道集成）
├── server.log                # 服务日志文件
├── templates/
│   └── index.html           # 单页应用主页面
├── static/
│   ├── css/
│   │   └── main.css         # 暗色科技风主题
│   └── js/
│       ├── dashboard.js     # 前端交互逻辑（主版本）
│       ├── dashboard copy.js # 前端交互逻辑（备份版本）
│       └── echarts.min.js   # 图表库（CDN备用）
├── data/
│   └── quality_data.json    # 模拟数据
├── scripts/
│   └── generate_data.py     # 模拟数据生成器
└── README.md
```

---

## 快速启动

### 1. 安装依赖

```bash
pip install flask flask-cors mysql-connector-python requests
```

### 2. 启动服务

```bash
cd d:\WS\quality-dashboard
python server.py
```

### 3. 访问仪表盘

- **本地访问**: http://localhost:5000
- **局域网访问**: http://你的IP:5000

---

## 数据源配置

服务已配置为强制使用真实数据，无需设置环境变量。

### 已配置的数据源

| 服务 | 地址 | 说明 |
|------|------|------|
| **Gitea (Git)** | http://192.168.10.215:3001 | RobotController_V2 仓库 |
| **禅道数据库** | MySQL 192.168.10.31:3306 | 数据库: `zentao`, 用户: `root` |

### 修改数据源配置

编辑 `server.py` 开头的配置区:

```python
# Gitea 配置
GITEA_URL = "http://192.168.10.215:3001"
GITEA_PROJECT = "RobotController_V2/robot-controller_v2"

# 禅道数据库配置
DB_CONFIG = {
    "host": "192.168.10.31",
    "port": 3306,
    "user": "root",
    "password": "123456",
    "database": "zentao",
}
```

---

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 仪表盘主页 |
| GET | `/api/data?version=v2.8.0` | 全部仪表盘数据 |
| GET | `/api/versions` | 版本列表 |
| GET | `/api/kpi-summary` | KPI 对比摘要 |
| GET | `/api/alerts` | 风险预警 |
| GET | `/api/root-cause` | 根因分析数据 |
| POST | `/api/refresh` | 刷新数据 |
| GET | `/api/health` | 健康检查 |

---

## 功能特性

### KPI 指标（11项）

| 指标 | 说明 |
|------|------|
| 🐛 缺陷密度 | 每千行代码的缺陷数 |
| ✅ 缺陷关闭率 | 已关闭缺陷占总数比例 |
| 📝 用例覆盖率 | 已执行用例占总数比例 |
| 🔁 回归缺陷率 | 重复出现的缺陷比例 |
| ⏱️ 平均修复时长 | 缺陷从打开到关闭的平均天数 |
| 🚨 P0/P1缺陷数 | 阻塞级和严重级缺陷数量 |
| 📋 需求完成率 | 已关闭需求占总数比例 |
| 🎯 用例通过率 | 已执行用例中通过的比例 |
| 💬 Commit数 | 提交次数统计 |
| ➕ 代码行变更 | 新增/删除代码行数 |
| 🐛 缺陷总数 | 当前所有缺陷数量 |

### 可视化图表（11张）

| 编号 | 图表 | 说明 |
|------|------|------|
| 1 | 📊 版本质量雷达图 | 5个核心指标对比 |
| 2 | 📈 版本关键指标对比 | 多版本KPI对比 |
| 3 | 📉 需求燃尽图 | 需求完成进度 |
| 4 | 📉 缺陷趋势（30天） | 新增/关闭/存量趋势 |
| 5 | 🥧 缺陷分布饼图 | 按模块/严重级别分布 |
| 6 | 📊 用例执行结果分布 | 通过/失败/阻塞等比例 |
| 7 | 🔥 Commit热力图 | 代码提交列表（带链接） |
| 8 | 🏆 质量评分卡 | 综合质量等级展示 |
| 9 | 🔗 桑基图 | 用例→缺陷→代码关联 |
| 10 | 🌹 玫瑰图 | 模块缺陷分布 |
| 11 | 📋 模块质量排行 | 按缺陷数排序 |

### 风险预警（3级）

| 级别 | 图标 | 触发条件 |
|------|------|----------|
| **严重** | 🚨 | P0/P1未关闭缺陷 |
| **警告** | ⚠️ | Bug Reopen率>5% 或 缺陷关闭率<80% |
| **提示** | ℹ️ | 用例覆盖率<90% |

---

## 让别人访问这个页面

### 方法一：内网穿透（推荐）

如果你的电脑需要一直开机，可以用内网穿透工具生成公网URL。

#### 步骤：

1. **在你的电脑运行服务**
```bash
cd d:\WS\quality-dashboard
python server.py
```

2. **安装内网穿透工具**（任选其一）
   - **cpolar**（推荐）: https://www.cpolar.com/
   - **frp**: https://gofrp.org/
   - **ngrok**: https://ngrok.com/

3. **生成公网URL**（以cpolar为例）
```bash
cpolar http 5000
```

4. **分享生成的URL给他人**
例如: `https://xxxx.cpolar.top`

> ✅ 优点：数据实时更新  
> ❌ 缺点：你的电脑需要一直开机并运行服务

---

### 方法二：静态页面（数据不更新）

如果只发静态HTML文件，别人打开就能看，但数据是固定的。

#### 步骤：

1. **准备本地数据**
```bash
# 运行生成器获取数据
python scripts/generate_data.py
```

2. **修改前端代码**
   - 移除所有 `fetch('/api/...')` API调用
   - 改为读取本地 `data/quality_data.json`

3. **打包发送**
   - 发送 `templates/index.html`
   - 发送 `static/` 整个文件夹

> ✅ 优点：别人无需运行服务，随时打开  
> ❌ 缺点：数据是固定的，不会更新

---

### 方法三：公网部署（专业方案）

部署到阿里云/腾讯云服务器，7x24小时运行。

#### 步骤：

1. **准备云服务器**
   - 选择配置：2核4G（轻量应用服务器即可）
   - 安装 Python 3.8+

2. **部署服务**
```bash
# 上传项目到服务器
scp -r quality-dashboard user@server:/opt/

# 安装依赖
pip install -r requirements.txt

# 使用 gunicorn 部署
gunicorn -w 4 -b 0.0.0.0:5000 server:app
```

3. **配置防火墙**
   - 放行 5000 端口
   - 可选：绑定域名 + Nginx反向代理

4. **访问**
   - 通过 `http://服务器IP:5000` 或 `http://your-domain.com` 访问

> ✅ 优点：数据实时，7x24运行  
> ❌ 缺点：需要云服务器成本（约100-300元/月）

---

## 技术栈

| 组件 | 版本 | 说明 |
|------|------|------|
| **后端** | Python 3 + Flask 2.x | Web服务框架 |
| **数据库** | MySQL Connector 8.x | 禅道数据源 |
| **前端** | ECharts 5.5 | 图表可视化 |
| **数据源** | Gitea API v1 | Git提交数据 |

---

## 配置说明

### 修改默认端口

编辑 `server.py` 最后一行:
```python
app.run(host="0.0.0.0", port=8080, debug=True)  # 改为8080
```

### 调试模式

```python
app.run(host="0.0.0.0", port=5000, debug=True)  # debug=True 会自动重载
```

### 生产部署

```bash
# 安装 gunicorn
pip install gunicorn

# 运行
gunicorn -w 4 -b 0.0.0.0:5000 server:app
```

---

## 常见问题

### Q1: 无���连接 Gitea

**检查**:
- Gitea 地址是否正确
- 用户名密码是否正确
- 网络是否连通（`ping 192.168.10.215`）

### Q2: 无法连接禅道数据库

**检查**:
- MySQL 地址和端口
- 用户名密码
- 数据库是否存在
- 是否允许远程连接

### Q3: CORS 错误

**解决**:
```bash
pip install flask-cors
```

### Q4: 图表不显示

**检查**:
- 浏览器控制台（F12）是否有错误
- CDN是否被墙（尝试更换网络）
- `static/js/echarts.min.js` 文件是否存在

---

## 更新日志

### v1.0 (2026-07-01)
- 初始版本发布
- 支持多项目（RobotController/Middleware/PC）
- 集成 Gitea + 禅道数据源
- 11项KPI指标 + 11张可视化图表

---

## 许可证

MIT License
