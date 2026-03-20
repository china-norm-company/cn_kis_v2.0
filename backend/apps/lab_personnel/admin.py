"""
实验室人员管理 Admin 注册

注册所有模型到 Django Admin，方便后台数据管理和调试。
"""
from django.contrib import admin

from .models import (
    LabStaffProfile, StaffCertificate, MethodQualification,
    ShiftSchedule, ShiftSlot, ShiftSwapRequest,
    WorkTimeLog, WorkTimeSummary,
    RiskAlert,
    DelegationLog, FieldChangeLog,
)


# ============================================================================
# 人员档案
# ============================================================================
@admin.register(LabStaffProfile)
class LabStaffProfileAdmin(admin.ModelAdmin):
    list_display = ('staff', 'lab_role', 'employment_type', 'competency_level', 'is_active', 'create_time')
    list_filter = ('lab_role', 'employment_type', 'competency_level', 'is_active')
    search_fields = ('staff__name', 'staff__employee_no')
    raw_id_fields = ('staff',)


@admin.register(StaffCertificate)
class StaffCertificateAdmin(admin.ModelAdmin):
    list_display = ('staff', 'cert_type', 'cert_name', 'status', 'expiry_date', 'is_locked')
    list_filter = ('cert_type', 'status', 'is_locked')
    search_fields = ('staff__name', 'cert_name', 'cert_number')
    raw_id_fields = ('staff',)
    date_hierarchy = 'expiry_date'


@admin.register(MethodQualification)
class MethodQualificationAdmin(admin.ModelAdmin):
    list_display = ('staff', 'method', 'level', 'qualified_date', 'total_executions', 'last_execution_date')
    list_filter = ('level',)
    search_fields = ('staff__name', 'method__name')
    raw_id_fields = ('staff', 'method')


# ============================================================================
# 排班管理
# ============================================================================
@admin.register(ShiftSchedule)
class ShiftScheduleAdmin(admin.ModelAdmin):
    list_display = ('id', 'week_start_date', 'week_end_date', 'status', 'published_at', 'create_time')
    list_filter = ('status',)
    date_hierarchy = 'week_start_date'


@admin.register(ShiftSlot)
class ShiftSlotAdmin(admin.ModelAdmin):
    list_display = ('schedule', 'staff', 'shift_date', 'start_time', 'end_time', 'confirm_status')
    list_filter = ('confirm_status',)
    search_fields = ('staff__name',)
    raw_id_fields = ('schedule', 'staff')
    date_hierarchy = 'shift_date'


@admin.register(ShiftSwapRequest)
class ShiftSwapRequestAdmin(admin.ModelAdmin):
    list_display = ('id', 'requester', 'target_staff', 'original_slot', 'status', 'create_time')
    list_filter = ('status',)
    raw_id_fields = ('requester', 'target_staff', 'original_slot')


# ============================================================================
# 工时统计
# ============================================================================
@admin.register(WorkTimeLog)
class WorkTimeLogAdmin(admin.ModelAdmin):
    list_display = ('staff', 'work_date', 'start_time', 'end_time', 'actual_hours', 'source')
    list_filter = ('source',)
    search_fields = ('staff__name',)
    raw_id_fields = ('staff',)
    date_hierarchy = 'work_date'


@admin.register(WorkTimeSummary)
class WorkTimeSummaryAdmin(admin.ModelAdmin):
    list_display = ('staff', 'week_start_date', 'total_hours', 'workorder_hours',
                    'training_hours', 'utilization_rate')
    search_fields = ('staff__name',)
    raw_id_fields = ('staff',)
    date_hierarchy = 'week_start_date'


# ============================================================================
# 风险预警
# ============================================================================
@admin.register(RiskAlert)
class RiskAlertAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'risk_type', 'level', 'status', 'related_staff', 'create_time')
    list_filter = ('risk_type', 'level', 'status')
    search_fields = ('title', 'description', 'related_staff_name')
    date_hierarchy = 'create_time'


# ============================================================================
# 合规增强
# ============================================================================
@admin.register(DelegationLog)
class DelegationLogAdmin(admin.ModelAdmin):
    list_display = ('staff', 'protocol_id', 'pi_name', 'delegation_date', 'is_active', 'create_time')
    list_filter = ('is_active',)
    search_fields = ('staff__name', 'pi_name', 'protocol_name')
    raw_id_fields = ('staff',)
    date_hierarchy = 'delegation_date'


@admin.register(FieldChangeLog)
class FieldChangeLogAdmin(admin.ModelAdmin):
    list_display = ('model_name', 'record_id', 'field_name', 'old_value', 'new_value', 'changed_at')
    list_filter = ('model_name',)
    search_fields = ('field_name',)
    date_hierarchy = 'changed_at'
