#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
在线质量仪表盘 V1.0 - 后端服务
集成 GitLab API + 禅道 API + MySQL
"""

import os
import json
import time
import logging
from datetime import datetime, timedelta
from functools import wraps

import requests
import mysql.connector
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS

# ============================================================
# 配置区
# ============================================================
# MOCK_MODE 已废弃，强制使用真实数据
# MOCK_MODE = os.getenv("MOCK_MODE", "false").lower() == "true"

# Gitea 配置
GITEA_URL = "http://192.168.10.215:3001"
GITEA_PROJECT = "RobotController_V2/robot-controller_v2"
GITEA_USER = "mengfeifei@five-ages.com"
GITEA_PASS = "Mff523174!"

# 禅道配置（直接使用数据库）
# ZENTAO_URL 已废弃，禅道数据仅通过 MySQL 获取


# MySQL 配置（禅道数据库）
DB_CONFIG = {
    "host": "192.168.10.31",
    "port": 3306,
    "user": "root",
    "password": "123456",
    "database": "zentao",
    "charset": "utf8mb4",
}
ZENTAO_DB = DB_CONFIG

# 日志配置
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ============================================================
# Flask 应用
# ============================================================
app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)

# ============================================================
# 工具函数
# ============================================================

def retry_on_fail(max_retries=3, delay=2):
    """重试装饰器"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    logger.warning(f"[{func.__name__}] 第{attempt+1}次失败: {e}")
                    if attempt < max_retries - 1:
                        time.sleep(delay)
            logger.error(f"[{func.__name__}] 重试{max_retries}次后仍失败")
            return None
        return wrapper
    return decorator


class GiteaClient:
    """Gitea API 客户端"""
    def __init__(self):
        self.base_url = GITEA_URL
        self.session = requests.Session()
        self.session.auth = (GITEA_USER, GITEA_PASS)
        self.session.headers.update({"Content-Type": "application/json"})
        self._project_id = None

    def _get_project_id(self):
        """获取项目ID（Gitea API v1）"""
        if self._project_id:
            return self._project_id
        try:
            resp = self.session.get(
                f"{self.base_url}/api/v1/repos/{GITEA_PROJECT}",
                timeout=10
            )
            if resp.status_code == 200:
                data = resp.json()
                self._project_id = data.get("id") or data.get("owner", {}).get("id")
                logger.info(f"获取 Gitea 项目 ID 成功: {self._project_id}")
                return self._project_id
            logger.warning(f"获取 Gitea 项目失败: {resp.status_code} {resp.text[:200]}")
        except Exception as e:
            logger.warning(f"获取 Gitea 项目异常: {e}")
        return None

    @retry_on_fail()
    def get_commits(self):
        """获取 commit 列表（Gitea API v1）"""
        pid = self._get_project_id()
        if not pid:
            raise Exception("无法获取项目ID，请检查 GITEA_PROJECT 配置")
        params = {"limit": 500}
        resp = self.session.get(
            f"{self.base_url}/api/v1/repos/{GITEA_PROJECT}/commits",
            params=params, timeout=15,
        )
        resp.raise_for_status()
        return resp.json()

    @retry_on_fail()
    def get_branches(self):
        """获取分支列表（Gitea API v1）"""
        resp = self.session.get(
            f"{self.base_url}/api/v1/repos/{GITEA_PROJECT}/branches",
            params={"limit": 100}, timeout=10,
        )
        resp.raise_for_status()
        return resp.json()


