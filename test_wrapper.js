export default {};
/**
 * 在线质量仪表盘 V1.0 - 前端交互逻辑
 * 对接真实后端 API，自动轮询刷新
 */

const API = {
  base: '/api',
  get: (path, params = {}) => {
    const q = new URLSearchParams(params).toString();
    return fetch(`${API.base}/${path}${q ? '?' + q : ''}`).then(r => r.json());
}

let state = { version: '', data: null, timer: null, charts: {} };

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  loadVersions();
  loadAll();
  startPolling();
});

function startPolling() {
  clearInterval(state.timer);
  state.timer = setInterval(() => loadAll(true), 120000); // 2分钟轮询
}

// ==================== 导航 ====================
function initNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function () {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      this.classList.add('active');
      const page = this.dataset.page;
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(page).classList.add('active');
      if (page === 'root-cause') renderRootCause();
    });
  });
}

// ==================== 版本选择 ====================
function loadVersions() {
  API.get('versions').then(list => {
    const sel = document.getElementById('versionSelect');
    sel.innerHTML = '<option value="">全部版本</option>';
    (list || []).forEach(v => {
      sel.innerHTML += `<option value="${v}">${v}</option>`;
    });
    sel.onchange = () => { state.version = sel.value; loadAll(); };
  });
}

// ==================== 主加载 ====================
function loadAll(silent = false) {
  if (!silent) showLoading();
  API.get('data', state.version ? { version: state.version } : {}).then(data => {
    state.data = data;
    renderKPI(data.kpi);
    renderCharts(data.charts);
    renderAlerts(data.alerts);
    renderVersionInfo(data);
    document.getElementById('updateTime').textContent = data.updateTime;
    hideLoading();
  }).catch(err => {
    console.error('加载数据失败:', err);
    hideLoading();
  });
}

function showLoading() {
  document.getElementById('loading').style.display = 'flex';
}
function hideLoading() {
  document.getElementById('loading').style.display = 'none';
}

function renderVersionInfo(data) {
  document.getElementById('currentVersion').textContent = data.version || '全部';
}

// ==================== KPI 卡片 ====================
function renderKPI(kpi) {
  const grid = document.getElementById('kpiGrid');
  grid.innerHTML = '';
  const order = [
    'defectDensity', 'defectCloseRate', 'caseCoverage', 'regressionRate',
    'avgFixTime', 'blockingDefects', 'storyCompletion', 'execPassRate',
    'commitCount', 'codeChangeLines'
  ];
  const labels = {
    defectDensity: '缺陷密度', defectCloseRate: '缺陷关闭率', caseCoverage: '用例覆盖率',
    regressionRate: '回归缺陷率', avgFixTime: '平均修复时长', blockingDefects: '阻塞缺陷(P0/P1)',
    storyCompletion: '需求完成率', execPassRate: '执行通过率', commitCount: 'Commit 数',
    codeChangeLines: '代码行变更'
  };
  order.forEach(key => {
    const item = kpi[key];
    if (!item) return;
    const status = getKPIStatus(key, item);
    const cls = status === 'good' ? 'kpi-good' : status === 'warn' ? 'kpi-warn' : 'kpi-bad';
    const icon = status === 'good' ? '✅' : status === 'warn' ? '⚠️' : '❌';
    grid.innerHTML += `
      <div class="kpi-card ${cls}">
        <div class="kpi-header"><span class="kpi-icon">${icon}</span><span class="kpi-label">${labels[key]}</span></div>
        <div class="kpi-value">${item.value}<small>${item.unit}</small></div>
        ${item.target !== null ? `<div class="kpi-target">目标: ${item.target}${item.unit === '%' ? '%' : ''}</div>` : ''}
      </div>`;
  });
}

