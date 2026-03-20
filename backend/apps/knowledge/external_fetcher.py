"""
外部知识采集器（生产化版本）

将外部六大域从「样例/硬编码/基础抓取」升级为持续运行的采集管线。

采集域：
1. 法规（NMPA）— 正文抓取 + 差异检测 + AI 相关性评分
2. 内部 SOP — 每日同步
3. 项目经验 — 每周归档
4. 论文（PubMed/Semantic Scholar）— 关键词监控 + 元数据结构化
5. CDISC 标准更新 — 每月增量检查
6. 竞品情报 — 多源采集（当前降级：基于知识库读取）
"""
import logging
from datetime import date, timedelta
from typing import Dict, Any, List, Optional

logger = logging.getLogger('cn_kis.knowledge.external_fetcher')


def _find_previous_regulation_entry(title: str, source_key: str) -> Optional[int]:
    """按标题匹配法规旧版本，挂接知识版本链。"""
    try:
        from apps.knowledge.models import KnowledgeEntry

        existing = KnowledgeEntry.objects.filter(
            entry_type='regulation',
            source_type='regulation_tracker',
            title=f'[法规] {title[:200]}',
            is_deleted=False,
        ).exclude(source_key=source_key).order_by('-update_time').first()
        return existing.id if existing else None
    except Exception as exc:
        logger.debug('查找法规旧版本失败: %s', exc)
        return None


def _find_previous_sop_entry_id(previous_sop_id: Optional[int]) -> Optional[int]:
    """根据 SOP.previous_version_id 找到上一版知识条目。"""
    if not previous_sop_id:
        return None

    try:
        from apps.knowledge.models import KnowledgeEntry

        existing = KnowledgeEntry.objects.filter(
            entry_type='sop',
            source_id=previous_sop_id,
            is_deleted=False,
        ).filter(source_type__in=['sop_sync', 'sop']).order_by('-update_time').first()
        return existing.id if existing else None
    except Exception as exc:
        logger.debug('查找 SOP 旧版本失败: %s', exc)
        return None


# ============================================================================
# 1. 法规采集（生产化）
# ============================================================================

def fetch_nmpa_regulations() -> Dict[str, Any]:
    """
    采集 NMPA 化妆品法规公告

    升级：
    - 正文抓取（而非仅标题+URL）
    - 增量检测（对比已入库，只处理新增/变更）
    - AI 相关性评分
    - 高相关公告推送通知
    """
    results = {'source': 'nmpa_regulation', 'fetched': 0, 'created': 0,
               'skipped_duplicate': 0, 'errors': []}

    try:
        import urllib.request
        import re

        url = 'https://www.nmpa.gov.cn/xxgk/ggtg/hzhpggtg/index.html'
        req = urllib.request.Request(
            url,
            headers={
                'User-Agent': 'Mozilla/5.0 (compatible; CN-KIS-Bot/1.0)',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'zh-CN,zh;q=0.9',
            }
        )

        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                html = resp.read().decode('utf-8', errors='ignore')
        except Exception as e:
            logger.info('NMPA 网站访问失败（正常降级）: %s', e)
            results['errors'].append(f'网站访问失败: {e}')
            return results

        # 提取公告链接和标题
        pattern = r'<a[^>]+href="(/[^"]*hzhpggtg[^"]*)"[^>]*>([^<]+)</a>'
        matches = re.findall(pattern, html)

        regulations = []
        for href, title in matches:
            title = title.strip()
            if len(title) > 5 and any(kw in title for kw in ['化妆品', '通告', '公告', '通知', '征求意见', '指导原则']):
                full_url = f'https://www.nmpa.gov.cn{href}'
                regulations.append({'title': title, 'url': full_url})

        results['fetched'] = len(regulations)

        from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline

        for reg in regulations[:30]:  # 每次最多处理 30 条
            source_key = 'nmpa:' + reg['url'].split('/')[-1][:60]
            previous_entry_id = _find_previous_regulation_entry(reg['title'], source_key)

            # 尝试获取正文
            content = _fetch_regulation_fulltext(reg['url'])
            if not content:
                content = f'法规标题：{reg["title"]}\n\n来源：{reg["url"]}\n\n（正文获取失败，请访问原始链接查看）'

            # AI 相关性评分（降级：基于关键词规则）
            relevance_score = _score_regulation_relevance(reg['title'], content)

            raw = RawKnowledgeInput(
                title=f'[法规] {reg["title"][:200]}',
                content=content,
                entry_type='regulation',
                source_type='regulation_tracker',
                source_key=source_key,
                tags=['NMPA', '法规', '化妆品'],
                namespace='nmpa_regulation',
                uri=reg['url'],
                version=source_key.replace('nmpa:', '', 1),
                previous_entry_id=previous_entry_id,
                properties={
                    'source_url': reg['url'],
                    'relevance_score': relevance_score,
                    'nmpa_title': reg['title'],
                },
                summary=reg['title'],
            )

            pipeline_result = run_pipeline(raw)
            if pipeline_result.success:
                if pipeline_result.status == 'duplicate_skipped':
                    results['skipped_duplicate'] += 1
                else:
                    results['created'] += 1
                    # 高相关法规触发通知
                    if relevance_score >= 70 and pipeline_result.entry_id:
                        _notify_high_relevance_regulation(reg['title'], reg['url'], relevance_score)

    except Exception as e:
        logger.warning('NMPA 采集异常: %s', e)
        results['errors'].append(str(e))

    return results


