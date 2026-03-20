"""
CDISC Library REST API 导入器 (K3)

从 CDISC Library 公开 API 导入标准术语到知识图谱：
- SDTM 域定义和变量
- CDASH 域定义和字段
- 受控术语 (Controlled Terminology)

Entity 通过 linked_entry 关联到 KnowledgeEntry，使图谱检索通道可正常工作。

CDISC Library API: https://library.cdisc.org/api
认证方式: API Key (Bearer Token)
"""
import logging
from typing import Any, Dict, List, Optional

import requests
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import (
    EntryType,
    EntityType,
    KnowledgeEntry,
    KnowledgeEntity,
    KnowledgeRelation,
    OntologyNamespace,
    RelationType,
)

logger = logging.getLogger(__name__)

CDISC_API_BASE = 'https://library.cdisc.org/api'
REQUEST_TIMEOUT = 30


def _get_api_key() -> str:
    return getattr(settings, 'CDISC_LIBRARY_API_KEY', '') or ''


def _api_get(path: str, params: Optional[dict] = None) -> Optional[dict]:
    api_key = _get_api_key()
    if not api_key:
        logger.warning('CDISC_LIBRARY_API_KEY not configured')
        return None

    url = f'{CDISC_API_BASE}{path}'
    headers = {
        'Accept': 'application/json',
        'api-key': api_key,
    }
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        logger.error('CDISC API request failed: %s %s', url, e)
        return None


# ── SDTM 导入 ──

def import_sdtm_domains(version: str = '3-4') -> Dict[str, Any]:
    """
    导入 SDTM IG 域定义（如 DM, VS, AE 等），创建实体和层次关系。

    CDISC Library API 路径：/mdr/sdtmig/{version}/datasets
    版本格式：用连字符（如 3-4），不是点号（如 3.4）。
    """
    data = _api_get(f'/mdr/sdtmig/{version}/datasets')
    if not data:
        return {'success': False, 'message': 'CDISC API 请求失败或未配置 API Key'}

    domains = data.get('_links', {}).get('datasets', [])
    if not domains:
        domains = data.get('datasets', data.get('_links', {}).get('domains', []))

    stats = {'created': 0, 'skipped': 0, 'errors': 0}

    sdtm_root = _ensure_root_entity(
        namespace=OntologyNamespace.CDISC_SDTM,
        uri=f'cdisc:sdtm/{version}',
        label=f'SDTM v{version}',
        label_en=f'SDTM v{version}',
        definition=f'Study Data Tabulation Model version {version}',
    )

    with transaction.atomic():
        for domain_info in domains:
            domain_name = domain_info.get('title', domain_info.get('name', ''))
            domain_href = domain_info.get('href', '')
            domain_code = _extract_code_from_href(domain_href) or domain_name

            uri = f'cdisc:sdtm/{version}/{domain_code}'

            entity, created = KnowledgeEntity.objects.get_or_create(
                namespace=OntologyNamespace.CDISC_SDTM,
                uri=uri,
                is_deleted=False,
                defaults={
                    'entity_type': EntityType.CLASS,
                    'label': domain_name,
                    'label_en': domain_name,
                    'definition': domain_info.get('description', ''),
                    'parent': sdtm_root,
                    'properties': {
                        'code': domain_code,
                        'version': version,
                        'href': domain_href,
                        'source': 'cdisc-library',
                    },
                },
            )

            if created:
                stats['created'] += 1
                _ensure_relation(
                    subject=entity,
                    object_entity=sdtm_root,
                    relation_type=RelationType.PART_OF,
                    predicate_uri=f'cdisc:partOf',
                    source='cdisc-import',
                )
                _ensure_linked_entry(entity, source_type='cdisc_import',
                                     entry_type=EntryType.METHOD_REFERENCE,
                                     extra_tags=['SDTM', 'domain', domain_code])
            else:
                stats['skipped'] += 1
                _ensure_linked_entry(entity, source_type='cdisc_import',
                                     entry_type=EntryType.METHOD_REFERENCE,
                                     extra_tags=['SDTM', 'domain', domain_code])

    return {
        'success': True,
        'version': version,
        'root_entity_id': sdtm_root.id,
        **stats,
    }


