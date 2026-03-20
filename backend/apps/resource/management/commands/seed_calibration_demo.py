"""
校准计划/工单/记录 虚拟演示数据

Usage:
    python manage.py seed_calibration_demo

创建：
- 设备类别（若不存在）
- 3 台设备（含校准计划信息）
- 校准记录（EquipmentCalibration）
- 校准工单（EquipmentMaintenance type=calibration）
"""
from datetime import date, timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.resource.models import (
    ResourceCategory, ResourceItem, ResourceType, ResourceStatus,
    EquipmentCalibration, EquipmentMaintenance,
)


def _get_or_create_equipment_category():
    cat = ResourceCategory.objects.filter(
        resource_type=ResourceType.EQUIPMENT,
        is_active=True,
    ).first()
    if not cat:
        cat = ResourceCategory.objects.create(
            name='仪器设备',
            code='EQ',
            resource_type=ResourceType.EQUIPMENT,
            is_active=True,
        )
    return cat


DEMO_EQUIPMENT = [
    {
        'code': 'FSD0405093',
        'name': 'D01高温高湿间',
        'model_number': '',
        'serial_number': '',
        'traceability': '校准',
        'calibration_method': '上门检测',
        'calibration_institution': '上海市质量监督检验技术研究院',
        'calibration_procedure': '温度辨识点:38℃;湿度识别点:85%RH;',
        'calibration_cycle_days': 365,
        'last_calibration_date': date(2025, 6, 20),
        'next_calibration_date': date(2026, 6, 19),
        'reminder_days': 30,
        'reminder_person': '张造',
    },
    {
        'code': 'FSD0405094',
        'name': 'D02恒温恒湿间1',
        'model_number': '',
        'serial_number': '',
        'traceability': '校准',
        'calibration_method': '上门检测',
        'calibration_institution': '上海市计量技术研究院',
        'calibration_procedure': '温度辨识点:38℃;湿度识别点:85%RH;',
        'calibration_cycle_days': 365,
        'last_calibration_date': date(2025, 7, 11),
        'next_calibration_date': date(2026, 7, 10),
        'reminder_days': 30,
        'reminder_person': '张造',
    },
    {
        'code': 'FS-CT-E115',
        'name': 'E2级砝码-100g',
        'model_number': '100g',
        'serial_number': '050',
        'traceability': '检定',
        'calibration_method': '送检',
        'calibration_institution': '上海市计量技术研究院',
        'calibration_procedure': 'JJG 99-2022 砝码规程检定',
        'calibration_cycle_days': 365,
        'last_calibration_date': date(2025, 6, 15),
        'next_calibration_date': date(2026, 6, 14),
        'reminder_days': 30,
        'reminder_person': '张造',
    },
]


class Command(BaseCommand):
    help = '创建校准计划/工单/记录的虚拟演示数据'

    def handle(self, *args, **options):
        cat = _get_or_create_equipment_category()
        self.stdout.write(f'设备类别: {cat.name} (id={cat.id})')

        created_equip = []
        for d in DEMO_EQUIPMENT:
            eq, created = ResourceItem.objects.get_or_create(
                code=d['code'],
                defaults={
                    'name': d['name'],
                    'category': cat,
                    'status': ResourceStatus.ACTIVE,
                    'model_number': d.get('model_number', ''),
                    'serial_number': d.get('serial_number', ''),
                    'last_calibration_date': d['last_calibration_date'],
                    'next_calibration_date': d['next_calibration_date'],
                    'calibration_cycle_days': d['calibration_cycle_days'],
                    'attributes': {
                        'traceability': d.get('traceability', ''),
                        'calibration_method': d.get('calibration_method', ''),
                        'calibration_institution': d.get('calibration_institution', ''),
                        'calibration_procedure': d.get('calibration_procedure', ''),
                        'reminder_days': d.get('reminder_days', 30),
                        'reminder_person': d.get('reminder_person', ''),
                    },
                },
            )
            if not created:
                eq.name = d['name']
                eq.model_number = d.get('model_number', '')
                eq.serial_number = d.get('serial_number', '')
                eq.last_calibration_date = d['last_calibration_date']
                eq.next_calibration_date = d['next_calibration_date']
                eq.calibration_cycle_days = d['calibration_cycle_days']
                attrs = dict(eq.attributes or {})
                attrs.update({
                    'traceability': d.get('traceability', ''),
                    'calibration_method': d.get('calibration_method', ''),
                    'calibration_institution': d.get('calibration_institution', ''),
                    'calibration_procedure': d.get('calibration_procedure', ''),
                    'reminder_days': d.get('reminder_days', 30),
                    'reminder_person': d.get('reminder_person', ''),
                })
                eq.attributes = attrs
                eq.save()
            created_equip.append((eq, created))

        self.stdout.write(f'设备: 共 {len(created_equip)} 台')

        # 校准记录
        for eq, _ in created_equip:
            if not EquipmentCalibration.objects.filter(equipment=eq).exists():
                EquipmentCalibration.objects.create(
                    equipment=eq,
                    calibration_type='external',
                    calibration_date=eq.last_calibration_date,
                    next_due_date=eq.next_calibration_date,
                    calibrator=eq.attributes.get('calibration_institution', '') if eq.attributes else '',
                    certificate_no=f'CERT-{eq.code}-001',
                    result='pass',
                )
                self.stdout.write(f'  校准记录: {eq.code}')

        # 校准工单（为第一台设备创建一个待处理的）
        eq1 = ResourceItem.objects.filter(code='FSD0405093').first()
        if eq1 and not EquipmentMaintenance.objects.filter(
            equipment=eq1, maintenance_type='calibration', status__in=['pending', 'in_progress']
        ).exists():
            EquipmentMaintenance.objects.create(
                equipment=eq1,
                maintenance_type='calibration',
                title=f'校准计划：{eq1.name} - 到期日 {eq1.next_calibration_date}',
                description=f'设备 {eq1.code} 校准到期日 {eq1.next_calibration_date}，请安排校准。',
                maintenance_date=date.today(),
                status='pending',
                calibration_due_date=eq1.next_calibration_date,
            )
            self.stdout.write(f'  校准工单: {eq1.code} (待处理)')

        # 确保首个账号有校准权限（开发/演示用）
        from apps.identity.models import Account, Role, AccountRole
        first_acc = Account.objects.filter(is_deleted=False).first()
        tech_role = Role.objects.filter(name='technician', is_active=True).first()
        if first_acc and tech_role and not AccountRole.objects.filter(account=first_acc, role=tech_role).exists():
            AccountRole.objects.get_or_create(account=first_acc, role=tech_role, project_id=None, defaults={})
            self.stdout.write(self.style.SUCCESS(f'已为 {first_acc.username} 授予 technician 角色（含校准权限）'))

        self.stdout.write(self.style.SUCCESS('完成。请刷新器监·设备台 → 校准计划 页面查看。'))
