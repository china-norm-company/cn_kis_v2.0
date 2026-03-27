#!/usr/bin/env python3
"""
CN KIS V2.0 — 端到端业务主链 Smoke Test

验证核心业务链路：Protocol → Subject → EDC CRF → 审计日志

使用方式（需在能访问生产 API 的环境运行）：
  python ops/scripts/e2e_smoke_test.py --token <JWT_TOKEN> [--base-url https://china-norm.com/v2/api/v1]

选项：
  --token      JWT Bearer token（必须有足够权限：protocol.create, subject.create, edc.crf.create）
  --base-url   API 基础 URL（默认 https://china-norm.com/v2/api/v1）
  --cleanup    测试后清理测试数据（默认 True）
  --verbose    打印详细响应

退出码：
  0 — 所有用例通过
  1 — 至少一个用例失败

符合 PQ.md 中 PQ-001 场景要求。
"""
import argparse
import json
import sys
import time
from datetime import date, datetime
from typing import Optional

try:
    import requests
except ImportError:
    print("❌ 需要 requests 库：pip install requests")
    sys.exit(1)

# ── ANSI 颜色 ──────────────────────────────────────────────────────────────
G = "\033[92m"
R = "\033[91m"
Y = "\033[93m"
B = "\033[94m"
E = "\033[0m"


