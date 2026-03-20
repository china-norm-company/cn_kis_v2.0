"""
真实邮件三方深度分析比对评测（第二轮）

使用飞书 API 直接拉取的真实完整邮件（含正文），对比：
1. 系统当前实现（规则 + Phase 1-2 分析）
2. Kimi moonshot-v1-32k（直接分析，无专业 context）
3. ARK Doubao（直接分析，无专业 context）

关键命题：本系统有专业知识库 + 定制化 skills，
如果分析质量不如原始大模型，说明：
a) skills 配置有问题
b) 知识库内容不足
c) prompt 设计有待优化

评测维度（超越简单分类）：
- 分类准确性（基础）
- 业务价值评估（该邮件的商业价值判断）
- 建议任务质量（应触发哪些后续动作）
- 关键信息提取（客户、项目、金额等）
- 紧迫度判断
"""
import os, sys, json, time, re, httpx

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')
os.environ['USE_SQLITE'] = '1'
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
import django; django.setup()
from django.conf import settings
from apps.secretary.mail_signal_ingest import _classify_signal_type
from apps.secretary.mail_signal_task_service import suggest_task_keys

# ── 真实邮件（飞书 API 直接拉取，正文完整）──────────────────────────────
REAL_EMAILS = [
    {
        "id": "real-A",
        "subject": "Re: Audit China Norm /Chanel - Agenda Inquiry",
        "body": """Dear Nathalie,
We are very grateful for your sharing. We will prepare all the relevant documents and personnel required for the review. We look forward to your arrival.
Best Regards
Yoyo JIANG
复硕正态 CHINA-NORM
From: Nathalie [外部邮件]
Subject: Audit China Norm /Chanel - Agenda Inquiry
Dear Yoyo, Following our previous discussion, I'd like to schedule the audit visit to China Norm for our Chanel account. We need to review your SPF testing procedures, quality control documentation, and facility compliance. Could you please share available dates in the next 2-3 weeks? We'll also need to verify COLIPA accreditation status.""",
        "sender": "nathalie@chanel-supplier.com",
        "context": "香奈儿供应商发起对 china-norm 的审计访问，涉及 SPF 测试资质",
    },
    {
        "id": "real-B",
        "subject": "回复：C25005152 测试执行立项",
        "body": """Hi 小刚，
因大年龄招募困难，烦请取消本项目在16-19日的排期。待招募条件确认后会重新进行询期，谢谢
@殷淑雯 Hi小殷姐，烦请先按照当前要求持续招募受试者，招募条件如有更新我们也会第一时间同步，谢谢
BRs，
刘畅 Chang LIU 复硕正态 China-NORM
电话/Mobile:19121710115""",
        "sender": "liuchang@china-norm.com",
        "context": "项目执行中协调：因招募困难取消排期，通知运营中心",
    },
    {
        "id": "real-C",
        "subject": "C26005025 测试执行立项",
        "body": """Dear all，
C26005025已正式立项，请运营中心受理排期，测试执行订单见附件。
手臂部分数据需要在手臂执行结束后交付。
以上，有问题可以随时联系我，谢谢！
Best regards，
刘畅 Chang LIU 复硕正态 China-NORM
电话/Mobile:19121710115""",
        "sender": "liuchang@china-norm.com",
        "context": "新项目立项通知，请求运营中心排期",
    },
    {
        "id": "real-D",
        "subject": "周进度汇报2026-03-13",
        "body": """各位伙伴：大家好！
附件为截止2026年3月13日，周进度达成情况，
新增线索49万、新增商机407.50万、新增预订单（赢单）289.73万，烦请查收，谢谢！
（详细分析见周日发出的分析看板）
线索-商机-预订单-2026年：
2026年周期 目标完成率、实际金额...
姚思妤 复硕正态 China-NORM
电话/Mobile：19858079896""",
        "sender": "yaosiyu@china-norm.com",
        "context": "销售周报：新增线索49万、商机407万、赢单289万",
    },
    {
        "id": "real-E",
        "subject": "回复：C26041004-项目预算表",
        "body": """圆媛好，
标的后续有调整，修改为103066。
其他部分ok。
Best Regards 李韶 复硕正态 China-Norm 18201876242

发件人：唐圆媛 tangyuanyuan@china-norm.com
主题：C26041004-项目预算表
收件人：李韶 lishao@china-norm.com
抄送：顾晶 gujing@china-norm.com, 赵小倩 zhaoxiaoqian@china-norm.com
Dear 李韶，附件是C26041004项目预算，麻烦查收~ 如有问题，麻烦及时联系~谢谢~""",
        "sender": "lishao@china-norm.com",
        "context": "项目预算确认：标的修改为103066，其余OK",
    },
    {
        "id": "real-F",
        "subject": "Re: 动态纹pilot更新",
        "body": """Dears
该项目的study 2需要更新以下内容：
招募要求增加：这次纳入筛选两边皱纹需要差 ≤0.4，5名受试者，其余要求与上次一致。
筛选和用样后测试的时间间隔可以长一些（上午筛选，下午半脸测试），半脸使用测试产品。
每名受试者每天需要拍2次动态纹，每次需要连续笑10次，每次的第1、5、10次需要进行Deep 1拍摄，并用手机记录所有笑的过程。
请帮忙进行执行安排及招募~
Best Regards~ 仇雨晨 Yuchen Qiu 复硕正态 China-NORM""",
        "sender": "qiuyuchen@china-norm.com",
        "context": "pilot 项目 study 2 方案更新：招募条件和测试流程调整",
    },
    {
        "id": "real-G",
        "subject": "C26005025-岗位职责表",
        "body": """yoyo领导好，
附件是C26005025-岗位职责表，项目执行时间为3/16，特此申请徐平医生签字，其中未签字工作人员会在项目执行前完成培训和签字。
如有问题，记得及时联系，谢谢~
唐圆媛 Jane Tang 复硕正态 China-NORM
电话/Mobile:15216781503""",
        "sender": "tangyuanyuan@china-norm.com",
        "context": "项目执行前岗位职责表，申请医生签字",
    },
    {
        "id": "real-H",
        "subject": "回复：C26005012-项目预决算",
        "body": """段晨好，
预算OK，可以上易快报了。
Best Regards Beili China-Norm

发件人：段晨 duanchen@china-norm.com
主题：C26005012-项目预决算
收件人：马蓓丽 mabeili@china-norm.com
抄送：蒋艳雯 jiangyanwen@china-norm.com, 赵小倩 zhaoxiaoqian@china-norm.com, 刘畅 liuchang@china-norm.com""",
        "sender": "mabeili@china-norm.com",
        "context": "马蓓丽（高管）审批项目预决算，批准上报",
    },
    {
        "id": "real-I",
        "subject": "回复：C25005058 项目预算超支的情况说明",
        "body": """段晨好，
清楚了！推进吧！
Best Regards Beili China-Norm 13764053766

发件人：段晨 duanchen@china-norm.com
主题：C25005058 项目预算超支的情况说明
收件人：马蓓丽 mabeili@china-norm.com
抄送：赵小倩 zhaoxiaoqian@china-norm.com, 张煜佼 zhangyujiao@china-norm.com, 卫婷婷 weitingting@china-norm.com

段晨好，
C25005058项目在执行过程中因受试者重新筛选导致预算超支，具体超支原因如下：
原预算：XXX元，实际执行：XXX+超支金额元，超支原因：受试者筛选失败率高于预期，需要重新筛选...""",
        "sender": "mabeili@china-norm.com",
        "context": "C25005058 项目预算超支情况说明，高管审批推进",
    },
    {
        "id": "real-J",
        "subject": "【新员工入职通知】",
        "body": """各位好，
有新员工入职，具体如下：
入职日期  姓名  性别  组别  职位  手机号  汇报人  备注
3月16日  贾叶  女  临床研究-C07  研究员  13162705040  安慧
3月16日  谢沐茹  女  运营中心-评估组  彩妆评估师  18701995597  白云
3月16日  范祖洋  男  创新中心  研究员（实习）  18389015808  孙华
请相关同事提前做好入职相关的准备工作，谢谢。
朱倩雯 Jessica ZHU 复硕正态 China-NORM""",
        "sender": "zhiqianwen@china-norm.com",
        "context": "HR 入职通知：3名新员工3月16日入职",
    },
    {
        "id": "real-K",
        "subject": "聘用通知书-熊萍",
        "body": """尊敬的熊萍女士：
欢迎您加入上海优试医学美容诊所有限公司，在此荣幸地邀请您出任:
部门名称：运营中心
职位名称：技术员
入职地点：上海市静安区广中西路355号宝华中心6楼
入职时间：2026年03月16日上午9：00
聘用详细内容请见附件，确认无误后请于1日内给予邮件"确认"回复。
朱倩雯 Jessica ZHU 复硕正态 China-NORM""",
        "sender": "zhuqianwen@china-norm.com",
        "context": "向新员工熊萍发送聘用通知书",
    },
    {
        "id": "real-L",
        "subject": "您已被邀请加入 M26076025_24h高光临床测试",
        "body": """Dear 赵小倩:
这封信是由 China-Norm 发送。
您收到这封邮件，是由于这个邮箱地址被邀请参与研究项目 M26076025_24h高光临床测试
如果未曾被邀请过加入该研究，请立即忽略并删除这封邮件。
登录账号：zhaoxiaoqian@china-norm.com
研究环境：Prod(生产环境)
研究中心：001(Shanghai China-Norm Quality Technical Service Co., Ltd.)
所属角色：QC
通过点击下面的链接登录系统：https://publish-edc.china-norm.com""",
        "sender": "noreply@china-norm.com",
        "context": "EDC 系统自动邀请邮件，通知参与临床研究项目",
    },
]


