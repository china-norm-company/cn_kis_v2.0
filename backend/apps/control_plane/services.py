from __future__ import annotations

import json
import os
import socket
import ssl
from collections import defaultdict
from datetime import datetime, timedelta
from ipaddress import ip_address
from pathlib import Path
from typing import Dict, List, Optional
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

from django.db.models import QuerySet
from django.utils import timezone

from apps.iot_data.models import DeviceReading
from apps.resource.models import (
    ResourceItem,
    ResourceType,
    VenueEnvironmentLog,
)
from apps.resource.models_facility import EnvironmentIncident, IncidentStatus

EDGE_COLLECTOR_PREFIX = 'edge-collector:'
EDGE_COLLECTOR_HEARTBEAT = 'agent_heartbeat'
EDGE_COLLECTOR_INGEST_COUNT = 'instrument_ingest_count'
EDGE_COLLECTOR_OFFLINE_MINUTES = 5

SNAPSHOT_PATH = Path(__file__).resolve().parent / 'network_snapshot.json'
RESOURCE_REGISTRY_PATH = Path(__file__).resolve().parent / 'resource_registry.json'
LIVE_SNAPSHOT_PATH = Path(__file__).resolve().parent / 'snapshots' / 'latest_snapshot.json'

DIRECT_PUBLIC_PROBE = 'direct_public_probe'
EDGE_AGENT_REQUIRED = 'edge_agent_required'
CONFIG_AUDIT = 'config_audit'
INTEGRATED_LIVE = 'integrated_live'

CONTROL_PLANE_PUBLIC_URL = 'http://118.196.64.48/control-plane/'
PUBLIC_HEALTH_URLS = {
    'obj-reg-volcengine-ecs': 'http://118.196.64.48/control-plane/',
    'obj-reg-domain-www-utest': 'https://www.utest.cc/api/v1/health',
    'obj-reg-domain-mini-china-norm': 'https://mini.china-norm.com/api/v1/health',
    'obj-reg-domain-mini-utest': 'http://mini.utest.cc/',
    'obj-reg-domain-utest-root': 'https://utest.cc/',
}
IDENTITY_ENV_MAP = {
    'obj-reg-feishu-secretary': ('FEISHU_APP_ID', 'FEISHU_REDIRECT_URI'),
    'obj-reg-feishu-finance': ('FEISHU_APP_ID_FINANCE', 'FEISHU_REDIRECT_URI_FINANCE'),
    'obj-reg-feishu-lab-personnel': ('FEISHU_APP_ID_LAB_PERSONNEL', 'FEISHU_REDIRECT_URI_LAB_PERSONNEL'),
    'obj-reg-feishu-ethics': ('FEISHU_APP_ID_ETHICS', 'FEISHU_REDIRECT_URI_ETHICS'),
    'obj-reg-feishu-control-plane': ('FEISHU_APP_ID_CONTROL_PLANE', 'FEISHU_REDIRECT_URI_CONTROL_PLANE'),
}

RUNTIME_CHECKS_CACHE_TTL_SECONDS = 90
_runtime_checks_cache: Dict[str, dict] = {}
_runtime_checks_cache_at: Optional[datetime] = None

# 工单状态流转内存覆盖（Phase 5 闭环）；后续对接 workorder 后移除
_ticket_status_overrides: Dict[str, str] = {}
_ticket_updated_overrides: Dict[str, str] = {}


def _load_network_snapshot() -> dict:
    if not SNAPSHOT_PATH.exists():
        return {}
    with open(SNAPSHOT_PATH, encoding='utf-8') as f:
        return json.load(f)


def _load_resource_registry() -> dict:
    if not RESOURCE_REGISTRY_PATH.exists():
        return {}
    with open(RESOURCE_REGISTRY_PATH, encoding='utf-8') as f:
        return json.load(f)


