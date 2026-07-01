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

    // ============================================================
    // 初始化
    // ============================================================
    document.addEventListener("DOMContentLoaded", function () {
        initNavTabs();
        initVersionSelect();
        initRefreshBtn();
        loadData();
        startAutoRefresh();
    });

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
    // 数据加载
    // ============================================================
    function loadData(version, silent) {
        var url = "/api/data" + (version ? "?version=" + encodeURIComponent(version) : "");
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
        renderGantt(data.testGantt);
        renderHeatmap(data.heatmap);
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
            { label: "缺陷关闭率", value: kpi.bugCloseRate + "%", icon: "🏁", color: kpi.bugCloseRate >= 95 ? COLORS.success : COLORS.warning, target: "≥95%" },
            { label: "P0/P1 未关闭", value: kpi.p0p1Count, icon: "🚨", color: kpi.p0p1Count === 0 ? COLORS.success : COLORS.danger },
            { label: "需求完成率", value: kpi.requirementCompleteRate + "%", icon: "📋", color: kpi.requirementCompleteRate >= 100 ? COLORS.success : COLORS.warning, target: "≥100%" },
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
        var chart = echarts.init(document.getElementById("radarChart"), null, { renderer: "canvas" });
        charts.radar = chart;

        // 归一化
        var maxDensity = 10;
        var maxDays = 10;

        var option = {
            tooltip: { trigger: "item" },
            radar: {
                shape: "circle",
                indicator: [
                    { name: "缺陷密度", max: 10 },
                    { name: "缺陷关闭率(%)", max: 100 },
                    { name: "用例覆盖率(%)", max: 100 },
                    { name: "回归缺陷率(%)", max: Math.max(radar.regressionRate * 2, 10) },
                    { name: "平均修复(天)", max: 10 },
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
            grid: { left: 120, right: 40, top: 20, bottom: 30 },
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
            graphic: [
                { type: "text", right: 20, top: 10, style: { text: "综合等级", fill: COLORS.subtext, fontSize: 12 } },
                { type: "text", right: 30, top: 30, style: { text: score.grade, fill: gradeColor, fontSize: 36, fontWeight: "bold" } },
                { type: "text", right: 20, top: 72, style: { text: "均分 " + score.average, fill: COLORS.text, fontSize: 14 } },
            ],
        };
        chart.setOption(option);
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
    // 甘特图（用例执行）
    // ============================================================
    function renderGantt(data) {
        if (!data || !data.cases) return;
        var chart = echarts.init(document.getElementById("ganttChart"), null, { renderer: "canvas" });
        charts.gantt = chart;

        var cases = data.cases.slice(0, 30);
        var statusColor = { pass: COLORS.success, fail: COLORS.danger, pending: COLORS.warning, blocked: COLORS.info };
        var statusLabel = { pass: "通过", fail: "失败", pending: "待执行", blocked: "阻塞" };

        var option = {
            tooltip: { formatter: function (p) { return p.name + ": " + (statusLabel[p.value[2]] || p.value[2]); } },
            grid: { left: 200, right: 30, top: 20, bottom: 30 },
            xAxis: { type: "value", axisLabel: { color: COLORS.subtext, formatter: function (v) { return v; } }, splitLine: { lineStyle: { color: COLORS.grid } } },
            yAxis: { type: "category", data: cases.map(function (c) { return c.title; }).reverse(), axisLabel: { color: COLORS.text, fontSize: 10, width: 180, overflow: "truncate" } },
            series: [{
                type: "bar",
                data: cases.map(function (c, i) {
                    return {
                        name: c.title,
                        value: [0, cases.length - i - 1, c.status],
                        itemStyle: { color: statusColor[c.status] || COLORS.subtext, borderRadius: 3 },
                        label: { show: true, position: "right", formatter: statusLabel[c.status] || c.status, color: COLORS.text, fontSize: 10 },
                    };
                }).reverse(),
                barWidth: 14,
            }],
        };
        chart.setOption(option);
    }

    // ============================================================
    // 热力图
    // ============================================================
    function renderHeatmap(data) {
        if (!data || !data.data) return;
        var chart = echarts.init(document.getElementById("heatmapChart"), null, { renderer: "canvas" });
        charts.heatmap = chart;

        var option = {
            tooltip: { position: "top", formatter: function (p) { return data.commits[p.value[0]] + " × " + data.modules[p.value[1]] + ": " + p.value[2]; } },
            grid: { left: 150, right: 30, top: 20, bottom: 40 },
            xAxis: { type: "category", data: data.commits, axisLabel: { color: COLORS.subtext, rotate: 45, fontSize: 9 } },
            yAxis: { type: "category", data: data.modules, axisLabel: { color: COLORS.text, fontSize: 11 } },
            visualMap: { min: 1, max: 5, show: false, inRange: { color: ["#1e293b", "#6366f1", "#f59e0b", "#ef4444"] } },
            series: [{
                type: "heatmap",
                data: data.data,
                itemStyle: { borderRadius: 2 },
                emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(99,102,241,0.5)" } },
            }],
        };
        chart.setOption(option);
    }

    // ============================================================
    // 桑基图
    // ============================================================
    function renderSankey(data) {
        if (!data || !data.sankey) return;
        var chart = echarts.init(document.getElementById("sankeyChart"), null, { renderer: "canvas" });
        charts.sankey = chart;

        var colorMap = { case: COLORS.info, bug: COLORS.danger, module: COLORS.warning };

        var option = {
            tooltip: { trigger: "item", formatter: function (p) { return p.data.name + " -" + (p.data.value || ""); } },
            series: [{
                type: "sankey",
                layout: "none",
                emphasis: { focus: "adjacency" },
                nodeAlign: "left",
                nodeGap: 12,
                nodeWidth: 20,
                data: data.sankey.nodes.map(function (n) {
                    return { name: n.name, itemStyle: { color: colorMap[n.category] || COLORS.primary, borderColor: COLORS.bg, borderWidth: 2 } };
                }),
                links: data.sankey.links.map(function (l) {
                    return { source: l.source, target: l.target, value: l.value, lineStyle: { color: "source", curveness: 0.3, opacity: 0.6 } };
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

        var option = {
            tooltip: { trigger: "item", formatter: "{b}: {c} 个缺陷" },
            series: [{
                type: "pie",
                roseType: "area",
                radius: ["15%", "70%"],
                data: data.rose,
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

        var items = data.moduleRanking;
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
