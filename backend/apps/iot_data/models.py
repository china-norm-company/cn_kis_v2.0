from django.db import models


class DeviceReading(models.Model):
    class Meta:
        db_table = 't_iot_device_reading'
        verbose_name = '设备读数'
        verbose_name_plural = '设备读数'
        indexes = [
            models.Index(fields=['device_id', 'timestamp']),
            models.Index(fields=['reading_type', 'timestamp']),
            models.Index(fields=['created_at']),
        ]

    device_id = models.CharField('设备ID', max_length=120, db_index=True)
    reading_type = models.CharField('读数类型', max_length=80, db_index=True)
    value = models.FloatField('读数值')
    unit = models.CharField('单位', max_length=30, blank=True, default='')
    timestamp = models.DateTimeField('采集时间', db_index=True)
    payload = models.JSONField('原始载荷', default=dict, blank=True)
    source = models.CharField('来源', max_length=40, default='https_push')
    created_at = models.DateTimeField('入库时间', auto_now_add=True, db_index=True)

    def __str__(self):
        return f'{self.device_id} {self.reading_type}={self.value}{self.unit}'
