"""
飞书卡片交互回调接口

处理审批人在飞书卡片上点击「批准合并」/「拒绝」/「发布到生产」按钮的回调：
- approve_pr / reject_pr：PR 审批，2 人 approve 后自动设置 GitHub commit status
- deploy_to_production：触发 GitHub Actions workflow_dispatch 进行生产部署

配置要求：
  飞书开放平台 → 机器人 → 卡片请求网址 设置为：
    https://china-norm.com/api/v1/webhooks/feishu/card-action/

  GitHub Actions Secret：GITHUB_PAT_STATUS（repo scope，用于设置 commit status 和触发 workflow）
  本地 .env：GITHUB_TOKEN（已有，直接复用）
"""
import json
import logging
import os

import httpx
from django.http import HttpRequest, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from apps.notification.models import PrApprovalRecord

logger = logging.getLogger('cn_kis.pr_approval')

# 需要 2 人批准方可通过
REQUIRED_APPROVALS = 2

# GitHub 仓库信息
GITHUB_REPO = 'china-norm-company/cn_kis_v2.0'

# 有效审批人列表（Feishu open_id），空列表表示不限制（任何人均可批准）
# 目前不限制，依靠群成员限制
AUTHORIZED_APPROVERS: list[str] = []


def _get_feishu_token() -> str | None:
    app_id = os.environ.get('FEISHU_APP_ID', '')
    app_secret = os.environ.get('FEISHU_APP_SECRET', '')
    if not app_id or not app_secret:
        return None
    resp = httpx.post(
        'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
        json={'app_id': app_id, 'app_secret': app_secret},
        timeout=10,
    )
    data = resp.json()
    return data.get('tenant_access_token')


def _get_user_name(open_id: str) -> str:
    """通过 open_id 查询飞书用户姓名"""
    token = _get_feishu_token()
    if not token:
        return open_id
    try:
        resp = httpx.get(
            f'https://open.feishu.cn/open-apis/contact/v3/users/{open_id}',
            params={'user_id_type': 'open_id'},
            headers={'Authorization': f'Bearer {token}'},
            timeout=10,
        )
        data = resp.json()
        return data.get('data', {}).get('user', {}).get('name', open_id)
    except Exception:
        return open_id