def _fetch_regulation_fulltext(url: str) -> str:
    """抓取法规公告正文"""
    try:
        import urllib.request
        from html.parser import HTMLParser

        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'Mozilla/5.0 (compatible; CN-KIS-Bot/1.0)'}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode('utf-8', errors='ignore')

        # 简单正文提取：查找主要内容区域
        import re
        # 移除 script/style 标签
        html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
        html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL | re.IGNORECASE)
        # 移除 HTML 标签
        text = re.sub(r'<[^>]+>', ' ', html)
        # 清理空白
        text = re.sub(r'\s+', ' ', text).strip()

        # 截取合理长度（正文一般在 500-5000 字）
        if len(text) > 200:
            return text[:5000]

    except Exception as e:
        logger.debug('Failed to fetch regulation fulltext from %s: %s', url, e)

    return ''


def _score_regulation_relevance(title: str, content: str) -> int:
    """
    计算法规与化妆品 CRO 业务的相关性分数（0-100）。
    生产方案：调用 LLM 评分。
    降级方案：基于关键词规则。
    """
    score = 30  # 基础分：NMPA 的任何公告都有一定相关性

    high_relevance_keywords = [
        '化妆品', '功效', '安全评估', '备案', '注册', '原料', '禁用', '限用',
        '检测方法', '安全技术', '标签', '宣称', '儿童', '防晒', '染发',
    ]
    medium_relevance_keywords = [
        '受试者', '临床', '皮肤', '过敏', '不良反应', '质量', 'GCP',
    ]

    text = title + ' ' + content[:1000]
    for kw in high_relevance_keywords:
        if kw in text:
            score += 8

    for kw in medium_relevance_keywords:
        if kw in text:
            score += 4

    return min(100, score)


def _notify_high_relevance_regulation(title: str, url: str, score: int):
    """高相关法规推送飞书通知"""
    try:
        from apps.secretary.alert_service import send_system_alert
        send_system_alert(
            title=f'⚠️ 高相关法规更新：{title[:50]}',
            message=f'相关性评分：{score}/100\n法规标题：{title}\n来源：{url}',
            level='warning',
        )
    except Exception as e:
        logger.debug('Failed to send regulation notification: %s', e)


# ============================================================================
# 2. 内部 SOP 同步（升级版：通过 pipeline）
# ============================================================================

