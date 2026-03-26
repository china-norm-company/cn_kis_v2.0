"""用户反馈 → 上线治理缺口桥接（幂等、工作台归一）。"""
from django.test import TestCase

from apps.identity.launch_governance_feedback_bridge import (
    FEISHU_REF_PREFIX,
    ensure_launch_gap_from_user_feedback,
)
from apps.identity.models_launch_governance import LaunchGovernanceGap, LaunchGapStatus
from apps.secretary.feedback_models import FeedbackStatus, UserFeedback


class LaunchGovernanceFeedbackBridgeTests(TestCase):
    def test_creates_gap_and_normalizes_governance_to_admin(self):
        fb = UserFeedback.objects.create(
            feishu_message_id='om_test_001',
            sender_open_id='ou_x',
            sender_name='测试用户',
            raw_text='登录失败 报错',
            category='bug',
            workstation='governance',
            severity='high',
            ai_summary='登录失败',
            status=FeedbackStatus.ISSUE_CREATED,
            github_issue_url='https://github.com/china-norm-company/cn_kis_v2.0/issues/99',
        )
        gid = ensure_launch_gap_from_user_feedback(fb)
        self.assertIsNotNone(gid)
        g = LaunchGovernanceGap.objects.get(id=gid)
        self.assertEqual(g.feishu_ref, f'{FEISHU_REF_PREFIX}om_test_001')
        self.assertEqual(g.related_workstation, 'admin')
        self.assertEqual(g.status, LaunchGapStatus.OPEN)
        self.assertTrue(g.blocked_loop)
        self.assertIn('github.com', g.github_issue_url)

    def test_idempotent_same_message_id(self):
        fb = UserFeedback.objects.create(
            feishu_message_id='om_test_002',
            raw_text='建议增加导出',
            category='feature',
            workstation='quality',
            severity='medium',
            status=FeedbackStatus.ISSUE_CREATED,
            github_issue_url='https://github.com/china-norm-company/cn_kis_v2.0/issues/100',
        )
        a = ensure_launch_gap_from_user_feedback(fb)
        b = ensure_launch_gap_from_user_feedback(fb)
        self.assertIsNotNone(a)
        self.assertIsNone(b)
        self.assertEqual(LaunchGovernanceGap.objects.filter(feishu_ref=f'{FEISHU_REF_PREFIX}om_test_002').count(), 1)

    def test_skips_without_github_url(self):
        fb = UserFeedback.objects.create(
            feishu_message_id='om_test_003',
            raw_text='仅记录无 Issue',
            category='bug',
            status=FeedbackStatus.PENDING,
            github_issue_url='',
        )
        self.assertIsNone(ensure_launch_gap_from_user_feedback(fb))
        self.assertEqual(LaunchGovernanceGap.objects.count(), 0)