function getKPIStatus(key, item) {
  if (item.target === null) return 'good';
  const v = parseFloat(item.value);
  const t = parseFloat(item.target);
  if (key === 'defectDensity' || key === 'regressionRate' || key === 'blockingDefects') {
    return v <= t ? 'good' : v <= t * 2 ? 'warn' : 'bad';
  }
  return v >= t ? 'good' : v >= t * 0.8 ? 'warn' : 'bad';
}

// ==================== 图表渲染 ====================
function renderCharts(charts) {
  renderCommitChart(charts.commitChart);
  renderBurnDown(charts.burnDown);
  renderBugTrend(charts.bugTrend);
  renderBugPie(charts.bugPie);
  renderCaseGantt(charts.caseGantt);
  renderHeatmap(charts.heatmap);
  renderQualityRadar();
}

// ① 代码变更柱状图
function renderCommitChart(data) {
  const chart = echarts.init(document.getElementById('commitChart'));
  state.charts.commitChart = chart;
  chart.setOption({
    title: { text: '代码变更统计', left: 'center', textStyle: { color: '#e0e0e0' } },
    tooltip: { trigger: 'axis' },
    legend: { data: ['新增行', '删除行'], top: 30, textStyle: { color: '#aaa' } },
    grid: { left: 60, right: 30, bottom: 50, top: 70 },
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#aaa', rotate: 45 } },
    yAxis: { type: 'value', axisLabel: { color: '#aaa' } },
    series: [
      { name: '新增行', type: 'bar', data: data.additions, itemStyle: { color: '#4caf50' } },
      { name: '删除行', type: 'bar', data: data.deletions, itemStyle: { color: '#f44336' } }
    ]
  });
}

// ② 燃尽图
function renderBurnDown(data) {
  const chart = echarts.init(document.getElementById('burnDownChart'));
  state.charts.burnDown = chart;
  const ideal = data.dates.map((_, i) => Math.round(data.total - (data.total / (data.dates.length || 1)) * i));
  chart.setOption({
    title: { text: '需求燃尽图', left: 'center', textStyle: { color: '#e0e0e0' } },
    tooltip: { trigger: 'axis' },
    legend: { data: ['剩余需求', '理想线'], top: 30, textStyle: { color: '#aaa' } },
    grid: { left: 60, right: 30, bottom: 50, top: 70 },
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#aaa', rotate: 45 } },
    yAxis: { type: 'value', axisLabel: { color: '#aaa' } },
    series: [
      { name: '剩余需求', type: 'line', data: data.remaining, smooth: true, lineStyle: { color: '#ff9800', width: 2 }, itemStyle: { color: '#ff9800' } },
      { name: '理想线', type: 'line', data: ideal, lineStyle: { color: '#666', type: 'dashed' }, itemStyle: { color: '#666' } }
    ]
  });
}

// ③ 缺陷趋势
function renderBugTrend(data) {
  const chart = echarts.init(document.getElementById('bugTrendChart'));
  state.charts.bugTrend = chart;
  chart.setOption({
    title: { text: '缺陷趋势（每日）', left: 'center', textStyle: { color: '#e0e0e0' } },
    tooltip: { trigger: 'axis' },
    legend: { data: ['新增', '关闭', '存量'], top: 30, textStyle: { color: '#aaa' } },
    grid: { left: 60, right: 30, bottom: 50, top: 70 },
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#aaa', rotate: 45 } },
    yAxis: { type: 'value', axisLabel: { color: '#aaa' } },
    series: [
      { name: '新增', type: 'bar', data: data.new, itemStyle: { color: '#e53935' } },
      { name: '关闭', type: 'bar', data: data.closed, itemStyle: { color: '#43a047' } },
      { name: '存量', type: 'line', data: data.active, smooth: true, lineStyle: { color: '#ff9800', width: 2 }, itemStyle: { color: '#ff9800' } }
    ]
  });
}

