"""
清空质量台常见测试数据：手动补录协议、冒烟协议编号、关联监察/登记及指向这些协议的偏差。

用法：
  python manage.py clear_quality_test_data --yes

非 DEBUG 环境须加 --i-know（防误删生产库）。
"""
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db.models import Q

from apps.protocol.models import Protocol
from apps.quality.models import Deviation, QualityProjectRegistry


def _collect_test_protocol_ids():
    """与质量台测试/补录相关的协议主键（去重）。"""
    ids = set()

    manual_reg = QualityProjectRegistry.objects.filter(
        source=QualityProjectRegistry.Source.QUALITY_MANUAL
    ).values_list('protocol_id', flat=True)
    ids.update(manual_reg)

    try:
        qs_json = Protocol.objects.filter(
            is_deleted=False,
            parsed_data__quality_origin='manual_test',
        ).values_list('id', flat=True)
        ids.update(qs_json)
    except Exception:
        for p in Protocol.objects.filter(is_deleted=False).only('id', 'parsed_data').iterator(chunk_size=500):
            pd = p.parsed_data if isinstance(p.parsed_data, dict) else {}
            if pd.get('quality_origin') == 'manual_test':
                ids.add(p.id)

    smoke_q = Q(code__istartswith='SMK') | Q(title__icontains='冒烟-项目监察')
    for pid in Protocol.objects.filter(is_deleted=False).filter(smoke_q).values_list('id', flat=True):
        ids.add(pid)

    return sorted(ids)


class Command(BaseCommand):
    help = '删除质量台手动补录/冒烟类测试协议及其关联数据（须 --yes）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--yes',
            action='store_true',
            help='确认执行删除',
        )
        parser.add_argument(
            '--i-know',
            action='store_true',
            dest='i_know',
            help='允许在 DJANGO_DEBUG=false 时仍执行（慎用）',
        )

    def handle(self, *args, **options):
        if not options['yes']:
            self.stderr.write('请追加 --yes 确认执行')
            return

        debug = getattr(settings, 'DEBUG', False)
        if not debug and not options['i_know']:
            self.stderr.write('当前非 DEBUG，若仍要清空请追加 --i-know（慎用）')
            return

        ids = _collect_test_protocol_ids()
        if not ids:
            self.stdout.write(self.style.WARNING('未找到符合条件的测试协议，无需删除'))
            return

        dev_qs = Deviation.objects.filter(project_id__in=ids, is_deleted=False)
        dev_n = dev_qs.count()
        if dev_n:
            dev_qs.delete()
            self.stdout.write(f'已删除偏差记录 {dev_n} 条（project_id 指向待删协议）')

        protos = list(
            Protocol.objects.filter(id__in=ids, is_deleted=False).values_list('id', 'code', 'title')
        )
        deleted_n, _ = Protocol.objects.filter(id__in=ids, is_deleted=False).delete()
        self.stdout.write(
            self.style.SUCCESS(
                f'已删除协议 {len(protos)} 条（级联监察登记等）；ORM delete 返回值合计={deleted_n}'
            )
        )
        for pid, code, title in protos[:20]:
            self.stdout.write(f'  - id={pid} code={code!r} title={title!r}')
        if len(protos) > 20:
            self.stdout.write(f'  ... 另有 {len(protos) - 20} 条')
