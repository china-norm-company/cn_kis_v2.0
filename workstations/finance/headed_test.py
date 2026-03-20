"""管仲·财务台 Headed 浏览器验收测试"""
import os
import time
from datetime import datetime
from playwright.sync_api import sync_playwright

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJ1c2VybmFtZSI6ImFkbWluIiwiYWNjb3VudF90eXBlIjoiYWRtaW4iLCJyb2xlcyI6WyJhZG1pbiJdLCJleHAiOjE3NzE1MzMwNDcsImlhdCI6MTc3MTQ0NjY0N30.sKRmgrCMB_P9v9FKrQp_4o8QK8JT9Sv7D0jN9iHDobA"
BASE_URL = "http://localhost:3005/finance/"

PAGES = [
    ("dashboard", "财务驾驶舱"),
    ("quotes", "报价管理"),
    ("contracts", "合同管理"),
    ("invoices", "发票管理"),
    ("payment-plans/list", None),
    ("budgets", "预算管理"),
    ("costs", "成本管理"),
    ("revenue-analysis", "收入分析"),
    ("cost-analysis", "成本分析"),
    ("profit-analysis", "利润分析"),
    ("cashflow", "现金流"),
    ("risk-dashboard", "风险看板"),
    ("efficiency", "运营效率"),
    ("ar-aging", "应收账龄"),
    ("payables", "应付管理"),
    ("expenses", "费用报销"),
    ("settlement", "项目决算"),
    ("reports", "财务报表"),
]

timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
screenshot_dir = os.path.join(os.path.dirname(__file__), "screenshots", timestamp)
os.makedirs(screenshot_dir, exist_ok=True)

results = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False, slow_mo=300)
    context = browser.new_context(
        viewport={"width": 1440, "height": 900},
        locale="zh-CN",
    )
    page = context.new_page()

    page.goto(BASE_URL)
    page.evaluate(f"""
        localStorage.setItem('auth_token', '{TOKEN}');
        localStorage.setItem('auth_user', JSON.stringify({{
            "user_id": "admin_001",
            "name": "系统管理员",
            "avatar": "",
            "email": "admin@test.com",
            "open_id": "admin_001"
        }}));
        localStorage.setItem('auth_roles', JSON.stringify(["admin"]));
        localStorage.setItem('auth_profile', JSON.stringify({{
            "permissions": [
                "finance.quote.read", "finance.quote.create", "finance.quote.update", "finance.quote.delete",
                "finance.contract.read", "finance.contract.create", "finance.contract.update", "finance.contract.delete",
                "finance.invoice.read", "finance.invoice.create", "finance.invoice.update", "finance.invoice.delete",
                "finance.payment.read", "finance.payment.create", "finance.payment.update", "finance.payment.delete",
                "finance.budget.read", "finance.budget.create", "finance.budget.update", "finance.budget.delete",
                "finance.cost.read", "finance.cost.create", "finance.cost.update", "finance.cost.delete",
                "finance.report.read", "finance.report.create", "finance.report.update", "finance.report.delete",
                "finance.payable.read", "finance.payable.create", "finance.payable.update", "finance.payable.delete",
                "finance.expense.read", "finance.expense.create", "finance.expense.update", "finance.expense.delete",
                "finance.settlement.read", "finance.settlement.create", "finance.settlement.update", "finance.settlement.delete"
            ],
            "roles": ["admin"]
        }}));
    """)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(3)

    for route, label in PAGES:
        if label is None:
            continue
        url = f"{BASE_URL}#/{route}"
        print(f"  测试: {label} ({route})...", end=" ", flush=True)

        try:
            page.goto(url)
            page.wait_for_load_state("networkidle")
            time.sleep(2)

            errors = []
            page.on("pageerror", lambda err: errors.append(str(err)))

            filename = f"{route.replace('/', '_')}.png"
            filepath = os.path.join(screenshot_dir, filename)
            page.screenshot(path=filepath, full_page=True)

            body_text = page.inner_text("body")
            has_data = len(body_text.strip()) > 100
            has_empty = "暂无" in body_text or "没有" in body_text or "No data" in body_text.lower()

            status = "✅ 通过"
            if errors:
                status = "⚠️ 有控制台错误"
            
            results.append({
                "route": route,
                "label": label,
                "status": status,
                "has_data": has_data,
                "has_empty": has_empty,
                "screenshot": filepath,
                "errors": errors,
            })
            print(status)
        except Exception as e:
            results.append({
                "route": route,
                "label": label,
                "status": f"❌ 异常: {e}",
                "has_data": False,
                "has_empty": False,
                "screenshot": "",
                "errors": [str(e)],
            })
            print(f"❌ {e}")

    browser.close()

print("\n" + "=" * 60)
print("  管仲·财务台 验收测试报告")
print("=" * 60)
print(f"  截图保存: {screenshot_dir}")
print(f"  测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print(f"  总页面数: {len(results)}")
passed = sum(1 for r in results if "通过" in r["status"])
print(f"  通过: {passed}/{len(results)}")
print()
for r in results:
    data_indicator = "📊" if r["has_data"] and not r["has_empty"] else "📭" if r["has_empty"] else "📄"
    print(f"  {r['status']} {data_indicator} {r['label']} (/{r['route']})")
    if r["errors"]:
        for err in r["errors"][:2]:
            print(f"       ⚠ {err[:80]}")
print()