def import_sdtm_variables(domain_code: str, version: str = '3-4') -> Dict[str, Any]:
    """
    导入 SDTM 某域的变量定义（如 DM 域的 USUBJID, AGE, SEX 等）。

    CDISC Library API 路径：/mdr/sdtmig/{version}/datasets/{code}/variables
    """
    data = _api_get(f'/mdr/sdtmig/{version}/datasets/{domain_code}/variables')
    if not data:
        data = _api_get(f'/mdr/sdtmig/{version}/datasets/{domain_code}/fields')
    if not data:
        return {'success': False, 'message': f'SDTM {domain_code} 变量获取失败'}

    fields = data.get('_links', {}).get('datasetVariables', [])
    if not fields:
        fields = data.get('datasetVariables', data.get('fields', data.get('variables', [])))
    if not fields:
        return {'success': True, 'message': f'{domain_code} 无变量数据', 'created': 0}

    domain_uri = f'cdisc:sdtm/{version}/{domain_code}'
    domain_entity = KnowledgeEntity.objects.filter(
        namespace=OntologyNamespace.CDISC_SDTM,
        uri=domain_uri,
        is_deleted=False,
    ).first()

    if not domain_entity:
        return {'success': False, 'message': f'域实体 {domain_uri} 不存在，请先导入域定义'}

    stats = {'created': 0, 'skipped': 0}

    with transaction.atomic():
        for field in fields:
            field_name = field.get('name', field.get('title', ''))
            if not field_name:
                continue
            field_label = field.get('label', field_name)
            uri = f'cdisc:sdtm/{version}/{domain_code}/{field_name}'

            entity, created = KnowledgeEntity.objects.get_or_create(
                namespace=OntologyNamespace.CDISC_SDTM,
                uri=uri,
                is_deleted=False,
                defaults={
                    'entity_type': EntityType.PROPERTY,
                    'label': field_label,
                    'label_en': field_name,
                    'definition': field.get('description', field.get('definition', '')),
                    'parent': domain_entity,
                    'properties': {
                        'name': field_name,
                        'data_type': field.get('type', field.get('dataType', '')),
                        'core': field.get('core', ''),
                        'role': field.get('role', ''),
                        'source': 'cdisc-library',
                    },
                },
            )
            if created:
                stats['created'] += 1
                _ensure_relation(
                    subject=entity,
                    object_entity=domain_entity,
                    relation_type=RelationType.PART_OF,
                    predicate_uri='cdisc:belongsToDomain',
                    source='cdisc-import',
                )
                _ensure_linked_entry(entity, source_type='cdisc_import',
                                     entry_type=EntryType.METHOD_REFERENCE,
                                     extra_tags=['SDTM', 'variable', domain_code])
            else:
                stats['skipped'] += 1
                _ensure_linked_entry(entity, source_type='cdisc_import',
                                     entry_type=EntryType.METHOD_REFERENCE,
                                     extra_tags=['SDTM', 'variable', domain_code])

    return {'success': True, 'domain': domain_code, **stats}


# ── CDASH 导入 ──

def import_cdash_domains(version: str = '2-2') -> Dict[str, Any]:
    """
    导入 CDASH IG 域定义。

    CDISC Library API 路径：/mdr/cdashig/{version}/domains
    版本格式：用连字符（如 2-2）。
    """
    data = _api_get(f'/mdr/cdashig/{version}/domains')
    if not data:
        return {'success': False, 'message': 'CDASH API 请求失败'}

    domains = data.get('_links', {}).get('domains', data.get('domains', []))
    stats = {'created': 0, 'skipped': 0}

    cdash_root = _ensure_root_entity(
        namespace=OntologyNamespace.CDISC_CDASH,
        uri=f'cdisc:cdash/{version}',
        label=f'CDASH v{version}',
        label_en=f'CDASH v{version}',
        definition=f'Clinical Data Acquisition Standards Harmonization version {version}',
    )

    with transaction.atomic():
        for domain_info in domains:
            domain_name = domain_info.get('title', domain_info.get('name', ''))
            domain_href = domain_info.get('href', '')
            domain_code = _extract_code_from_href(domain_href) or domain_name
            uri = f'cdisc:cdash/{version}/{domain_code}'

            entity, created = KnowledgeEntity.objects.get_or_create(
                namespace=OntologyNamespace.CDISC_CDASH,
                uri=uri,
                is_deleted=False,
                defaults={
                    'entity_type': EntityType.CLASS,
                    'label': domain_name,
                    'label_en': domain_name,
                    'definition': domain_info.get('description', ''),
                    'parent': cdash_root,
                    'properties': {
                        'code': domain_code,
                        'version': version,
                        'source': 'cdisc-library',
                    },
                },
            )
            if created:
                stats['created'] += 1
                _ensure_linked_entry(entity, source_type='cdisc_import',
                                     entry_type=EntryType.METHOD_REFERENCE,
                                     extra_tags=['CDASH', 'domain', domain_code])
            else:
                stats['skipped'] += 1
                _ensure_linked_entry(entity, source_type='cdisc_import',
                                     entry_type=EntryType.METHOD_REFERENCE,
                                     extra_tags=['CDASH', 'domain', domain_code])

    return {'success': True, 'version': version, 'root_entity_id': cdash_root.id, **stats}