def sync_internal_sops() -> Dict[str, Any]:
    """
    内部 SOP 同步到知识库（通过统一入库管线）
    """
    results = {'source': 'internal_sop', 'synced': 0, 'created': 0, 'updated': 0}

    try:
        from apps.quality.models import SOP
        from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline

        effective_sops = SOP.objects.filter(status='effective', is_deleted=False)

        for sop in effective_sops:
            content = (
                getattr(sop, 'content', '') or
                getattr(sop, 'description', '') or
                f'SOP {sop.code} {sop.title} (版本 {getattr(sop, "version", "")})'
            )

            raw = RawKnowledgeInput(
                title=f'[SOP] {sop.code} - {sop.title}',
                content=content,
                entry_type='sop',
                source_type='sop_sync',
                source_id=sop.id,
                source_key=f'sop:{sop.id}:v{getattr(sop, "version", "1")}',
                tags=['SOP', getattr(sop, 'category', ''), 'internal'],
                namespace='internal_sop',
                uri=f'sop://{sop.code}',
                version=str(getattr(sop, 'version', '') or ''),
                previous_entry_id=_find_previous_sop_entry_id(getattr(sop, 'previous_version_id', None)),
                summary=f'SOP编号: {sop.code}, 版本: {getattr(sop, "version", "")}, 分类: {getattr(sop, "category", "")}',
                properties={
                    'sop_code': sop.code,
                    'version': str(getattr(sop, 'version', '')),
                    'status': sop.status,
                    'next_review': str(getattr(sop, 'next_review', '')),
                },
            )

            pipeline_result = run_pipeline(raw)
            results['synced'] += 1
            if pipeline_result.success:
                if pipeline_result.status not in ('duplicate_skipped', 'updated'):
                    results['created'] += 1
                else:
                    results['updated'] += 1

    except Exception as e:
        logger.warning('SOP 同步异常: %s', e)
        results['error'] = str(e)

    return results


# ============================================================================
# 3. 项目经验归档
# ============================================================================

def archive_project_experience() -> Dict[str, Any]:
    """
    从已完成项目提取经验，写入知识库
    """
    results = {'source': 'project_experience', 'archived': 0, 'created': 0}

    try:
        from apps.protocol.models import Protocol
        from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline

        completed = Protocol.objects.filter(status='completed', is_deleted=False)

        for p in completed:
            content_parts = [
                f'项目名称：{p.title}',
                f'项目编号：{getattr(p, "code", "N/A")}',
                f'样本量：{getattr(p, "sample_size", "N/A")}',
                f'申办方：{getattr(p, "sponsor", "N/A")}',
                f'项目类型：{getattr(p, "study_type", "N/A")}',
                f'功效宣称：{getattr(p, "claim", "N/A")}',
            ]

            description = getattr(p, 'description', '') or getattr(p, 'objectives', '')
            if description:
                content_parts.append(f'\n项目描述：{description[:500]}')

            content = '\n'.join(content_parts)

            raw = RawKnowledgeInput(
                title=f'[项目经验] {p.title}',
                content=content,
                entry_type='lesson_learned',
                source_type='internal_archive',
                source_id=p.id,
                source_key=f'protocol:{p.id}:experience',
                tags=['项目经验', getattr(p, 'study_type', ''), '已完成项目'],
                namespace='project_experience',
                uri=f'protocol://{p.id}',
                summary=f'{p.title} - 样本量 {getattr(p, "sample_size", "N/A")}',
            )

            pipeline_result = run_pipeline(raw)
            results['archived'] += 1
            if pipeline_result.success and pipeline_result.status != 'duplicate_skipped':
                results['created'] += 1

    except Exception as e:
        logger.warning('项目经验归档异常: %s', e)
        results['error'] = str(e)

    return results


# ============================================================================
# 4. 论文采集（生产化）
# ============================================================================

