#!/usr/bin/env python3
"""模拟数据生成器（开发调试用）"""
import json, random, datetime, os

random.seed(42)
now = datetime.datetime.now()

data = {
    "versions": ["v2.8.0", "v2.7.0", "v2.6.0"],
    "currentVersion": "v2.8.0",
    "kpi": {
        "commitCount": 326, "codeChangeLines": 12800, "bugCount": 42,
        "closedBugCount": 38, "p0p1Count": 2, "storyCount": 28,
        "closedStoryCount": 25, "caseCount": 156, "executedCaseCount": 142,
        "passedCaseCount": 135, "regressionBugCount": 3,
        "defectDensity": 3.28, "bugCloseRate": 90.5, "requirementCompleteRate": 89.3,
        "caseCoverage": 91.0, "casePassRate": 95.1, "regressionRate": 7.1,
        "avgFixDays": 2.3,
    },
    "radar": {"defectDensity": 3.28, "bugCloseRate": 90.5, "caseCoverage": 91.0, "regressionRate": 7.1, "avgFixDays": 2.3},
    "commitChart": {"dates": [(now - datetime.timedelta(days=29-i)).strftime("%Y-%m-%d") for i in range(30)], "commits": [random.randint(3,15) for _ in range(30)], "additions": [random.randint(100,800) for _ in range(30)], "deletions": [random.randint(50,400) for _ in range(30)], "totalChanges": [random.randint(200,1000) for _ in range(30)]},
    "burndown": {"dates": [(now - datetime.timedelta(days=13-i)).strftime("%Y-%m-%d") for i in range(14)], "remaining": [max(0, 28-i*2) for i in range(14)], "ideal": [28 - round(28*i/13) for i in range(14)], "total": 28},
    "bugTrend": {"dates": [(now - datetime.timedelta(days=29-i)).strftime("%Y-%m-%d") for i in range(30)], "newBugs": [random.randint(0,4) for _ in range(30)], "closedBugs": [random.randint(0,3) for _ in range(30)], "cumulativeBugs": [max(0, 42-i) for i in range(30)]},
    "bugDistribution": {"byModule": [{"name": "运动控制", "value": 12}, {"name": "路径规划", "value": 9}, {"name": "通信模块", "value": 8}, {"name": "UI界面", "value": 7}, {"name": "数据管理", "value": 4}, {"name": "其他", "value": 2}], "bySeverity": [{"name": "致命", "value": 2}, {"name": "严重", "value": 8}, {"name": "一般", "value": 22}, {"name": "轻微", "value": 10}]},
    "testGantt": {"cases": [{"id": i, "title": f"测试用例 {i}", "status": random.choice(["pass","fail","pending","blocked"]), "executedDate": (now - datetime.timedelta(days=random.randint(0,10))).strftime("%Y-%m-%d")} for i in range(1,31)]},
    "heatmap": {"modules": ["运动控制","路径规划","通信模块","UI界面","数据管理","导航"], "commits": [f"a{i:06x}" for i in range(15)], "data": [[j,i,random.randint(1,5)] for i in range(6) for j in range(15) if random.random()>0.5]},
    "rootCause": {
        "sankey": {"nodes": [{"name": "case:1001","category":"case"},{"name":"case:1002","category":"case"},{"name":"bug:5001","category":"bug"},{"name":"bug:5002","category":"bug"},{"name":"运动控制","category":"module"},{"name":"通信模块","category":"module"}], "links": [{"source":"case:1001","target":"bug:5001","value":1},{"source":"bug:5001","target":"运动控制","value":1},{"source":"case:1002","target":"bug:5002","value":1},{"source":"bug:5002","target":"通信模块","value":1}]},
        "rose": [{"name":"运动控制","value":12},{"name":"路径规划","value":9},{"name":"通信模块","value":8}],
        "moduleRanking": [{"name":"运动控制","value":12},{"name":"路径规划","value":9},{"name":"通信模块","value":8}],
    },
    "alerts": [
        {"level":"critical","icon":"🚨","title":"存在 2 个未关闭 P0/P1 缺陷","desc":"阻塞级缺陷必须全部关闭后才能发布","time":now.isoformat()},
        {"level":"warning","icon":"⚠️","title":"回归缺陷率 7.1% 超过阈值 5%","desc":"需加强回归测试覆盖","time":now.isoformat()},
    ],
    "qualityScore": {"items": [{"name":"缺陷关闭率","score":90,"maxScore":100,"status":"warn"},{"name":"回归缺陷率","score":85,"maxScore":100,"status":"warn"},{"name":"阻塞缺陷","score":70,"maxScore":100,"status":"fail"},{"name":"需求完成率","score":89,"maxScore":100,"status":"warn"},{"name":"用例覆盖","score":91,"maxScore":100,"status":"pass"}], "average":85,"grade":"B"},
}

out_path = os.path.join(os.path.dirname(__file__), "..", "data", "quality_data.json")
os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print(f"✅ 模拟数据已生成: {out_path}")