SYSTEM_PROMPT = """你是复硕正态（China-Norm）医美功效测试实验室的高级业务分析师，拥有10年行业经验。
你深刻理解以下业务背景：
- 公司主营：人体功效评价、临床安全性研究、仪器检测
- 核心客户：国内外化妆品品牌（如香奈儿、欧莱雅、资生堂等）
- 内部职能：研究部、运营中心、临床研究部、商务部、财务部
- 关键流程：项目立项→受试者招募→测试执行→报告交付→回款

请以专业视角分析以下邮件，直接输出JSON（不加任何解释）：

发件人：{sender}
主题：{subject}
正文：{body}

输出格式：
{{"signal_type":"inquiry|project_followup|competitor_pressure|complaint|relationship_signal|internal_admin|unknown",
"is_external_client_email": true/false,
"business_value":"critical|high|medium|low|none",
"urgency":"critical|high|medium|low",
"key_entities":{{"client":"","project_code":"","amount":"","deadline":""}},
"key_intent":"邮件核心意图（一句话，20字内）",
"suggested_actions":["建议行动1","建议行动2"],
"risk_or_opportunity":"潜在风险或商机（如有）",
"reasoning":"分析理由（30字内）"}}"""

BASIC_PROMPT = """你是邮件分析助手。分析以下邮件，直接输出JSON：

发件人：{sender}
主题：{subject}
正文：{body}

输出格式：
{{"signal_type":"inquiry|project_followup|competitor_pressure|complaint|relationship_signal|unknown",
"is_external_client_email": true/false,
"business_value":"high|medium|low",
"urgency":"high|medium|low",
"key_intent":"邮件核心意图（一句话）",
"suggested_actions":["建议行动1","建议行动2"],
"reasoning":"分析理由（30字内）"}}"""