# ── 受控术语导入 ──

def import_controlled_terminology(
    ct_package: str = 'sdtmct',
    version: str = '2025-03-28',
) -> Dict[str, Any]:
    """
    导入 CDISC 受控术语（Codelists + Terms）。

    CDISC Library API 路径：/mdr/ct/packages/{package}-{version}/codelists
    ct_package 格式：sdtmct / cdashct（注意不是 sdtm）
    version 格式：YYYY-MM-DD
    """
    data = _api_get(f'/mdr/ct/packages/{ct_package}-{version}/codelists')
    if not data:
        return {'success': False, 'message': 'CT 获取失败'}

    codelist_links = data.get('_links', {}).get('codelists', data.get('codelists', []))
    stats = {'codelists_created': 0, 'terms_created': 0, 'skipped': 0, 'errors': 0}

    namespace = OntologyNamespace.CDISC_SDTM
    ct_root = _ensure_root_entity(
        namespace=namespace,
        uri=f'cdisc:ct/{ct_package}/{version}',
        label=f'{ct_package.upper()} CT {version}',
        label_en=f'{ct_package.upper()} Controlled Terminology {version}',
        definition=f'CDISC {ct_package.upper()} Controlled Terminology package {version}',
    )

    max_codelists = 300
    for idx, cl_link in enumerate(codelist_links[:max_codelists]):
        cl_href = cl_link.get('href', '')
        cl_title = cl_link.get('title', '')

        if not cl_href:
            continue

        cl_detail = _api_get(cl_href)
        if not cl_detail:
            stats['errors'] += 1
            continue

        cl_name = (cl_detail.get('name', cl_title) or '')[:490]
        cl_code = cl_detail.get('conceptId', '')
        cl_definition = cl_detail.get('definition', '')

        if not cl_name:
            continue

        uri = f'cdisc:ct/{ct_package}/{cl_code or cl_name}'

        with transaction.atomic():
            cl_entity, created = KnowledgeEntity.objects.get_or_create(
                namespace=namespace,
                uri=uri,
                is_deleted=False,
                defaults={
                    'entity_type': EntityType.CLASS,
                    'label': cl_name,
                    'label_en': cl_name,
                    'definition': cl_definition,
                    'parent': ct_root,
                    'properties': {
                        'conceptId': cl_code,
                        'submissionValue': cl_detail.get('submissionValue', ''),
                        'extensible': cl_detail.get('extensible', ''),
                        'source': 'cdisc-ct-import',
                    },
                },
            )
            if created:
                stats['codelists_created'] += 1
            else:
                stats['skipped'] += 1
            _ensure_linked_entry(cl_entity, source_type='cdisc_import',
                                 entry_type=EntryType.METHOD_REFERENCE,
                                 extra_tags=['CDISC-CT', 'codelist'])

            terms = cl_detail.get('terms', [])
            for term in terms:
                term_name = (term.get('preferredTerm', term.get('submissionValue', '')) or '')[:490]
                term_code = term.get('conceptId', '')
                if not term_name:
                    continue
                term_uri = f'cdisc:ct/{ct_package}/{cl_code}/{term_code or term_name}'

                _, t_created = KnowledgeEntity.objects.get_or_create(
                    namespace=namespace,
                    uri=term_uri,
                    is_deleted=False,
                    defaults={
                        'entity_type': EntityType.INSTANCE,
                        'label': term_name,
                        'label_en': (term.get('submissionValue', term_name) or '')[:490],
                        'definition': term.get('definition', ''),
                        'parent': cl_entity,
                        'properties': {
                            'conceptId': term_code,
                            'submissionValue': term.get('submissionValue', ''),
                            'source': 'cdisc-ct-import',
                        },
                    },
                )
                if t_created:
                    stats['terms_created'] += 1
                    # 为 term 实体确保 linked_entry
                    term_entity = KnowledgeEntity.objects.filter(
                        namespace=namespace, uri=term_uri, is_deleted=False,
                    ).first()
                    if term_entity:
                        _ensure_linked_entry(term_entity, source_type='cdisc_import',
                                             entry_type=EntryType.METHOD_REFERENCE,
                                             extra_tags=['CDISC-CT', 'term'])

        if (idx + 1) % 50 == 0:
            logger.info('CT 进度: %d/%d codelists 已处理', idx + 1, min(len(codelist_links), max_codelists))

    return {'success': True, 'ct_package': ct_package, 'version': version, **stats}