// ④ 缺陷分布饼图
function renderBugPie(data) {
  const chart = echarts.init(document.getElementById('bugPieChart'));
  state.charts.bugPie = chart;
  chart.setOption({
    title: { text: '缺陷分布', left: 'center', textStyle: { color: '#e0e0e0' } },
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { type: 'scroll', orient: 'vertical', right: 10, top: 40, textStyle: { color: '#aaa' } },
    series: [
      { name: '按模块', type: 'pie', radius: ['20%', '45%'], center: ['35%', '55%'], label: { color: '#ccc' }, data: data.module },
      { name: '按严重级别', type: 'pie', radius: ['50%', '75%'], center: ['35%', '55%'], label: { color: '#ccc' }, data: data.severity }
    ]
  });
}

// ⑤ 用例甘特图
function renderCaseGantt(data) {
  const chart = echarts.init(document.getElementById('caseGanttChart'));
  state.charts.caseGantt = chart;
  const names = data.map(c => c.name);
  const colors = { pass: '#4caf50', fail: '#f44336', pending: '#ff9800', block: '#9c27b0' };
  const bgColors = { pass: '#1b5e20', fail: '#7f1d1d', pending: '#78350f', block: '#4a1a6b' };
  const cats = ['pending', 'pass', 'fail', 'block'];
  const series = cats.map(cat => ({
    name: cat,
    type: 'bar',
    stack: 'total',
    barWidth: 18,
    label: { show: false },
    itemStyle: { color: bgColors[cat], borderColor: colors[cat], borderWidth: 1 },
    data: data.map(c => c.status === cat ? 1 : 0)
  }));
  chart.setOption({
    title: { text: '用例执行状态', left: 'center', textStyle: { color: '#e0e0e0' } },
    tooltip: { formatter: p => `${names[p.dataIndex]}: ${cats[p.seriesIndex]}` },
    legend: { data: cats, top: 30, textStyle: { color: '#aaa' } },
    grid: { left: 200, right: 30, bottom: 30, top: 70 },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', data: names.reverse(), axisLabel: { color: '#ccc', fontSize: 10 } },
    series: series.reverse()
  });
}

// ⑥ 热力图
function renderHeatmap(data) {
  if (!data || !data.length) return;
  const commits = [...new Set(data.map(d => d.commit))];
  const modules = [...new Set(data.map(d => d.module))];
  const values = data.map(d => [commits.indexOf(d.commit), modules.indexOf(d.module), d.value]);

  const chart = echarts.init(document.getElementById('heatmapChart'));
  state.charts.heatmap = chart;
  chart.setOption({
    title: { text: 'Commit × 模块 回归缺陷热力图', left: 'center', textStyle: { color: '#e0e0e0' } },
    tooltip: { formatter: p => `${commits[p.data[0]]} × ${modules[p.data[1]]}: ${p.data[2]}` },
    grid: { left: 150, right: 30, bottom: 80, top: 70 },
    xAxis: { type: 'category', data: commits, axisLabel: { color: '#aaa', rotate: 45, fontSize: 9 } },
    yAxis: { type: 'category', data: modules, axisLabel: { color: '#ccc' } },
    visualMap: { min: 0, max: 1, show: false, inRange: { color: ['#1a237e', '#b71c1c'] } },
    series: [{ type: 'heatmap', data: values, itemStyle: { borderColor: '#333', borderWidth: 1 } }]
  });
}