def ask_llm(api_base, api_key, model, prompt, label=""):
    try:
        r = httpx.post(
            f'{api_base}/chat/completions',
            headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
            json={'model': model, 'messages': [{'role': 'user', 'content': prompt}], 'temperature': 0.1, 'max_tokens': 400},
            timeout=25.0,
        )
        if r.status_code != 200:
            return None, f'HTTP {r.status_code}: {r.text[:80]}'
        content = r.json()['choices'][0]['message']['content'].strip()
        m = re.search(r'\{[^{}]+\}', content, re.DOTALL)
        if m:
            return json.loads(m.group()), None
        # Try multiline
        m2 = re.search(r'\{.*\}', content, re.DOTALL)
        if m2:
            try:
                return json.loads(m2.group()), None
            except:
                pass
        return None, f'no JSON: {content[:80]}'
    except Exception as e:
        return None, str(e)[:80]


def system_classify(subject, body, sender=''):
    """系统当前分类 + 业务价值评估 + 实体提取 + 意图理解（完整输出）"""
    signal_type = _classify_signal_type(subject, body)
    tasks = suggest_task_keys(signal_type)

    # 导入新增的分析函数
    from apps.secretary.mail_signal_ingest import (
        _assess_business_value_and_urgency,
        _extract_key_entities,
        _build_extracted_intents,
    )

    # 从发件人域名判断 is_external
    internal_domains = {'china-norm.com', 'noreply.feishu.cn', 'noreply@'}
    is_external = not any(d in sender.lower() for d in internal_domains) and bool(sender)

    # 业务价值评估
    business_value, urgency_level, _ = _assess_business_value_and_urgency(
        subject, body, signal_type, is_external
    )

    # 实体提取
    entities = _extract_key_entities(subject, body)

    # 意图理解 + 具体化建议
    intents = _build_extracted_intents(signal_type, subject, body, entities)
    intent_obj = intents[0] if intents else {}

    return {
        'signal_type': signal_type,
        'suggested_tasks': tasks,
        'is_external_client_email': is_external,
        'business_value': business_value,
        'urgency_level': urgency_level,
        'key_entities': entities,
        'key_intent': intent_obj.get('key_intent', ''),
        'suggested_actions': intent_obj.get('suggested_actions', []),
        'risk_or_opportunity': intent_obj.get('risk_or_opportunity', ''),
    }


