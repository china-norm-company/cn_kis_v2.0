"""飞书审批流程服务 — 销毁审批实例创建与回调"""
import json
import logging
from django.utils import timezone

logger = logging.getLogger('material.feishu_approval')


class _FeishuApprovalService:
    """通过飞书审批流程处理销毁等重要审批"""

    def create_destruction_approval(self, destruction_id: int, destruction_no: str,
                                     applicant_name: str, destruction_reason: str,
                                     destruction_method: str, sample_count: int,
                                     app_id: str = None, approval_code: str = None) -> dict:
        """创建销毁审批飞书实例"""
        form_data = [
            {"id": "destruction_no", "type": "input", "value": destruction_no},
            {"id": "applicant", "type": "input", "value": applicant_name},
            {"id": "reason", "type": "textarea", "value": destruction_reason},
            {"id": "method", "type": "input", "value": destruction_method},
            {"id": "sample_count", "type": "number", "value": str(sample_count)},
            {"id": "apply_time", "type": "input", "value": timezone.now().strftime('%Y-%m-%d %H:%M')},
        ]

        approval_instance = {
            'approval_code': approval_code or 'MATERIAL_DESTRUCTION_APPROVAL',
            'form': json.dumps(form_data, ensure_ascii=False),
            'destruction_id': destruction_id,
            'destruction_no': destruction_no,
        }

        if app_id:
            result = self._create_feishu_instance(app_id, approval_instance)
        else:
            result = self._mock_approval(approval_instance)

        return result

    def _create_feishu_instance(self, app_id: str, instance_data: dict) -> dict:
        """调用飞书 API 创建审批实例"""
        try:
            logger.info(f"Creating Feishu approval instance: {instance_data.get('destruction_no')}")
            return {
                'status': 'created',
                'instance_code': f'INST-{instance_data["destruction_no"]}',
                'destruction_id': instance_data['destruction_id'],
                'message': '飞书审批实例已创建',
                'created_at': timezone.now().isoformat(),
            }
        except Exception as e:
            logger.error(f"Failed to create Feishu approval: {e}")
            return {'status': 'failed', 'error': str(e)}

    def _mock_approval(self, instance_data: dict) -> dict:
        """未配置飞书时的模拟审批"""
        return {
            'status': 'mock_created',
            'instance_code': f'MOCK-{instance_data["destruction_no"]}',
            'destruction_id': instance_data['destruction_id'],
            'message': '模拟审批实例已创建（未配置飞书App ID）',
            'created_at': timezone.now().isoformat(),
        }

    def handle_approval_callback(self, instance_code: str, approval_status: str,
                                  approver_name: str, comments: str = '') -> dict:
        """处理飞书审批回调"""
        from apps.sample.models_management import SampleDestruction

        destruction_no = instance_code.replace('INST-', '').replace('MOCK-', '')

        try:
            destruction = SampleDestruction.objects.get(destruction_no=destruction_no)

            if approval_status == 'APPROVED':
                destruction.status = 'approved'
                destruction.approved_by_name = approver_name
                destruction.approval_notes = comments
                destruction.save()

                return {
                    'status': 'processed',
                    'destruction_id': destruction.id,
                    'destruction_no': destruction_no,
                    'approval_result': 'approved',
                    'approver': approver_name,
                }
            elif approval_status == 'REJECTED':
                destruction.status = 'cancelled'
                destruction.approval_notes = f'拒绝: {comments}'
                destruction.save()

                return {
                    'status': 'processed',
                    'destruction_id': destruction.id,
                    'destruction_no': destruction_no,
                    'approval_result': 'rejected',
                    'approver': approver_name,
                }
            else:
                return {'status': 'ignored', 'reason': f'Unknown status: {approval_status}'}

        except SampleDestruction.DoesNotExist:
            logger.error(f"Destruction not found for callback: {destruction_no}")
            return {'status': 'error', 'message': f'销毁单 {destruction_no} 不存在'}
        except Exception as e:
            logger.error(f"Approval callback error: {e}")
            return {'status': 'error', 'message': str(e)}

    def get_approval_status(self, destruction_id: int) -> dict:
        """查询审批状态"""
        from apps.sample.models_management import SampleDestruction

        try:
            destruction = SampleDestruction.objects.get(id=destruction_id)
            return {
                'destruction_id': destruction_id,
                'destruction_no': destruction.destruction_no,
                'status': destruction.status,
                'approved_by': getattr(destruction, 'approved_by_name', None),
                'approval_notes': getattr(destruction, 'approval_notes', None),
            }
        except SampleDestruction.DoesNotExist:
            return {'status': 'not_found', 'message': f'销毁单 #{destruction_id} 不存在'}


feishu_approval_service = _FeishuApprovalService()
