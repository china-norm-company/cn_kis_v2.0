#!/usr/bin/env python3
"""
邮件驱动客户价值创造体系 — 大模型分析结果比对评测

方法：
1. 取 15 封真实/业务相关邮件（含完整 subject + 可用 body）
2. 系统当前分类结果（基于关键词规则 _classify_signal_type）
3. 用 Kimi (moonshot-v1-32k) 做独立直接分析（零 prompt 工程差异）
4. 用 ARK Doubao 做第三方参考分析
5. 输出逐封比对报告 + 汇总一致性得分

运行：
  cd backend && USE_SQLITE=1 python3 ../scripts/eval_mail_classification.py
"""
import os
import sys
import json
import time
from typing import Optional

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')
os.environ['USE_SQLITE'] = '1'
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import django; django.setup()

from django.conf import settings
from apps.secretary.mail_signal_ingest import _classify_signal_type
from apps.secretary.mail_signal_task_service import suggest_task_keys

# ── 评测邮件集（真实业务场景 + seed 数据，共 15 封）──────────────────────────
EVAL_EMAILS = [
    # === 真实飞书邮件（标题 + 业务推断正文）===
    {
        "id": "real-001",
        "source": "飞书真实邮件",
        "subject": "您已被邀请加入 C25005094_头皮精华产品结合头皮护理（头皮护理设备及头皮护理产品）的临床防脱功效研究",
        "body": "您已被邀请加入一个新的临床研究项目：C25005094。该项目研究头皮精华产品结合头皮护理设备与产品的临床防脱功效。项目负责人：马蓓丽。请在系统中确认参与。",
        "sender_email": "noreply@china-norm.com",
        "ground_truth_note": "项目参与邀请 → 内部项目通知，非外部客户邮件"
    },
    {
        "id": "real-002",
        "source": "飞书真实邮件",
        "subject": "Re: Audit China Norm /Chanel - Agenda Inquiry",
        "body": "Dear Team, We would like to schedule an audit visit to China Norm for Chanel. Could you please share your availability for the coming weeks? We need to review the testing procedures and compliance documentation for the new product line.",
        "sender_email": "audit@chanel-external.com",
        "ground_truth_note": "外部审计询问 → 合规审查类外部邮件"
    },
    {
        "id": "real-003",
        "source": "飞书真实邮件",
        "subject": "C26005025-岗位职责表",
        "body": "附件是C26005025-岗位职责表，项目执行时间为3/16-3/21，请相关人员按照职责表安排执行工作，如有问题及时反馈。项目地点：上海市静安区幺+XX路。联系电话：15216781503。",
        "sender_email": "pm@china-norm.com",
        "ground_truth_note": "项目内部执行通知 → 内部项目管理"
    },
    {
        "id": "real-004",
        "source": "飞书真实邮件",
        "subject": "2602运营中心月度绩效打分-需确认",
        "body": "各位同仁，2026年2月份运营中心月度绩效考核已完成初步打分，请各部门负责人于本周五前登录系统确认本部门绩效评分。如有异议请及时反馈给HR。绩效评分影响本月奖金发放。",
        "sender_email": "hr@china-norm.com",
        "ground_truth_note": "内部HR管理 → 内部行政邮件"
    },
    {
        "id": "real-005",
        "source": "飞书真实邮件",
        "subject": "M26076025_24h高光临床测试邀请",
        "body": "您已被邀请参与M26076025高光产品24小时临床测试项目。本次测试需要受试者配合完成24小时高光产品的肤感评价和功效测试。报酬：200元/人。测试地点：上海市研发中心。",
        "sender_email": "clinical@china-norm.com",
        "ground_truth_note": "内部临床测试招募 → 内部项目通知"
    },
    # === seed 数据（高质量完整邮件）===
    {
        "id": "seed-001",
        "source": "seed数据",
        "subject": "新品防晒霜SPF50+功效评价询价",
        "body": "您好，我们计划今年Q3上市一款新品防晒霜，需要做SPF、PA测试和安全性评估，请问贵司报价？我们希望在2个月内完成全部测试，请回复具体费用和周期安排。",
        "sender_email": "chen.mei@testclient.com",
        "ground_truth_note": "典型询价 → inquiry"
    },
    {
        "id": "seed-002",
        "source": "seed数据",
        "subject": "精华液功效测试需求",
        "body": "我们有款抗老精华新品，需要功效评价测试，包括保湿度、弹力改善、皱纹改善等指标。请报价及交付周期。产品上市时间紧，望尽快回复。",
        "sender_email": "wang.zhi@client2.com",
        "ground_truth_note": "典型询价 → inquiry"
    },
    {
        "id": "seed-003",
        "source": "seed数据",
        "subject": "PROTO-E2E-001 中期阶段报告确认",
        "body": "中期报告已收到，请按协议要求确认进度，补充资料已附上，项目方案按计划推进，请查收附件并确认下一步安排。如有疑问请联系项目负责人。",
        "sender_email": "li.yan@testclient.com",
        "ground_truth_note": "项目执行沟通 → project_followup"
    },
    {
        "id": "seed-004",
        "source": "seed数据",
        "subject": "竞品实验室对比和竞争压力",
        "body": "我们了解到另一家实验室竞品更便宜，数据更有说服力，希望贵司重新给出有竞争力的方案，否则我们考虑换合作方。请在三天内给出回复。",
        "sender_email": "liu.zong@competitor.com",
        "ground_truth_note": "竞品压力 → competitor_pressure"
    },
    {
        "id": "seed-005",
        "source": "seed数据",
        "subject": "项目延误投诉和赔偿要求",
        "body": "你们的项目严重延误，我们非常不满，要求立即给出赔偿方案，否则将投诉到行业协会。这是第三次延误，已经严重影响我们的产品上市计划。",
        "sender_email": "sun.client@external.com",
        "ground_truth_note": "强烈投诉 → complaint"
    },
    # === 额外真实业务场景邮件（高质量构造，基于真实 china-norm 业务）===
    {
        "id": "biz-001",
        "source": "业务构造",
        "subject": "关于贵司防晒测试资质认证问题",
        "body": "您好，我们是某化妆品企业市场部，目前有一款防晒产品计划进入欧洲市场，需要了解贵司是否具备COLIPA认证的SPF测试资质，以及能否出具符合欧盟要求的测试报告。请提供相关资质证明和报价。",
        "sender_email": "inquiry@beautyco.eu",
        "ground_truth_note": "资质询问+询价 → inquiry"
    },
    {
        "id": "biz-002",
        "source": "业务构造",
        "subject": "C26005033 项目方案修改确认",
        "body": "您好，针对C26005033项目，我们在审阅了中期报告后，需要对测试方案做如下调整：1）增加皮肤水分TEWL测量 2）延长测试周期至8周 3）受试者数量增加至60人。请确认调整可行性及费用变更。",
        "sender_email": "pm@luxurybeauty.com",
        "ground_truth_note": "项目方案变更沟通 → project_followup"
    },
    {
        "id": "biz-003",
        "source": "业务构造",
        "subject": "竞品数据对比 - 我们的产品测试结果为何不如竞品",
        "body": "贵司最近为我司完成的保湿效果测试报告显示，我们产品的24h保湿率为68%，但市面上竞品X品牌声称保湿率达到85%并有第三方检测数据支持。请解释这个差距，并建议我们如何调整产品配方或测试方案以获得更有竞争力的数据。",
        "sender_email": "rd@cosme-company.com",
        "ground_truth_note": "竞品数据对比压力 → competitor_pressure"
    },
    {
        "id": "biz-004",
        "source": "业务构造",
        "subject": "紧急：C25006789测试报告数据存疑，要求重新检验",
        "body": "我司法务部门已介入，就贵司出具的C25006789测试报告提出异议：报告中受试者肤质分布与我司提供的样品说明不符，部分数据疑似造假。如48小时内不给出合理解释，我司将向相关监管机构投诉，并保留追究法律责任的权利。",
        "sender_email": "legal@brandowner.com",
        "ground_truth_note": "法律威胁/严重投诉 → complaint"
    },
    {
        "id": "biz-005",
        "source": "业务构造",
        "subject": "Re: 防晒新品测试合作意向 - 请提供更多信息",
        "body": "感谢您的回复。我们对贵司的人体功效评价服务非常感兴趣。请进一步提供：1）完整的SPF测试流程说明 2）历史客户参考案例（尤其是欧系品牌）3）测试数据保密协议模板。我们目前在评估3家服务商，希望尽快做出决定。",
        "sender_email": "procurement@skincarebrand.com",
        "ground_truth_note": "深度询价/供应商评估 → inquiry"
    },
]