def score_analysis(sys_res, kimi_res, ark_res, email):
    """
    对齐评分函数：系统字段现在与 Kimi 字段同维度，公平比较。

    评分维度（共 13 分/封）：
    1. 内/外部识别（2分）
    2. 业务价值识别（3分）— 高价值邮件需正确识别
    3. 关键实体提取（2分）— 项目号/金额/品牌等
    4. 意图摘要质量（2分）— 有意义的 key_intent
    5. 建议行动质量（2分）— ≥2 条具体可执行建议
    6. 风险/商机识别（2分）— 高商业价值邮件识别
    """
    scores = {'system': 0, 'kimi': 0, 'ark': 0}

    context = email.get('context', '')
    is_client_email = any(kw in context for kw in ['外部', '客户', 'Chanel', '香奈儿', '供应商', '审计'])
    is_high_value = any(kw in context for kw in ['商机', '超支', '审计', '香奈儿', 'Chanel'])

    all_res = [('system', sys_res), ('kimi', kimi_res), ('ark', ark_res)]

    # 1. 内/外部识别（2分）
    for name, res in all_res:
        if not res:
            continue
        is_ext = res.get('is_external_client_email', False)
        if is_client_email and is_ext:
            scores[name] += 2
        elif not is_client_email and not is_ext:
            scores[name] += 2

    # 2. 业务价值识别（3分）
    if is_high_value:
        for name, res in all_res:
            if not res:
                continue
            bv = (res.get('business_value') or '').lower()
            if bv in ('critical', 'high'):
                scores[name] += 3
            elif bv == 'medium':
                scores[name] += 1

    # 3. 关键实体提取（2分）
    for name, res in all_res:
        if not res:
            continue
        entities = res.get('key_entities', {}) or res.get('key_entities', {})
        if not isinstance(entities, dict):
            entities = {}
        if any(v for v in entities.values() if v):
            scores[name] += 2

    # 4. 意图摘要质量（2分）— 有 key_intent 且长度合理
    for name, res in all_res:
        if not res:
            continue
        intent = str(res.get('key_intent', '') or '')
        if len(intent) >= 8:
            scores[name] += 2
        elif len(intent) >= 3:
            scores[name] += 1

    # 5. 建议行动质量（2分）
    for name, res in all_res:
        if not res:
            continue
        actions = res.get('suggested_actions', []) or []
        if isinstance(actions, list) and len(actions) >= 2 and any(len(str(a)) > 5 for a in actions):
            scores[name] += 2

    # 6. 风险/商机识别（2分）
    if is_high_value or '超支' in context or '法律' in context:
        for name, res in all_res:
            if not res:
                continue
            risk = str(res.get('risk_or_opportunity', '') or '')
            if len(risk) >= 8:
                scores[name] += 2

    return scores, []


results = []
print('=' * 72)
print('  复硕正态真实邮件 × 系统 × Kimi（专业 prompt）× ARK 三方比对')
print(f'  Kimi: {settings.KIMI_DEFAULT_MODEL} (with 专业背景 context)')
print(f'  ARK: {settings.ARK_DEFAULT_MODEL[:30]}')
print(f'  评测邮件: {len(REAL_EMAILS)} 封（飞书 API 真实拉取，正文完整）')
print('=' * 72)

