import os, httpx, json, time, re, sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')
os.environ['USE_SQLITE'] = '1'
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
import django; django.setup()

from django.conf import settings
from apps.secretary.mail_signal_ingest import _classify_signal_type
from apps.secretary.mail_signal_task_service import suggest_task_keys

KIMI_KEY = settings.KIMI_API_KEY
KIMI_MODEL = settings.KIMI_DEFAULT_MODEL
ARK_KEY = settings.ARK_API_KEY
ARK_MODEL = settings.ARK_DEFAULT_MODEL

# 15 封评测邮件
EMAILS = [
    # 真实飞书邮件（subject 真实，body 为业务推断）
    ('real-001','真实飞书',
     '您已被邀请加入 C25005094_头皮精华产品结合头皮护理（头皮护理设备及头皮护理产品）的临床防脱功效研究',
     '您已被邀请参与临床防脱功效研究项目C25005094。请确认参与并查看项目详情。',
     'noreply@china-norm.com',
     '内部项目邀请'),
    ('real-002','真实飞书',
     'Re: Audit China Norm /Chanel - Agenda Inquiry',
     'Dear Team, We would like to schedule an audit visit for Chanel. Please share availability for compliance documentation review.',
     'audit@chanel-external.com',
     '外部合规审计询问'),
    ('real-003','真实飞书',
     'C26005025-岗位职责表',
     '附件是C26005025-岗位职责表，项目执行时间为3/16-3/21，请相关人员按照职责表安排执行。',
     'pm@china-norm.com',
     '内部项目执行'),
    ('real-004','真实飞书',
     '2602运营中心月度绩效打分-需确认',
     '各位同仁，2026年2月运营中心月度绩效考核完成，请各部门负责人于本周五前确认绩效评分，如有异议反馈HR。',
     'hr@china-norm.com',
     '内部HR行政'),
    ('real-005','真实飞书',
     'M26076025_24h高光临床测试邀请',
     '您已被邀请参与M26076025高光产品24小时临床测试。报酬200元，测试地点上海研发中心。',
     'clinical@china-norm.com',
     '内部临床招募'),
    # Seed 数据（高质量典型案例）
    ('seed-001','测试数据',
     '新品防晒霜SPF50+功效评价询价',
     '您好，我们计划今年Q3上市一款新品防晒霜，需要做SPF、PA测试和安全性评估，请问贵司报价？',
     'chen.mei@testclient.com',
     'inquiry'),
    ('seed-002','测试数据',
     '精华液功效测试需求',
     '我们有款抗老精华新品，需要功效评价测试，包括保湿度、弹力改善等指标，请报价及交付周期。',
     'wang.zhi@client2.com',
     'inquiry'),
    ('seed-003','测试数据',
     'PROTO-E2E-001 中期阶段报告确认',
     '中期报告已收到，请按协议要求确认进度，补充资料已附上，项目方案按计划推进，请查收附件。',
     'li.yan@testclient.com',
     'project_followup'),
    ('seed-004','测试数据',
     '竞品实验室对比和竞争压力',
     '我们了解到另一家实验室竞品更便宜，数据更有说服力，希望贵司重新给出有竞争力方案，否则考虑换合作方。',
     'liu.zong@competitor.com',
     'competitor_pressure'),
    ('seed-005','测试数据',
     '项目延误投诉和赔偿要求',
     '你们项目严重延误，我们非常不满，要求立即给出赔偿方案，否则将投诉到行业协会。',
     'sun.client@external.com',
     'complaint'),
    # 业务构造场景
    ('biz-001','业务构造',
     '关于防晒测试资质认证问题',
     '我司有防晒产品计划进入欧洲市场，需了解贵司是否具备COLIPA认证的SPF测试资质，能否出具符合欧盟要求的测试报告，请提供资质证明和报价。',
     'inquiry@beautyco.eu',
     'inquiry'),
    ('biz-002','业务构造',
     'C26005033 项目方案修改确认',
     '针对C26005033项目，中期报告后需做调整：增加皮肤水分TEWL测量，延长测试周期至8周，受试者增至60人。请确认可行性及费用变更。',
     'pm@luxurybeauty.com',
     'project_followup'),
    ('biz-003','业务构造',
     '竞品数据对比-我们测试结果为何不如竞品',
     '贵司测试报告显示我们产品保湿率68%，但竞品X声称85%并有第三方数据。请解释差距并建议如何获得更有竞争力的数据。',
     'rd@cosme-company.com',
     'competitor_pressure'),
    ('biz-004','业务构造',
     '紧急：C25006789测试报告数据存疑，要求重新检验',
     '我司法务已介入，就贵司测试报告提出异议，数据疑似存在问题。48小时内不给合理解释，将向监管机构投诉并追究法律责任。',
     'legal@brandowner.com',
     'complaint'),
    ('biz-005','业务构造',
     'Re: 防晒新品测试合作意向-请提供更多信息',
     '感谢回复，我们对贵司功效评价服务感兴趣，请提供完整SPF测试流程说明、历史客户案例及保密协议模板，目前评估3家服务商。',
     'procurement@skincarebrand.com',
     'inquiry'),
]

PROMPT = '''你是医美功效测试实验室邮件分析助手。分析以下邮件，直接输出JSON，不加任何解释：

发件人：{sender}
主题：{subject}
正文：{body}

输出格式（严格JSON）：
{{"signal_type":"inquiry|project_followup|competitor_pressure|complaint|relationship_signal|unknown","urgency":"high|medium|low","key_intent":"邮件核心意图（一句话）","business_value":"high|medium|low","reasoning":"分类理由（30字内）"}}'''