def _set_github_commit_status(commit_sha: str, state: str, description: str) -> bool:
    """调用 GitHub API 设置 commit status"""
    token = os.environ.get('GITHUB_TOKEN', '')
    if not token:
        logger.error('GITHUB_TOKEN 未配置，无法设置 commit status')
        return False
    url = f'https://api.github.com/repos/{GITHUB_REPO}/statuses/{commit_sha}'
    payload = {
        'state': state,
        'context': 'feishu-approval/required',
        'description': description[:140],
        'target_url': f'https://github.com/{GITHUB_REPO}/pulls',
    }
    try:
        resp = httpx.post(
            url,
            json=payload,
            headers={
                'Authorization': f'Bearer {token}',
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            timeout=15,
        )
        if resp.status_code in (200, 201):
            logger.info(f'GitHub commit status 已更新：{state} for {commit_sha[:8]}')
            return True
        logger.error(f'GitHub commit status 更新失败：{resp.status_code} {resp.text[:200]}')
        return False
    except Exception as e:
        logger.error(f'GitHub commit status 请求异常：{e}')
        return False


def _send_feishu_group_message(chat_id: str, card: dict) -> None:
    """向飞书群发送卡片消息"""
    token = _get_feishu_token()
    if not token:
        return
    try:
        httpx.post(
            'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id',
            json={'receive_id': chat_id, 'msg_type': 'interactive', 'content': json.dumps(card)},
            headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
            timeout=10,
        )
    except Exception as e:
        logger.warning(f'发送飞书群消息失败：{e}')


def _trigger_production_deploy(
    pr_number: int,
    commit_sha: str,
    approver_name: str,
    pr_title: str,
) -> dict:
    """
    触发 GitHub Actions workflow_dispatch，启动生产部署。
    只有 approver_name 在已知成员中才允许触发（防止任意人触发部署）。
    """
    token = os.environ.get('GITHUB_TOKEN', '')
    if not token:
        logger.error('GITHUB_TOKEN 未配置，无法触发 workflow')
        return {'status': 'error', 'error': 'GITHUB_TOKEN 未配置'}

    url = f'https://api.github.com/repos/{GITHUB_REPO}/actions/workflows/backend-deploy-production.yml/dispatches'
    payload = {
        'ref': 'main',
        'inputs': {
            'pr_number': str(pr_number),
            'commit_sha': commit_sha,
            'approver_name': approver_name,
            'pr_title': pr_title,
        },
    }
    try:
        resp = httpx.post(
            url,
            json=payload,
            headers={
                'Authorization': f'Bearer {token}',
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            timeout=15,
        )
        if resp.status_code == 204:
            logger.info(f'已触发生产部署 workflow：PR #{pr_number} by {approver_name}')
            return {'status': 'triggered'}
        logger.error(f'触发 workflow 失败：{resp.status_code} {resp.text[:300]}')
        return {'status': 'error', 'error': f'HTTP {resp.status_code}'}
    except Exception as e:
        logger.error(f'触发 workflow 请求异常：{e}')
        return {'status': 'error', 'error': str(e)}


def _process_approval(
    pr_number: int,
    commit_sha: str,
    repo: str,
    approver_open_id: str,
    approver_name: str,
    action: str,
) -> dict:
    """
    处理一次审批动作，返回处理结果摘要。
    action: 'approve' | 'reject'
    """
    # 幂等：同一人对同一 PR 的操作只记录一次（覆盖更新）
    record, created = PrApprovalRecord.objects.update_or_create(
        repo=repo,
        pr_number=pr_number,
        approver_open_id=approver_open_id,
        defaults={
            'commit_sha': commit_sha,
            'approver_name': approver_name,
            'action': action,
            'github_status_set': False,
        },
    )

    approval_group_chat_id = os.environ.get('FEISHU_APPROVAL_CHAT_ID', '')

    if action == PrApprovalRecord.ACTION_REJECT:
        # 拒绝：立即设置 GitHub status 为 failure
        desc = f'{approver_name} 拒绝了此 PR，请修改后重新提交审批'
        ok = _set_github_commit_status(commit_sha, 'failure', desc)
        if ok:
            PrApprovalRecord.objects.filter(
                repo=repo, pr_number=pr_number
            ).update(github_status_set=True)
        # 通知审批群
        if approval_group_chat_id:
            _send_feishu_group_message(approval_group_chat_id, {
                'header': {
                    'title': {'content': f'🔴 PR #{pr_number} 已被拒绝', 'tag': 'plain_text'},
                    'template': 'red',
                },
                'elements': [
                    {'tag': 'div', 'text': {'tag': 'lark_md',
                        'content': f'**审批人**：{approver_name}\n**原因**：审批人点击了「拒绝」按钮\n\n开发者需修改代码后重新提交。'}},
                    {'tag': 'action', 'actions': [
                        {'tag': 'button', 'text': {'content': '查看 PR', 'tag': 'plain_text'},
                         'url': f'https://github.com/{repo}/pull/{pr_number}', 'type': 'danger'},
                    ]},
                ],
            })
        return {'status': 'rejected', 'approver': approver_name}

    # approve：统计有效批准数（同一 PR）
    approve_records = PrApprovalRecord.objects.filter(
        repo=repo,
        pr_number=pr_number,
        action=PrApprovalRecord.ACTION_APPROVE,
    ).order_by('create_time')

    approve_count = approve_records.count()
    approver_names = list(approve_records.values_list('approver_name', flat=True))
    names_str = '、'.join(n or oid for n, oid in zip(
        approver_names,
        approve_records.values_list('approver_open_id', flat=True)
    ))

    logger.info(f'PR #{pr_number} 当前批准数：{approve_count}/{REQUIRED_APPROVALS}（{names_str}）')

    if approve_count >= REQUIRED_APPROVALS:
        desc = f'{names_str} 已批准（{approve_count}/{REQUIRED_APPROVALS}）'
        ok = _set_github_commit_status(commit_sha, 'success', desc)
        if ok:
            approve_records.update(github_status_set=True)
            # 通知审批群
            if approval_group_chat_id:
                _send_feishu_group_message(approval_group_chat_id, {
                    'header': {
                        'title': {'content': f'✅ PR #{pr_number} 审批通过，可合并', 'tag': 'plain_text'},
                        'template': 'green',
                    },
                    'elements': [
                        {'tag': 'div', 'text': {'tag': 'lark_md',
                            'content': f'**审批人**：{names_str}\n\n已达到 {REQUIRED_APPROVALS} 人批准要求，PR 状态检查已通过。\n\n开发者现在可以运行 `gh pr merge {pr_number} --squash` 合并。'}},
                        {'tag': 'action', 'actions': [
                            {'tag': 'button', 'text': {'content': '查看 PR', 'tag': 'plain_text'},
                             'url': f'https://github.com/{repo}/pull/{pr_number}', 'type': 'primary'},
                        ]},
                    ],
                })
        return {'status': 'approved_and_merged', 'count': approve_count, 'approvers': names_str}
    else:
        # 还不够，设置 pending
        remaining = REQUIRED_APPROVALS - approve_count
        desc = f'{names_str} 已批准（{approve_count}/{REQUIRED_APPROVALS}），还需 {remaining} 人'
        _set_github_commit_status(commit_sha, 'pending', desc)
        # 通知审批群
        if approval_group_chat_id:
            _send_feishu_group_message(approval_group_chat_id, {
                'header': {
                    'title': {'content': f'⏳ PR #{pr_number} 已收到 {approve_count}/{REQUIRED_APPROVALS} 个批准', 'tag': 'plain_text'},
                    'template': 'yellow',
                },
                'elements': [
                    {'tag': 'div', 'text': {'tag': 'lark_md',
                        'content': f'**已批准**：{names_str}\n**还需**：{remaining} 人批准\n\n请其他审批人也点击卡片上的「✅ 批准合并」按钮。'}},
                ],
            })
        return {'status': 'pending', 'count': approve_count, 'remaining': remaining}


@csrf_exempt
@require_POST
def feishu_card_action_webhook(request: HttpRequest) -> JsonResponse:
    """
    飞书卡片交互回调端点（无需认证，飞书直接 POST）

    飞书要求此接口在 1 秒内返回 200，否则会重试。
    """
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({'code': 400, 'msg': 'invalid json'}, status=400)

    # 飞书 URL 验证（首次配置时）
    if 'challenge' in body:
        return JsonResponse({'challenge': body['challenge']})

    action_data = body.get('action', {})
    value = action_data.get('value', {})

    pr_action = value.get('action')
    pr_number = value.get('pr_number')
    commit_sha = value.get('commit_sha', '')
    repo = value.get('repo', GITHUB_REPO)

    if pr_action not in ('approve_pr', 'reject_pr', 'deploy_to_production') or not pr_number or not commit_sha:
        logger.warning(f'无效的卡片回调参数：{value}')
        return JsonResponse({'code': 0, 'msg': 'ignored'})

    open_id = body.get('open_id', '')
    approver_name = _get_user_name(open_id) if open_id else '未知操作人'

    # 限制审批人（如配置了白名单）
    if AUTHORIZED_APPROVERS and open_id not in AUTHORIZED_APPROVERS:
        logger.warning(f'未授权的审批人：{open_id}')
        return JsonResponse({'toast': {'type': 'error', 'content': '您没有审批权限'}, 'code': 0})

    # ── deploy_to_production 动作 ──────────────────────────────────────────
    if pr_action == 'deploy_to_production':
        pr_title = value.get('pr_title', f'PR #{pr_number}')
        result = _trigger_production_deploy(
            pr_number=int(pr_number),
            commit_sha=commit_sha,
            approver_name=approver_name,
            pr_title=pr_title,
        )
        if result.get('status') == 'triggered':
            return JsonResponse({'toast': {'type': 'success', 'content': f'🚀 已触发生产部署，{approver_name} 操作成功'}, 'code': 0})
        else:
            logger.error(f'触发生产部署失败：{result}')
            return JsonResponse({'toast': {'type': 'error', 'content': f'触发失败：{result.get("error", "未知错误")}'}, 'code': 0})

    # ── approve_pr / reject_pr ──────────────────────────────────────────

    action = PrApprovalRecord.ACTION_APPROVE if pr_action == 'approve_pr' else PrApprovalRecord.ACTION_REJECT

    result = _process_approval(
        pr_number=int(pr_number),
        commit_sha=commit_sha,
        repo=repo,
        approver_open_id=open_id,
        approver_name=approver_name,
        action=action,
    )
    logger.info(f'PR #{pr_number} 审批结果：{result}')

    # 飞书卡片回调支持返回 toast 消息（在审批人手机上显示）
    if action == PrApprovalRecord.ACTION_REJECT:
        toast_msg = f'已拒绝 PR #{pr_number}'
        toast_type = 'error'
    elif result.get('status') == 'approved_and_merged':
        toast_msg = f'✅ 审批完成！PR #{pr_number} 可合并了'
        toast_type = 'success'
    else:
        remaining = result.get('remaining', 1)
        toast_msg = f'已批准，还需 {remaining} 人确认'
        toast_type = 'info'

    return JsonResponse({'toast': {'type': toast_type, 'content': toast_msg}, 'code': 0})