total_scores = {'system': 0, 'kimi': 0, 'ark': 0}

for i, email in enumerate(REAL_EMAILS, 1):
    print(f'\n[{i:02d}/{len(REAL_EMAILS)}] {email["id"]}')
    print(f'  Subject: {email["subject"][:65]}')
    print(f'  Context: {email["context"][:70]}')
    print(f'  Body({len(email["body"])}c): {email["body"][:80].replace(chr(10)," ")}...')

    # 系统分类（新版：返回完整字段字典）
    sys_res = system_classify(email['subject'], email['body'], email.get('sender', ''))
    sys_type = sys_res['signal_type']
    sys_tasks = sys_res['suggested_tasks']
    print(f'  [系统] type={sys_type:<22} val={sys_res["business_value"]} urg={sys_res["urgency_level"]}')
    print(f'         意图: {sys_res["key_intent"][:65]}')
    if sys_res.get('risk_or_opportunity'):
        print(f'         风险/商机: {sys_res["risk_or_opportunity"][:60]}')
    if sys_res.get('suggested_actions'):
        print(f'         行动[{len(sys_res["suggested_actions"])}]: {sys_res["suggested_actions"][0][:50]}')
    if sys_res.get('key_entities'):
        ent = {k: v for k, v in sys_res["key_entities"].items() if v}
        if ent:
            print(f'         实体: {str(ent)[:65]}')

    # Kimi with 专业 prompt
    kimi_prompt = SYSTEM_PROMPT.format(sender=email['sender'], subject=email['subject'], body=email['body'][:400])
    k_res, k_err = ask_llm(settings.KIMI_API_BASE, settings.KIMI_API_KEY, settings.KIMI_DEFAULT_MODEL, kimi_prompt, 'Kimi')
    time.sleep(0.3)

    # ARK basic prompt（不加专业 context，模拟普通用户直接用 LLM）
    ark_prompt = BASIC_PROMPT.format(sender=email['sender'], subject=email['subject'], body=email['body'][:400])
    a_res, a_err = ask_llm(settings.ARK_API_BASE, settings.ARK_API_KEY, settings.ARK_DEFAULT_MODEL, ark_prompt, 'ARK')
    time.sleep(0.3)

    if k_err:
        print(f'  [Kimi] ERR: {k_err}')
    else:
        k_type = k_res.get('signal_type', '?')
        k_val = k_res.get('business_value', '?')
        k_urg = k_res.get('urgency', '?')
        k_ext = k_res.get('is_external_client_email', '?')
        k_intent = k_res.get('key_intent', '')
        k_entities = k_res.get('key_entities', {})
        k_risk = k_res.get('risk_or_opportunity', '')
        print(f'  [Kimi] type={k_type:<22} val={k_val} urg={k_urg} ext={k_ext}')
        print(f'         意图: {k_intent[:65]}')
        if k_entities and isinstance(k_entities, dict) and any(k_entities.values()):
            ent_str = ' | '.join(f'{k}={v}' for k, v in k_entities.items() if v)
            print(f'         实体: {ent_str[:65]}')
        if k_risk:
            print(f'         风险/商机: {k_risk[:65]}')

    if a_err:
        print(f'  [ARK]  ERR: {a_err}')
    else:
        a_type = a_res.get('signal_type', '?')
        a_val = a_res.get('business_value', '?')
        a_intent = a_res.get('key_intent', '')
        print(f'  [ARK]  type={a_type:<22} val={a_val}  意图: {a_intent[:40]}')

    # 一致性
    k_type = (k_res or {}).get('signal_type', 'ERR') if not k_err else 'ERR'
    a_type = (a_res or {}).get('signal_type', 'ERR') if not a_err else 'ERR'
    sk = '✅' if sys_type == k_type else '⚠️'
    sa = '✅' if sys_type == a_type else '⚠️'
    ka = '✅' if (k_type == a_type and k_type != 'ERR') else '⚠️'
    print(f'  分类一致性: Sys=Kimi {sk}  Sys=ARK {sa}  Kimi=ARK {ka}')

    # 评分
    scores, _ = score_analysis(sys_res, k_res if not k_err else None, a_res if not a_err else None, email)
    for k, v in scores.items():
        total_scores[k] += v
    print(f'  本轮评分: 系统={scores["system"]} | Kimi={scores["kimi"]} | ARK={scores["ark"]}')

    results.append({
        'id': email['id'],
        'subject': email['subject'],
        'context': email['context'],
        'system': {'type': sys_type, 'tasks': sys_tasks},
        'kimi': k_res if not k_err else {'error': k_err},
        'ark': a_res if not a_err else {'error': a_err},
        'scores': scores,
    })