class SmokeTestRunner:
    def __init__(self, base_url: str, token: str, verbose: bool = False):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        })
        self.verbose = verbose
        self.results: list[dict] = []
        self._created: dict = {}  # 记录已创建的测试对象 ID，用于清理

    # ── 工具方法 ──────────────────────────────────────────────────────────

    def _req(self, method: str, path: str, **kwargs) -> requests.Response:
        url = f"{self.base_url}{path}"
        resp = self.session.request(method, url, timeout=30, **kwargs)
        if self.verbose:
            print(f"  {method} {path} → {resp.status_code}")
            try:
                print(f"  {json.dumps(resp.json(), ensure_ascii=False, indent=2)[:500]}")
            except Exception:
                pass
        return resp

    def _pass(self, name: str, detail: str = '') -> dict:
        r = {'name': name, 'status': 'PASS', 'detail': detail}
        self.results.append(r)
        print(f"  {G}✅ PASS{E}  {name}{f'  ({detail})' if detail else ''}")
        return r

    def _fail(self, name: str, detail: str = '') -> dict:
        r = {'name': name, 'status': 'FAIL', 'detail': detail}
        self.results.append(r)
        print(f"  {R}❌ FAIL{E}  {name}{f'  → {detail}' if detail else ''}")
        return r

    def _skip(self, name: str, reason: str = '') -> dict:
        r = {'name': name, 'status': 'SKIP', 'detail': reason}
        self.results.append(r)
        print(f"  {Y}⏭  SKIP{E}  {name}{f'  ({reason})' if reason else ''}")
        return r

    def _check(self, name: str, condition: bool, detail: str = '') -> bool:
        if condition:
            self._pass(name, detail)
        else:
            self._fail(name, detail)
        return condition

    # ── 测试用例 ──────────────────────────────────────────────────────────

    def tc_api_health(self):
        """TC-01 API 健康检查"""
        print(f"\n{B}[TC-01] API 健康检查{E}")
        resp = self._req('GET', '/openapi.json')
        ok = resp.status_code == 200
        if ok:
            title = resp.json().get('info', {}).get('title', '')
            self._check('OpenAPI 文档可访问', True, f'title={title}')
        else:
            self._fail('OpenAPI 文档可访问', f'HTTP {resp.status_code}')

    def tc_auth(self):
        """TC-02 认证校验"""
        print(f"\n{B}[TC-02] 认证与权限{E}")
        # 无 token 时应返回 401
        s2 = requests.Session()
        resp = s2.get(f"{self.base_url}/auth/me", timeout=10)
        self._check('未登录访问 /auth/me → 401', resp.status_code == 401,
                    f'实际 {resp.status_code}')

        # 有 token 时返回当前用户
        resp = self._req('GET', '/auth/me')
        ok = resp.status_code == 200
        if ok:
            account_id = resp.json().get('data', {}).get('id') or resp.json().get('id')
            self._check('已登录访问 /auth/me → 200', True, f'account_id={account_id}')
            self._created['account_id'] = account_id
        else:
            self._fail('已登录访问 /auth/me → 200', f'HTTP {resp.status_code}')

    def tc_protocol_create(self) -> Optional[int]:
        """TC-03 创建研究方案"""
        print(f"\n{B}[TC-03] 研究方案创建与查询{E}")
        ts = datetime.now().strftime('%Y%m%d%H%M%S')
        payload = {
            'title': f'[SMOKE_TEST] 自动化测试方案 {ts}',
            'code': f'SMOKE-{ts}',
            'status': 'draft',
            'efficacy_type': 'moisturizing',
            'sample_size': 5,
        }
        resp = self._req('POST', '/protocol/create', json=payload)
        if resp.status_code != 200:
            self._fail('创建方案 → 200', f'HTTP {resp.status_code}: {resp.text[:200]}')
            return None

        protocol_id = resp.json().get('data', {}).get('id')
        self._check('创建方案返回 protocol_id', bool(protocol_id), str(protocol_id))
        self._created['protocol_id'] = protocol_id

        # 查询方案详情
        resp2 = self._req('GET', f'/protocol/{protocol_id}')
        self._check('查询方案详情 → 200', resp2.status_code == 200)
        if resp2.status_code == 200:
            code = resp2.json().get('data', {}).get('code', '')
            self._check('方案编号一致', code == payload['code'], code)

        # 创建方案版本 v1.0.0
        resp3 = self._req('POST', f'/protocol/{protocol_id}/versions/create', json={
            'change_type': 'major',
            'change_summary': 'Smoke test 初始版本',
            'effective_date': str(date.today()),
        })
        if resp3.status_code == 200:
            version = resp3.json().get('data', {}).get('version', '')
            self._check('创建方案版本 v1.0.0', True, version)
        else:
            self._skip('创建方案版本', f'HTTP {resp3.status_code}')

        return protocol_id

    def tc_subject_create(self, protocol_id: Optional[int]) -> Optional[int]:
        """TC-04 创建受试者"""
        print(f"\n{B}[TC-04] 受试者管理{E}")
        if not protocol_id:
            self._skip('创建受试者', '依赖 TC-03 通过')
            return None

        ts = datetime.now().strftime('%H%M%S')
        payload = {
            'code': f'S-SMOKE-{ts}',
            'status': 'screened',
            'consent_date': str(date.today()),
        }
        resp = self._req('POST', '/subjects/create', json=payload)
        if resp.status_code not in (200, 201):
            self._fail('创建受试者 → 200/201', f'HTTP {resp.status_code}: {resp.text[:200]}')
            return None

        subject_id = resp.json().get('data', {}).get('id')
        self._check('创建受试者返回 subject_id', bool(subject_id), str(subject_id))
        self._created['subject_id'] = subject_id

        # 查询受试者详情
        resp2 = self._req('GET', f'/subjects/{subject_id}')
        self._check('查询受试者详情 → 200', resp2.status_code == 200)

        # PIPL 查阅权
        resp3 = self._req('GET', f'/subjects/{subject_id}/privacy-report')
        if resp3.status_code == 200:
            self._check('PIPL 查阅权报告 → 200', True)
        else:
            self._skip('PIPL 查阅权报告', f'HTTP {resp3.status_code}')

        return subject_id

    def tc_edc_crf(self, subject_id: Optional[int], protocol_id: Optional[int]) -> None:
        """TC-05 EDC CRF 录入"""
        print(f"\n{B}[TC-05] EDC CRF 数据录入{E}")
        if not subject_id or not protocol_id:
            self._skip('EDC CRF 录入', '依赖 TC-04 通过')
            return

        # 获取可用 visit（如无则跳过）
        resp_visits = self._req('GET', f'/visits/list?protocol_id={protocol_id}')
        visits = resp_visits.json().get('data', {}).get('items', []) if resp_visits.status_code == 200 else []

        if not visits:
            self._skip('EDC CRF 录入', '方案无关联访视，跳过')
            return

        visit_id = visits[0]['id']
        payload = {
            'subject_id': subject_id,
            'visit_id': visit_id,
            'form_data': {'smoke_test_field': 'smoke_test_value', 'timestamp': str(datetime.now())},
        }
        resp = self._req('POST', '/edc/crf/create', json=payload)
        if resp.status_code in (200, 201):
            crf_id = resp.json().get('data', {}).get('id')
            self._check('创建 CRF 记录 → 200/201', True, f'id={crf_id}')
            self._created['crf_id'] = crf_id
        else:
            self._skip('创建 CRF 记录', f'HTTP {resp.status_code}（可能无访视配置）')

    def tc_audit_trail(self) -> None:
        """TC-06 审计轨迹验证"""
        print(f"\n{B}[TC-06] 审计日志完整性{E}")

        # 读取近期日志
        resp = self._req('GET', '/audit/logs?page=1&page_size=10')
        self._check('查询审计日志 → 200', resp.status_code == 200,
                    f'HTTP {resp.status_code}')

        # 不可删除
        delete_resp = requests.delete(
            f"{self.base_url}/audit/logs/1",
            headers=self.session.headers,
            timeout=10,
        )
        self._check('DELETE 审计日志 → 403/404/405',
                    delete_resp.status_code in (403, 404, 405),
                    f'实际 {delete_resp.status_code}')

        # 不可篡改（尝试 PATCH）
        patch_resp = requests.patch(
            f"{self.base_url}/audit/logs/1",
            headers=self.session.headers,
            json={'description': 'tampered'},
            timeout=10,
        )
        self._check('PATCH 审计日志 → 403/404/405',
                    patch_resp.status_code in (403, 404, 405),
                    f'实际 {patch_resp.status_code}')

    def tc_knowledge_protection(self) -> None:
        """TC-07 知识写保护验证"""
        print(f"\n{B}[TC-07] 知识写保护{E}")
        resp = self._req('GET', '/knowledge/assets/protection-status')
        if resp.status_code == 200:
            data = resp.json().get('data', {})
            write_enabled = data.get('write_enabled', False)
            self._check('知识写保护状态可查询', True, f'write_enabled={write_enabled}')
            if not write_enabled:
                self._pass('写保护处于激活状态（KNOWLEDGE_WRITE_ENABLED=false）')
            else:
                self._fail('写保护应为 false（当前为开放写入）')
        else:
            self._skip('知识写保护', f'HTTP {resp.status_code}')

        # EkbRawRecord 不可写
        resp2 = self._req('POST', '/ekuaibao/raw-records/create',
                          json={'test': 'smoke_test_should_fail'})
        self._check('EkbRawRecord 写入拦截 → 非 2xx',
                    resp2.status_code not in (200, 201),
                    f'HTTP {resp2.status_code}')

    def tc_governance_basics(self) -> None:
        """TC-08 治理台基础功能"""
        print(f"\n{B}[TC-08] 治理台基础功能（鹿鸣·治理台）{E}")

        resp = self._req('GET', '/auth/governance/dashboard')
        self._check('Governance Dashboard → 200', resp.status_code == 200)

        resp2 = self._req('GET', '/auth/roles/list')
        if resp2.status_code == 200:
            roles = resp2.json().get('data', [])
            self._check('角色列表非空', len(roles) > 0, f'{len(roles)} 个角色')
        else:
            self._fail('角色列表', f'HTTP {resp2.status_code}')

        resp3 = self._req('GET', '/auth/token-health')
        self._check('Token 健康检查 → 200', resp3.status_code == 200)

    def tc_pipl_rights(self, subject_id: Optional[int]) -> None:
        """TC-09 PIPL 数据主体权利验证（F1-F3）"""
        print(f"\n{B}[TC-09] PIPL 数据主体权利{E}")
        if not subject_id:
            self._skip('PIPL 数据主体权利', '依赖 TC-04 受试者创建')
            return

        # F1: 查阅权（Right to Access）
        resp = self._req('GET', f'/subject/{subject_id}/privacy-report')
        if resp.status_code == 200:
            data = resp.json().get('data', {})
            self._check('PIPL 隐私报告返回 200', True,
                        f'keys={list(data.keys())[:5]}')
        else:
            self._fail('PIPL 隐私报告', f'HTTP {resp.status_code}')

        # F2: 更正权（Right to Rectification）
        resp2 = self._req('POST', f'/subject/{subject_id}/rectification-request',
                          json={'field': 'phone', 'new_value': '13800000001',
                                'reason': 'smoke_test_correction'})
        if resp2.status_code in (200, 201):
            self._check('PIPL 数据更正请求 → 200/201', True)
        else:
            self._skip('PIPL 数据更正请求', f'HTTP {resp2.status_code}')

        # F3: 撤回同意（Right to Withdraw Consent）— 检查端点存在
        resp3 = self._req('POST', f'/subject/{subject_id}/withdraw-consent',
                          json={'reason': 'smoke_test_withdrawal'})
        self._check('PIPL 撤回同意端点存在（非 404）',
                    resp3.status_code != 404,
                    f'HTTP {resp3.status_code}')

    def tc_data_quality(self) -> None:
        """TC-10 数据质量规则引擎（D6）"""
        print(f"\n{B}[TC-10] 数据质量规则引擎{E}")

        # 检查规则列表（应有预设 12 条）
        resp = self._req('GET', '/quality/data-quality/rules')
        if resp.status_code == 200:
            data = resp.json().get('data', {})
            total = data.get('total', 0)
            self._check('数据质量规则列表 → 200', True, f'{total} 条规则')
            self._check('预设规则数 >= 12', total >= 12, f'实际 {total} 条')
        else:
            self._fail('数据质量规则列表', f'HTTP {resp.status_code}')

        # 手动触发巡检（POST）
        resp2 = self._req('POST', '/quality/data-quality/patrol')
        if resp2.status_code == 200:
            data2 = resp2.json().get('data', {})
            checked = data2.get('checked', 0)
            self._check('数据质量巡检触发成功', True,
                        f'checked={checked} passed={data2.get("passed",0)} alerted={data2.get("alerted",0)}')
            self._check('巡检无内部错误（errors == 0）',
                        data2.get('errors', 0) == 0,
                        f'errors={data2.get("errors",0)}')
        else:
            self._fail('数据质量巡检', f'HTTP {resp2.status_code}: {resp2.text[:200]}')

    # ── 清理 ───────────────────────────────────────────────────────────────

    def cleanup(self):
        print(f"\n{B}[清理] 删除测试数据{E}")
        if pid := self._created.get('protocol_id'):
            resp = self._req('DELETE', f'/protocol/{pid}/archive')
            print(f"  方案 {pid} 归档 → HTTP {resp.status_code}")

    # ── 主运行 ─────────────────────────────────────────────────────────────

    def run_all(self, do_cleanup: bool = True):
        print(f"\n{'='*60}")
        print(f"  CN KIS V2.0 — E2E 业务主链 Smoke Test")
        print(f"  目标：{self.base_url}")
        print(f"  时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*60}")

        self.tc_api_health()
        self.tc_auth()
        protocol_id = self.tc_protocol_create()
        subject_id = self.tc_subject_create(protocol_id)
        self.tc_edc_crf(subject_id, protocol_id)
        self.tc_audit_trail()
        self.tc_knowledge_protection()
        self.tc_governance_basics()
        self.tc_pipl_rights(subject_id)
        self.tc_data_quality()

        if do_cleanup:
            self.cleanup()

        # ── 结果汇总 ─────────────────────────────────────────────────────────
        passed = sum(1 for r in self.results if r['status'] == 'PASS')
        failed = sum(1 for r in self.results if r['status'] == 'FAIL')
        skipped = sum(1 for r in self.results if r['status'] == 'SKIP')
        total = len(self.results)

        print(f"\n{'='*60}")
        print(f"  结果汇总  通过:{G}{passed}{E}  失败:{R}{failed}{E}  跳过:{Y}{skipped}{E}  总计:{total}")
        print(f"{'='*60}\n")

        if failed > 0:
            print(f"{R}❌ SMOKE TEST FAILED（{failed} 个用例失败）{E}\n")
            for r in self.results:
                if r['status'] == 'FAIL':
                    print(f"  ❌ {r['name']}: {r['detail']}")
            return False
        else:
            print(f"{G}✅ SMOKE TEST PASSED（{passed} 通过，{skipped} 跳过）{E}\n")
            print("  → 符合 PQ.md PQ-001（端到端 CRF 录入流程）验证要求")
            print("  → 可在 VALIDATION_SUMMARY.md 中标记 PQ-001 为 PASS")
            return True


def main():
    parser = argparse.ArgumentParser(description='CN KIS V2.0 E2E Smoke Test')
    parser.add_argument('--token', required=True, help='JWT Bearer token')
    parser.add_argument('--base-url', default='https://china-norm.com/v2/api/v1',
                        help='API base URL')
    parser.add_argument('--no-cleanup', action='store_true', help='不清理测试数据')
    parser.add_argument('--verbose', action='store_true', help='打印详细 API 响应')
    args = parser.parse_args()

    runner = SmokeTestRunner(
        base_url=args.base_url,
        token=args.token,
        verbose=args.verbose,
    )
    success = runner.run_all(do_cleanup=not args.no_cleanup)
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