def fetch_papers_by_keywords(
    keywords: Optional[List[str]] = None,
    max_results_per_keyword: int = 10,
) -> Dict[str, Any]:
    """
    从 PubMed/Semantic Scholar 采集相关论文。

    关键词来自：
    - 环境变量 KNOWLEDGE_PAPER_KEYWORDS（逗号分隔）
    - 或传入的 keywords 参数
    """
    import os

    if keywords is None:
        keywords_str = os.getenv('KNOWLEDGE_PAPER_KEYWORDS',
                                  '化妆品功效评估,皮肤屏障,防晒,保湿,skin assessment,cosmetic efficacy')
        keywords = [k.strip() for k in keywords_str.split(',') if k.strip()]

    results = {'source': 'paper_scout', 'fetched': 0, 'created': 0, 'errors': []}

    for keyword in keywords[:10]:  # 最多处理 10 个关键词
        try:
            papers = _search_pubmed(keyword, max_results_per_keyword)
            for paper in papers:
                pipeline_result = _ingest_paper(paper)
                results['fetched'] += 1
                if pipeline_result and pipeline_result.status != 'duplicate_skipped':
                    results['created'] += 1
        except Exception as e:
            logger.warning('Paper fetch failed for keyword "%s": %s', keyword, e)
            results['errors'].append(f'{keyword}: {e}')

    return results


def _search_pubmed(keyword: str, max_results: int = 10) -> List[Dict[str, Any]]:
    """
    调用 PubMed E-utilities API 搜索论文。
    无需 API Key，公开访问（有速率限制：3 次/秒）。

    修复：efetch 使用 retmode=xml 并用 XML 解析器逐条提取标题和摘要，
    避免原 retmode=json 不支持 efetch 导致所有 PMID 共享同一段文本的 bug。
    """
    import urllib.request
    import urllib.parse
    import json
    import time
    import xml.etree.ElementTree as ET

    papers = []

    try:
        # 步骤1：搜索获取 PMID 列表
        search_params = urllib.parse.urlencode({
            'db': 'pubmed',
            'term': keyword,
            'retmode': 'json',
            'retmax': max_results,
            'sort': 'relevance',
        })
        search_url = f'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?{search_params}'

        with urllib.request.urlopen(search_url, timeout=10) as resp:
            search_data = json.loads(resp.read().decode('utf-8'))

        pmids = search_data.get('esearchresult', {}).get('idlist', [])
        if not pmids:
            return []

        time.sleep(0.4)  # 遵守速率限制

        # 步骤2：用 XML 格式逐条获取摘要（efetch 不支持 JSON）
        fetch_params = urllib.parse.urlencode({
            'db': 'pubmed',
            'id': ','.join(pmids),
            'retmode': 'xml',
            'rettype': 'abstract',
        })
        fetch_url = f'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?{fetch_params}'

        with urllib.request.urlopen(fetch_url, timeout=20) as resp:
            xml_content = resp.read().decode('utf-8', errors='ignore')

        # 步骤3：解析 XML，逐条提取标题和摘要
        try:
            root = ET.fromstring(xml_content)
            for article_el in root.findall('.//PubmedArticle'):
                # 提取 PMID
                pmid_el = article_el.find('.//PMID')
                pmid = pmid_el.text.strip() if pmid_el is not None and pmid_el.text else ''
                if not pmid:
                    continue

                # 提取标题
                title_el = article_el.find('.//ArticleTitle')
                title = ''
                if title_el is not None:
                    # ArticleTitle 可能包含子标签，用 itertext 提取纯文本
                    title = ''.join(title_el.itertext()).strip()

                # 提取摘要（AbstractText 可能有多个 Label 属性的段落）
                abstract_parts = []
                for abs_el in article_el.findall('.//AbstractText'):
                    label = abs_el.get('Label', '')
                    text = ''.join(abs_el.itertext()).strip()
                    if text:
                        if label:
                            abstract_parts.append(f'{label}: {text}')
                        else:
                            abstract_parts.append(text)
                abstract = '\n'.join(abstract_parts)

                # 提取发表年份
                year_el = article_el.find('.//PubDate/Year')
                pub_year = year_el.text.strip() if year_el is not None and year_el.text else ''

                # 提取期刊名
                journal_el = article_el.find('.//Journal/Title')
                journal = journal_el.text.strip() if journal_el is not None and journal_el.text else ''

                if title or abstract:
                    papers.append({
                        'pmid': pmid,
                        'title': title or f'PubMed Article PMID:{pmid}',
                        'abstract': abstract or '',
                        'source_url': f'https://pubmed.ncbi.nlm.nih.gov/{pmid}/',
                        'keyword': keyword,
                        'pub_year': pub_year,
                        'journal': journal,
                    })

        except ET.ParseError as e:
            logger.warning('PubMed XML 解析失败，降级为纯文本: %s', e)
            # 降级：为每个 PMID 创建简单记录
            for pmid in pmids:
                papers.append({
                    'pmid': pmid,
                    'title': f'PubMed Article PMID:{pmid}',
                    'abstract': '',
                    'source_url': f'https://pubmed.ncbi.nlm.nih.gov/{pmid}/',
                    'keyword': keyword,
                })

    except Exception as e:
        logger.debug('PubMed search failed for "%s": %s', keyword, e)

    return papers