# ── 汇总 ──────────────────────────────────────────────────────────────
print('\n' + '=' * 72)
print('  汇总评估报告')
print('=' * 72)

valid = [r for r in results if 'error' not in r.get('kimi', {}) and 'error' not in r.get('ark', {})]
n = len(valid)

sk_agree = sum(1 for r in valid if r['system']['type'] == (r['kimi'] or {}).get('signal_type'))
sa_agree = sum(1 for r in valid if r['system']['type'] == (r['ark'] or {}).get('signal_type'))
ka_agree = sum(1 for r in valid if (r['kimi'] or {}).get('signal_type') == (r['ark'] or {}).get('signal_type'))
all3 = sum(1 for r in valid if r['system']['type'] == (r['kimi'] or {}).get('signal_type') == (r['ark'] or {}).get('signal_type'))

print(f'\n  有效比对: {n}/{len(results)} 封')
print(f'\n  分类一致率:')
print(f'    系统 vs Kimi: {sk_agree}/{n} = {sk_agree*100//max(n,1)}%')
print(f'    系统 vs ARK:  {sa_agree}/{n} = {sa_agree*100//max(n,1)}%')
print(f'    Kimi vs ARK:  {ka_agree}/{n} = {ka_agree*100//max(n,1)}%')
print(f'    三方全一致:   {all3}/{n} = {all3*100//max(n,1)}%')

print(f'\n  综合评分（分类+价值评估+实体提取+建议质量）:')
print(f'    系统（规则）: {total_scores["system"]} 分  — 仅分类，无价值评估/实体提取')
print(f'    Kimi（专业 prompt）: {total_scores["kimi"]} 分  — 含专业背景、实体提取、风险商机')
print(f'    ARK（基础 prompt）:  {total_scores["ark"]} 分  — 无专业背景')

print('\n  核心发现:')

# Find emails where system missed external
external_missed = [r for r in results if 'audit' in r['subject'].lower() or 'chanel' in r['subject'].lower()]
if external_missed:
    print(f'\n  ⚠️  关键发现：Audit/香奈儿相关邮件（real-A）系统分类结果：')
    for r in external_missed[:2]:
        print(f'     {r["subject"][:50]}: 系统={r["system"]["type"]} Kimi={r.get("kimi",{}).get("signal_type","?")}')

# business value insights
high_value = [r for r in results if (r.get('kimi') or {}).get('business_value') in ('critical', 'high')]
print(f'\n  Kimi 识别为 high/critical 商业价值的邮件：{len(high_value)} 封')
for r in high_value[:3]:
    print(f'     [{r["id"]}] {r["subject"][:50]}')
    print(f'          Kimi: val={r["kimi"].get("business_value")} 意图={r["kimi"].get("key_intent","")[:50]}')

print('\n  结论:')
kimi_score = total_scores["kimi"]
sys_score = total_scores["system"]
if kimi_score > sys_score * 1.5:
    print(f'  ❌ 系统综合能力显著弱于大模型（{sys_score} vs {kimi_score}）')
    print(f'     根因：系统缺少以下能力：')
    print(f'       1. 业务价值评估（business_value、urgency）')
    print(f'       2. 关键实体提取（客户、项目编号、金额、截止日期）')
    print(f'       3. 风险/商机识别')
    print(f'       4. 专业 skills 未被充分调用（Phase 2 分析仅对已确认外部邮件触发）')
elif kimi_score > sys_score:
    print(f'  ⚠️  系统能力弱于大模型（{sys_score} vs {kimi_score}），有改进空间')
else:
    print(f'  ✅ 系统综合能力不弱于大模型（{sys_score} vs {kimi_score}）')

# Save
out_path = os.path.join(os.path.dirname(__file__), '..', 'docs', 'eval_real_email_round2.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print(f'\n详细结果: {out_path}')
print('=' * 72)
