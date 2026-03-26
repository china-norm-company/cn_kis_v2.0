"""
飞书通讯录同步服务

S3-4：对接 contact/v3 自动同步部门和人员到系统。
"""
import logging
import hashlib
from typing import List, Dict

from django.utils import timezone

from apps.hr.models import Staff, StaffArchive

logger = logging.getLogger(__name__)


class FeishuContactSyncService:
    """飞书通讯录同步"""

    @classmethod
    def sync_all(cls) -> dict:
        """
        全量同步飞书通讯录

        1. 同步部门
        2. 同步各部门下的用户
        """
        from libs.feishu_client import feishu_client

        stats = {'departments': 0, 'users_created': 0, 'users_updated': 0}

        # 递归同步部门
        departments = cls._fetch_all_departments(feishu_client)
        stats['departments'] = len(departments)

        # 同步各部门用户
        for dept in departments:
            dept_id = dept.get('department_id', '')
            dept_name = dept.get('name', '')
            users = cls._fetch_department_users(feishu_client, dept_id)

            for user_data in users:
                created = cls._upsert_staff(user_data, dept_name)
                if created:
                    stats['users_created'] += 1
                else:
                    stats['users_updated'] += 1

        logger.info(f'通讯录同步完成: {stats}')
        return stats

    @classmethod
    def _fetch_all_departments(cls, client, parent_id: str = '0') -> list:
        """递归获取所有部门"""
        all_depts = []
        page_token = ''

        while True:
            try:
                result = client.list_departments(
                    parent_department_id=parent_id,
                    page_token=page_token,
                )
                items = result.get('items', [])
                all_depts.extend(items)

                if not result.get('has_more', False):
                    break
                page_token = result.get('page_token', '')
            except Exception as e:
                logger.error(f'获取部门列表失败(parent={parent_id}): {e}')
                break

        # 递归子部门
        child_depts = []
        for dept in all_depts:
            child_id = dept.get('department_id', '')
            if child_id and child_id != parent_id:
                child_depts.extend(cls._fetch_all_departments(client, child_id))

        all_depts.extend(child_depts)
        return all_depts

    @classmethod
    def _fetch_department_users(cls, client, department_id: str) -> list:
        """获取指定部门的用户"""
        all_users = []
        page_token = ''

        while True:
            try:
                result = client.list_users(
                    department_id=department_id,
                    page_token=page_token,
                )
                items = result.get('items', [])
                all_users.extend(items)

                if not result.get('has_more', False):
                    break
                page_token = result.get('page_token', '')
            except Exception as e:
                logger.error(f'获取部门用户失败(dept={department_id}): {e}')
                break

        return all_users

    @classmethod
    def _upsert_staff(cls, user_data: dict, department_name: str) -> bool:
        """
        新增或更新员工记录

        Returns:
            True 如果是新建，False 如果是更新
        """
        open_id = user_data.get('open_id', '')
        name = user_data.get('name', '')
        mobile = user_data.get('mobile', '')
        email = user_data.get('email', '')
        employee_no = user_data.get('employee_no', '')

        if not open_id:
            return False

        # Staff.position 为必填；飞书字段因版本而异，统一兜底避免 get_or_create 失败
        job_title = (
            (user_data.get('job_title') or user_data.get('title') or user_data.get('employee_type') or '')
        )
        position = (str(job_title).strip() or '待完善')[:200]

        sync_payload = {
            'name': name,
            'position': position,
            'department': department_name,
            'phone': mobile,
            'email': email,
            'employee_no': employee_no or open_id[:20],
        }
        payload_hash = hashlib.sha256(str(sorted(sync_payload.items())).encode('utf-8')).hexdigest()

        staff, created = Staff.objects.get_or_create(
            feishu_open_id=open_id,
            defaults=sync_payload,
        )
        if not created:
            archive, _ = StaffArchive.objects.get_or_create(
                staff=staff,
                defaults={'department': staff.department, 'sync_source': 'feishu_contact'},
            )
            locked_fields = set(archive.sync_locked_fields or [])

            # 同步时尊重人工锁定字段，避免覆盖 HR 人工维护数据
            for field, value in sync_payload.items():
                if field in locked_fields:
                    continue
                setattr(staff, field, value)
            staff.save(
                update_fields=['name', 'position', 'department', 'phone', 'email', 'employee_no', 'update_time'],
            )

            archive.department = staff.department
            archive.sync_source = 'feishu_contact'
            archive.sync_hash = payload_hash
            archive.last_sync_at = timezone.now()
            archive.save(update_fields=['department', 'sync_source', 'sync_hash', 'last_sync_at', 'update_time'])
        else:
            StaffArchive.objects.get_or_create(
                staff=staff,
                defaults={
                    'department': department_name,
                    'sync_source': 'feishu_contact',
                    'sync_hash': payload_hash,
                    'last_sync_at': timezone.now(),
                },
            )

        action = '新建' if created else '更新'
        logger.debug(f'员工{action}: {name} ({open_id})')
        return created