// 质量雷达图
function renderQualityRadar() {
  if (!state.data) return;
  const kpi = state.data.kpi;
  const dims = [
    { name: '缺陷密度', key: 'defectDensity', max: 1 },
    { name: '缺陷关闭率', key: 'defectCloseRate', max: 100 },
    { name: '用例覆盖率', key: 'caseCoverage', max: 100 },
    { name: '回归缺陷率', key: 'regressionRate', max: 20 },
    { name: '平均修复时长', key: 'avgFixTime', max: 10 },
  ];
  const chart = echarts.init(document.getElementById('qualityRadar'));
  state.charts.qualityRadar = chart;
  chart.setOption({
    title: { text: '版本质量综合评估', left: 'center', textStyle: { color: '#e0e0e0' } },
    radar: {
      indicator: dims.map(d => ({ name: d.name, max: d.max })),
      shape: 'polygon',
      axisName: { color: '#ccc' },
      splitArea: { areaStyle: { color: ['#1a237e', '#1e3a5f', '#1a3a4a'] } }
    },
    series: [{
      type: 'radar',
      data: [{
        value: dims.map(d => parseFloat(kpi[d.key].value)),
        name: '当前版本',
        areaStyle: { color: 'rgba(0,188,212,0.3)' },
        lineStyle: { color: '#00bcd4' },
        itemStyle: { color: '#00bcd4' }
      }]
    }]
  });
}

// ==================== 预警 ====================
function renderAlerts(alerts) {
  const container = document.getElementById('alertList');
  container.innerHTML = '';
  const levelOrder = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);
  alerts.forEach(a => {
    container.innerHTML += `
      <div class="alert-card alert-${a.level}">
        <div class="alert-icon">${a.icon}</div>
        <div class="alert-body">
          <div class="alert-title">${a.title}</div>
          <div class="alert-desc">${a.desc}</div>
          <div class="alert-time">${a.time}</div>
        </div>
      </div>`;
  });
  document.getElementById('alertCount').textContent = alerts.length;
  const crit = alerts.filter(a => a.level === 'critical').length;
  document.getElementById('criticalCount').textContent = crit;
}

// ==================== 根因分析 ====================
function renderRootCause() {
  if (!state.data || !state.data.rootCause) return;
  const rc = state.data.rootCause;

  // 桑基图
  const sankeyEl = document.getElementById('sankeyChart');
  if (sankeyEl) {
    const chart = echarts.init(sankeyEl);
    state.charts.sankey = chart;
    chart.setOption({
      title: { text: '用例 → 缺陷 → 代码模块 链路分析', left: 'center', textStyle: { color: '#e0e0e0' } },
      tooltip: { trigger: 'item', triggerOn: 'mousemove' },
      series: [{
        type: 'sankey',
        layout: 'none',
        emphasis: { focus: 'adjacency' },
        nodeAlign: 'left',
        data: rc.sankey.nodes,
        links: rc.sankey.links,
        lineStyle: { color: 'gradient', curveness: 0.5 },
        itemStyle: { borderWidth: 1, borderColor: '#333' },
        label: { color: '#ccc' }
      }]
    });
  }

  // 玫瑰图
  const roseEl = document.getElementById('roseChart');
  if (roseEl) {
    const chart = echarts.init(roseEl);
    state.charts.rose = chart;
    chart.setOption({
      title: { text: '模块缺陷分布（玫瑰图）', left: 'center', textStyle: { color: '#e0e0e0' } },
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie', roseType: 'area', radius: ['20%', '75%'],
        data: rc.rose,
        label: { color: '#ccc' },
        itemStyle: { borderColor: '#222', borderWidth: 1 }
      }]
    });
  }

  // 模块质量矩阵
  const barEl = document.getElementById('moduleBarChart');
  if (barEl) {
    const chart = echarts.init(barEl);
    state.charts.moduleBar = chart;
    chart.setOption({
      title: { text: '高缺陷模块排行', left: 'center', textStyle: { color: '#e0e0e0' } },
      grid: { left: 120, right: 30, bottom: 30, top: 50 },
      xAxis: { type: 'value', axisLabel: { color: '#aaa' } },
      yAxis: { type: 'category', data: rc.bar.modules, axisLabel: { color: '#ccc' } },
      series: [{
        type: 'bar', data: rc.bar.counts,
        itemStyle: { color: '#e53935', borderRadius: [0, 4, 4, 0] }
      }]
    });
  }
}

// ==================== 响应式 ====================
window.addEventListener('resize', () => {
  Object.values(state.charts).forEach(c => c.resize());
});