def ask_llm(api_base, api_key, model, subject, body, sender):
    prompt = PROMPT.format(sender=sender, subject=subject, body=body)
    try:
        r = httpx.post(
            f'{api_base}/chat/completions',
            headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
            json={
                'model': model,
                'messages': [{'role': 'user', 'content': prompt}],
                'temperature': 0.1,
                'max_tokens': 300,
            },
            timeout=25.0,
        )
        if r.status_code != 200:
            return None, f'HTTP {r.status_code}: {r.text[:80]}'
        content = r.json()['choices'][0]['message']['content'].strip()
        m = re.search(r'\{[^{}]+\}', content, re.DOTALL)
        if m:
            return json.loads(m.group()), None
        return None, f'no JSON: {content[:60]}'
    except Exception as e:
        return None, str(e)[:80]


results = []
print('=' * 68)
print('  邮件驱动系统 × Kimi × ARK Doubao 三方分析比对')
print(f'  Kimi: {KIMI_MODEL} | ARK: {ARK_MODEL[:30]}')
print('=' * 68)

for eid, source, subj, body, sender, ground_truth in EMAILS:
    # System rule-based
    sys_type = _classify_signal_type(subj, body)
    tasks = suggest_task_keys(sys_type)

    # Kimi
    k_res, k_err = ask_llm(settings.KIMI_API_BASE, KIMI_KEY, KIMI_MODEL, subj, body, sender)
    time.sleep(0.3)

    # ARK
    a_res, a_err = ask_llm(settings.ARK_API_BASE, ARK_KEY, ARK_MODEL, subj, body, sender)
    time.sleep(0.3)

    k_type = (k_res or {}).get('signal_type', '?') if not k_err else 'ERR'
    a_type = (a_res or {}).get('signal_type', '?') if not a_err else 'ERR'

    sk = '✅' if sys_type == k_type else '⚠️'
    sa = '✅' if sys_type == a_type else '⚠️'
    all3 = '✅ 一致' if sys_type == k_type == a_type else '⚠️ 分歧'

    print(f'\n[{eid}] {source}')
    print(f'  Subj: {subj[:65]}')
    print(f'  Sys: {sys_type:<25}  任务: {tasks}')
    if k_err:
        print(f'  Kimi: ERR — {k_err}')
    else:
        print(f'  Kimi: {k_type:<25}  urgency={k_res.get("urgency")} value={k_res.get("business_value")}')
        print(f'        意图: {k_res.get("key_intent","")[:65]}')
        print(f'        理由: {k_res.get("reasoning","")[:65]}')
    if a_err:
        print(f'  ARK:  ERR — {a_err}')
    else:
        print(f'  ARK:  {a_type:<25}  意图: {(a_res or {}).get("key_intent","")[:45]}')
    print(f'  比对: Sys=Kimi {sk}  Sys=ARK {sa}  {all3}')
    print(f'  参考: {ground_truth}')

    results.append((eid, subj, sys_type, k_type, a_type,
                    (k_res or {}).get('reasoning', ''),
                    (k_res or {}).get('key_intent', ''),
                    ground_truth))

# Summary
valid = [(s, k, a, r) for _, _, s, k, a, r, _, _ in results
         if k not in ('ERR', '?') and a not in ('ERR', '?')]
n = len(valid)
sk = sum(1 for s, k, *_ in valid if s == k)
sa = sum(1 for s, k, a, *_ in valid if s == a)
ka = sum(1 for s, k, a, *_ in valid if k == a)
all3c = sum(1 for s, k, a, *_ in valid if s == k == a)

print('\n' + '=' * 68)
print('  汇总报告')
print('=' * 68)
print(f'  有效比对: {n}/{len(results)} 封邮件')
print(f'  系统 vs Kimi  一致率: {sk}/{n} = {sk * 100 // max(n, 1)}%')
print(f'  系统 vs ARK   一致率: {sa}/{n} = {sa * 100 // max(n, 1)}%')
print(f'  Kimi vs ARK   一致率: {ka}/{n} = {ka * 100 // max(n, 1)}%')
print(f'  三方全部一致:        {all3c}/{n} = {all3c * 100 // max(n, 1)}%')

print('\n  分歧详情:')
for eid, subj, s, k, a, reason, intent, gt in results:
    if not (s == k == a) and k not in ('ERR', '?') and a not in ('ERR', '?'):
        print(f'  [{eid}]')
        print(f'    系统:{s:<22}  Kimi:{k:<22}  ARK:{a}')
        print(f'    Kimi理由: {reason[:65]}')
        print(f'    参考: {gt}')

print()
pct = sk * 100 // max(n, 1)
if pct >= 85:
    print(f'结论: ✅ 系统规则与大模型高度一致（{pct}%），当前规则准确率优秀')
elif pct >= 70:
    print(f'结论: ⚠️  系统规则基本可用（{pct}%），部分边界场景需 AI 辅助')
else:
    print(f'结论: ❌ 系统规则一致率偏低（{pct}%），建议引入 AI 辅助分类')

# Save JSON
out = []
for eid, subj, s, k, a, reason, intent, gt in results:
    out.append({
        'email_id': eid,
        'subject': subj,
        'system': s,
        'kimi': k,
        'ark': a,
        'kimi_reasoning': reason,
        'kimi_intent': intent,
        'ground_truth_note': gt,
        'system_kimi_match': s == k,
        'system_ark_match': s == a,
        'all_agree': s == k == a,
    })

output_path = os.path.join(os.path.dirname(__file__), '..', 'docs', 'eval_mail_classification_result.json')
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print(f'\n详细结果已保存: {output_path}')
print('=' * 68)