def _ingest_paper(paper: Dict[str, Any]):
    """将论文数据通过 pipeline 入库"""
    from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline

    pmid = paper.get('pmid', '')
    source_key = f'pubmed:{pmid}' if pmid else None
    if not source_key:
        return None

    raw = RawKnowledgeInput(
        title=paper.get('title', ''),
        content=paper.get('abstract', ''),
        entry_type='paper_abstract',
        source_type='paper_scout',
        source_key=source_key,
        tags=['论文', paper.get('keyword', ''), 'PubMed'],
        namespace='cnkis',
        uri=paper.get('source_url', ''),
        summary=paper.get('abstract', '')[:200],
        properties={
            'pmid': pmid,
            'source_url': paper.get('source_url', ''),
            'keyword': paper.get('keyword', ''),
            'pub_year': paper.get('pub_year', ''),
            'journal': paper.get('journal', ''),
        },
    )

    return run_pipeline(raw)


# ============================================================================
# 5. CDISC 标准更新
# ============================================================================

def fetch_cdisc_updates() -> Dict[str, Any]:
    """
    CDISC 标准更新（复用已有 cdisc_importer 逻辑）
    """
    results = {'source': 'cdisc', 'status': 'checked', 'new_terms': 0}

    try:
        from apps.knowledge.cdisc_importer import run_full_cdisc_import
        import_result = run_full_cdisc_import()
        results['new_terms'] = import_result.get('created', 0)
        results['status'] = 'success'
    except ImportError:
        results['status'] = 'importer_not_available'
    except Exception as e:
        logger.warning('CDISC 更新检查异常: %s', e)
        results['status'] = 'error'
        results['error'] = str(e)

    return results


# ============================================================================
# 6. 竞品情报（升级：基于知识库，移除硬编码）
# ============================================================================