def _load_live_snapshot() -> dict:
    if not LIVE_SNAPSHOT_PATH.exists():
        return {}
    try:
        with open(LIVE_SNAPSHOT_PATH, encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


RESOURCE_CATEGORY_MAP = {
    'network-security': {
        'name': '网络与安全设备',
        'live_categories': ['网络与安全设备'],
        'icon': 'shield',
    },
    'compute-virtualization': {
        'name': '服务器与计算资源',
        'live_categories': ['服务器与计算资源'],
        'icon': 'server',
    },
    'storage-database': {
        'name': '存储与数据资源',
        'live_categories': ['存储与数据资源'],
        'icon': 'database',
    },
    'endpoint-output': {
        'name': '终端与办公设备',
        'live_categories': ['终端与办公设备'],
        'icon': 'printer',
    },
    'domain-cloud-entry': {
        'name': '域名与云服务',
        'live_categories': ['云服务与平台', '域名与公网入口'],
        'icon': 'cloud',
    },
    'identity-collaboration': {
        'name': '身份与协同服务',
        'live_categories': ['身份与协同服务'],
        'icon': 'users',
    },
    'ai-model-resource': {
        'name': 'AI与大模型',
        'live_categories': ['AI能力与大模型'],
        'icon': 'brain',
    },
    'application-service': {
        'name': '业务与接入服务',
        'live_categories': ['业务与接入服务'],
        'icon': 'activity',
    },
}

# 业务场景定义：用于今日运行与场景中心（Phase 1）
BUSINESS_SCENARIOS = [
    {'id': 'scene-opening', 'name': '开工准备', 'description': '核心入口、身份、网络、数据库、关键依赖就绪', 'required_category_ids': ['network-security', 'identity-collaboration', 'domain-cloud-entry', 'storage-database']},
    {'id': 'scene-execution', 'name': '现场执行', 'description': '房间、环境、仪器、边缘、终端与输出链路齐备', 'required_category_ids': ['network-security', 'compute-virtualization', 'endpoint-output', 'application-service']},
    {'id': 'scene-data-collect', 'name': '数据采集', 'description': '采集主机、数据库、存储与上报链路连续', 'required_category_ids': ['storage-database', 'application-service', 'compute-virtualization']},
    {'id': 'scene-delivery', 'name': '对外交付', 'description': '域名、证书、云入口、身份与智能服务可用', 'required_category_ids': ['domain-cloud-entry', 'identity-collaboration', 'ai-model-resource']},
    {'id': 'scene-auth', 'name': '系统登录与认证', 'description': '飞书 OAuth、工作台入口可用', 'required_category_ids': ['identity-collaboration', 'domain-cloud-entry']},
    {'id': 'scene-ai', 'name': 'AI 辅助处理', 'description': '大模型 API 与调用链路可用', 'required_category_ids': ['ai-model-resource']},
]

# 依赖边：(from_id, to_id) 表示 from 依赖 to；用于对象依赖与影响分析
def _build_dependency_edges() -> List[tuple]:
    """核心依赖来自 dependency_check；扩展为 (object_id_or_placeholder, depends_on_id) 列表。"""
    live = _load_live_snapshot()
    resources = {r['id']: r for r in live.get('resources', [])}
    edges = []
    core_ids = ['volcengine-ecs', 'baohua-core-switch', 'baohua-fw-main', 'nas-server', 'db-read', 'domain-mini-chinanorm', 'feishu-control-plane']
    for i, rid in enumerate(core_ids):
        if i + 1 < len(core_ids):
            edges.append((core_ids[i + 1], rid))
        edges.append(('control-plane-entry', rid))
    return edges


def get_resource_health_overview() -> dict:
    """Return per-category health overview using live snapshot data."""
    snapshot = _load_live_snapshot()
    resources = snapshot.get('resources', [])
    collected_at = snapshot.get('collected_at', '')

    category_health: list[dict] = []
    for cat_id, cat_meta in RESOURCE_CATEGORY_MAP.items():
        live_cats = cat_meta['live_categories']
        items = [r for r in resources if r.get('category') in live_cats]
        total = len(items)
        online = len([r for r in items if r.get('status') in ('online', 'healthy', 'token_valid', 'reachable')])
        warning = len([r for r in items if r.get('status') in ('warning', 'cert_expiring', 'cert_invalid')])
        offline = len([r for r in items if r.get('status') in ('offline',)])
        other = total - online - warning - offline

        if total == 0:
            health = 'unknown'
        elif offline > 0 or warning > 0:
            health = 'warning' if offline == 0 else 'critical'
        else:
            health = 'healthy'

        category_health.append({
            'id': cat_id,
            'name': cat_meta['name'],
            'icon': cat_meta['icon'],
            'total': total,
            'online': online,
            'warning': warning,
            'offline': offline,
            'other': other,
            'health': health,
            'items': [
                {
                    'id': r.get('id', ''),
                    'name': r.get('name', ''),
                    'location': r.get('location', ''),
                    'status': r.get('status', ''),
                    'type': r.get('type', ''),
                    'collected_at': r.get('collected_at', ''),
                    'details': r.get('details', {}),
                }
                for r in items
            ],
        })

    total_resources = len(resources)
    healthy_count = len([r for r in resources if r.get('status') in ('online', 'healthy', 'token_valid', 'reachable')])
    problem_count = len([r for r in resources if r.get('status') in ('offline', 'cert_invalid')])

    return {
        'collected_at': collected_at,
        'total_resources': total_resources,
        'healthy_count': healthy_count,
        'problem_count': problem_count,
        'categories': category_health,
    }


def get_dependency_check() -> dict:
    """Self-check: verify all platform dependencies are present and reachable."""
    snapshot = _load_live_snapshot()
    resources = snapshot.get('resources', [])

    checks: list[dict] = []

    core_deps = [
        ('volcengine-ecs', '火山云ECS(部署节点)', True),
        ('baohua-core-switch', '核心交换机(网络基础)', True),
        ('baohua-fw-main', '防火墙主机(安全边界)', True),
        ('nas-server', 'NAS存储(数据存储)', True),
        ('db-read', '生产数据库(数据服务)', True),
        ('domain-mini-chinanorm', '域名证书(公网入口)', True),
        ('feishu-control-plane', '飞书天工应用(身份认证)', True),
    ]

    resource_by_id = {r['id']: r for r in resources}

    for dep_id, dep_name, required in core_deps:
        r = resource_by_id.get(dep_id)
        if r is None:
            checks.append({
                'id': dep_id,
                'name': dep_name,
                'required': required,
                'status': 'missing',
                'message': '未在最近采集中发现此资源',
            })
        elif r.get('status') in ('online', 'healthy', 'token_valid', 'reachable'):
            checks.append({
                'id': dep_id,
                'name': dep_name,
                'required': required,
                'status': 'ok',
                'message': f"状态正常: {r.get('status')}",
            })
        else:
            checks.append({
                'id': dep_id,
                'name': dep_name,
                'required': required,
                'status': 'error',
                'message': f"状态异常: {r.get('status')}",
            })

    all_ok = all(c['status'] == 'ok' for c in checks if c['required'])
    missing = [c for c in checks if c['status'] == 'missing']
    errors = [c for c in checks if c['status'] == 'error']

    return {
        'all_ok': all_ok,
        'total_checks': len(checks),
        'ok_count': len([c for c in checks if c['status'] == 'ok']),
        'error_count': len(errors),
        'missing_count': len(missing),
        'checks': checks,
        'collected_at': snapshot.get('collected_at', ''),
    }


def get_scenarios() -> List[dict]:
    """返回业务场景列表及每场景就绪摘要。"""
    health = get_resource_health_overview()
    by_cat = {c['id']: c for c in health['categories']}
    result = []
    for scene in BUSINESS_SCENARIOS:
        cat_ids = scene.get('required_category_ids', [])
        ready = 0
        total = len(cat_ids)
        blocked = []
        for cid in cat_ids:
            cat = by_cat.get(cid)
            if not cat or cat['total'] == 0:
                blocked.append(cid)
                continue
            if cat['health'] == 'healthy':
                ready += 1
            else:
                blocked.append(cid)
        status = 'ready' if total > 0 and ready == total else ('degraded' if ready > 0 else 'blocked')
        result.append({
            'id': scene['id'],
            'name': scene['name'],
            'description': scene['description'],
            'status': status,
            'ready_count': ready,
            'total_count': total,
            'blocked_category_ids': blocked,
        })
    return result


def get_scenario_detail(scenario_id: str) -> Optional[dict]:
    """单个场景详情：绑定资源类别与就绪情况。"""
    scene = next((s for s in BUSINESS_SCENARIOS if s['id'] == scenario_id), None)
    if not scene:
        return None
    health = get_resource_health_overview()
    by_cat = {c['id']: c for c in health['categories']}
    categories = []
    for cid in scene.get('required_category_ids', []):
        cat = by_cat.get(cid, {})
        categories.append({
            'id': cid,
            'name': cat.get('name', cid),
            'health': cat.get('health', 'unknown'),
            'total': cat.get('total', 0),
            'online': cat.get('online', 0),
            'warning': cat.get('warning', 0),
            'offline': cat.get('offline', 0),
        })
    ready = sum(1 for c in categories if c['health'] == 'healthy')
    total = len(categories)
    status = 'ready' if total > 0 and ready == total else ('degraded' if ready > 0 else 'blocked')
    return {
        'id': scene['id'],
        'name': scene['name'],
        'description': scene['description'],
        'status': status,
        'categories': categories,
        'ready_count': ready,
        'total_count': total,
    }


def get_scenario_topology(scenario_id: str) -> Optional[dict]:
    """场景拓扑：节点为资源类别与关键对象，边为依赖。"""
    detail = get_scenario_detail(scenario_id)
    if not detail:
        return None
    nodes = [{'id': c['id'], 'label': c['name'], 'type': 'category', 'health': c['health']} for c in detail['categories']]
    edges = []
    for i, c in enumerate(detail['categories']):
        if i + 1 < len(detail['categories']):
            edges.append({'from': detail['categories'][i + 1]['id'], 'to': c['id']})
    return {'nodes': nodes, 'edges': edges}


def get_object_dependencies(object_id: str) -> dict:
    """对象依赖：该对象依赖谁、谁依赖该对象。基于 live 与核心依赖配置。"""
    objects = list_managed_objects()
    obj_map = {o['id']: o for o in objects}
    live = _load_live_snapshot()
    live_by_id = {r['id']: r for r in live.get('resources', [])}
    edges = _build_dependency_edges()
    depends_on = []
    depended_by = []
    for from_id, to_id in edges:
        if from_id == object_id or (object_id.startswith('obj-reg-') and to_id in (object_id, object_id.replace('obj-reg-', ''))):
            candidate = to_id
            if candidate in obj_map:
                o = obj_map[candidate]
                depends_on.append({'id': o['id'], 'name': o.get('name', ''), 'status': o.get('status', '')})
            elif candidate in live_by_id:
                r = live_by_id[candidate]
                depends_on.append({'id': r['id'], 'name': r.get('name', ''), 'status': r.get('status', '')})
        if to_id == object_id:
            candidate = from_id
            if candidate in obj_map:
                o = obj_map[candidate]
                depended_by.append({'id': o['id'], 'name': o.get('name', ''), 'status': o.get('status', '')})
            elif candidate in live_by_id:
                r = live_by_id[candidate]
                depended_by.append({'id': r['id'], 'name': r.get('name', ''), 'status': r.get('status', '')})
    return {'depends_on': depends_on, 'depended_by': depended_by}


def get_event_impact(event_id: str) -> Optional[dict]:
    """事件业务影响：受影响场景、依赖链上的环节、建议处置优先级。"""
    event = get_event_detail(event_id)
    if not event:
        return None
    source_id = event.get('source_object_id', '')
    source_obj = get_object_detail(source_id) if source_id else None
    source_category = None
    if source_obj and isinstance(source_obj.get('extra'), dict):
        source_category = source_obj['extra'].get('management_category_id')
    scenarios = get_scenarios()
    affected_scenario_ids = []
    for s in scenarios:
        if s['status'] == 'ready':
            continue
        if source_category and source_category in s.get('blocked_category_ids', []):
            affected_scenario_ids.append(s['id'])
        elif not source_category:
            affected_scenario_ids.append(s['id'])
    affected_scenarios = [{'id': s['id'], 'name': s['name'], 'status': s['status']} for s in scenarios if s['id'] in affected_scenario_ids]
    obj_deps = get_object_dependencies(source_id) if source_id else {'depends_on': [], 'depended_by': []}
    impact_level = 'high' if event.get('severity') in ('critical', 'high') else 'medium'
    return {
        'event_id': event_id,
        'source_object_id': source_id,
        'impact_level': impact_level,
        'affected_scenario_ids': affected_scenario_ids,
        'affected_scenarios': affected_scenarios,
        'dependency_chain': obj_deps['depends_on'],
        'recommendation': '优先恢复来源对象或依赖链上的上游资源',
    }


_TYPE_LABELS = {
    'firewall': ('security_device', '防火墙', '网络与安全域'),
    'wireless_controller': ('network_device', '无线控制器', '管理域'),
    'switch': ('network_device', '接入/汇聚交换机', '管理域'),
    'ip_phone': ('endpoint', 'IP 话机', '办公网'),
    'unknown': ('endpoint', '未知设备', '待识别'),
}


def _build_network_objects() -> List[dict]:
    snap = _load_network_snapshot()
    if not snap:
        return []

    objects: List[dict] = []
    cs = snap.get('core_switch', {})
    cpu = cs.get('cpu', {})
    mem = cs.get('memory', {})
    temps = cs.get('temperature', [])
    ifaces = snap.get('interfaces', {})
    hot = ifaces.get('hot_links', [])

    cpu_pct = cpu.get('current_percent', 0)
    mem_pct = mem.get('used_percent', 0)
    if cpu_pct > 80 or mem_pct > 85:
        sw_status, sw_risk = 'warning', 'high'
    else:
        sw_status, sw_risk = 'active', 'medium'

    temp_parts = ', '.join(f"Slot{t['slot']} {t['celsius']}°C" for t in temps)
    hot_parts = ', '.join(f"{h['name']} In {h['in']}%/Out {h['out']}%" for h in hot)
    summary = (
        f"堆叠双机 {cs.get('model', '')} | "
        f"CPU {cpu_pct}% 内存 {mem_pct}% | "
        f"端口 {ifaces.get('up', 0)} up/{ifaces.get('down', 0)} down | "
        f"温度 {temp_parts}"
    )
    if hot_parts:
        summary += f' | 热点链路: {hot_parts}'

    objects.append({
        'id': 'obj-core-switch',
        'asset_code': 'NET-CORE-001',
        'name': f"核心交换机 ({cs.get('model', 'S5735')})",
        'type': 'network_device',
        'subtype': 'core_switch',
        'zone': '管理域',
        'location': f"192.168.10.254 | 运行 {cs.get('uptime', '')}",
        'owner': '网络组',
        'status': sw_status,
        'risk_level': sw_risk,
        'last_seen_at': timezone.now().strftime('%Y-%m-%d %H:%M'),
        'summary': summary,
        'extra': {
            'cpu': cpu,
            'memory': mem,
            'temperature': temps,
            'power': cs.get('power', []),
            'stack': cs.get('stack_members', []),
            'interfaces_up': ifaces.get('up', 0),
            'interfaces_down': ifaces.get('down', 0),
            'hot_links': hot,
        },
    })

    fw = snap.get('firewall', {})
    if fw:
        objects.append({
            'id': 'obj-firewall',
            'asset_code': 'NET-FW-001',
            'name': f"防火墙 ({fw.get('model', 'USG')})",
            'type': 'security_device',
            'subtype': 'firewall',
            'zone': '网络与安全域',
            'location': f"{fw.get('host', '')} | VRRP VIP {fw.get('vrrp_vip', '')}",
            'owner': '网络组',
            'status': 'active',
            'risk_level': 'medium',
            'last_seen_at': timezone.now().strftime('%Y-%m-%d %H:%M'),
            'summary': f"通过 LLDP 发现，型号 {fw.get('model', '')}，管理地址 {fw.get('management_url', '')}，上联 {fw.get('connected_via', '')}。",
            'extra': {'management_url': fw.get('management_url', ''), 'data_source': 'lldp'},
        })

    wc = snap.get('wireless_controller', {})
    if wc:
        ap_count = sum(
            1 for d in snap.get('discovered_devices', [])
            if d['type'] == 'unknown' and any('GE0/0/21' in p for p in d.get('connected_via', []))
        )
        objects.append({
            'id': 'obj-wireless-ac',
            'asset_code': 'NET-AC-001',
            'name': f"无线控制器 ({wc.get('model', 'AirEngine')})",
            'type': 'network_device',
            'subtype': 'wireless_controller',
            'zone': '管理域',
            'location': f"上联 {wc.get('connected_via', '')}",
            'owner': '网络组',
            'status': 'active',
            'risk_level': 'medium',
            'last_seen_at': timezone.now().strftime('%Y-%m-%d %H:%M'),
            'summary': f"通过 LLDP 发现，型号 {wc.get('model', '')}，管理约 {ap_count} 台 AP。",
            'extra': {'ap_count': ap_count, 'data_source': 'lldp'},
        })

    for dev in snap.get('discovered_devices', []):
        dtype = dev.get('type', 'unknown')
        if dtype in ('firewall', 'wireless_controller'):
            continue
        type_info = _TYPE_LABELS.get(dtype, _TYPE_LABELS['unknown'])
        dev_id = dev['name'].lower().replace(' ', '-').replace('_', '-')[:30]
        connected = ', '.join(dev.get('connected_via', []))
        objects.append({
            'id': f'obj-lldp-{dev_id}',
            'asset_code': '',
            'name': f"{type_info[1]}: {dev['name']}",
            'type': type_info[0],
            'subtype': dtype,
            'zone': type_info[2],
            'location': f'上联 {connected}',
            'owner': '网络组',
            'status': 'active',
            'risk_level': 'low',
            'last_seen_at': timezone.now().strftime('%Y-%m-%d %H:%M'),
            'summary': f"LLDP 发现 {dev.get('link_count', 1)} 条链路，连接端口 {connected}。",
        })

    arp = snap.get('arp', {})
    arp_summary = arp.get('summary', {})
    by_vlan = arp.get('by_vlan', {})
    if arp_summary:
        vlan_parts = ', '.join(
            f"{k} {v.get('active', 0)} 台在线"
            for k, v in sorted(by_vlan.items(), key=lambda x: -x[1].get('active', 0))
            if v.get('active', 0) > 0
        )
        objects.append({
            'id': 'obj-network-endpoints',
            'asset_code': 'NET-ENDPOINTS',
            'name': '在线终端设备汇总',
            'type': 'summary',
            'subtype': 'endpoint_summary',
            'zone': '全网',
            'location': '来自 ARP 表统计',
            'owner': '网络组',
            'status': 'active',
            'risk_level': 'low',
            'last_seen_at': timezone.now().strftime('%Y-%m-%d %H:%M'),
            'summary': f"ARP 总计 {arp_summary.get('total', 0)} 条（动态 {arp_summary.get('dynamic', 0)}）。{vlan_parts}",
            'extra': {'arp_summary': arp_summary, 'by_vlan': by_vlan},
        })

    return objects


def _build_network_events(network_objects: List[dict]) -> List[dict]:
    snap = _load_network_snapshot()
    if not snap:
        return []

    events: List[dict] = []
    hot_links = snap.get('interfaces', {}).get('hot_links', [])
    for link in hot_links:
        max_util = max(link.get('in', 0), link.get('out', 0))
        severity = 'critical' if max_util > 60 else 'high' if max_util > 40 else 'medium'
        events.append({
            'id': f"evt-hotlink-{link['name'].lower().replace('/', '-')}",
            'title': f"链路 {link['name']} 带宽利用率偏高",
            'category': 'performance',
            'severity': severity,
            'status': 'new',
            'source_object_id': 'obj-core-switch',
            'location': f"核心交换机 {link['name']}",
            'detected_at': timezone.now().strftime('%Y-%m-%d %H:%M'),
            'owner': '网络组',
            'summary': f"入向 {link['in']}% / 出向 {link['out']}%，建议关注流量分布与链路容量。",
        })

    cpu = snap.get('core_switch', {}).get('cpu', {})
    if cpu.get('max_percent', 0) > 70:
        events.append({
            'id': 'evt-cpu-peak',
            'title': f"核心交换机 CPU 历史峰值 {cpu['max_percent']}%",
            'category': 'performance',
            'severity': 'medium',
            'status': 'new',
            'source_object_id': 'obj-core-switch',
            'location': '192.168.10.254',
            'detected_at': timezone.now().strftime('%Y-%m-%d %H:%M'),
            'owner': '网络组',
            'summary': f"当前 {cpu.get('current_percent', 0)}%，五分钟均值 {cpu.get('five_minutes', 0)}%，历史峰值 {cpu['max_percent']}%。",
        })

    power_supplies = snap.get('core_switch', {}).get('power', [])
    absent = [p for p in power_supplies if not p.get('online', True)]
    if absent:
        slot_ids = ', '.join(f"Slot{p['slot']}/{p['id']}" for p in absent)
        events.append({
            'id': 'evt-power-absent',
            'title': f"核心交换机电源缺失: {slot_ids}",
            'category': 'hardware',
            'severity': 'medium',
            'status': 'new',
            'source_object_id': 'obj-core-switch',
            'location': '192.168.10.254',
            'detected_at': timezone.now().strftime('%Y-%m-%d %H:%M'),
            'owner': '网络组',
            'summary': f"堆叠设备 {slot_ids} 电源未接入，当前仅单电源供电，建议补齐冗余电源。",
        })

    return events


STATIC_TICKETS = [
    {
        'id': 'ticket-001',
        'title': '排查采集主机 03 离线原因',
        'related_event_id': 'evt-edge-collector-fallback',
        'assignee': '张工',
        'status': 'processing',
        'updated_at': '2026-03-10 08:58',
    },
]


def _format_datetime(value) -> str:
    if not value:
        return ''
    local_value = timezone.localtime(value) if timezone.is_aware(value) else value
    return local_value.strftime('%Y-%m-%d %H:%M')


def _now_text() -> str:
    return timezone.now().strftime('%Y-%m-%d %H:%M')


def _parse_host(location: str) -> str:
    text = (location or '').strip()
    if not text:
        return ''
    if '://' in text:
        return urllib_parse.urlparse(text).hostname or ''
    primary = text.split('|', 1)[0].strip()
    return primary.split(':', 1)[0].strip()


def _is_private_target(location: str) -> bool:
    host = _parse_host(location)
    if not host:
        return False
    try:
        return ip_address(host).is_private
    except ValueError:
        return False


def _http_probe(url: str, timeout: float = 2.5) -> dict:
    try:
        req = urllib_request.Request(url, headers={'User-Agent': 'cn-kis-control-plane/1.0'})
        with urllib_request.urlopen(req, timeout=timeout) as response:
            code = getattr(response, 'status', 200)
            return {
                'status': 'healthy' if 200 <= code < 400 else 'warning',
                'detail': f'HTTP {code}',
            }
    except urllib_error.HTTPError as exc:
        code = exc.code
        return {
            'status': 'healthy' if 200 <= code < 400 else 'warning' if code < 500 else 'error',
            'detail': f'HTTP {code}',
        }
    except Exception as exc:
        return {
            'status': 'error',
            'detail': f'访问失败: {exc}',
        }


def _tls_days_remaining(host: str, port: int = 443) -> Optional[int]:
    try:
        context = ssl.create_default_context()
        with socket.create_connection((host, port), timeout=2.5) as sock:
            with context.wrap_socket(sock, server_hostname=host) as ssock:
                cert = ssock.getpeercert()
        not_after = cert.get('notAfter')
        if not not_after:
            return None
        expires_at = datetime.strptime(not_after, '%b %d %H:%M:%S %Y %Z')
        delta = expires_at - timezone.now().replace(tzinfo=None)
        return max(delta.days, 0)
    except Exception:
        return None


def _resolve_management_profile(item: dict) -> dict:
    item_type = str(item.get('type') or '')
    subtype = str(item.get('subtype') or '')
    object_id = str(item.get('id') or '')
    location = str(item.get('location') or '')

    if item_type in ('network_device', 'security_device'):
        probe_strategy = INTEGRATED_LIVE if not object_id.startswith('obj-reg-') else EDGE_AGENT_REQUIRED
        return {
            'management_category_id': 'network-security',
            'management_category': '网络与安全设备',
            'management_tier': 'S1',
            'service_level': '核心生产资源',
            'probe_strategy': probe_strategy,
            'collector_mode': 'SSH/SNMP/API/拓扑归集',
            'governance_mode': '拓扑+配置+性能+安全策略统一治理',
            'recommended_metrics': ['端口状态', '带宽利用率', 'CPU/内存', '策略配置', 'ARP/MAC'],
        }

    if subtype in ('virtualization_host', 'user_vm', 'gpu_server', 'domain_controller', 'print_server') or item_type == 'compute':
        return {
            'management_category_id': 'compute-virtualization',
            'management_category': '计算与虚拟化资源',
            'management_tier': 'S1' if subtype in ('virtualization_host', 'gpu_server', 'domain_controller') else 'S2',
            'service_level': '生产计算资源',
            'probe_strategy': EDGE_AGENT_REQUIRED if _is_private_target(location) else DIRECT_PUBLIC_PROBE,
            'collector_mode': '节点 Agent / SSH / 指标采集',
            'governance_mode': '容量、可用性、任务负载统一治理',
            'recommended_metrics': ['CPU', '内存', '磁盘/IO', '在线率', 'GPU 温度/利用率'],
        }

    if item_type in ('storage', 'database'):
        return {
            'management_category_id': 'storage-database',
            'management_category': '存储与数据资源',
            'management_tier': 'S1',
            'service_level': '数据核心资源',
            'probe_strategy': EDGE_AGENT_REQUIRED if _is_private_target(location) else DIRECT_PUBLIC_PROBE,
            'collector_mode': '数据库连接检查 / 存储指标 / 备份任务归集',
            'governance_mode': '容量、备份、性能与恢复统一治理',
            'recommended_metrics': ['连接成功率', '慢查询', '容量', 'RAID/SMART', '备份成功率'],
        }

    if item_type == 'application' or subtype == 'edge_collector_host':
        return {
            'management_category_id': 'application-service',
            'management_category': '业务与接入服务',
            'management_tier': 'S1' if subtype == 'api_platform' else 'S2',
            'service_level': '服务接入资源',
            'probe_strategy': INTEGRATED_LIVE if subtype == 'edge_collector_host' and not object_id.startswith('obj-reg-') else EDGE_AGENT_REQUIRED,
            'collector_mode': 'HTTP/端口检查 / 日志归集 / 心跳采集',
            'governance_mode': '服务可用性与发布闭环治理',
            'recommended_metrics': ['可用率', '延迟', '错误率', '采集量', '重启次数'],
        }

    if item_type == 'identity_service':
        return {
            'management_category_id': 'identity-collaboration',
            'management_category': '身份与协同应用',
            'management_tier': 'S1',
            'service_level': '统一认证资源',
            'probe_strategy': CONFIG_AUDIT,
            'collector_mode': '环境变量/redirect/权限配置巡检',
            'governance_mode': 'OAuth、权限、可见性统一治理',
            'recommended_metrics': ['登录成功率', 'OAuth 错误数', '配置漂移数', '权限缺口数'],
        }

    if item_type in ('cloud_service', 'domain'):
        return {
            'management_category_id': 'domain-cloud-entry',
            'management_category': '域名与云服务入口',
            'management_tier': 'S1' if item_type == 'cloud_service' else 'S2',
            'service_level': '公网入口资源',
            'probe_strategy': DIRECT_PUBLIC_PROBE,
            'collector_mode': 'HTTP/DNS/TLS/进程健康检查',
            'governance_mode': '公网接入层统一治理',
            'recommended_metrics': ['HTTP 状态', '证书剩余天数', 'DNS 解析', '进程健康'],
        }

    if item_type == 'ai_service':
        return {
            'management_category_id': 'ai-model-resource',
            'management_category': 'AI 与模型资源',
            'management_tier': 'S1',
            'service_level': '智能化核心资源',
            'probe_strategy': DIRECT_PUBLIC_PROBE,
            'collector_mode': 'API 可达性 / 成本 / 配额巡检',
            'governance_mode': '模型调用与成本统一治理',
            'recommended_metrics': ['调用成功率', '延迟', 'Token/费用', '回退次数'],
        }

    if item_type == 'endpoint' and subtype == 'printer':
        return {
            'management_category_id': 'endpoint-output',
            'management_category': '终端与输出设备',
            'management_tier': 'S3',
            'service_level': '终端输出资源',
            'probe_strategy': EDGE_AGENT_REQUIRED,
            'collector_mode': '局域网探活 / 错误码 / 耗材采集',
            'governance_mode': '终端状态与派单统一治理',
            'recommended_metrics': ['在线率', '作业失败率', '耗材状态', '故障次数'],
        }

    # 实验室检测仪器
    if item_type == 'instrument' or subtype == 'skin_analyzer':
        return {
            'management_category_id': 'lab-instrument',
            'management_category': '实验室检测仪器',
            'management_tier': 'S1',
            'service_level': '核心生产仪器',
            'probe_strategy': EDGE_AGENT_REQUIRED,
            'collector_mode': 'LIMS API / 设备序列号巡检 / 维保日期监控',
            'governance_mode': '仪器状态、维保、校准周期统一治理',
            'recommended_metrics': ['在线状态', '最近校准日期', '维保到期', '使用频率'],
        }

    # SaaS 生产系统
    if item_type == 'saas' or (item_type == 'application' and subtype == 'production_system'):
        tier = 'S1' if subtype == 'production_system' else 'S2'
        return {
            'management_category_id': 'saas-production',
            'management_category': 'SaaS生产系统',
            'management_tier': tier,
            'service_level': 'SaaS订阅资源',
            'probe_strategy': DIRECT_PUBLIC_PROBE if str(location).startswith('http') else CONFIG_AUDIT,
            'collector_mode': 'HTTP健康检查 / 合同到期监控 / 登录可达性',
            'governance_mode': '可用性、合同续费、账号权限统一治理',
            'recommended_metrics': ['服务可用率', '合同剩余天数', '登录成功率', '许可证使用量'],
        }

    # SSL证书 / 域名（带证书检测）
    if item_type == 'certificate':
        return {
            'management_category_id': 'domain-cloud-entry',
            'management_category': '域名与云服务入口',
            'management_tier': 'S1',
            'service_level': '公网接入安全资源',
            'probe_strategy': DIRECT_PUBLIC_PROBE,
            'collector_mode': 'TLS证书到期检测 / OCSP状态',
            'governance_mode': 'SSL/TLS证书全生命周期统一治理',
            'recommended_metrics': ['证书剩余天数', '证书颁发机构', 'HTTPS可达性'],
        }

    # IoT 设备
    if item_type == 'iot':
        return {
            'management_category_id': 'iot-environment',
            'management_category': 'IoT与环境传感器',
            'management_tier': 'S2',
            'service_level': '环境监测资源',
            'probe_strategy': EDGE_AGENT_REQUIRED,
            'collector_mode': 'MQTT / HTTP / BLE 数据上报',
            'governance_mode': '传感器在线状态、数据新鲜度统一治理',
            'recommended_metrics': ['在线状态', '数据更新时间', '告警触发次数'],
        }

    # 场地/设施
    if item_type == 'facility':
        return {
            'management_category_id': 'facility-space',
            'management_category': '场地与设施资源',
            'management_tier': 'S2',
            'service_level': '物理场地资源',
            'probe_strategy': EDGE_AGENT_REQUIRED,
            'collector_mode': '环境传感器 / 资产盘点 / 合同到期',
            'governance_mode': '场地容量、使用率、合规统一治理',
            'recommended_metrics': ['房间使用率', '环境达标率', '维保到期'],
        }

    # AI/API 资源
    if item_type == 'ai_api':
        return {
            'management_category_id': 'ai-model-resource',
            'management_category': 'AI 与模型资源',
            'management_tier': 'S1',
            'service_level': 'AI服务资源',
            'probe_strategy': DIRECT_PUBLIC_PROBE,
            'collector_mode': 'API可达性 / 余额 / 调用量监控',
            'governance_mode': 'AI模型调用成本与可用性统一治理',
            'recommended_metrics': ['API可达性', '余额剩余', '调用成功率', 'Token消耗'],
        }

    return {
        'management_category_id': 'other',
        'management_category': '其他资源',
        'management_tier': 'S3',
        'service_level': '一般资源',
        'probe_strategy': EDGE_AGENT_REQUIRED if _is_private_target(location) else DIRECT_PUBLIC_PROBE,
        'collector_mode': '待定义',
        'governance_mode': '待纳入统一治理',
        'recommended_metrics': [],
    }


def _get_cached_runtime_checks_map(objects: List[dict]) -> Dict[str, dict]:
    """返回 object_id -> {status, detail, action_hint, category} 的映射，带 90 秒缓存避免每次请求都拨测。"""
    global _runtime_checks_cache, _runtime_checks_cache_at
    now = timezone.now()
    if _runtime_checks_cache_at is not None:
        delta = (now - _runtime_checks_cache_at).total_seconds()
        if delta <= RUNTIME_CHECKS_CACHE_TTL_SECONDS and _runtime_checks_cache:
            return _runtime_checks_cache
    runtime = _build_management_runtime(objects)
    out: Dict[str, dict] = {}
    for check in runtime.get('checks', []):
        obj_id = check['id'].replace('check-', '')
        out[obj_id] = {
            'status': check.get('status', ''),
            'detail': check.get('detail', ''),
            'action_hint': check.get('action_hint', ''),
            'category': check.get('category', ''),
        }
    _runtime_checks_cache = out
    _runtime_checks_cache_at = now
    return out


def get_runtime_checks_last_check_at() -> Optional[str]:
    """返回最近一次治理巡检完成时间的可读字符串，无缓存时返回 None。"""
    if _runtime_checks_cache_at is None:
        return None
    return _runtime_checks_cache_at.strftime('%Y-%m-%d %H:%M:%S')


def clear_runtime_checks_cache() -> None:
    """清空治理巡检缓存，下次 list_managed_objects 或 get_management_blueprint 将重新执行拨测。"""
    global _runtime_checks_cache, _runtime_checks_cache_at
    _runtime_checks_cache = {}
    _runtime_checks_cache_at = None


def _augment_managed_object(item: dict, check_result: Optional[dict] = None) -> dict:
    extra = item.get('extra') if isinstance(item.get('extra'), dict) else {}
    profile = _resolve_management_profile(item)
    merged_extra = {
        **extra,
        **profile,
    }
    if 'monitoring_status' not in merged_extra:
        merged_extra['monitoring_status'] = 'live' if profile['probe_strategy'] == INTEGRATED_LIVE else 'planned'
    if check_result:
        merged_extra['governance_check_status'] = check_result.get('status', '')
        merged_extra['governance_check_detail'] = check_result.get('detail', '')
        merged_extra['governance_check_action_hint'] = check_result.get('action_hint', '')
        merged_extra['governance_check_category'] = check_result.get('category', '')
        merged_extra['governance_check_at'] = _now_text()
    return {
        **item,
        'extra': merged_extra,
    }


def _sanitize_device_id(device_id: str) -> str:
    return device_id.replace(':', '-').replace('/', '-').replace(' ', '-')


def _edge_collector_queryset() -> QuerySet[DeviceReading]:
    return DeviceReading.objects.filter(device_id__startswith=EDGE_COLLECTOR_PREFIX).order_by('-timestamp')


def _build_edge_collector_objects() -> List[dict]:
    readings = list(_edge_collector_queryset()[:200])
    if not readings:
        return [
            {
                'id': 'obj-edge-collector-fallback',
                'asset_code': 'EDG-COL-UNKNOWN',
                'name': '仪器采集主机（待接入心跳）',
                'type': 'endpoint',
                'subtype': 'edge_collector_host',
                'zone': '仪器采集域',
                'location': '待识别',
                'owner': '仪器组',
                'status': 'offline',
                'risk_level': 'high',
                'last_seen_at': '',
                'summary': '尚未收到真实心跳数据，请在 instrument-agent 配置边缘采集主机心跳上报。',
            },
        ]

    latest_by_device: Dict[str, Dict[str, Optional[DeviceReading]]] = defaultdict(lambda: {'heartbeat': None, 'ingest': None})
    for reading in readings:
        bucket = latest_by_device[reading.device_id]
        if reading.reading_type == EDGE_COLLECTOR_HEARTBEAT and bucket['heartbeat'] is None:
            bucket['heartbeat'] = reading
        elif reading.reading_type == EDGE_COLLECTOR_INGEST_COUNT and bucket['ingest'] is None:
            bucket['ingest'] = reading

    objects: List[dict] = []
    now = timezone.now()
    offline_threshold = now - timedelta(minutes=EDGE_COLLECTOR_OFFLINE_MINUTES)

    for device_id, bucket in latest_by_device.items():
        heartbeat = bucket['heartbeat']
        ingest = bucket['ingest']
        latest_reading = heartbeat or ingest
        if latest_reading is None:
            continue

        latest_payload = latest_reading.payload or {}
        host_name = str(latest_payload.get('host_name') or '').strip()
        display_name = str(latest_payload.get('device_name') or '').strip() or host_name or device_id
        location = str(latest_payload.get('location') or '').strip() or '待识别'
        owner = str(latest_payload.get('owner') or '').strip() or '仪器组'
        asset_code = str(latest_payload.get('asset_code') or '').strip() or _sanitize_device_id(device_id).upper()
        zone = str(latest_payload.get('zone') or '').strip() or '仪器采集域'

        is_offline = heartbeat is None or heartbeat.timestamp < offline_threshold
        last_ingest_time = ingest.timestamp if ingest else None
        if is_offline:
            summary = '最近未收到采集主机心跳，需检查主机在线状态、Agent 进程和网络连通性。'
            status = 'offline'
            risk_level = 'high'
        else:
            ingest_summary = '尚无成功采集记录。'
            if ingest:
                source_file = str((ingest.payload or {}).get('source_file') or '').strip()
                ingest_summary = f'最近一次采集时间 {_format_datetime(last_ingest_time)}'
                if source_file:
                    ingest_summary += f'，源文件 {source_file}'
            summary = f'采集主机在线。{ingest_summary}'
            status = 'active'
            risk_level = 'medium'

        objects.append(
            {
                'id': f'obj-{_sanitize_device_id(device_id)}',
                'asset_code': asset_code,
                'name': display_name,
                'type': 'endpoint',
                'subtype': 'edge_collector_host',
                'zone': zone,
                'location': location,
                'owner': owner,
                'status': status,
                'risk_level': risk_level,
                'last_seen_at': _format_datetime(latest_reading.timestamp),
                'summary': summary,
            }
        )

    return sorted(objects, key=lambda item: (item['status'] != 'offline', item['name']))


def _build_edge_collector_events(objects: List[dict]) -> List[dict]:
    events: List[dict] = []
    for item in objects:
        if item['subtype'] != 'edge_collector_host' or item['status'] != 'offline':
            continue
        events.append(
            {
                'id': f"evt-{item['id'].replace('obj-', '')}",
                'title': f"{item['name']} 离线",
                'category': 'data_ingest',
                'severity': 'critical',
                'status': 'investigating',
                'source_object_id': item['id'],
                'location': item['location'],
                'detected_at': item['last_seen_at'],
                'owner': item['owner'],
                'summary': item['summary'],
            }
        )
    return events


VENUE_LOG_RECENT_MINUTES = 60


def _environment_venues_qs() -> QuerySet:
    return ResourceItem.objects.filter(
        is_deleted=False,
        category__resource_type=ResourceType.ENVIRONMENT,
    ).select_related('category')


def _build_venue_objects() -> List[dict]:
    venues = list(_environment_venues_qs())
    if not venues:
        return []

    venue_ids = [v.id for v in venues]
    all_logs = list(
        VenueEnvironmentLog.objects.filter(venue_id__in=venue_ids).order_by('-recorded_at')
    )
    latest_logs: Dict[int, VenueEnvironmentLog] = {}
    for log in all_logs:
        if log.venue_id not in latest_logs:
            latest_logs[log.venue_id] = log

    now = timezone.now()
    recent_threshold = now - timedelta(minutes=VENUE_LOG_RECENT_MINUTES)
    objects: List[dict] = []

    for venue in venues:
        log = latest_logs.get(venue.id)
        attrs = venue.attributes if isinstance(venue.attributes, dict) else {}
        location = str(attrs.get('floor') or attrs.get('building') or '').strip() or venue.name
        asset_code = str(venue.code or '').strip() or f'FAC-VEN-{venue.id}'
        zone = str(attrs.get('zone') or '').strip() or '实验执行域'
        owner = '设施组'

        if log is None:
            status = 'offline'
            risk_level = 'high'
            last_seen_at = ''
            summary = '暂无环境监控记录，请接入温湿度采集或人工录入。'
        else:
            last_seen_at = _format_datetime(log.recorded_at)
            if log.recorded_at < recent_threshold:
                status = 'offline'
                risk_level = 'high'
                summary = f'最近一条记录时间为 {last_seen_at}，超过 {VENUE_LOG_RECENT_MINUTES} 分钟未更新。'
            elif not log.is_compliant:
                status = 'warning'
                risk_level = 'high'
                reason = (log.non_compliance_reason or '').strip() or '温湿度偏离'
                summary = f'环境不合规：{reason}'
            else:
                status = 'active'
                risk_level = 'medium'
                t = f'{log.temperature}°C' if log.temperature is not None else '-'
                h = f'{log.humidity}%' if log.humidity is not None else '-'
                summary = f'温湿度稳定（{t} / {h}），环境记录连续。'

        objects.append(
            {
                'id': f'obj-venue-{venue.id}',
                'asset_code': asset_code,
                'name': venue.name,
                'type': 'facility',
                'subtype': 'controlled_room',
                'zone': zone,
                'location': location,
                'owner': owner,
                'status': status,
                'risk_level': risk_level,
                'last_seen_at': last_seen_at,
                'summary': summary,
            }
        )

    return sorted(objects, key=lambda item: (item['status'] != 'offline', item['name']))


def _build_venue_events(venue_objects: List[dict]) -> List[dict]:
    events: List[dict] = []
    venue_ids = [
        int(obj['id'].replace('obj-venue-', ''))
        for obj in venue_objects
        if obj['id'].startswith('obj-venue-')
    ]
    if not venue_ids:
        return events

    open_statuses = (IncidentStatus.OPEN, IncidentStatus.INVESTIGATING)
    incidents = EnvironmentIncident.objects.filter(
        venue_id__in=venue_ids,
        status__in=open_statuses,
    ).select_related('venue')[:50]

    for inc in incidents:
        venue_obj = next(
            (o for o in venue_objects if o['id'] == f'obj-venue-{inc.venue_id}'),
            None,
        )
        location = venue_obj['location'] if venue_obj else inc.venue.name
        owner = venue_obj['owner'] if venue_obj else '设施组'
        events.append(
            {
                'id': f'evt-env-inc-{inc.id}',
                'title': inc.title,
                'category': 'environment',
                'severity': inc.severity if inc.severity in ('low', 'medium', 'high', 'critical') else 'medium',
                'status': 'investigating' if inc.status == IncidentStatus.INVESTIGATING else 'new',
                'source_object_id': f'obj-venue-{inc.venue_id}',
                'location': location,
                'detected_at': _format_datetime(inc.discovered_at or inc.create_time),
                'owner': owner,
                'summary': (inc.description or inc.title)[:200],
            }
        )

    for obj in venue_objects:
        if obj['subtype'] != 'controlled_room' or obj['status'] != 'warning':
            continue
        events.append(
            {
                'id': f"evt-{obj['id'].replace('obj-', '')}-env-deviation",
                'title': f"{obj['name']} 环境偏离",
                'category': 'environment',
                'severity': 'high',
                'status': 'new',
                'source_object_id': obj['id'],
                'location': obj['location'],
                'detected_at': obj['last_seen_at'],
                'owner': obj['owner'],
                'summary': obj['summary'],
            }
        )

    return events


def _build_incident_tickets() -> List[dict]:
    """将未关闭的环境不合规事件作为工单展示，便于在总控台与 evt-env-inc-* 关联。"""
    open_statuses = (IncidentStatus.OPEN, IncidentStatus.INVESTIGATING)
    incidents = EnvironmentIncident.objects.filter(
        status__in=open_statuses,
    ).order_by('-create_time')[:100]

    tickets: List[dict] = []
    for inc in incidents:
        status_map = {
            IncidentStatus.OPEN: 'todo',
            IncidentStatus.INVESTIGATING: 'processing',
        }
        tickets.append({
            'id': f'ticket-env-inc-{inc.id}',
            'title': inc.title,
            'related_event_id': f'evt-env-inc-{inc.id}',
            'assignee': (inc.assigned_to_name or '').strip() or '待分配',
            'status': status_map.get(inc.status, 'todo'),
            'updated_at': _format_datetime(inc.update_time),
        })
    return tickets


def _build_registry_objects() -> List[dict]:
    registry = _load_resource_registry()
    objects = registry.get('objects', [])
    if not isinstance(objects, list):
        return []
    return [item for item in objects if isinstance(item, dict)]


def _build_registry_events(registry_objects: List[dict]) -> List[dict]:
    events: List[dict] = []
    now_text = _now_text()
    for item in registry_objects:
        extra = item.get('extra') if isinstance(item.get('extra'), dict) else {}
        monitoring_status = str(extra.get('monitoring_status') or '').strip() or 'planned'
        source = str(extra.get('source') or '').strip() or 'registry'
        severity = 'critical' if item.get('risk_level') == 'high' else 'medium'
        status = 'investigating' if item.get('risk_level') == 'high' else 'new'
        if monitoring_status in ('planned', 'partial'):
            events.append({
                'id': f"evt-reg-coverage-{item['id'].replace('obj-', '')}",
                'title': f"{item['name']} 待接入实时监控",
                'category': 'coverage_gap',
                'severity': severity,
                'status': status,
                'source_object_id': item['id'],
                'location': item.get('location', ''),
                'detected_at': item.get('last_seen_at') or now_text,
                'owner': item.get('owner', '平台组'),
                'summary': f"资源已登记（来源 {source}），但当前监控状态为 {monitoring_status}，建议补充连通性、容量/性能与告警规则。",
            })
        if item.get('type') in ('identity_service', 'ai_service', 'domain') and item.get('risk_level') == 'high':
            events.append({
                'id': f"evt-reg-critical-{item['id'].replace('obj-', '')}",
                'title': f"{item['name']} 关键配置需纳入巡检",
                'category': 'configuration',
                'severity': 'high',
                'status': 'new',
                'source_object_id': item['id'],
                'location': item.get('location', ''),
                'detected_at': item.get('last_seen_at') or now_text,
                'owner': item.get('owner', '平台组'),
                'summary': item.get('summary', ''),
            })
    return events


def _build_registry_tickets(registry_objects: List[dict], registry_events: List[dict]) -> List[dict]:
    event_by_object = {}
    for event in registry_events:
        event_by_object.setdefault(event['source_object_id'], event['id'])

    tickets: List[dict] = []
    for item in registry_objects:
        if item.get('risk_level') != 'high':
            continue
        related_event_id = event_by_object.get(item['id'])
        if not related_event_id:
            continue
        tickets.append({
            'id': f"ticket-reg-{item['id'].replace('obj-', '')}",
            'title': f"完成 {item['name']} 纳管接线",
            'related_event_id': related_event_id,
            'assignee': item.get('owner', '平台组'),
            'status': 'todo' if item.get('status') != 'active' else 'processing',
            'updated_at': item.get('last_seen_at') or _now_text(),
        })
    return tickets


def _resource_matches(item: dict, *, types: tuple[str, ...] = (), subtypes: tuple[str, ...] = (), ids: tuple[str, ...] = ()) -> bool:
    item_type = str(item.get('type') or '')
    item_subtype = str(item.get('subtype') or '')
    item_id = str(item.get('id') or '')
    return (
        (types and item_type in types)
        or (subtypes and item_subtype in subtypes)
        or (ids and item_id in ids)
    )


def _build_runtime_strategy_summary(objects: List[dict]) -> List[dict]:
    strategy_labels = {
        INTEGRATED_LIVE: '已接实时采集',
        EDGE_AGENT_REQUIRED: '需边缘采集器',
        DIRECT_PUBLIC_PROBE: '可直接公网探测',
        CONFIG_AUDIT: '配置巡检型资源',
    }
    counts = defaultdict(int)
    for item in objects:
        extra = item.get('extra') if isinstance(item.get('extra'), dict) else {}
        strategy = str(extra.get('probe_strategy') or EDGE_AGENT_REQUIRED)
        counts[strategy] += 1
    return [
        {
            'id': key,
            'name': strategy_labels.get(key, key),
            'count': counts.get(key, 0),
        }
        for key in (INTEGRATED_LIVE, EDGE_AGENT_REQUIRED, DIRECT_PUBLIC_PROBE, CONFIG_AUDIT)
    ]


def _build_config_audit_check(item: dict) -> dict:
    app_id_env, redirect_env = IDENTITY_ENV_MAP.get(item['id'], ('', ''))
    app_id_value = os.getenv(app_id_env, '') if app_id_env else ''
    redirect_value = os.getenv(redirect_env, '') if redirect_env else ''
    location = str(item.get('location') or '')
    has_app_id = bool(app_id_value)
    matches_location = not location or app_id_value == location
    has_redirect = bool(redirect_value)

    if has_app_id and matches_location and has_redirect:
        status = 'healthy'
        detail = f'{app_id_env} 与 {redirect_env} 已配置'
    elif has_app_id or has_redirect:
        status = 'warning'
        detail = f'配置不完整：{app_id_env}={bool(app_id_value)}，{redirect_env}={bool(redirect_value)}'
    else:
        status = 'error'
        detail = '缺少飞书应用运行配置'

    return {
        'id': f"check-{item['id']}",
        'title': item['name'],
        'category': '配置巡检',
        'strategy': CONFIG_AUDIT,
        'status': status,
        'location': location,
        'detail': detail,
        'action_hint': '检查 App ID、redirect_uri 与飞书开放平台配置是否一致',
    }


def _build_public_probe_check(item: dict) -> dict:
    target_url = PUBLIC_HEALTH_URLS.get(item['id'])
    location = str(item.get('location') or '')
    if not target_url:
        if location.startswith('http://') or location.startswith('https://'):
            target_url = location
        elif item.get('type') == 'ai_service':
            target_url = location
        elif item.get('type') == 'domain':
            target_url = f"https://{location}/"
        elif item.get('type') == 'cloud_service':
            target_url = CONTROL_PLANE_PUBLIC_URL

    if not target_url:
        return {
            'id': f"check-{item['id']}",
            'title': item['name'],
            'category': '公网探测',
            'strategy': DIRECT_PUBLIC_PROBE,
            'status': 'warning',
            'location': location,
            'detail': '未定义拨测目标',
            'action_hint': '补充健康检查 URL 或拨测地址',
        }

    probe = _http_probe(target_url)
    host = _parse_host(target_url)
    tls_days = _tls_days_remaining(host) if target_url.startswith('https://') and host else None
    detail = probe['detail']
    if tls_days is not None:
        detail += f' · 证书剩余 {tls_days} 天'
    return {
        'id': f"check-{item['id']}",
        'title': item['name'],
        'category': '公网探测',
        'strategy': DIRECT_PUBLIC_PROBE,
        'status': probe['status'],
        'location': target_url,
        'detail': detail,
        'action_hint': '关注 HTTP 返回、DNS/证书与公网入口可用性',
    }


def _build_internal_strategy_check(item: dict) -> dict:
    extra = item.get('extra') if isinstance(item.get('extra'), dict) else {}
    monitoring_status = str(extra.get('monitoring_status') or 'planned')
    strategy = str(extra.get('probe_strategy') or EDGE_AGENT_REQUIRED)

    if strategy == INTEGRATED_LIVE:
        status = 'healthy' if item.get('status') == 'active' else 'warning'
        detail = f"已接实时采集，当前对象状态为 {item.get('status')}"
        action_hint = '继续补齐更细粒度指标与告警阈值'
    else:
        status = 'warning' if monitoring_status in ('planned', 'partial') else 'healthy'
        detail = f"当前监控状态 {monitoring_status}，需要通过边缘采集器或局域网 Agent 接入"
        action_hint = '在资源所在网络部署采集器，打通 SSH/Agent/SNMP/数据库检查'

    return {
        'id': f"check-{item['id']}",
        'title': item['name'],
        'category': '内部资源接入',
        'strategy': strategy,
        'status': status,
        'location': str(item.get('location') or ''),
        'detail': detail,
        'action_hint': action_hint,
    }


def _check_ssl_expiry(hostname: str, port: int = 443, timeout: float = 5.0) -> dict:
    """检测域名的 SSL 证书到期日期，返回 {ok, days_left, expire_date, error}。"""
    try:
        ctx = ssl.create_default_context()
        with ctx.wrap_socket(socket.create_connection((hostname, port), timeout=timeout), server_hostname=hostname) as conn:
            cert = conn.getpeercert()
        expire_str = cert.get('notAfter', '')
        expire_dt = datetime.strptime(expire_str, '%b %d %H:%M:%S %Y %Z')
        days_left = (expire_dt - datetime.utcnow()).days
        return {'ok': True, 'days_left': days_left, 'expire_date': expire_dt.strftime('%Y-%m-%d'), 'error': None}
    except Exception as e:
        return {'ok': False, 'days_left': None, 'expire_date': None, 'error': str(e)[:80]}


def _build_ssl_cert_check(item: dict) -> dict:
    """对 certificate / domain 类型资源执行 SSL 证书到期巡检。"""
    location = str(item.get('location') or '')
    extra = item.get('extra') if isinstance(item.get('extra'), dict) else {}
    alert_days = int(extra.get('alert_days_before_expire', 30))

    # 提取主机名
    hostname = location
    for prefix in ('https://', 'http://'):
        if hostname.startswith(prefix):
            hostname = hostname[len(prefix):].rstrip('/')
    hostname = hostname.split('/')[0]

    if not hostname or '.' not in hostname:
        return {
            'id': f"check-{item['id']}",
            'title': f"{item['name']} SSL证书",
            'category': '证书巡检',
            'strategy': CONFIG_AUDIT,
            'status': 'warning',
            'location': location,
            'detail': '未配置域名，无法检测证书',
            'action_hint': '补充 location 字段（https://域名）',
        }

    result = _check_ssl_expiry(hostname)
    if not result['ok']:
        status = 'error'
        detail = f'证书检测失败: {result["error"]}'
        action = '检查域名可访问性及证书配置'
    elif result['days_left'] is None:
        status = 'warning'
        detail = '无法解析证书到期日期'
        action = '手动验证证书状态'
    elif result['days_left'] <= 0:
        status = 'error'
        detail = f'证书已过期（到期日: {result["expire_date"]}）'
        action = '立即更新 SSL 证书！'
    elif result['days_left'] <= alert_days:
        status = 'warning'
        detail = f'证书将在 {result["days_left"]} 天后到期（{result["expire_date"]}）'
        action = f'请在 {result["days_left"]} 天内续期证书'
    else:
        status = 'healthy'
        detail = f'证书有效，剩余 {result["days_left"]} 天（到期 {result["expire_date"]}）'
        action = ''

    return {
        'id': f"check-{item['id']}",
        'title': f"{item['name']} SSL证书",
        'category': '证书巡检',
        'strategy': CONFIG_AUDIT,
        'status': status,
        'location': hostname,
        'detail': detail,
        'action_hint': action,
    }


def _build_contract_expiry_check(item: dict) -> dict:
    """对 extra.contract_expire 字段进行合同/订阅到期预警巡检。"""
    extra = item.get('extra') if isinstance(item.get('extra'), dict) else {}
    expire_str = extra.get('contract_expire', '')
    alert_days = int(extra.get('alert_days_before_expire', 60))
    contract_name = extra.get('contract', '合同/订阅')

    if not expire_str:
        return {
            'id': f"check-contract-{item['id']}",
            'title': f"{item['name']} 合同到期",
            'category': '合同巡检',
            'strategy': CONFIG_AUDIT,
            'status': 'warning',
            'location': str(item.get('location') or ''),
            'detail': '未录入合同到期日期',
            'action_hint': '在 resource_registry.json 的 extra.contract_expire 填写到期日（YYYY-MM-DD）',
        }
    try:
        expire_dt = datetime.strptime(expire_str, '%Y-%m-%d')
        days_left = (expire_dt - datetime.utcnow()).days
    except Exception:
        return {
            'id': f"check-contract-{item['id']}",
            'title': f"{item['name']} 合同到期",
            'category': '合同巡检',
            'strategy': CONFIG_AUDIT,
            'status': 'warning',
            'location': '',
            'detail': f'到期日格式错误: {expire_str}',
            'action_hint': '日期格式应为 YYYY-MM-DD',
        }

    if days_left <= 0:
        status = 'error'
        detail = f'合同已过期（{expire_str}）: {contract_name}'
        action = '立即续签！'
    elif days_left <= alert_days:
        status = 'warning'
        detail = f'合同将在 {days_left} 天后到期（{expire_str}）: {contract_name}'
        action = f'请在 {days_left} 天内完成续签'
    else:
        status = 'healthy'
        detail = f'合同有效，剩余 {days_left} 天（到期 {expire_str}）'
        action = ''

    return {
        'id': f"check-contract-{item['id']}",
        'title': f"{item['name']} 合同到期",
        'category': '合同巡检',
        'strategy': CONFIG_AUDIT,
        'status': status,
        'location': str(item.get('location') or ''),
        'detail': detail,
        'action_hint': action,
    }


def _build_management_runtime(objects: List[dict]) -> dict:
    checks: List[dict] = []
    strategy_summary = _build_runtime_strategy_summary(objects)

    identity_items = [item for item in objects if str(item.get('type') or '') == 'identity_service']
    direct_items = [
        item for item in objects
        if isinstance(item.get('extra'), dict) and str(item['extra'].get('probe_strategy') or '') == DIRECT_PUBLIC_PROBE
    ]
    internal_samples = [
        item for item in objects
        if isinstance(item.get('extra'), dict) and str(item['extra'].get('probe_strategy') or '') in (EDGE_AGENT_REQUIRED, INTEGRATED_LIVE)
    ]
    # SSL 证书巡检：certificate 类型 + domain 类型中有 https location 的
    ssl_items = [
        item for item in objects
        if item.get('type') in ('certificate',)
        or (item.get('type') == 'domain' and str(item.get('location') or '').startswith('https://'))
    ]
    # 合同到期巡检：extra.contract_expire 已填写的
    contract_items = [
        item for item in objects
        if isinstance(item.get('extra'), dict) and item['extra'].get('contract_expire')
    ]
    # 监控状态需要告警的资源（monitoring_status = needs_expiry_alert）
    expiry_alert_items = [
        item for item in objects
        if isinstance(item.get('extra'), dict)
        and item['extra'].get('monitoring_status') == 'needs_expiry_alert'
        and item.get('id') not in {i['id'] for i in contract_items}
    ]

    for item in identity_items:
        checks.append(_build_config_audit_check(item))
    for item in direct_items[:6]:
        checks.append(_build_public_probe_check(item))
    for item in internal_samples[:6]:
        checks.append(_build_internal_strategy_check(item))
    for item in ssl_items[:4]:
        checks.append(_build_ssl_cert_check(item))
    for item in contract_items[:4]:
        checks.append(_build_contract_expiry_check(item))

    status_rank = {'error': 0, 'warning': 1, 'healthy': 2}
    checks.sort(key=lambda item: (status_rank.get(item['status'], 99), item['title']))
    return {
        'strategy_summary': strategy_summary,
        'checks': checks[:20],
    }


def _build_runtime_events(objects: List[dict]) -> List[dict]:
    runtime = _build_management_runtime(objects)
    events: List[dict] = []
    for check in runtime['checks']:
        if check['status'] == 'healthy':
            continue
        severity = 'critical' if check['status'] == 'error' else 'medium'
        status = 'investigating' if check['status'] == 'error' else 'new'
        source_object_id = check['id'].replace('check-', '')
        events.append({
            'id': f"evt-runtime-{source_object_id.replace('obj-', '')}",
            'title': f"{check['title']} 治理巡检异常",
            'category': 'governance',
            'severity': severity,
            'status': status,
            'source_object_id': source_object_id,
            'location': check['location'],
            'detected_at': _now_text(),
            'owner': '平台组',
            'summary': f"{check['detail']}。处置建议：{check['action_hint']}",
        })
    return events


def _build_runtime_tickets(runtime_events: List[dict]) -> List[dict]:
    tickets: List[dict] = []
    for event in runtime_events:
        if event['severity'] not in ('critical', 'high'):
            continue
        tickets.append({
            'id': f"ticket-{event['id'].replace('evt-', '')}",
            'title': f"处理 {event['title']}",
            'related_event_id': event['id'],
            'assignee': event.get('owner', '平台组'),
            'status': 'todo',
            'updated_at': event.get('detected_at', _now_text()),
        })
    return tickets


def get_management_blueprint() -> dict:
    objects = list_managed_objects()

    category_specs = [
        {
            'id': 'network-security',
            'name': '网络与安全设备',
            'goal': '把交换机、防火墙、无线控制器统一纳入拓扑、配置、流量与安全策略管理。',
            'frontend_modules': ['资源拓扑', '链路与端口健康', '配置漂移', '安全策略视图'],
            'backend_capabilities': ['SSH/SNMP/API 采集', 'LLDP/ARP/MAC 拓扑归集', '配置快照对比', '策略/接口巡检任务'],
            'management_mode': ['统一拓扑建模', '分钟级巡检', '配置变更留痕', '高风险变更双人复核'],
            'smart_actions': ['热点链路识别', '主备切换告警', '配置漂移检测', '异常流量阈值预警'],
            'metrics': ['CPU/内存', '端口 up/down', '带宽利用率', '会话数', 'ARP/MAC 数量'],
            'matcher': lambda item: _resource_matches(
                item,
                types=('network_device', 'security_device'),
                subtypes=('core_switch', 'switch', 'firewall', 'wireless_controller'),
            ),
        },
        {
            'id': 'compute-virtualization',
            'name': '计算与虚拟化资源',
            'goal': '把宿主机、虚拟机、GPU 服务器统一纳入容量、可用性和任务负载管理。',
            'frontend_modules': ['主机中心', '虚拟机清单', 'GPU 算力视图', '容量趋势'],
            'backend_capabilities': ['Ping/SSH/Agent 探活', '节点指标采集', 'GPU 监控适配器', '虚拟机快照与备份任务编排'],
            'management_mode': ['统一主机标签', '分层阈值告警', '容量预测', '变更窗口管理'],
            'smart_actions': ['主机离线告警', 'GPU 过热预警', '磁盘增长预测', '资源热点自动归因'],
            'metrics': ['CPU/内存', '磁盘/IO', '在线率', 'GPU 温度/显存/利用率', '任务队列长度'],
            'matcher': lambda item: _resource_matches(
                item,
                types=('compute',),
                subtypes=('virtualization_host', 'user_vm', 'gpu_server', 'domain_controller', 'print_server'),
            ),
        },
        {
            'id': 'storage-database',
            'name': '存储与数据资源',
            'goal': '把 NAS、数据库和备份恢复链路统一纳入容量、性能与数据安全管理。',
            'frontend_modules': ['存储总览', '数据库健康', '备份与恢复', '容量预警'],
            'backend_capabilities': ['数据库连通性检查', '慢查询与连接池指标', 'NAS SMART/RAID 状态采集', '备份任务结果归集'],
            'management_mode': ['主从/读写链路巡检', '备份日检', '容量阈值分级', '恢复演练闭环'],
            'smart_actions': ['容量不足预测', '慢查询聚类', '备份失败升级', '账号风险访问提醒'],
            'metrics': ['连接成功率', '慢查询数', '磁盘使用率', 'RAID/SMART', '备份成功率'],
            'matcher': lambda item: _resource_matches(
                item,
                types=('storage', 'database'),
                subtypes=('nas', 'read_only_account'),
            ),
        },
        {
            'id': 'application-service',
            'name': '业务与接入服务',
            'goal': '把 API 平台、边缘采集主机和关键应用接入统一服务可用性与任务闭环管理。',
            'frontend_modules': ['应用健康看板', '接口 SLA', '边缘采集状态', '发布与变更记录'],
            'backend_capabilities': ['HTTP/端口健康检查', '日志与任务结果归集', '边缘采集心跳', '接口错误码分析'],
            'management_mode': ['服务分级', '告警与工单联动', '发布后自动验收', '依赖关系回溯'],
            'smart_actions': ['接口失败自动聚类', '采集断点识别', '发布回归提示', '异常依赖链归因'],
            'metrics': ['可用率', '延迟', '错误率', '采集量', '服务重启次数'],
            'matcher': lambda item: _resource_matches(
                item,
                types=('application',),
                subtypes=('api_platform', 'edge_collector_host'),
            ) or str(item.get('subtype') or '') == 'edge_collector_host',
        },
        {
            'id': 'identity-collaboration',
            'name': '身份与协同应用',
            'goal': '把飞书应用、登录链路、权限配置和可见性规则统一纳入治理。',
            'frontend_modules': ['身份应用台账', 'OAuth 状态', '权限与菜单可见性', '配置一致性巡检'],
            'backend_capabilities': ['App 配置校验', 'redirect_uri 巡检', '权限范围比对', '登录成功率采集'],
            'management_mode': ['应用独立治理', '凭据轮换', '配置基线对齐', '登录问题一键定位'],
            'smart_actions': ['redirect 异常预警', '权限缺口检测', '菜单不可见归因', '应用配置漂移提醒'],
            'metrics': ['登录成功率', 'OAuth 错误数', '权限缺口数', '配置漂移数', '回调异常数'],
            'matcher': lambda item: _resource_matches(
                item,
                types=('identity_service',),
                subtypes=('feishu_oauth_app',),
            ),
        },
        {
            'id': 'domain-cloud-entry',
            'name': '域名与云服务入口',
            'goal': '把 ECS、域名、证书、Nginx 与公网入口纳入统一接入层管理。',
            'frontend_modules': ['云资源概览', '域名与证书', '入口健康', '部署状态'],
            'backend_capabilities': ['DNS/证书检查', '主机探活', 'Nginx/进程巡检', '部署记录归集'],
            'management_mode': ['接入层统一管理', '证书到期预警', '公网拨测', '发布后健康门禁'],
            'smart_actions': ['证书到期提醒', 'DNS 解析异常识别', '入口 5xx 聚类', '部署后自动拨测'],
            'metrics': ['HTTP 状态', '证书剩余天数', 'DNS 解析结果', '磁盘/CPU', '进程健康'],
            'matcher': lambda item: _resource_matches(
                item,
                types=('cloud_service', 'domain', 'certificate', 'network'),
                subtypes=('ecs_server', 'public_domain', 'ssl_tls', 'isp_link', 'firewall'),
            ),
        },
        {
            'id': 'ai-model-resource',
            'name': 'AI 与模型资源',
            'goal': '把 Kimi、火山方舟及后续模型接入统一的调用、成本、配额与质量治理。',
            'frontend_modules': ['模型资源池', '调用成本看板', '成功率与延迟', '智能体依赖关系'],
            'backend_capabilities': ['模型调用日志采集', '配额与密钥状态巡检', '成本归集', '回退链路管理'],
            'management_mode': ['模型分级路由', '配额阈值控制', '密钥轮换', '业务场景绑定'],
            'smart_actions': ['延迟飙升预警', '成本异常识别', '回退模型切换建议', '提示词与场景归因'],
            'metrics': ['调用成功率', '延迟', 'Token/费用', '模型可用率', '回退次数'],
            'matcher': lambda item: _resource_matches(
                item,
                types=('ai_service', 'ai_api'),
                subtypes=('llm_provider', 'llm'),
            ),
        },
        {
            'id': 'endpoint-output',
            'name': '终端与输出设备',
            'goal': '把打印机等一线终端纳入在线状态、耗材、故障与服务依赖管理。',
            'frontend_modules': ['终端台账', '打印服务依赖', '耗材与故障', '派单处理'],
            'backend_capabilities': ['Ping/Web 登录页探测', '错误码采集', '打印服务依赖检查', '耗材状态接入'],
            'management_mode': ['按场景分组', '故障快速派单', '耗材阈值维护', '服务依赖联动'],
            'smart_actions': ['打印故障自动归类', '耗材不足提醒', '打印服务联动诊断', '高频故障设备识别'],
            'metrics': ['在线率', '作业失败率', '错误码次数', '耗材状态', '服务依赖可用性'],
            'matcher': lambda item: _resource_matches(
                item,
                types=('endpoint',),
                subtypes=('printer',),
            ),
        },
        {
            'id': 'lab-instrument',
            'name': '实验室检测仪器',
            'goal': '把皮肤检测仪、IoT环境传感器等实验室仪器纳入维保、校准周期与状态统一管理。',
            'frontend_modules': ['仪器台账', '维保与校准日历', '仪器使用率', '故障工单'],
            'backend_capabilities': ['仪器序列号维护', 'LIMS接口同步', '维保到期预警', '校准记录归集'],
            'management_mode': ['仪器分类管理', '校准周期提醒', '维保合同绑定', '故障快速工单'],
            'smart_actions': ['校准到期预警', '维保合同快到期提醒', '使用频次异常识别', 'LIMS同步状态检查'],
            'metrics': ['在线状态', '最近校准日期', '维保剩余天数', '使用频率', '故障次数'],
            'matcher': lambda item: _resource_matches(
                item,
                types=('instrument', 'iot'),
                subtypes=('skin_analyzer', 'measurement_device', 'environment_sensor'),
            ),
        },
        {
            'id': 'saas-production',
            'name': 'SaaS生产系统',
            'goal': '把LIMS、EDC、CTMS、FineBI等SaaS系统纳入可用性、合同续费和账号权限统一管理。',
            'frontend_modules': ['SaaS台账', '合同与续费日历', '服务可用性', '账号权限管理'],
            'backend_capabilities': ['HTTP健康检查', '合同到期预警', '登录可达性', '服务商联系方式维护'],
            'management_mode': ['按业务重要性分级', '合同到期提前60天预警', '服务降级预案', '账号统一创建/撤销'],
            'smart_actions': ['合同到期自动提醒', '服务不可用升级告警', '账号异常访问识别', '续费决策成本分析'],
            'metrics': ['服务可用率', '合同剩余天数', '登录成功率', '活跃用户数', '月度成本'],
            'matcher': lambda item: _resource_matches(
                item,
                types=('saas',),
                subtypes=('production_system', 'analytics', 'erp', 'expense', 'data_collection', 'esign', 'self_developed'),
            ),
        },
        {
            'id': 'facility-space',
            'name': '场地与设施资源',
            'goal': '把实验室房间、IoT环境传感器等场地资源纳入使用率、环境达标与合规统一管理。',
            'frontend_modules': ['场地总览', '房间使用率', '环境指标', '设施维保'],
            'backend_capabilities': ['环境传感器数据采集', '房间占用状态同步', '能耗与合规报告', '设施巡检任务'],
            'management_mode': ['按楼层/功能区分组', '环境阈值告警', '合规指标日检', '维保计划管理'],
            'smart_actions': ['温湿度超标预警', '房间长期闲置识别', '能耗异常归因', '合规缺口提醒'],
            'metrics': ['房间使用率', '温湿度达标率', 'PM2.5/PM10', '噪音', '能耗/月'],
            'matcher': lambda item: _resource_matches(
                item,
                types=('facility',),
                subtypes=('laboratory', 'controlled_room', 'office'),
            ) or str(item.get('type') or '') == 'facility',
        },
    ]

    categories = []
    for spec in category_specs:
        resources = [item for item in objects if spec['matcher'](item)]
        high_risk_count = len([item for item in resources if item.get('risk_level') == 'high'])
        pending_count = len([
            item for item in resources
            if isinstance(item.get('extra'), dict) and str(item['extra'].get('monitoring_status') or '').strip() in ('planned', 'partial')
        ])
        categories.append({
            'id': spec['id'],
            'name': spec['name'],
            'goal': spec['goal'],
            'resource_count': len(resources),
            'high_risk_count': high_risk_count,
            'pending_monitoring_count': pending_count,
            'frontend_modules': spec['frontend_modules'],
            'backend_capabilities': spec['backend_capabilities'],
            'management_mode': spec['management_mode'],
            'smart_actions': spec['smart_actions'],
            'metrics': spec['metrics'],
            'resources': [
                {
                    'id': item.get('id', ''),
                    'name': item.get('name', ''),
                    'asset_code': item.get('asset_code', ''),
                    'location': item.get('location', ''),
                    'status': item.get('status', ''),
                    'risk_level': item.get('risk_level', ''),
                }
                for item in resources[:8]
            ],
        })

    runtime = _build_management_runtime(objects)
    runtime['last_check_at'] = get_runtime_checks_last_check_at()
    return {
        'vision': {
            'title': '一站式统一资源治理',
            'summary': '统一对象模型、统一接入链路、统一事件工单、统一智能规则，让硬件、云、身份、AI 资源进入同一管理闭环。',
            'frontend_value': ['同一个工作台查看对象、事件、工单、治理蓝图', '同一资源既可看台账，也可看实时状态和责任链'],
            'backend_value': ['同一对象模型承载采集、巡检、告警、工单', '适配器按资源类型扩展，避免烟囱式系统重复建设'],
            'management_value': ['按资源类型制定统一规则', '按风险和服务等级驱动治理优先级', '通过自动化与智能归因减少人工巡检'],
        },
        'categories': categories,
        'runtime': runtime,
    }


def list_managed_objects() -> List[dict]:
    base_objects = (
        _build_network_objects()
        + _build_venue_objects()
        + _build_edge_collector_objects()
        + _build_registry_objects()
    )
    checks_map = _get_cached_runtime_checks_map(base_objects)
    return [_augment_managed_object(item, checks_map.get(item['id'])) for item in base_objects]


def _build_expiry_events(objects: List[dict]) -> List[dict]:
    """为 SSL 证书和合同到期生成专项事件（在 runtime_checks 之外独立触发，确保不遗漏）。"""
    events: List[dict] = []
    now = datetime.utcnow()

    for item in objects:
        extra = item.get('extra') if isinstance(item.get('extra'), dict) else {}
        item_id = item.get('id', '')
        item_name = item.get('name', '')

        # SSL 证书到期事件
        if item.get('type') == 'certificate':
            location = str(item.get('location') or '')
            hostname = location
            for prefix in ('https://', 'http://'):
                if hostname.startswith(prefix):
                    hostname = hostname[len(prefix):].rstrip('/')
            hostname = hostname.split('/')[0]
            if hostname and '.' in hostname:
                result = _check_ssl_expiry(hostname)
                days = result.get('days_left')
                if result['ok'] and days is not None:
                    alert_days = int(extra.get('alert_days_before_expire', 30))
                    if days <= alert_days:
                        severity = 'critical' if days <= 0 else ('high' if days <= 7 else 'medium')
                        events.append({
                            'id': f"evt-cert-expire-{item_id.replace('obj-', '')}",
                            'title': f"{item_name} 即将到期",
                            'category': 'expiry',
                            'severity': severity,
                            'status': 'new',
                            'source_object_id': item_id,
                            'location': hostname,
                            'detected_at': _now_text(),
                            'owner': 'IT',
                            'summary': f"SSL证书剩余 {days} 天（到期 {result['expire_date']}），请及时续期。",
                        })

        # 合同到期事件
        expire_str = extra.get('contract_expire', '')
        if expire_str:
            try:
                expire_dt = datetime.strptime(expire_str, '%Y-%m-%d')
                days_left = (expire_dt - now).days
                alert_days = int(extra.get('alert_days_before_expire', 60))
                if days_left <= alert_days:
                    severity = 'critical' if days_left <= 0 else ('high' if days_left <= 14 else 'medium')
                    contract_name = extra.get('contract', '合同/订阅')
                    events.append({
                        'id': f"evt-contract-expire-{item_id.replace('obj-', '')}",
                        'title': f"{item_name} 合同即将到期",
                        'category': 'expiry',
                        'severity': severity,
                        'status': 'new',
                        'source_object_id': item_id,
                        'location': str(item.get('location') or ''),
                        'detected_at': _now_text(),
                        'owner': 'IT',
                        'summary': f"合同 [{contract_name}] 剩余 {days_left} 天（到期 {expire_str}），请及时续签。",
                    })
            except Exception:
                pass

    return events


def list_unified_events() -> List[dict]:
    objects = list_managed_objects()
    venue_objs = [o for o in objects if o.get('subtype') == 'controlled_room']
    network_objs = [o for o in objects if o.get('type') in ('network_device', 'security_device')]
    registry_objs = [o for o in objects if str(o.get('id', '')).startswith('obj-reg-')]
    runtime_events = _build_runtime_events(objects)
    expiry_events = _build_expiry_events(objects)
    return (
        _build_network_events(network_objs)
        + _build_venue_events(venue_objs)
        + _build_edge_collector_events(objects)
        + _build_registry_events(registry_objs)
        + runtime_events
        + expiry_events
    )


def list_tickets() -> List[dict]:
    objects = list_managed_objects()
    events = list_unified_events()
    event_ids = {event['id'] for event in events}
    tickets: List[dict] = []

    for ticket in STATIC_TICKETS:
        if ticket['related_event_id'] == 'evt-edge-collector-fallback':
            edge_event = next((event for event in events if event['category'] == 'data_ingest'), None)
            if not edge_event:
                continue
            ticket = {**ticket, 'related_event_id': edge_event['id']}
        if ticket['related_event_id'] in event_ids:
            tickets.append(ticket)

    for ticket in _build_incident_tickets():
        if ticket['related_event_id'] in event_ids:
            tickets.append(ticket)

    registry_objects = [o for o in objects if str(o.get('id', '')).startswith('obj-reg-')]
    registry_events = [e for e in events if str(e.get('id', '')).startswith('evt-reg-')]
    for ticket in _build_registry_tickets(registry_objects, registry_events):
        if ticket['related_event_id'] in event_ids:
            tickets.append(ticket)

    runtime_events = [e for e in events if str(e.get('id', '')).startswith('evt-runtime-')]
    for ticket in _build_runtime_tickets(runtime_events):
        if ticket['related_event_id'] in event_ids:
            tickets.append(ticket)

    for t in tickets:
        if t['id'] in _ticket_status_overrides:
            t['status'] = _ticket_status_overrides[t['id']]
        if t['id'] in _ticket_updated_overrides:
            t['updated_at'] = _ticket_updated_overrides[t['id']]
    return tickets


def get_dashboard_summary() -> dict:
    objects = list_managed_objects()
    events = list_unified_events()
    tickets = list_tickets()
    high_risk_objects = [item for item in objects if item['risk_level'] == 'high' or item['status'] == 'offline']
    open_events = [item for item in events if item['status'] != 'resolved']
    processing_ticket_count = len([item for item in tickets if item['status'] != 'done'])
    return {
        'object_count': len(objects),
        'open_event_count': len(open_events),
        'processing_ticket_count': processing_ticket_count,
        'high_risk_objects': high_risk_objects,
        'open_events': open_events,
    }


def get_object_detail(object_id: str) -> Optional[dict]:
    return next((item for item in list_managed_objects() if item['id'] == object_id), None)


def get_object_events(object_id: str) -> List[dict]:
    return [event for event in list_unified_events() if event['source_object_id'] == object_id]


def get_event_detail(event_id: str) -> Optional[dict]:
    return next((item for item in list_unified_events() if item['id'] == event_id), None)


def get_event_tickets(event_id: str) -> List[dict]:
    return [ticket for ticket in list_tickets() if ticket['related_event_id'] == event_id]


def get_ticket_detail(ticket_id: str) -> Optional[dict]:
    return next((item for item in list_tickets() if item['id'] == ticket_id), None)


def ticket_transition(ticket_id: str, new_status: str) -> Optional[dict]:
    """工单状态流转（内存覆盖，后续对接 workorder）。允许: todo, processing, done。"""
    allowed = {'todo', 'processing', 'done'}
    if new_status not in allowed:
        return None
    detail = get_ticket_detail(ticket_id)
    if not detail:
        return None
    _ticket_status_overrides[ticket_id] = new_status
    _ticket_updated_overrides[ticket_id] = timezone.now().strftime('%Y-%m-%d %H:%M')
    return get_ticket_detail(ticket_id)


def get_network_snapshot() -> dict:
    return _load_network_snapshot()