def classify_with_system(subject: str, body: str) -> dict:
    """用系统当前的关键词规则分类"""
    signal_type = _classify_signal_type(subject, body)
    suggested = suggest_task_keys(signal_type)
    return {
        "signal_type": signal_type,
        "suggested_tasks": suggested,
        "method": "rule-based keywords"
    }


def classify_with_kimi(subject: str, body: str, sender: str = "") -> dict:
    """用 Kimi moonshot-v1-32k 直接分析"""
    import httpx
    
    api_key = settings.KIMI_API_KEY
    if not api_key:
        return {"error": "KIMI_API_KEY not set", "signal_type": None}
    
    prompt = f"""你是一名医美功效测试实验室（China Norm）的邮件分析师。
请分析以下邮件，输出 JSON 格式的分析结果。

邮件信息：
- 发件人：{sender or '未知'}
- 主题：{subject}
- 正文：{body}

请输出以下 JSON 结构（不要加任何解释，直接输出 JSON）：
{{
  "signal_type": "inquiry|project_followup|competitor_pressure|complaint|relationship_signal|unknown",
  "is_external": true/false,
  "urgency": "high|medium|low",
  "key_intent": "一句话描述邮件核心意图",
  "suggested_actions": ["建议行动1", "建议行动2"],
  "business_value": "high|medium|low",
  "reasoning": "简要说明分类理由（2句话内）"
}}

signal_type 定义：
- inquiry：询价、合作意向、服务了解
- project_followup：在执行项目的进度沟通、方案修改、资料交换
- competitor_pressure：提及竞品、价格比较、威胁换供应商
- complaint：投诉、强烈不满、法律威胁、赔偿要求
- relationship_signal：关系维护、介绍、拜访、非业务寒暄
- unknown：无法明确归类"""

    try:
        resp = httpx.post(
            f"{settings.KIMI_API_BASE}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": settings.KIMI_DEFAULT_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 500,
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"].strip()
        # 提取 JSON
        import re
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
            result["method"] = "kimi-moonshot-v1-32k"
            return result
        return {"error": f"JSON parse failed: {content[:200]}", "signal_type": None}
    except Exception as e:
        return {"error": str(e), "signal_type": None}


def classify_with_ark(subject: str, body: str, sender: str = "") -> dict:
    """用火山方舟 Doubao 模型分析"""
    import httpx
    
    api_key = settings.ARK_API_KEY
    model = settings.ARK_DEFAULT_MODEL
    
    if not api_key or not model:
        return {"error": "ARK_API_KEY or ARK_DEFAULT_MODEL not set", "signal_type": None}
    
    prompt = f"""你是一名医美功效测试实验室的邮件分析助手。
请分析以下邮件，直接输出 JSON，不加任何额外解释：

发件人：{sender or '未知'}
主题：{subject}
正文：{body}

输出格式（严格 JSON）：
{{
  "signal_type": "inquiry|project_followup|competitor_pressure|complaint|relationship_signal|unknown",
  "is_external": true/false,
  "urgency": "high|medium|low",
  "key_intent": "邮件核心意图（一句话）",
  "suggested_actions": ["行动1", "行动2"],
  "business_value": "high|medium|low",
  "reasoning": "分类理由（2句话内）"
}}"""

    try:
        resp = httpx.post(
            f"{settings.ARK_API_BASE}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 500,
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"].strip()
        import re
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
            result["method"] = f"ark-doubao-{model[:20]}"
            return result
        return {"error": f"JSON parse failed: {content[:200]}", "signal_type": None}
    except Exception as e:
        return {"error": str(e), "signal_type": None}


def compare_results(system: dict, kimi: dict, ark: dict, ground_truth_note: str) -> dict:
    """比对三方结果"""
    sys_type = system.get("signal_type", "unknown")
    kimi_type = kimi.get("signal_type", "unknown") if not kimi.get("error") else "ERROR"
    ark_type = ark.get("signal_type", "unknown") if not ark.get("error") else "ERROR"
    
    system_vs_kimi = (sys_type == kimi_type) if kimi_type != "ERROR" else None
    system_vs_ark = (sys_type == ark_type) if ark_type != "ERROR" else None
    kimi_vs_ark = (kimi_type == ark_type) if (kimi_type != "ERROR" and ark_type != "ERROR") else None
    
    return {
        "system_type": sys_type,
        "kimi_type": kimi_type,
        "ark_type": ark_type,
        "system_vs_kimi": system_vs_kimi,
        "system_vs_ark": system_vs_ark,
        "kimi_vs_ark": kimi_vs_ark,
        "all_agree": system_vs_kimi and system_vs_ark and kimi_vs_ark,
        "ground_truth_note": ground_truth_note,
    }


def main():
    print("=" * 70)
    print("  邮件驱动系统 × Kimi × ARK 三方分析结果比对评测")
    print(f"  邮件总数: {len(EVAL_EMAILS)}")
    print(f"  系统方法: 关键词规则 (_classify_signal_type)")
    print(f"  参考方法1: Kimi {settings.KIMI_DEFAULT_MODEL}")
    print(f"  参考方法2: ARK Doubao ({settings.ARK_DEFAULT_MODEL[:30] if settings.ARK_DEFAULT_MODEL else 'NOT SET'})")
    print("=" * 70)
    
    results = []
    
    for i, email in enumerate(EVAL_EMAILS, 1):
        print(f"\n[{i:02d}/{len(EVAL_EMAILS)}] {email['id']} ({email['source']})")
        print(f"  Subject: {email['subject'][:65]}")
        print(f"  Body({len(email['body'])}c): {email['body'][:80]}...")
        
        # 系统分类
        sys_result = classify_with_system(email['subject'], email['body'])
        print(f"  系统分类: {sys_result['signal_type']} → tasks: {sys_result['suggested_tasks']}")
        
        # Kimi 分类
        time.sleep(0.5)  # rate limit
        kimi_result = classify_with_kimi(email['subject'], email['body'], email.get('sender_email', ''))
        if kimi_result.get('error'):
            print(f"  Kimi:     ERROR — {kimi_result['error'][:60]}")
        else:
            print(f"  Kimi:     {kimi_result.get('signal_type')} | urgency={kimi_result.get('urgency')} | value={kimi_result.get('business_value')}")
            print(f"            intent: {kimi_result.get('key_intent', '')[:70]}")
        
        # ARK 分类
        time.sleep(0.5)
        ark_result = classify_with_ark(email['subject'], email['body'], email.get('sender_email', ''))
        if ark_result.get('error'):
            print(f"  ARK:      ERROR — {ark_result['error'][:60]}")
        else:
            print(f"  ARK:      {ark_result.get('signal_type')} | urgency={ark_result.get('urgency')} | value={ark_result.get('business_value')}")
        
        # 比对
        comparison = compare_results(sys_result, kimi_result, ark_result, email['ground_truth_note'])
        
        agree_sys_kimi = "✅" if comparison['system_vs_kimi'] else ("⚠️" if comparison['system_vs_kimi'] is False else "❓")
        agree_sys_ark  = "✅" if comparison['system_vs_ark'] else ("⚠️" if comparison['system_vs_ark'] is False else "❓")
        agree_all      = "✅ 三方一致" if comparison['all_agree'] else "⚠️ 存在分歧"
        
        print(f"  系统 vs Kimi: {agree_sys_kimi}  系统 vs ARK: {agree_sys_ark}  {agree_all}")
        print(f"  [参考] {email['ground_truth_note']}")
        
        results.append({
            "email": email,
            "system": sys_result,
            "kimi": kimi_result,
            "ark": ark_result,
            "comparison": comparison,
        })
    
    # 汇总报告
    print("\n" + "=" * 70)
    print("  汇总报告")
    print("=" * 70)
    
    valid_results = [r for r in results if not r['kimi'].get('error') and not r['ark'].get('error')]
    
    sys_kimi_agree = sum(1 for r in valid_results if r['comparison']['system_vs_kimi'])
    sys_ark_agree  = sum(1 for r in valid_results if r['comparison']['system_vs_ark'])
    kimi_ark_agree = sum(1 for r in valid_results if r['comparison']['kimi_vs_ark'])
    all_agree      = sum(1 for r in valid_results if r['comparison']['all_agree'])
    total_valid    = len(valid_results)
    
    print(f"\n  有效比对数: {total_valid}/{len(results)}")
    print(f"  系统 vs Kimi 一致率: {sys_kimi_agree}/{total_valid} = {sys_kimi_agree/max(total_valid,1)*100:.0f}%")
    print(f"  系统 vs ARK  一致率: {sys_ark_agree}/{total_valid} = {sys_ark_agree/max(total_valid,1)*100:.0f}%")
    print(f"  Kimi vs ARK  一致率: {kimi_ark_agree}/{total_valid} = {kimi_ark_agree/max(total_valid,1)*100:.0f}%")
    print(f"  三方全部一致:        {all_agree}/{total_valid} = {all_agree/max(total_valid,1)*100:.0f}%")
    
    # 分歧详情
    diverge = [r for r in valid_results if not r['comparison']['all_agree']]
    if diverge:
        print(f"\n  存在分歧的邮件 ({len(diverge)} 封):")
        for r in diverge:
            e = r['email']
            c = r['comparison']
            print(f"    [{e['id']}] 系统:{c['system_type']} Kimi:{c['kimi_type']} ARK:{c['ark_type']}")
            print(f"      Subject: {e['subject'][:60]}")
            kimi_reason = r['kimi'].get('reasoning', '')
            if kimi_reason:
                print(f"      Kimi说: {kimi_reason[:100]}")
    
    # 评测结论
    consistency = sys_kimi_agree / max(total_valid, 1)
    print(f"\n  评测结论:")
    if consistency >= 0.85:
        print(f"  ✅ 系统分类与 Kimi 大模型高度一致（{consistency*100:.0f}%），当前规则准确率优秀")
    elif consistency >= 0.70:
        print(f"  ⚠️  系统分类与 Kimi 大模型基本一致（{consistency*100:.0f}%），部分边界场景需优化")
    else:
        print(f"  ❌ 系统分类与 Kimi 大模型一致率偏低（{consistency*100:.0f}%），建议引入 AI 辅助分类")
    
    # 保存结果
    output_path = os.path.join(os.path.dirname(__file__), '../docs/eval_mail_classification_result.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        # Make results JSON-serializable
        serializable = []
        for r in results:
            serializable.append({
                "email_id": r['email']['id'],
                "email_source": r['email']['source'],
                "subject": r['email']['subject'],
                "system_type": r['system']['signal_type'],
                "kimi_type": r['kimi'].get('signal_type') if not r['kimi'].get('error') else 'ERROR',
                "kimi_intent": r['kimi'].get('key_intent', ''),
                "kimi_reasoning": r['kimi'].get('reasoning', ''),
                "ark_type": r['ark'].get('signal_type') if not r['ark'].get('error') else 'ERROR',
                "comparison": r['comparison'],
                "ground_truth_note": r['email']['ground_truth_note'],
            })
        json.dump(serializable, f, ensure_ascii=False, indent=2)
    print(f"\n  详细结果已保存至: {output_path}")
    print("=" * 70)


if __name__ == '__main__':
    main()