class ZenTaoClient:
    """禅道客户端 - 直接查询 MySQL 数据库"""
    def __init__(self):
        self._db = None

    def get_db(self):
        """获取数据库连接"""
        if self._db and self._db.is_connected():
            return self._db
        try:
            self._db = mysql.connector.connect(**DB_CONFIG)
            logger.info("禅道数据库连接成功")
            return self._db
        except Exception as e:
            logger.error(f"禅道数据库连接失败: {e}")
            raise

    def get_db(self):
        """获取数据库连接"""
        if self._db and self._db.is_connected():
            return self._db
        try:
            self._db = mysql.connector.connect(**DB_CONFIG)
            logger.info("禅道数据库连接成功")
            return self._db
        except Exception as e:
            logger.error(f"禅道数据库连接失败: {e}")
            raise

    # ---- 缺陷 ----
    def get_bugs(self, build_name=None, days=30):
        """获取缺陷列表（仅 MySQL）"""
        return self._get_bugs_from_db(build_name, days)

    def _get_bugs_from_db(self, build_name=None, days=30):
        db = self.get_db()
        cursor = db.cursor(dictionary=True)
        sql = """
            SELECT 
                bug.id AS id,
                bug.title AS title,
                bug.severity AS severity,
                bug.pri AS priority,
                bug.status AS status,
                build.name AS buildName,
                creator.realname AS creator,
                bug.openedDate AS openedDate,
                resolver.realname AS resolver,
                bug.resolvedDate AS resolvedDate,
                bug.closedDate AS closedDate,
                bug.type AS bugType,
                bug.activatedCount AS activatedCount
            FROM `zt_project` exec
            JOIN `zt_build` build ON exec.`id` = build.`execution`
            JOIN `zt_bug` bug ON bug.`openedBuild` = build.`id`
            LEFT JOIN `zt_user` creator ON bug.`openedBy` = creator.`account`
            LEFT JOIN `zt_user` resolver ON bug.`resolvedBy` = resolver.`account`
            WHERE exec.`name` = '机器人本体控制软件'
                AND exec.`type` = 'sprint'
                AND bug.deleted = '0'
                AND bug.openedDate >= %s
        """
        params = [(datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")]
        if build_name:
            sql += " AND build.name = %s"
            params.append(build_name)
        sql += " ORDER BY bug.id DESC"
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        cursor.close()
        logger.info(f"禅道 bugs 获取: {len(rows)} 条")
        return rows or []

    # ---- 需求 ----
    def get_stories(self, version=None):
        """获取需求列表（仅 MySQL）"""
        return self._get_stories_from_db(version)

    def _get_stories_from_db(self, version=None):
        db = self.get_db()
        cursor = db.cursor(dictionary=True)
        sql = """
            SELECT s.id AS id, s.title AS title, s.status AS status, s.version AS version, s.product AS product,
                   s.closedDate AS closedDate, s.parent AS parent, s.type AS type
            FROM zt_story s
            WHERE s.deleted = '0'
            ORDER BY s.id DESC LIMIT 500
        """
        params = []
        if version:
            sql += " AND s.version = %s"
            params.append(version)
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        cursor.close()
        logger.info(f"禅道 stories 获取: {len(rows)} 条")
        return rows or []

    # ---- 用例 ----
    def get_test_cases(self, build_name=None):
        """获取测试用例列表（仅 MySQL）"""
        return self._get_cases_from_db(build_name)

    def get_total_test_cases(self):
        """获取所有测试用例数量（机器人本体控制软件模块）"""
        db = self.get_db()
        cursor = db.cursor(dictionary=True)
        sql = """
            SELECT COUNT(DISTINCT c.id) as total
            FROM `zt_case` c
            JOIN `zt_module` m ON c.`module` = m.`id`
            WHERE c.`product` = 17
                AND c.`module` BETWEEN 476 AND 487
                AND c.`deleted` = '0'
        """
        cursor.execute(sql)
        row = cursor.fetchone()
        cursor.close()
        if row and row.get("total"):
            logger.info(f"禅道所有测试用例数量: {row['total']}")
            return row["total"]
        return 0

    def get_all_test_cases_detail(self):
        """获取所有测试用例详情（机器人本体控制软件模块）"""
        db = self.get_db()
        cursor = db.cursor(dictionary=True)
        sql = """
            SELECT
                c.id,
                c.title,
                c.pri,
                c.type,
                c.status,
                c.openedBy,
                c.openedDate,
                c.lastRunner,
                c.lastRunResult,
                m.name AS module_name
            FROM `zt_case` c
            JOIN `zt_module` m ON c.`module` = m.`id`
            WHERE c.`product` = 17
                AND c.`module` BETWEEN 476 AND 487
                AND c.`deleted` = '0'
            ORDER BY c.`module`, c.`id` DESC
        """
        cursor.execute(sql)
        rows = cursor.fetchall()
        cursor.close()
        logger.info(f"禅道所有测试用例详情: {len(rows)} 条")
        return rows or []

    def get_executed_test_cases(self, build_name=None):
        """获取已执行的测试用例数量（按版本）"""
        db = self.get_db()
        cursor = db.cursor(dictionary=True)
        sql = """
            SELECT COUNT(DISTINCT r.`case`) as executed
            FROM `zt_build` b
            JOIN `zt_testtask` t ON t.`build` = b.`id`
            JOIN `zt_testrun` r ON r.`task` = t.`id`
            JOIN `zt_case` c ON r.`case` = c.`id`
            WHERE b.name IS NOT NULL
                AND c.`deleted` = '0'
                AND t.`deleted` = '0'
        """
        params = []
        if build_name:
            sql += " AND b.name = %s"
            params.append(build_name)
        cursor.execute(sql, params)
        row = cursor.fetchone()
        cursor.close()
        if row and row.get("executed"):
            logger.info(f"禅道已执行测试用例数量: {row['executed']}")
            return row["executed"]
        return 0

    def get_executed_test_cases_detail(self, build_name=None):
        """获取已执行的测试用例详情（按版本）"""
        db = self.get_db()
        cursor = db.cursor(dictionary=True)
        sql = """
            SELECT
                b.name AS 构建版本号,
                t.id AS 测试单ID,
                t.name AS 测试单名称,
                r.`case` AS 用例ID,
                c.title AS 用例标题,
                c.pri AS 优先级,
                r.status AS 执行记录状态,
                r.lastRunResult AS 执行结果,
                r.lastRunner AS 执行人,
                r.lastRunDate AS 执行时间
            FROM `zt_build` b
            JOIN `zt_testtask` t ON t.`build` = b.`id`
            JOIN `zt_testrun` r ON r.`task` = t.`id`
            JOIN `zt_case` c ON r.`case` = c.`id`
            WHERE b.name IS NOT NULL
                AND c.`deleted` = '0'
                AND t.`deleted` = '0'
        """
        params = []
        if build_name:
            sql += " AND b.name = %s"
            params.append(build_name)
        sql += " ORDER BY t.id, r.`case`"
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        cursor.close()
        logger.info(f"禅道已执行测试用例详情: {len(rows)} 条")
        return rows or []

    def _get_cases_from_db(self, build_name=None):
        db = self.get_db()
        cursor = db.cursor(dictionary=True)
        sql = """
            SELECT
                tr.id AS id,
                c.title AS title,
                tr.lastrunner AS runner,
                tr.lastRunDate AS runDate,
                tr.status AS status,
                tr.lastRunResult AS result,
                t.name AS taskName,
                b.name AS buildName,
                exec.name AS execName
            FROM `zt_testrun` tr
            JOIN `zt_testtask` t ON tr.`task` = t.`id`
            JOIN `zt_build` b ON t.`build` = b.`id`
            JOIN `zt_project` exec ON b.`execution` = exec.`id`
            JOIN `zt_case` c ON tr.`case` = c.`id`
            WHERE exec.`name` = '机器人本体控制软件'
                AND b.name IS NOT NULL
        """
        params = []
        if build_name:
            sql += " AND b.name = %s"
            params.append(build_name)
        sql += " ORDER BY tr.id DESC"
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        cursor.close()
        logger.info(f"禅道 cases 获取: {len(rows)} 条")
        return rows or []

    # ---- 构建版本（从执行模块）----
    def get_builds(self):
        """获取构建版本列表（禅道执行模块）"""
        return self._get_builds_from_db()

    def _get_builds_from_db(self):
        """从 zt_build 表获取构建版本信息（通过项目关联）"""
        db = self.get_db()
        cursor = db.cursor(dictionary=True)
        sql = """
            SELECT 
                b.id AS 构建ID,
                b.name AS 构建名称,
                p.name AS 所属产品,
                e.name AS 所属迭代,
                u.realname AS 构建者,
                b.date AS 构建日期
            FROM `zt_build` b
            LEFT JOIN `zt_product` p ON b.`product` = p.`id`
            LEFT JOIN `zt_project` e ON b.`execution` = e.`id`
            LEFT JOIN `zt_user` u ON b.`builder` = u.`account`
            WHERE b.`product` = 17
            ORDER BY b.`id` DESC
        """
        cursor.execute(sql)
        rows = cursor.fetchall()
        cursor.close()
        logger.info(f"禅道 builds 获取: {len(rows)} 条")
        return rows or []

    # ---- 版本/提测单 ----
    def get_versions(self):
        """获取版本列表（仅 MySQL）"""
        return self._get_versions_from_db()

    def _get_versions_from_db(self):
        db = self.get_db()
        cursor = db.cursor(dictionary=True)
        try:
            # 从 zt_build 表获取构建名称作为版本号（产品ID 17）
            cursor.execute("""
                SELECT DISTINCT b.name as version
                FROM `zt_build` b
                LEFT JOIN `zt_product` p ON b.`product` = p.`id`
                LEFT JOIN `zt_project` e ON b.`execution` = e.`id`
                LEFT JOIN `zt_user` u ON b.`builder` = u.`account`
                WHERE b.`product` = 17 AND b.name IS NOT NULL AND b.name != ''
                UNION
                SELECT DISTINCT s.version FROM zt_story s
                WHERE s.version IS NOT NULL AND s.version != ''
                ORDER BY version DESC LIMIT 20
            """)
            rows = cursor.fetchall()
            cursor.close()
            return [{"version": r["version"]} for r in rows if r.get("version")]
        except Exception as e:
            cursor.close()
            logger.error(f"获取版本列表失败: {e}")
            return []


# ============================================================
# 数据聚合服务
# ============================================================
class QualityDataService:
    """聚合 Gitea + 禅道 数据，输出仪表盘所需结构"""
    def __init__(self):
        self.gitea = GiteaClient()
        self.zentao = ZenTaoClient()

    def get_all_versions(self):
        """获取所有版本列表"""
        try:
            versions = self.zentao.get_versions()
            if versions:
                return [v.get("version", v.get("name", "")) for v in versions]
        except Exception as e:
            logger.error(f"获取版本列表失败: {e}")
        return []

    def get_all_builds(self):
        """获取所有构建版本列表"""
        try:
            builds = self.zentao.get_builds()
            if builds:
                return [{"version": b.get("build_name", ""), "date": str(b.get("build_date", ""))} for b in builds]
        except Exception as e:
            logger.error(f"获取构建版本列表失败: {e}")
        return []

    def get_dashboard_data(self, build_name=None):
        """获取完整仪表盘数据"""
        try:
            return self._real_data(build_name)
        except Exception as e:
            logger.error(f"获取真实数据失败: {e}")
            # 返回空数据结构，而不是 mock 数据
            return {
                "versions": self.get_all_versions()[:10],
                "builds": self.get_all_builds()[:10],
                "currentVersion": build_name or "latest",
                "kpi": {
                    "commitCount": 0, "codeChangeLines": 0, "bugCount": 0,
                    "closedBugCount": 0, "p0p1Count": 0, "storyCount": 0,
                    "closedStoryCount": 0, "caseCount": 0, "executedCaseCount": 0,
                    "passedCaseCount": 0, "regressionBugCount": 0,
                    "defectDensity": 0, "bugCloseRate": 0, "requirementCompleteRate": 0,
                    "caseCoverage": 0, "casePassRate": 0, "regressionRate": 0,
                    "avgFixDays": 0,
                },
                "radar": {"defectDensity": 0, "bugCloseRate": 0, "caseCoverage": 0, "regressionRate": 0, "avgFixDays": 0},
                "commitChart": {"dates": [], "commits": [], "additions": [], "deletions": [], "totalChanges": []},
                "burndown": {"dates": [], "remaining": [], "ideal": [], "total": 0},
                "bugTrend": {"dates": [], "newBugs": [], "closedBugs": [], "cumulativeBugs": []},
                "bugDistribution": {"byModule": [], "bySeverity": []},
                "testGantt": {"cases": []},
                "heatmap": {"modules": [], "commits": [], "data": []},
                "rootCause": {"sankey": {"nodes": [], "links": []}, "rose": [], "moduleRanking": []},
                "alerts": [{"level": "info", "icon": "⚠️", "title": "数据加载失败，请检查 GitLab 和禅道连接", "desc": "请确认配置的 URL 和认证信息正确", "time": datetime.now().isoformat()}],
                "qualityScore": {"items": [], "average": 0, "grade": "-"},
            }

    def _real_data(self, build_name=None):
        # Gitea 数据
        commits = self.gitea.get_commits()
        logger.info(f"Gitea commits 获取: {len(commits)} 条")

        # 缺陷数据
        bugs = self.zentao.get_bugs(build_name=build_name)
        logger.info(f"禅道 bugs 获取: {len(bugs)} 条")

        # 需求数据
        stories = self.zentao.get_stories()
        logger.info(f"禅道 stories 获取: {len(stories)} 条")

        # 用例数据
        cases = self.zentao.get_test_cases()
        logger.info(f"禅道 cases 获取: {len(cases)} 条")

        # 聚合计算
        kpi = self._calc_kpi(commits, bugs, stories, cases, build_name)
        return {
            "versions": self.get_all_versions()[:10],
            "currentVersion": "latest",
            "kpi": kpi,
            "radar": self._calc_radar(kpi),
            "commitChart": self._calc_commit_chart(commits),
            "burndown": self._calc_burndown(stories),
            "bugTrend": self._calc_bug_trend(bugs),
            "bugDistribution": self._calc_bug_distribution(bugs),
            "testGantt": self._calc_test_gantt(cases),
            "heatmap": self._calc_heatmap(commits, bugs),
            "rootCause": self._calc_root_cause(bugs, cases, commits),
            "alerts": self._calc_alerts(bugs, stories, cases, build_name),
            "qualityScore": self._calc_quality_score(bugs, cases, commits, stories),
        }

    def _calc_kpi(self, commits, bugs, stories, cases, build_name=None):
        """计算 KPI 指标"""
        total_commits = len(commits)
        total_loc = sum(c.get("stats", {}).get("total", 0) for c in commits) if commits else 0

        total_bugs = len(bugs)
        closed_bugs = sum(1 for b in bugs if b.get("status") in ("closed", "resolved"))
        active_bugs = [b for b in bugs if b.get("status") not in ("closed", "resolved")]
        p0_p1 = sum(1 for b in active_bugs if str(b.get("severity", "")) in ("1", "2"))

        total_stories = len(stories)
        closed_stories = sum(1 for s in stories if s.get("status") == "closed")

        # 用例覆盖率计算
        # total_cases: 所有测试用例数量（机器人本体控制软件模块）
        total_cases = self.zentao.get_total_test_cases()
        # executed_cases_detail: 已执行的测试用例详情（按版本）
        executed_cases_detail = self.zentao.get_executed_test_cases_detail(build_name=build_name)
        # executed_cases: 已执行的测试用例数量
        executed_cases = len(executed_cases_detail)
        # passed_cases: 通过的测试用例数量
        passed_cases = sum(1 for c in executed_cases_detail if c.get("执行结果") == "pass")

        # Bug Reopen率
        # 识别reopen的bug: activatedCount > 1 表示bug被重新激活过
        reopened_bugs = [b for b in bugs if (b.get("activatedCount") or 0) > 1]
        regression_rate = len(reopened_bugs) / total_bugs * 100 if total_bugs > 0 else 0

        # 平均修复时长
        fix_times = []
        for b in bugs:
            opened = b.get("openedDate") or b.get("createdDate")
            closed = b.get("closedDate") or b.get("resolvedDate")
            if opened and closed:
                try:
                    d1 = datetime.fromisoformat(str(opened)[:10])
                    d2 = datetime.fromisoformat(str(closed)[:10])
                    fix_times.append((d2 - d1).days)
                except:
                    pass
        avg_fix_days = round(sum(fix_times) / len(fix_times), 1) if fix_times else 0

        # 缺陷密度
        defect_density = round(total_bugs / (total_loc / 1000), 2) if total_loc > 0 else 0

        return {
            "commitCount": total_commits,
            "codeChangeLines": total_loc,
            "bugCount": total_bugs,
            "closedBugCount": closed_bugs,
            "p0p1Count": p0_p1,
            "storyCount": total_stories,
            "closedStoryCount": closed_stories,
            "caseCount": total_cases,
            "executedCaseCount": executed_cases,
            "passedCaseCount": passed_cases,
            "regressionBugCount": len(reopened_bugs),
            # 派生指标
            "defectDensity": defect_density,
            "bugCloseRate": round(closed_bugs / total_bugs * 100, 1) if total_bugs > 0 else 100,
            "requirementCompleteRate": round(closed_stories / total_stories * 100, 1) if total_stories > 0 else 100,
            "caseCoverage": round(executed_cases / total_cases * 100, 1) if total_cases > 0 else 100,
            "casePassRate": round(passed_cases / executed_cases * 100, 1) if executed_cases > 0 else 100,
            "regressionRate": round(regression_rate, 1),
            "avgFixDays": avg_fix_days,
        }

    def _calc_radar(self, kpi):
        """从 KPI 中提取雷达图数据"""
        return {
            "defectDensity": kpi.get("defectDensity", 0),
            "bugCloseRate": kpi.get("bugCloseRate", 0),
            "caseCoverage": kpi.get("caseCoverage", 0),
            "regressionRate": kpi.get("regressionRate", 0),
            "avgFixDays": kpi.get("avgFixDays", 0),
        }

    def _calc_commit_chart(self, commits):
        """按日期聚合 commit 数和代码行数（兼容 Gitea API）"""
        daily = {}
        for c in commits:
            # 尝试多种日期字段名
            date = None
            for key in ["commit_date", "created", "committed_date", "created_at", "date"]:
                date = str(c.get("commit", {}).get(key, "") or c.get(key, ""))[:10]
                if date and len(date) >= 10:
                    break
            if not date or len(date) < 10:
                continue
            if date not in daily:
                daily[date] = {"commits": 0, "additions": 0, "deletions": 0}
            daily[date]["commits"] += 1
            
            # 尝试获取 stats 信息
            stats = c.get("stats", {}) or c.get("stats", {})
            if not stats:
                # 尝试从 commit 对象中获取
                commit_obj = c.get("commit", {})
                if commit_obj:
                    stats = commit_obj.get("stats", {})
            
            daily[date]["additions"] += stats.get("additions", 0)
            daily[date]["deletions"] += stats.get("deletions", 0)

        dates = sorted(daily.keys())
        return {
            "dates": dates,
            "commits": [daily[d]["commits"] for d in dates],
            "additions": [daily[d]["additions"] for d in dates],
            "deletions": [daily[d]["deletions"] for d in dates],
            "totalChanges": [daily[d]["additions"] + daily[d]["deletions"] for d in dates],
        }

    def _calc_burndown(self, stories):
        """需求燃尽图"""
        total = len(stories)
        closed = sum(1 for s in stories if s.get("status") == "closed")
        remaining = total - closed
        # 按日期模拟燃尽
        dates = []
        values = []
        today = datetime.now()
        for i in range(14):
            d = (today - timedelta(days=13-i)).strftime("%Y-%m-%d")
            dates.append(d)
            # 模拟线性燃尽
            progress = (i + 1) / 14
            values.append(round(total * (1 - progress * closed / total)))
        return {
            "dates": dates,
            "remaining": values,
            "ideal": [round(total * (1 - i/14)) for i in range(14)],
            "total": total,
        }

    def _calc_bug_trend(self, bugs):
        """缺陷趋势（按日期聚合）"""
        daily_new = {}
        daily_closed = {}
        for b in bugs:
            opened = str(b.get("openedDate") or b.get("createdDate") or "")[:10]
            closed = str(b.get("closedDate") or b.get("resolvedDate") or "")[:10]
            if opened and opened >= (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d"):
                daily_new[opened] = daily_new.get(opened, 0) + 1
            if closed:
                daily_closed[closed] = daily_closed.get(closed, 0) + 1

        dates = sorted(set(list(daily_new.keys()) + list(daily_closed.keys())))
        # 累计存量
        cumulative = []
        total = 0
        for d in dates:
            total += daily_new.get(d, 0)
            total -= daily_closed.get(d, 0)
            cumulative.append(max(total, 0))

        return {
            "dates": dates,
            "newBugs": [daily_new.get(d, 0) for d in dates],
            "closedBugs": [daily_closed.get(d, 0) for d in dates],
            "cumulativeBugs": cumulative,
        }

    def _calc_bug_distribution(self, bugs):
        """缺陷分布（按模块 + 严重级别）"""
        by_module = {}
        by_severity = {}
        for b in bugs:
            mod = b.get("module") or "未分类"
            sev = b.get("severity") or "未知"
            by_module[mod] = by_module.get(mod, 0) + 1
            by_severity[sev] = by_severity.get(sev, 0) + 1
        return {
            "byModule": [{"name": k, "value": v} for k, v in by_module.items()],
            "bySeverity": [{"name": k, "value": v} for k, v in by_severity.items()],
        }

    def _calc_test_gantt(self, cases):
        """用例执行甘特图"""
        case_list = list(cases)[:50]  # 取前50条
        return {
            "cases": [
                {
                    "id": c.get("id"),
                    "title": c.get("title", "")[:40],
                    "status": c.get("result") or c.get("status", "pending"),
                    "executedDate": c.get("executedDate") or "",
                }
                for c in case_list
            ]
        }

    def _calc_heatmap(self, commits, bugs):
        """Commit-模块 热力图"""
        modules = set()
        commit_data = []
        for c in commits[:100]:
            sha = c.get("id") or c.get("sha", "")
            msg = c.get("message", "")
            # 尝试从 diff 获取模块
            mod = "unknown"
            if "src/" in msg:
                parts = msg.split("src/")
                if len(parts) > 1:
                    mod = parts[1].split("/")[0]
            modules.add(mod)
            commit_data.append({
                "sha": sha[:8],
                "module": mod,
                "date": str(c.get("created_at") or "")[:10],
            })

        module_list = list(modules)[:15]
        # 生成热力数据 [x, y, value]
        heat_data = []
        for i, mod in enumerate(module_list):
            for j, c in enumerate(commit_data):
                if c["module"] == mod:
                    heat_data.append([j, i, 1])

        return {
            "modules": module_list,
            "commits": [c["sha"] for c in commit_data[:20]],
            "data": heat_data[:100],
        }

    def _calc_root_cause(self, bugs, cases, commits):
        """根因分析数据（桑基图 + 玫瑰图）"""
        # 用例 → 缺陷 → 模块 的流向
        case_to_bug = {}
        bug_to_module = {}

        for b in bugs:
            mod = b.get("module") or "未分类"
            bug_to_module[b.get("id")] = mod

        # 模拟用例关联缺陷
        for c in cases:
            related_bugs = []
            for b in bugs:
                if str(b.get("title", "")).lower() in str(c.get("title", "")).lower() or \
                   str(c.get("title", "")).lower() in str(b.get("title", "")).lower():
                    related_bugs.append(b.get("id"))
            if related_bugs:
                case_to_bug[c.get("id")] = related_bugs[:3]

        # 构建桑基图数据
        nodes = []
        links = []
        node_set = set()

        def add_node(name, cat):
            label = f"{cat}:{name}"
            if label not in node_set:
                node_set.add(label)
                nodes.append({"name": label, "category": cat})
            return label

        for case_id, bug_ids in list(case_to_bug.items())[:10]:
            case_node = add_node(str(case_id), "case")
            for bid in bug_ids:
                bug_node = add_node(str(bid), "bug")
                mod = bug_to_module.get(bid, "未分类")
                mod_node = add_node(mod, "module")
                links.append({"source": case_node, "target": bug_node, "value": 1})
                links.append({"source": bug_node, "target": mod_node, "value": 1})

        # 玫瑰图：模块缺陷分布
        mod_bug_count = {}
        for b in bugs:
            mod = b.get("module") or "未分类"
            mod_bug_count[mod] = mod_bug_count.get(mod, 0) + 1

        rose_data = [{"name": k, "value": v} for k, v in mod_bug_count.items()][:10]

        return {
            "sankey": {"nodes": nodes, "links": links},
            "rose": rose_data,
            "moduleRanking": sorted(rose_data, key=lambda x: x["value"], reverse=True),
        }

    def _calc_alerts(self, bugs, stories, cases, build_name=None):
        """风险预警"""
        now = datetime.now()
        alerts = []

        # 1. P0/P1 未关闭缺陷
        p0_bugs = [b for b in bugs if str(b.get("severity", "")) in ("1", "2") and b.get("status") not in ("closed", "resolved")]
        if p0_bugs:
            alerts.append({
                "level": "critical",
                "icon": "🚨",
                "title": f"存在 {len(p0_bugs)} 个未关闭 P0/P1 缺陷",
                "desc": "阻塞级缺陷必须全部关闭后才能发布",
                "time": now.isoformat(),
            })

        # 2. Bug Reopen率
        reopened_bugs_alert = [b for b in bugs if (b.get("activatedCount") or 0) > 1]
        if bugs and len(reopened_bugs_alert) / len(bugs) * 100 > 5:
            alerts.append({
                "level": "warning",
                "icon": "⚠️",
                "title": f"Bug Reopen率 {round(len(reopened_bugs_alert)/len(bugs)*100, 1)}% 超过阈值 5%",
                "desc": "需加强测试覆盖，减少Bug Reopen",
                "time": now.isoformat(),
            })

        # 3. 缺陷关闭率
        closed = sum(1 for b in bugs if b.get("status") in ("closed", "resolved"))
        if bugs and closed / len(bugs) * 100 < 80:
            alerts.append({
                "level": "warning",
                "icon": "⚠️",
                "title": f"缺陷关闭率 {round(closed/len(bugs)*100, 1)}% 低于 80%",
                "desc": "距发布日期 ≤ 3天时需特别关注",
                "time": now.isoformat(),
            })

        # 4. 用例覆盖率
        # total_cases: 查询所有机器人本体控制软件模块的测试用例总数
        # executed: 查询对应版本的测试单中已执行的测试用例数
        total_cases = self.zentao.get_total_test_cases()
        executed = self.zentao.get_executed_test_cases(build_name=build_name)
        
        if total_cases > 0 and executed / total_cases * 100 < 90:
            alerts.append({
                "level": "info",
                "icon": "ℹ️",
                "title": f"用例覆盖率 {round(executed/total_cases*100, 1)}% 未达 90% 目标",
                "desc": "建议补充测试用例",
                "time": now.isoformat(),
            })

        if not alerts:
            alerts.append({
                "level": "info",
                "icon": "✅",
                "title": "当前版本质量状态良好",
                "desc": "所有指标均在目标范围内",
                "time": now.isoformat(),
            })

        return alerts

    def _calc_quality_score(self, bugs, cases, commits, stories):
        """质量评分"""
        total_bugs = len(bugs)
        closed_bugs = sum(1 for b in bugs if b.get("status") in ("closed", "resolved"))
        p0_count = sum(1 for b in bugs if str(b.get("severity", "")) in ("1", "2") and b.get("status") not in ("closed", "resolved"))

        # 各维度评分 (0-100)
        close_rate = closed_bugs / total_bugs * 100 if total_bugs > 0 else 100
        
        # Bug Reopen率计算
        regression_rate = 5  # 默认达标
        if total_bugs > 0:
            reg_count = sum(1 for b in bugs if (b.get("activatedCount") or 0) > 1)
            regression_rate = min(reg_count / total_bugs * 100, 20)

        items = [
            {"name": "缺陷关闭率", "score": round(close_rate), "maxScore": 100, "status": "pass" if close_rate >= 95 else ("warn" if close_rate >= 80 else "fail")},
            {"name": "Bug Reopen率", "score": round(100 - regression_rate * 5), "maxScore": 100, "status": "pass" if regression_rate <= 5 else ("warn" if regression_rate <= 10 else "fail")},
            {"name": "阻塞缺陷", "score": 100 if p0_count == 0 else max(0, 100 - p0_count * 30), "maxScore": 100, "status": "pass" if p0_count == 0 else "fail"},
            {"name": "需求完成率", "score": 85, "maxScore": 100, "status": "warn"},
            {"name": "用例覆盖", "score": 88, "maxScore": 100, "status": "warn"},
        ]

        avg = round(sum(i["score"] for i in items) / len(items))
        grade = "A" if avg >= 90 else ("B" if avg >= 75 else "C")
        return {"items": items, "average": avg, "grade": grade}

    # ---- Mock 数据 ----
    def _mock_data(self, version):
        """模拟数据（开发/调试用）"""
        import random
        random.seed(42)
        versions = ["v2.8.0", "v2.7.0", "v2.6.0", "v2.5.0"]
        now = datetime.now()

        kpi = {
            "commitCount": 326, "codeChangeLines": 12800, "bugCount": 42,
            "closedBugCount": 38, "p0p1Count": 2, "storyCount": 28,
            "closedStoryCount": 25, "caseCount": 156, "executedCaseCount": 142,
            "passedCaseCount": 135, "regressionBugCount": 3,
            "defectDensity": 3.28, "bugCloseRate": 90.5, "requirementCompleteRate": 89.3,
            "caseCoverage": 91.0, "casePassRate": 95.1, "regressionRate": 7.1,
            "avgFixDays": 2.3,
        }

        dates_30 = [(now - timedelta(days=29-i)).strftime("%Y-%m-%d") for i in range(30)]

        return {
            "versions": versions,
            "currentVersion": version or "v2.8.0",
            "kpi": kpi,
            "radar": {"defectDensity": 3.28, "bugCloseRate": 90.5, "caseCoverage": 91.0, "regressionRate": 7.1, "avgFixDays": 2.3},
            "commitChart": {
                "dates": dates_30,
                "commits": [random.randint(3, 15) for _ in range(30)],
                "additions": [random.randint(100, 800) for _ in range(30)],
                "deletions": [random.randint(50, 400) for _ in range(30)],
                "totalChanges": [random.randint(200, 1000) for _ in range(30)],
            },
            "burndown": {
                "dates": dates_30[-14:],
                "remaining": [max(0, 28 - i*2) for i in range(14)],
                "ideal": [28 - round(28*i/13) for i in range(14)],
                "total": 28,
            },
            "bugTrend": {
                "dates": dates_30,
                "newBugs": [random.randint(0, 4) for _ in range(30)],
                "closedBugs": [random.randint(0, 3) for _ in range(30)],
                "cumulativeBugs": [max(0, 42 - i) for i in range(30)],
            },
            "bugDistribution": {
                "byModule": [
                    {"name": "运动控制", "value": 12}, {"name": "路径规划", "value": 9},
                    {"name": "通信模块", "value": 8}, {"name": "UI界面", "value": 7},
                    {"name": "数据管理", "value": 4}, {"name": "其他", "value": 2},
                ],
                "bySeverity": [
                    {"name": "致命", "value": 2}, {"name": "严重", "value": 8},
                    {"name": "一般", "value": 22}, {"name": "轻微", "value": 10},
                ],
            },
            "testGantt": {
                "cases": [
                    {"id": i, "title": f"测试用例 {i}", "status": random.choice(["pass", "fail", "pending", "blocked"]),
                     "executedDate": (now - timedelta(days=random.randint(0, 10))).strftime("%Y-%m-%d")}
                    for i in range(1, 31)
                ]
            },
            "heatmap": {
                "modules": ["运动控制", "路径规划", "通信模块", "UI界面", "数据管理", "导航"],
                "commits": [f"a{i:06x}" for i in range(15)],
                "data": [[j, i, random.randint(1, 5)] for i in range(6) for j in range(15) if random.random() > 0.5],
            },
            "rootCause": {
                "sankey": {
                    "nodes": [
                        {"name": "case:1001", "category": "case"}, {"name": "case:1002", "category": "case"},
                        {"name": "bug:5001", "category": "bug"}, {"name": "bug:5002", "category": "bug"},
                        {"name": "运动控制", "category": "module"}, {"name": "通信模块", "category": "module"},
                    ],
                    "links": [
                        {"source": "case:1001", "target": "bug:5001", "value": 1},
                        {"source": "bug:5001", "target": "运动控制", "value": 1},
                        {"source": "case:1002", "target": "bug:5002", "value": 1},
                        {"source": "bug:5002", "target": "通信模块", "value": 1},
                    ],
                },
                "rose": [{"name": "运动控制", "value": 12}, {"name": "路径规划", "value": 9}, {"name": "通信模块", "value": 8}],
                "moduleRanking": [{"name": "运动控制", "value": 12}, {"name": "路径规划", "value": 9}, {"name": "通信模块", "value": 8}],
            },
            "alerts": [
                {"level": "critical", "icon": "🚨", "title": "存在 2 个未关闭 P0/P1 缺陷", "desc": "阻塞级缺陷必须全部关闭后才能发布", "time": now.isoformat()},
                {"level": "warning", "icon": "⚠️", "title": "Bug Reopen率 7.1% 超过阈值 5%", "desc": "需加强代码自测", "time": now.isoformat()},
            ],
            "qualityScore": {
                "items": [
                    {"name": "缺陷关闭率", "score": 90, "maxScore": 100, "status": "warn"},
                    {"name": "Bug Reopen率", "score": 85, "maxScore": 100, "status": "warn"},
                    {"name": "阻塞缺陷", "score": 70, "maxScore": 100, "status": "fail"},
                    {"name": "需求完成率", "score": 89, "maxScore": 100, "status": "warn"},
                    {"name": "用例覆盖", "score": 91, "maxScore": 100, "status": "pass"},
                ],
                "average": 85, "grade": "B",
            },
        }


# ============================================================
# 全局数据服务实例
# ============================================================
data_service = QualityDataService()


# ============================================================
# 路由定义
# ============================================================
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "services": {"gitea": GITEA_URL, "zentao": DB_CONFIG["host"]},
    })


@app.route("/api/versions")
def get_versions():
    try:
        versions = data_service.get_all_versions()
        return jsonify({"versions": versions})
    except Exception as e:
        return jsonify({"error": str(e), "versions": []}), 500


@app.route("/api/builds")
def get_builds():
    """获取构建版本列表"""
    try:
        builds = data_service.get_all_builds()
        return jsonify({"builds": builds})
    except Exception as e:
        return jsonify({"error": str(e), "builds": []}), 500


@app.route("/api/bugs")
def get_bugs():
    """获取缺陷列表（可选 build_name 参数）"""
    try:
        build_name = request.args.get("build_name")
        bugs = data_service.zentao.get_bugs(build_name=build_name)
        return jsonify({"bugs": bugs})
    except Exception as e:
        return jsonify({"error": str(e), "bugs": []}), 500


@app.route("/api/data")
def get_data():
    build_name = request.args.get("build_name") or request.args.get("version")
    try:
        data = data_service.get_dashboard_data(build_name)
        return jsonify(data)
    except Exception as e:
        logger.error(f"获取数据失败: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/kpi-summary")
def kpi_summary():
    try:
        data = data_service.get_dashboard_data()
        return jsonify(data.get("kpi", {}))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/alerts")
def get_alerts():
    try:
        data = data_service.get_dashboard_data()
        return jsonify(data.get("alerts", []))
    except Exception as e:
        return jsonify({"error": str(e), "alerts": []}), 500


@app.route("/api/root-cause")
def root_cause():
    try:
        data = data_service.get_dashboard_data()
        return jsonify(data.get("rootCause", {}))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/refresh", methods=["POST"])
def refresh_data():
    """刷新数据（清除缓存）"""
    return jsonify({
        "status": "refreshed",
        "timestamp": datetime.now().isoformat(),
    })


# ============================================================
# 启动
# ============================================================
if __name__ == "__main__":
    logger.info("启动质量仪表盘 | 强制使用真实数据")
    logger.info(f"Gitea: {GITEA_URL} | 禅道: {DB_CONFIG['host']}")
    app.run(host="0.0.0.0", port=5000, debug=True)