# ── Django 管理命令入口 ──

def run_full_cdisc_import(
    sdtm_version: str = '3-4',
    cdash_version: str = '2-2',
    ct_version: str = '2025-03-28',
    include_variables: bool = True,
    include_ct: bool = True,
) -> Dict[str, Any]:
    """
    完整 CDISC 导入流程：SDTM 域 → SDTM 变量 → CDASH 域 → 受控术语

    版本格式：连字符（如 3-4, 2-2），CT 版本用日期（如 2025-03-28）
    """
    results = {}

    logger.info('=== Phase 1: SDTM IG 域导入 (version %s) ===', sdtm_version)
    sdtm_result = import_sdtm_domains(sdtm_version)
    results['sdtm_domains'] = sdtm_result

    if include_variables and sdtm_result.get('success'):
        logger.info('=== Phase 2: SDTM 变量导入 ===')
        domains_data = _api_get(f'/mdr/sdtmig/{sdtm_version}/datasets')
        if domains_data:
            domain_links = (
                domains_data.get('_links', {}).get('datasets', [])
                or domains_data.get('datasets', [])
            )
            for d in domain_links:
                code = _extract_code_from_href(d.get('href', '')) or d.get('name', '')
                if code:
                    var_result = import_sdtm_variables(code, sdtm_version)
                    results[f'sdtm_vars_{code}'] = var_result

    logger.info('=== Phase 3: CDASH IG 域导入 (version %s) ===', cdash_version)
    cdash_result = import_cdash_domains(cdash_version)
    results['cdash_domains'] = cdash_result

    if include_ct:
        logger.info('=== Phase 4: 受控术语导入 (version %s) ===', ct_version)
        ct_result = import_controlled_terminology('sdtmct', ct_version)
        results['controlled_terminology'] = ct_result

    total_created = sum(
        r.get('created', 0) + r.get('codelists_created', 0) + r.get('terms_created', 0)
        for r in results.values() if isinstance(r, dict)
    )

    return {
        'success': True,
        'total_entities_created': total_created,
        'details': results,
    }


# ── 工具函数 ──

def _ensure_root_entity(
    namespace: str,
    uri: str,
    label: str,
    label_en: str,
    definition: str,
) -> KnowledgeEntity:
    entity, _ = KnowledgeEntity.objects.get_or_create(
        namespace=namespace,
        uri=uri,
        is_deleted=False,
        defaults={
            'entity_type': EntityType.CLASS,
            'label': label,
            'label_en': label_en,
            'definition': definition,
            'properties': {'source': 'cdisc-library', 'is_root': True},
        },
    )
    return entity


def _ensure_relation(
    subject: KnowledgeEntity,
    object_entity: KnowledgeEntity,
    relation_type: str,
    predicate_uri: str,
    source: str,
):
    KnowledgeRelation.objects.get_or_create(
        subject=subject,
        predicate_uri=predicate_uri,
        object=object_entity,
        is_deleted=False,
        defaults={
            'relation_type': relation_type,
            'confidence': 1.0,
            'source': source,
        },
    )


def _extract_code_from_href(href: str) -> str:
    if not href:
        return ''
    parts = href.rstrip('/').split('/')
    return parts[-1] if parts else ''


def _ensure_linked_entry(
    entity: KnowledgeEntity,
    source_type: str,
    entry_type: str = EntryType.METHOD_REFERENCE,
    extra_tags: list = None,
) -> KnowledgeEntry:
    """
    为 KnowledgeEntity 创建或获取关联的 KnowledgeEntry，并建立 linked_entry 关系。
    幂等操作：已关联则直接返回已有 Entry。
    """
    if entity.linked_entry_id is not None:
        return entity.linked_entry

    source_key = f'{source_type}:{entity.namespace}:{entity.uri}'[:120]
    tags = [entity.namespace, 'CDISC', source_type] + (extra_tags or [])
    content = entity.label
    if entity.definition:
        content = f'{entity.label}\n\n{entity.definition}'

    entry, _ = KnowledgeEntry.objects.get_or_create(
        source_type=source_type,
        source_key=source_key,
        defaults={
            'title': entity.label[:500],
            'content': content,
            'summary': (entity.definition or entity.label)[:200],
            'entry_type': entry_type,
            'namespace': entity.namespace,
            'uri': entity.uri,
            'tags': [t for t in tags if t],
            'is_published': True,
            'status': 'published',
        },
    )
    entity.linked_entry = entry
    entity.save(update_fields=['linked_entry'])
    return entry
