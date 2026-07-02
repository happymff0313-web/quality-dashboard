/**
 * 在线质量仪表盘 V1.0 - 前端交互逻辑
 */
(function () {
    "use strict";

    // ============================================================
    // 全局状态
    // ============================================================
    let dashboardData = null;
    let currentPage = "overview";
    let charts = {};
    let refreshTimer = null;
    let currentProject = "all";
    let currentBranch = "main";
    let currentDateRange = { start: "", end: "" };

    // 颜色主题
    const COLORS = {
        primary: "#6366f1",
        success: "#22c55e",
        warning: "#f59e0b",
        danger: "#ef4444",
        info: "#3b82f6",
        bg: "#0f172a",
        card: "#1e293b",
        text: "#e2e8f0",
        subtext: "#94a3b8",
        grid: "#334155",
    };

    const STATUS_COLORS = {
        pass: "#22c55e",
        warn: "#f59e0b",
        fail: "#ef4444",
    };

    function initBranchSelect() {
        document.getElementById("branchSelect").addEventListener("change", function () {
            currentBranch = this.value;
            loadData(document.getElementById("versionSelect").value);
        });
    }

    function initProjectSelect() {
        document.getElementById("projectSelect").addEventListener("change", function () {
            currentProject = this.value;
            updateBranchOptions();
            currentBranch = document.getElementById("branchSelect").value;
            loadData(document.getElementById("versionSelect").value);
        });
    }

    function updateBranchOptions() {
        var project = currentProject;
        var branchSelect = document.getElementById("branchSelect");
        
        if (project === "all") {
            branchSelect.innerHTML = '<option value="main">main (默认)</option>';
        } else if (project === "robot") {
            branchSelect.innerHTML = '<option value="main">main (默认)</option><option value="dev">dev</option><option value="release">release</option>';
        } else if (project === "middleware") {
            branchSelect.innerHTML = '<option value="main">main (默认)</option><option value="develop">develop</option><option value="feature">feature</option>';
        } else if (project === "pc") {
            branchSelect.innerHTML = '<option value="main">main (默认)</option><option value="develop">develop</option><option value="feature">feature</option>';
        }
    }

    function initDateRange() {
        // 设置默认日期范围为最近30天
        var endDate = new Date();
        var startDate = new Date();
        startDate.setDate(endDate.getDate() - 30);
        
        document.getElementById("startDate").valueAsDate = startDate;
        document.getElementById("endDate").valueAsDate = endDate;
        currentDateRange = {
            start: startDate.toISOString().split("T")[0],
            end: endDate.toISOString().split("T")[0]
        };
        
        // 绑定应用按钮
        document.getElementById("filterBtn").addEventListener("click", function () {
            currentDateRange = {
                start: document.getElementById("startDate").value,
                end: document.getElementById("endDate").value
            };
            loadData(document.getElementById("versionSelect").value);
        });
    }

    function initNavTabs() {
        document.querySelectorAll(".nav-tab").forEach(function (tab) {
            tab.addEventListener("click", function (e) {
                e.preventDefault();
                var page = this.dataset.page;
                switchPage(page);
            });
        });
    }

    function switchPage(page) {
        currentPage = page;
        document.querySelectorAll(".nav-tab").forEach(function (t) {
            t.classList.toggle("active", t.dataset.page === page);
        });
        document.querySelectorAll(".page").forEach(function (p) {
            p.classList.toggle("active", p.id === "page-" + page);
        });
        // 延迟 resize 确保图表正确渲染
        setTimeout(function () {
            Object.values(charts).forEach(function (c) {
                if (c && c.resize) c.resize();
            });
        }, 100);
    }

    function initVersionSelect() {
        document.getElementById("versionSelect").addEventListener("change", function () {
            loadData(this.value);
        });
    }

    function initRefreshBtn() {
        document.getElementById("refreshBtn").addEventListener("click", function () {
            this.disabled = true;
            this.textContent = "刷新中...";
            fetch("/api/refresh", { method: "POST" })
                .then(function () { return loadData(document.getElementById("versionSelect").value); })
                .finally(function () {
                    this.disabled = false;
                    this.textContent = "刷新";
                }.bind(this));
        });
    }

    function startAutoRefresh() {
        refreshTimer = setInterval(function () {
            loadData(document.getElementById("versionSelect").value, true);
        }, 120000); // 2分钟
    }

    // ============================================================
    // 初始化
    // ============================================================
    document.addEventListener("DOMContentLoaded", function () {
        initNavTabs();
        initVersionSelect();
        initProjectSelect();
        initBranchSelect();
        initDateRange();
        initRefreshBtn();
        updateBranchOptions();
        loadData();
        startAutoRefresh();
    });

    // ============================================================
    // 数据加载
    // ============================================================
    function loadData(version, silent) {
        var params = new URLSearchParams();
        if (version) params.append("version", version);
        params.append("project", currentProject);  // 总是传递 project 参数
        if (currentBranch) params.append("branch", currentBranch);
        if (currentDateRange.start) params.append("start_date", currentDateRange.start);
        if (currentDateRange.end) params.append("end_date", currentDateRange.end);
        
        var url = "/api/data" + (params.toString() ? "?" + params.toString() : "");
        if (!silent) showLoading();
        return fetch(url)
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.error) {
                    console.error("API Error:", data.error);
                    return;
                }
                dashboardData = data;
                renderAll(data);
                updateMeta(data);
            })
            .catch(function (err) {
                console.error("Fetch error:", err);
            })
            .finally(function () { hideLoading(); });
    }

    function updateMeta(data) {
        document.getElementById("lastUpdate").textContent =
            "最后更新 " + new Date().toLocaleTimeString("zh-CN");
        var badge = document.getElementById("mockBadge");
        if (data.mock !== undefined) {
            badge.style.display = data.mock ? "inline-block" : "none";
        }
        // 更新版本选择器
        var sel = document.getElementById("versionSelect");
        if (data.versions && data.versions.length > 0) {
            var currentVal = sel.value;
            sel.innerHTML = '<option value="">全部版本</option>';
            data.versions.forEach(function (v) {
                var opt = document.createElement("option");
                opt.value = v;
                opt.textContent = v;
                sel.appendChild(opt);
            });
            sel.value = currentVal || "";
        }
    }

    function showLoading() {
        // 可选添加 loading 遮罩
    }
    function hideLoading() {}

    // ============================================================
    // 渲染入口
    // ============================================================
    function renderAll(data) {
        renderKpiRow(data.kpi);
        renderRadar(data.radar);
        renderScore(data.qualityScore);
        renderCommitChart(data.commitChart);
        renderBugTrend(data.bugTrend);
        // 详情页
        renderDetailCommit(data.commitChart);
        renderBurndown(data.burndown);
        renderDetailBugTrend(data.bugTrend);
        renderBugDistribution(data.bugDistribution);
        renderTestResultPie(data.testGantt);
        // 筛选并渲染 Commit 列表
        console.log("heatmap data:", data.heatmap);
        var filteredCommits = filterCommitsByProjectAndDate(data.heatmap, currentProject, currentDateRange);
        console.log("filtered commits:", filteredCommits);
        renderHeatmap({ commits: filteredCommits });  // 注意：这里 filteredCommits 已经是数组了
        // 根因
        renderSankey(data.rootCause);
        renderRose(data.rootCause);
        renderModuleRank(data.rootCause);
        // 预警
        renderAlerts(data.alerts);
    }

    // ============================================================
    // KPI 卡片
    // ============================================================
    function renderKpiRow(kpi) {
        if (!kpi) return;
        var cards = [
            { label: "Commit 数", value: kpi.commitCount, icon: "📝", color: COLORS.info },
            { label: "代码行变更", value: kpi.codeChangeLines?.toLocaleString(), icon: "📊", color: COLORS.primary },
            { label: "缺陷总数", value: kpi.bugCount, icon: "🐛", color: kpi.bugCount > 50 ? COLORS.danger : COLORS.warning },
            { label: "未关闭 Bug", value: kpi.activeBugCount, icon: "❗", color: kpi.activeBugCount === 0 ? COLORS.success : (kpi.activeBugCount <= 5 ? COLORS.warning : COLORS.danger) },
            { label: "缺陷关闭率", value: kpi.bugCloseRate + "%", icon: "🏁", color: kpi.bugCloseRate >= 95 ? COLORS.success : COLORS.warning, target: "≥95%" },
            { label: "P0/P1 未关闭", value: kpi.p0p1Count, icon: "🚨", color: kpi.p0p1Count === 0 ? COLORS.success : COLORS.danger },
            // { label: "需求完成率", value: kpi.requirementCompleteRate + "%", icon: "📋", color: kpi.requirementCompleteRate >= 100 ? COLORS.success : COLORS.warning, target: "≥100%" },
            { label: "用例覆盖率", value: kpi.caseCoverage + "%", icon: "🧪", color: kpi.caseCoverage >= 90 ? COLORS.success : COLORS.warning, target: "≥90%" },
            { label: "执行通过率", value: kpi.casePassRate + "%", icon: "✔️", color: kpi.casePassRate >= 95 ? COLORS.success : COLORS.warning, target: "≥95%" },
            { label: "Bug Reopen率", value: kpi.regressionRate + "%", icon: "🔄", color: kpi.regressionRate <= 5 ? COLORS.success : COLORS.danger, target: "≤5%" },
            { label: "平均修复时长", value: kpi.avgFixDays + "天", icon: "⏱️", color: kpi.avgFixDays <= 2 ? COLORS.success : COLORS.warning, target: "≤2天" },
            { label: "缺陷密度", value: kpi.defectDensity, icon: "🎯", color: kpi.defectDensity <= 0.3 ? COLORS.success : COLORS.warning, target: "≤0.3" },
        ];

        var html = cards.map(function (c) {
            var targetHtml = c.target ? '<span class="kpi-target">目标: ' + c.target + "</span>" : "";
            return '<div class="kpi-card" style="border-left:3px solid ' + c.color + '">' +
                '<div class="kpi-icon">' + c.icon + '</div>' +
                '<div class="kpi-info">' +
                '<div class="kpi-value" style="color:' + c.color + '">' + c.value + '</div>' +
                '<div class="kpi-label">' + c.label + '</div>' +
                targetHtml +
                '</div></div>';
        }).join("");
        document.getElementById("kpiRow").innerHTML = html;
    }

    // ============================================================
    // 雷达图
    // ============================================================
    function renderRadar(radar) {
        if (!radar) return;
        // 如果已存在实例，先销毁避免重叠
        if (charts.radar) {
            charts.radar.dispose();
        }
        var chart = echarts.init(document.getElementById("radarChart"), null, { renderer: "canvas" });
        charts.radar = chart;

        // 调试输出
        console.log("=== 雷达图数据 ===");
        console.log("原始 radar 数据:", radar);
        console.log("defectDensity:", radar.defectDensity);
        console.log("bugCloseRate:", radar.bugCloseRate);
        console.log("caseCoverage:", radar.caseCoverage);
        console.log("regressionRate:", radar.regressionRate);
        console.log("avgFixDays:", radar.avgFixDays);

        // 归一化 - 根据实际数据动态调整 max 值
        var maxDensity = Math.max((radar.defectDensity || 0) * 2, 10);
        var maxDays = Math.max((radar.avgFixDays || 0) * 1.5, 10);

        var option = {
            tooltip: { trigger: "item" },
            radar: {
                shape: "circle",
                indicator: [
                    { name: "缺陷密度\n(每千行)", max: maxDensity },
                    { name: "缺陷关闭率(%)", max: 100 },
                    { name: "用例覆盖率(%)", max: 100 },
                    { name: "Bug Reopen率(%)", max: Math.max(radar.regressionRate * 2, 10) },
                    { name: "平均修复(天)", max: maxDays },
                ],
                axisName: { color: COLORS.text, fontSize: 12 },
                splitArea: { areaStyle: { color: ["#1e293b", "#172033", "#132040"] } },
                splitLine: { lineStyle: { color: COLORS.grid } },
                axisLine: { lineStyle: { color: COLORS.grid } },
            },
            series: [{
                type: "radar",
                data: [{
                    value: [
                        +(radar.defectDensity || 0).toFixed(2),
                        radar.bugCloseRate || 0,
                        radar.caseCoverage || 0,
                        radar.regressionRate || 0,
                        radar.avgFixDays || 0,
                    ],
                    name: "当前版本",
                    areaStyle: { color: "rgba(99,102,241,0.25)" },
                    lineStyle: { color: COLORS.primary, width: 2 },
                    itemStyle: { color: COLORS.primary },
                }],
            }],
        };
        chart.setOption(option);
    }

    // ============================================================
    // 质量评分
    // ============================================================
    function renderScore(score) {
        if (!score) return;
        var chart = echarts.init(document.getElementById("scoreChart"), null, { renderer: "canvas" });
        charts.score = chart;

        var gradeColor = score.grade === "A" ? COLORS.success : (score.grade === "B" ? COLORS.warning : COLORS.danger);

        var option = {
            tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
            grid: { left: 100, right: 40, top: 20, bottom: 30, containInner: true },
            xAxis: { type: "value", max: 100, axisLabel: { color: COLORS.subtext }, splitLine: { lineStyle: { color: COLORS.grid } } },
            yAxis: { type: "category", data: score.items.map(function (i) { return i.name; }), axisLabel: { color: COLORS.text, fontSize: 12 } },
            series: [{
                type: "bar",
                data: score.items.map(function (i) {
                    return {
                        value: i.score,
                        itemStyle: { color: STATUS_COLORS[i.status] || COLORS.primary, borderRadius: [0, 4, 4, 0] },
                        label: { show: true, position: "right", formatter: "{c}分", color: COLORS.text },
                    };
                }),
                barWidth: 20,
            }],
        };
        chart.setOption(option);
        
        // 更新卡片头部的综合等级显示
        var gradeEl = document.getElementById("scoreGradeValue");
        if (gradeEl) {
            gradeEl.textContent = score.grade;
            gradeEl.style.color = gradeColor;
        }
    }

    // ============================================================
    // 代码变更图表
    // ============================================================
    function renderCommitChart(data) {
        if (!data || !data.dates) return;
        var chart = echarts.init(document.getElementById("commitChart"), null, { renderer: "canvas" });
        charts.commit = chart;
        var option = {
            tooltip: { trigger: "axis" },
            legend: { data: ["Commit数", "代码行变更"], textStyle: { color: COLORS.subtext } },
            grid: { left: 50, right: 30, top: 40, bottom: 30 },
            xAxis: { type: "category", data: data.dates, axisLabel: { color: COLORS.subtext, rotate: 45, fontSize: 10 }, axisTick: { show: false } },
            yAxis: [
                { type: "value", name: "Commit数", axisLabel: { color: COLORS.subtext }, splitLine: { lineStyle: { color: COLORS.grid } } },
                { type: "value", name: "代码行", axisLabel: { color: COLORS.subtext }, splitLine: { show: false } },
            ],
            series: [
                { name: "Commit数", type: "bar", data: data.commits, itemStyle: { color: COLORS.primary, borderRadius: [2, 2, 0, 0] }, barWidth: 12 },
                { name: "代码行变更", type: "line", yAxisIndex: 1, data: data.totalChanges, smooth: true, lineStyle: { color: COLORS.info, width: 2 }, itemStyle: { color: COLORS.info }, areaStyle: { color: "rgba(59,130,246,0.1)" } },
            ],
        };
        chart.setOption(option);
    }

    function renderDetailCommit(data) {
        if (!data || !data.dates) return;
        var chart = echarts.init(document.getElementById("detailCommitChart"), null, { renderer: "canvas" });
        charts.detailCommit = chart;
        var option = {
            tooltip: { trigger: "axis" },
            legend: { data: ["Commit数", "新增", "删除", "总变更趋势"], textStyle: { color: COLORS.subtext } },
            grid: { left: 50, right: 30, top: 40, bottom: 30 },
            xAxis: { type: "category", data: data.dates, axisLabel: { color: COLORS.subtext, rotate: 45, fontSize: 10 } },
            yAxis: { type: "value", axisLabel: { color: COLORS.subtext }, splitLine: { lineStyle: { color: COLORS.grid } } },
            series: [
                { name: "Commit数", type: "bar", data: data.commits, stack: "total", itemStyle: { color: COLORS.primary } },
                { name: "新增", type: "bar", data: data.additions, stack: "total", itemStyle: { color: COLORS.success } },
                { name: "删除", type: "bar", data: data.deletions, stack: "total", itemStyle: { color: COLORS.danger } },
                { name: "总变更趋势", type: "line", data: data.totalChanges, smooth: true, lineStyle: { color: COLORS.warning, width: 2, type: "dashed" }, itemStyle: { color: COLORS.warning } },
            ],
        };
        chart.setOption(option);
    }

    // ============================================================
    // 缺陷趋势
    // ============================================================
    function renderBugTrend(data) {
        if (!data || !data.dates) return;
        var chart = echarts.init(document.getElementById("bugTrendChart"), null, { renderer: "canvas" });
        charts.bugTrend = chart;
        var option = {
            tooltip: { trigger: "axis" },
            legend: { data: ["新增缺陷", "关闭缺陷", "存量缺陷"], textStyle: { color: COLORS.subtext } },
            grid: { left: 50, right: 30, top: 40, bottom: 30 },
            xAxis: { type: "category", data: data.dates, axisLabel: { color: COLORS.subtext, rotate: 45, fontSize: 10 } },
            yAxis: { type: "value", axisLabel: { color: COLORS.subtext }, splitLine: { lineStyle: { color: COLORS.grid } } },
            series: [
                { name: "新增缺陷", type: "bar", data: data.newBugs, itemStyle: { color: COLORS.danger, borderRadius: [2, 2, 0, 0] }, barWidth: 8 },
                { name: "关闭缺陷", type: "bar", data: data.closedBugs, itemStyle: { color: COLORS.success, borderRadius: [2, 2, 0, 0] }, barWidth: 8 },
                { name: "存量缺陷", type: "line", data: data.cumulativeBugs, smooth: true, lineStyle: { color: COLORS.warning, width: 2 }, itemStyle: { color: COLORS.warning }, areaStyle: { color: "rgba(245,158,11,0.1)" } },
            ],
        };
        chart.setOption(option);
    }

    function renderDetailBugTrend(data) {
        if (!data || !data.dates) return;
        var chart = echarts.init(document.getElementById("detailBugTrend"), null, { renderer: "canvas" });
        charts.detailBugTrend = chart;
        var option = {
            tooltip: { trigger: "axis" },
            legend: { data: ["新增", "关闭", "存量"], textStyle: { color: COLORS.subtext } },
            grid: { left: 50, right: 30, top: 40, bottom: 30 },
            xAxis: { type: "category", data: data.dates, axisLabel: { color: COLORS.subtext, rotate: 45, fontSize: 10 } },
            yAxis: { type: "value", axisLabel: { color: COLORS.subtext }, splitLine: { lineStyle: { color: COLORS.grid } } },
            series: [
                { name: "新增", type: "line", data: data.newBugs, smooth: true, lineStyle: { color: COLORS.danger, width: 2 }, itemStyle: { color: COLORS.danger }, areaStyle: { color: "rgba(239,68,68,0.08)" } },
                { name: "关闭", type: "line", data: data.closedBugs, smooth: true, lineStyle: { color: COLORS.success, width: 2 }, itemStyle: { color: COLORS.success }, areaStyle: { color: "rgba(34,197,94,0.08)" } },
                { name: "存量", type: "bar", data: data.cumulativeBugs, itemStyle: { color: "rgba(245,158,11,0.6)", borderRadius: [2, 2, 0, 0] }, barWidth: 10 },
            ],
        };
        chart.setOption(option);
    }

    // ============================================================
    // 燃尽图
    // ============================================================
    function renderBurndown(data) {
        if (!data || !data.dates) return;
        var chart = echarts.init(document.getElementById("burndownChart"), null, { renderer: "canvas" });
        charts.burndown = chart;
        var option = {
            tooltip: { trigger: "axis" },
            legend: { data: ["实际剩余", "理想"], textStyle: { color: COLORS.subtext } },
            grid: { left: 50, right: 30, top: 40, bottom: 30 },
            xAxis: { type: "category", data: data.dates, axisLabel: { color: COLORS.subtext, rotate: 45, fontSize: 10 } },
            yAxis: { type: "value", min: 0, axisLabel: { color: COLORS.subtext }, splitLine: { lineStyle: { color: COLORS.grid } } },
            series: [
                { name: "实际剩余", type: "line", data: data.remaining, smooth: true, lineStyle: { color: COLORS.primary, width: 3 }, itemStyle: { color: COLORS.primary }, symbol: "circle", symbolSize: 6, areaStyle: { color: "rgba(99,102,241,0.1)" } },
                { name: "理想", type: "line", data: data.ideal, lineStyle: { color: COLORS.subtext, width: 2, type: "dashed" }, itemStyle: { color: COLORS.subtext }, symbol: "none" },
            ],
        };
        chart.setOption(option);
    }

    // ============================================================
    // 缺陷分布饼图
    // ============================================================
    function renderBugDistribution(data) {
        if (!data) return;
        var chart = echarts.init(document.getElementById("bugDistChart"), null, { renderer: "canvas" });
        charts.bugDist = chart;

        var option = {
            tooltip: { trigger: "item", formatter: "{a} <br/>{b}: {c} ({d}%)" },
            legend: { bottom: 0, textStyle: { color: COLORS.subtext } },
            series: [
                {
                    name: "按模块", title: { text: "按模块", left: "16%", textStyle: { color: COLORS.text, fontSize: 13 } },
                    type: "pie", radius: ["20%", "40%"], center: ["25%", "45%"],
                    data: data.byModule || [],
                    label: { color: COLORS.text, fontSize: 10 },
                    itemStyle: { borderRadius: 4, borderColor: COLORS.bg, borderWidth: 2 },
                },
                {
                    name: "按严重级", title: { text: "按严重级", left: "66%", textStyle: { color: COLORS.text, fontSize: 13 } },
                    type: "pie", radius: ["20%", "40%"], center: ["75%", "45%"],
                    data: data.bySeverity || [],
                    label: { color: COLORS.text, fontSize: 10 },
                    itemStyle: { borderRadius: 4, borderColor: COLORS.bg, borderWidth: 2 },
                },
            ],
        };
        chart.setOption(option);
    }

    // ============================================================
    // 用例执行结果饼图
    // ============================================================
    function renderTestResultPie(data) {
        if (!data || !data.cases || data.cases.length === 0) {
            console.warn("用例数据为空或不存在");
            return;
        }
        
        // 统计各状态用例数量
        var statusCount = {
            pass: 0,   // 通过
            fail: 0,   // 失败
            blocked: 0, // 阻塞
            skipped: 0, // 忽略
            pending: 0  // 待执行
        };
        
        data.cases.forEach(function(c) {
            // 优先使用 lastRunResult 字段（禅道原生字段）
            var status = c.lastRunResult || c.result || c.status || "pending";
            
            // 兼容中文状态
            var statusMap = {
                "通过": "pass",
                "pass": "pass",
                "成功": "pass",
                "失败": "fail",
                "fail": "fail",
                "阻塞": "blocked",
                "blocked": "blocked",
                "跳过": "skipped",
                "skipped": "skipped",
                "忽略": "skipped",
                "待执行": "pending",
                "pending": "pending",
                "未执行": "pending"
            };
            
            status = (statusMap[status] || status).toLowerCase();
            
            if (statusCount.hasOwnProperty(status)) {
                statusCount[status]++;
            } else {
                // 未知状态计入待执行
                statusCount.pending++;
            }
        });
        
        var chart = echarts.init(document.getElementById("testResultPie"), null, { renderer: "canvas" });
        charts.testResultPie = chart;
        
        var pieData = [
            { value: statusCount.pass, name: "通过 🟢", itemStyle: { color: COLORS.success } },
            { value: statusCount.fail, name: "失败 🔴", itemStyle: { color: COLORS.danger } },
            { value: statusCount.blocked, name: "阻塞 🟡", itemStyle: { color: COLORS.warning } },
            { value: statusCount.skipped, name: "忽略 ⚪", itemStyle: { color: "#94a3b8" } },
            { value: statusCount.pending, name: "待执行 ⏳", itemStyle: { color: COLORS.info } }
        ];
        
        // 过滤掉数量为0的项目
        pieData = pieData.filter(function(item) { return item.value > 0; });
        
        // 如果全部为0，显示一条提示
        if (pieData.length === 0) {
            pieData = [{ value: 0, name: "暂无数据", itemStyle: { color: COLORS.subtext } }];
        }
        
        var total = data.cases.length;
        var option = {
            tooltip: { 
                trigger: "item", 
                formatter: function(p) {
                    return p.name + "<br/>数量: " + p.value + " 个<br/>占比: " + (total > 0 ? (p.value / total * 100).toFixed(1) : 0) + "%";
                }
            },
            legend: { 
                bottom: 10, 
                textStyle: { color: COLORS.text },
                icon: "circle"
            },
            series: [{
                type: "pie",
                radius: ["30%", "65%"],
                center: ["50%", "45%"],
                avoidLabelOverlap: true,
                itemStyle: {
                    borderRadius: 6,
                    borderColor: COLORS.bg,
                    borderWidth: 2
                },
                label: {
                    show: true,
                    color: COLORS.text,
                    formatter: function(p) {
                        return p.name + "\n" + p.value + "个 (" + (p.value / total * 100).toFixed(1) + "%)";
                    }
                },
                emphasis: {
                    label: {
                        show: true,
                        fontSize: 14,
                        fontWeight: "bold"
                    },
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: "rgba(0, 0, 0, 0.5)"
                    }
                },
                data: pieData
            }]
        };
        chart.setOption(option);
    }

    // ============================================================
    // Commit 列表（带 Gitea 链接）
    // ============================================================
    function renderHeatmap(data) {
        if (!data || !data.commits || data.commits.length === 0) return;
        
        var container = document.getElementById("heatmapChart");
        if (!container) return;
        
        // 清空容器
        container.innerHTML = "";
        
        // 创建滚动容器
        var wrapper = document.createElement("div");
        wrapper.style.maxHeight = "360px";
        wrapper.style.overflowY = "auto";
        
        // 创建表格
        var table = document.createElement("table");
        table.className = "commit-table";
        table.innerHTML = `
            <thead>
                <tr>
                    <th style="width:80px;">Commit ID</th>
                    <th>提交内容</th>
                    <th style="width:100px;">模块</th>
                    <th style="width:90px;">作者</th>
                    <th style="width:100px;">日期</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        
        // 填充数据
        var tbody = table.querySelector("tbody");
        data.commits.forEach(function (c) {
            var tr = document.createElement("tr");
            tr.innerHTML = `
                <td><a href="${c.url}" target="_blank" style="color:${COLORS.info}; text-decoration:none; font-family:monospace;">${c.sha}</a></td>
                <td class="commit-msg-cell" title="${escapeHtml(c.message)}">${c.message}</td>
                <td>${c.module}</td>
                <td>${c.author}</td>
                <td>${c.date}</td>
            `;
            tbody.appendChild(tr);
        });
        
        wrapper.appendChild(table);
        container.appendChild(wrapper);
        
        // 添加表格样式
        var style = document.createElement("style");
        style.textContent = `
            .commit-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 12px;
            }
            .commit-table th {
                background-color: ${COLORS.card};
                color: ${COLORS.text};
                padding: 10px 8px;
                text-align: left;
                border-bottom: 2px solid ${COLORS.grid};
                position: sticky;
                top: 0;
                z-index: 10;
            }
            .commit-table td {
                padding: 8px;
                border-bottom: 1px solid ${COLORS.grid};
                color: ${COLORS.text};
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 200px;
            }
            .commit-table tr:hover {
                background-color: rgba(99, 102, 241, 0.1);
            }
            .commit-table a:hover {
                text-decoration: underline;
            }
            .commit-msg-cell {
                max-width: 250px;
                position: relative;
            }
            .commit-msg-cell:hover::after {
                content: attr(title);
                position: absolute;
                left: 0;
                top: 100%;
                background: ${COLORS.bg};
                border: 1px solid ${COLORS.grid};
                padding: 8px;
                max-width: 400px;
                white-space: pre-wrap;
                word-break: break-word;
                z-index: 100;
                box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            }
        `;
        container.appendChild(style);
    }
    
    // 辅助函数：转义 HTML
    function escapeHtml(str) {
        if (!str) return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    // 筛选 commits：根据项目和日期范围
    function filterCommitsByProjectAndDate(heatmapData, project, dateRange) {
        if (!heatmapData || !heatmapData.commits) return [];
        
        var commits = heatmapData.commits;
        
        // 如果有日期范围，进行筛选
        if (dateRange && (dateRange.start || dateRange.end)) {
            commits = commits.filter(function(c) {
                if (!c.date) return false;
                if (dateRange.start && c.date < dateRange.start) return false;
                if (dateRange.end && c.date > dateRange.end) return false;
                return true;
            });
        }
        
        // 如果选择了特定项目，进行筛选
        if (project && project !== "all") {
            if (project === "robot") {
                commits = commits.filter(function(c) { return c.module === "RobotController"; });
            } else if (project === "middleware") {
                commits = commits.filter(function(c) { return c.module === "Middleware"; });
            } else if (project === "pc") {
                commits = commits.filter(function(c) { return c.module === "PC"; });
            }
        }
        
        return commits;
    }

    // ============================================================
    // 桑基图
    // ============================================================
    function renderSankey(data) {
        if (!data || !data.sankey) return;
        var chart = echarts.init(document.getElementById("sankeyChart"), null, { renderer: "canvas" });
        charts.sankey = chart;

        var colorMap = { case: COLORS.info, bug: COLORS.danger, module: COLORS.warning };
        
        // 根据项目确定默认模块名称
        var defaultModuleName = "未分类";
        if (currentProject && currentProject !== "all") {
            var projectNames = {
                "robot": "RobotController",
                "middleware": "Middleware",
                "pc": "PC"
            };
            defaultModuleName = projectNames[currentProject] || currentProject;
        }

        // 预处理节点数据，添加category信息到name中
        var nodeMap = {};
        data.sankey.nodes.forEach(function (n) {
            nodeMap[n.name] = n;
        });

        // 过滤和转换节点数据：根据项目筛选
        var filteredNodes = data.sankey.nodes.map(function (n) {
            var name = n.name;
            // 如果是未分类的模块且选择了特定项目，替换为项目名称
            if (n.category === "module" && name === "未分类") {
                name = defaultModuleName;
            }
            return { name: name, category: n.category };
        });

        // 去重
        var seen = {};
        var uniqueNodes = [];
        filteredNodes.forEach(function (n) {
            var key = n.category + ":" + n.name;
            if (!seen[key]) {
                seen[key] = true;
                uniqueNodes.push(n);
            }
        });

        // 过滤links，确保连接有效
        var validNodeNames = {};
        uniqueNodes.forEach(function (n) {
            validNodeNames[n.category + ":" + n.name] = true;
        });
        
        var filteredLinks = data.sankey.links.filter(function (l) {
            var sourceKey = "case:" + l.source; // link中的source是case的id
            var targetKey = "bug:" + l.target;   // link中的target是bug的id
            // 桑基图links中的source和target是节点name
            // 需要检查连接是否有效
            return true; // 保留所有link，由ECharts处理无效连接
        });

        var option = {
            tooltip: {
                trigger: "item",
                formatter: function (p) {
                    // 桑基图的 tooltip 数据结构：p.data 可能是 link 或 node
                    var data = p.data || {};
                    
                    // 检查是否是 link
                    if (data.source && data.target) {
                        // 这是 link，获取 source 节点信息
                        var sourceNode = nodeMap[data.source];
                        var targetNode = nodeMap[data.target];
                        return sourceNode ? sourceNode.name + " → " + (targetNode ? targetNode.name : data.target) + "<br/>数量: " + data.value : "";
                    }
                    
                    // 这是 node
                    return data.name ? data.name + (data.value !== undefined ? " - " + data.value : "") : "";
                }
            },
            series: [{
                type: "sankey",
                layout: "none",
                emphasis: { focus: "adjacency" },
                nodeAlign: "left",
                nodeGap: 12,
                nodeWidth: 20,
                data: uniqueNodes.map(function (n) {
                    var displayName = n.name;
                    // 显示简洁名称（移除category前缀）
                    if (n.category === "module" && n.name !== "未分类") {
                        // 对于模块，只显示名称不显示类型前缀
                        displayName = n.name;
                    }
                    return { name: displayName, itemStyle: { color: colorMap[n.category] || COLORS.primary, borderColor: COLORS.bg, borderWidth: 2 } };
                }),
                links: data.sankey.links.map(function (l) {
                    // 转换link中的节点名称
                    var sourceName = l.source;
                    var targetName = l.target;
                    
                    // 检查source/target是否为未分类模块
                    var sourceNode = data.sankey.nodes.find(function (n) { return n.name === l.source; });
                    var targetNode = data.sankey.nodes.find(function (n) { return n.name === l.target; });
                    
                    if (sourceNode && sourceNode.category === "module" && l.source === "未分类") {
                        sourceName = defaultModuleName;
                    }
                    if (targetNode && targetNode.category === "module" && l.target === "未分类") {
                        targetName = defaultModuleName;
                    }
                    
                    return { source: sourceName, target: targetName, value: l.value, lineStyle: { color: "source", curveness: 0.3, opacity: 0.6 } };
                }),
                label: { color: COLORS.text, fontSize: 11 },
            }],
        };
        chart.setOption(option);
    }

    // ============================================================
    // 玫瑰图+模块排行
    // ============================================================
    function renderRose(data) {
        if (!data || !data.rose) return;
        var chart = echarts.init(document.getElementById("roseChart"), null, { renderer: "canvas" });
        charts.rose = chart;

        // 根据项目确定默认模块名称
        var defaultModuleName = "未分类";
        if (currentProject && currentProject !== "all") {
            var projectNames = {
                "robot": "RobotController",
                "middleware": "Middleware",
                "pc": "PC"
            };
            defaultModuleName = projectNames[currentProject] || currentProject;
        }

        // 处理玫瑰图数据：将"未分类"替换为项目名称
        var processedRose = data.rose.map(function (item) {
            if (item.name === "未分类") {
                return { name: defaultModuleName, value: item.value };
            }
            return item;
        });

        var option = {
            tooltip: { trigger: "item", formatter: "{b}: {c} 个缺陷" },
            series: [{
                type: "pie",
                roseType: "area",
                radius: ["15%", "70%"],
                data: processedRose,
                label: { color: COLORS.text, fontSize: 11 },
                itemStyle: { borderRadius: 4, borderColor: COLORS.bg, borderWidth: 2 },
            }],
        };
        chart.setOption(option);
    }

    function renderModuleRank(data) {
        if (!data || !data.moduleRanking) return;
        var chart = echarts.init(document.getElementById("moduleRankChart"), null, { renderer: "canvas" });
        charts.moduleRank = chart;

        // 根据项目确定默认模块名称
        var defaultModuleName = "未分类";
        if (currentProject && currentProject !== "all") {
            var projectNames = {
                "robot": "RobotController",
                "middleware": "Middleware",
                "pc": "PC"
            };
            defaultModuleName = projectNames[currentProject] || currentProject;
        }

        // 处理排行数据：将"未分类"替换为项目名称
        var items = data.moduleRanking.map(function (item) {
            if (item.name === "未分类") {
                return { name: defaultModuleName, value: item.value };
            }
            return item;
        });

        var option = {
            tooltip: { trigger: "axis", formatter: "{b}: {c} 个缺陷" },
            grid: { left: 120, right: 40, top: 20, bottom: 30 },
            xAxis: { type: "value", axisLabel: { color: COLORS.subtext }, splitLine: { lineStyle: { color: COLORS.grid } } },
            yAxis: { type: "category", data: items.map(function (i) { return i.name; }).reverse(), axisLabel: { color: COLORS.text, fontSize: 12 } },
            series: [{
                type: "bar",
                data: items.map(function (i) {
                    return {
                        value: i.value,
                        itemStyle: { color: i.value > 10 ? COLORS.danger : (i.value > 5 ? COLORS.warning : COLORS.success), borderRadius: [0, 4, 4, 0] },
                        label: { show: true, position: "right", formatter: "{c} 缺陷", color: COLORS.text, fontSize: 11 },
                    };
                }).reverse(),
                barWidth: 18,
            }],
        };
        chart.setOption(option);
    }

    // ============================================================
    // 风险预警
    // ============================================================
    function renderAlerts(alerts) {
        if (!alerts) return;

        // 摘要卡片
        var summaryHtml = alerts.map(function (a) {
            var bgColor = a.level === "critical" ? "rgba(239,68,68,0.15)" : (a.level === "warning" ? "rgba(245,158,11,0.15)" : "rgba(59,130,246,0.15)");
            var borderColor = a.level === "critical" ? COLORS.danger : (a.level === "warning" ? COLORS.warning : COLORS.info);
            return '<div class="alert-card" style="background:' + bgColor + ";border-left:3px solid " + borderColor + '">' +
                '<div class="alert-icon">' + a.icon + '</div>' +
                '<div class="alert-info">' +
                '<div class="alert-title">' + a.title + '</div>' +
                '<div class="alert-desc">' + a.desc + '</div>' +
                '<div class="alert-time">' + (a.time ? new Date(a.time).toLocaleString("zh-CN") : "") + '</div>' +
                '</div></div>';
        }).join("");
        document.getElementById("alertSummary").innerHTML = summaryHtml;

        // 时间线散点图
        var chart = echarts.init(document.getElementById("alertTimelineChart"), null, { renderer: "canvas" });
        charts.alertTimeline = chart;

        var colorMap = { critical: COLORS.danger, warning: COLORS.warning, info: COLORS.info };
        var scatterData = alerts.map(function (a, i) {
            return {
                value: [i, 0, a.title],
                itemStyle: { color: colorMap[a.level] || COLORS.subtext },
                name: a.title,
            };
        });

        var option = {
            tooltip: { formatter: function (p) { return p.data.name; } },
            grid: { left: 30, right: 30, top: 30, bottom: 40 },
            xAxis: { type: "category", data: alerts.map(function (a, i) { return i + 1; }), axisLabel: { color: COLORS.subtext } },
            yAxis: { type: "value", show: false },
            series: [{
                type: "scatter",
                data: scatterData,
                symbolSize: 28,
                label: {
                    show: true,
                    formatter: function (p) { return alerts[p.dataIndex].icon; },
                    fontSize: 16,
                },
                emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(99,102,241,0.5)" } },
            }],
        };
        chart.setOption(option);
    }

})();