def update_competitor_intel() -> Dict[str, Any]:
    """
    竞品情报更新。

    最小生产化版本：
    - 从 configs/competitive_intel_sources.yaml 读取竞品与官网/news 入口
    - 优先抓取官网/新闻页正文，补充实时搜索结果摘要
    - 通过统一知识管线沉淀为 competitor_intel 条目
    """
    results = {'source': 'competitor_intel', 'checked': 0, 'updated': 0, 'created': 0, 'errors': []}

    try:
        from pathlib import Path
        import yaml
        from urllib.parse import urlparse
        from libs.mcp_client import web_extract, web_search
        from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline

        def _is_placeholder_url(url: str) -> bool:
            if not url:
                return True
            parsed = urlparse(url)
            hostname = (parsed.hostname or '').lower()
            return hostname in {'example.com', 'www.example.com'}

        cfg_path = Path(__file__).resolve().parents[2] / 'configs' / 'competitive_intel_sources.yaml'
        if not cfg_path.exists():
            logger.info('No competitor source config found: %s', cfg_path)
            return results

        config = yaml.safe_load(cfg_path.read_text(encoding='utf-8')) or {}
        competitors = config.get('competitors') or []
        results['checked'] = len(competitors)

        for competitor in competitors:
            competitor_name = competitor.get('name', '').strip()
            if not competitor_name:
                continue

            source_payloads = []
            official_site = competitor.get('official_site', '').strip()
            if official_site and not _is_placeholder_url(official_site):
                extracted = web_extract(official_site)
                content = str(extracted.get('content') or extracted.get('markdown') or extracted.get('text') or '')
                if content.strip():
                    source_payloads.append({
                        'kind': 'official_site',
                        'url': official_site,
                        'content': content[:6000],
                    })

            for news_url in competitor.get('news_urls') or []:
                if _is_placeholder_url(news_url):
                    continue
                extracted = web_extract(news_url)
                content = str(extracted.get('content') or extracted.get('markdown') or extracted.get('text') or '')
                if content.strip():
                    source_payloads.append({
                        'kind': 'news_page',
                        'url': news_url,
                        'content': content[:6000],
                    })

            query_groups = {
                'web_search': competitor.get('watch_queries') or [f'{competitor_name} 化妆品 CRO'],
                'filing_monitor': competitor.get('filing_queries') or [],
                'job_monitor': competitor.get('job_queries') or [],
                'company_monitor': competitor.get('company_queries') or [],
            }
            for source_kind, queries in query_groups.items():
                search_snippets = []
                for query in queries[:2]:
                    search_result = web_search(query, max_results=3)
                    items = search_result.get('results') or search_result.get('data') or search_result.get('items') or []
                    if isinstance(items, list):
                        for item in items[:3]:
                            title = item.get('title') or item.get('name') or ''
                            snippet = item.get('snippet') or item.get('content') or ''
                            url = item.get('url') or item.get('link') or ''
                            if title or snippet:
                                search_snippets.append(f'- {title}\n  {snippet}\n  {url}'.strip())

                if search_snippets:
                    source_payloads.append({
                        'kind': source_kind,
                        'url': '',
                        'content': '竞品搜索线索：\n' + '\n'.join(search_snippets[:6]),
                    })

            for idx, payload in enumerate(source_payloads):
                raw = RawKnowledgeInput(
                    title=f'{competitor_name} 竞品动态监控 #{idx + 1}',
                    content=payload['content'],
                    summary=f'{competitor_name} 的 {payload["kind"]} 情报采集结果',
                    entry_type='competitor_intel',
                    source_type='competitor_monitor',
                    source_key=f'{competitor.get("id", competitor_name)}:{payload["kind"]}:{payload["url"] or idx}',
                    tags=['竞品情报', competitor_name, payload['kind']],
                    namespace='cnkis',
                    properties={
                        'source_url': payload['url'],
                        'competitor_name': competitor_name,
                        'competitor_id': competitor.get('id', ''),
                        'source_kind': payload['kind'],
                        'official_site': official_site,
                    },
                )
                pipeline_result = run_pipeline(raw)
                if pipeline_result.success and pipeline_result.entry_id:
                    results['created'] += 1

        results['updated'] = results['created']

    except Exception as e:
        logger.warning('竞品情报更新异常: %s', e)
        results['error'] = str(e)

    return results


# ============================================================================
# 主入口
# ============================================================================

def run_all_fetchers() -> Dict[str, Any]:
    """执行所有采集任务，返回汇总结果"""
    results = {}

    logger.info('开始执行外部信息采集...')

    results['nmpa'] = fetch_nmpa_regulations()
    results['sop'] = sync_internal_sops()
    results['experience'] = archive_project_experience()
    results['papers'] = fetch_papers_by_keywords()

    total_created = sum(r.get('created', 0) for r in results.values())
    logger.info('外部信息采集完成: 共新增 %d 条知识条目', total_created)

    return results
