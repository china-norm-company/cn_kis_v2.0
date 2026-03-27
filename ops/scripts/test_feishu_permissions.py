#!/usr/bin/env python3
"""
飞书应用权限测试脚本
====================================
逐项测试指定飞书应用的 API 权限，输出 ✅ / ❌ 结果。

使用方法：
  # 通过环境变量（推荐）
  export FEISHU_APP_ID=cli_xxx
  export FEISHU_APP_SECRET=xxx
  python3 ops/scripts/test_feishu_permissions.py

  # 通过命令行参数
  python3 ops/scripts/test_feishu_permissions.py --app-id cli_xxx --secret xxx

  # 测试用户查询（需要联系人权限）
  python3 ops/scripts/test_feishu_permissions.py --test-email user@example.com

  # 跳过群聊创建（避免重复创建）
  python3 ops/scripts/test_feishu_permissions.py --skip-create-chat
"""
import argparse
import json
import os
import sys
from pathlib import Path

try:
    import httpx
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'httpx', '-q'])
    import httpx

BASE_URL = 'https://open.feishu.cn/open-apis'

# ── 颜色输出 ──────────────────────────────────────────────────────────────────
GREEN  = '\033[92m'; RED = '\033[91m'; YELLOW = '\033[93m'
CYAN   = '\033[96m'; BOLD = '\033[1m'; RESET  = '\033[0m'

def ok(msg):      print(f'  {GREEN}✅ {msg}{RESET}')
def fail(msg):    print(f'  {RED}❌ {msg}{RESET}')
def warn(msg):    print(f'  {YELLOW}⚠️  {msg}{RESET}')
def info(msg):    print(f'  {CYAN}→  {msg}{RESET}')
def section(msg): print(f'\n{BOLD}【{msg}】{RESET}')


def _read_dotenv(dotenv_path: Path) -> dict:
    result = {}
    if not dotenv_path.exists():
        return result
    for line in dotenv_path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, val = line.partition('=')
        result[key.strip()] = val.strip().strip('"').strip("'")
    return result


def resolve_config(args: argparse.Namespace) -> dict:
    """CLI 参数 > 环境变量 > backend/.env"""
    script_dir = Path(__file__).resolve().parent
    dotenv = _read_dotenv(script_dir.parent.parent / 'backend' / '.env')

    def get(cli_val, env_key):
        return cli_val or os.environ.get(env_key) or dotenv.get(env_key, '')

    app_id     = get(args.app_id,  'FEISHU_APP_ID')
    app_secret = get(args.secret,  'FEISHU_APP_SECRET')

    if not app_id or not app_secret:
        print(f'{RED}缺少必要配置：{RESET}')
        if not app_id:
            print(f'  {RED}• FEISHU_APP_ID（或 --app-id）{RESET}')
        if not app_secret:
            print(f'  {RED}• FEISHU_APP_SECRET（或 --secret）{RESET}')
        sys.exit(1)

    return {
        'app_id':     app_id,
        'app_secret': app_secret,
        'test_email': args.test_email or os.environ.get('FEISHU_TEST_EMAIL', ''),
    }


# ── 核心 API 调用 ──────────────────────────────────────────────────────────────
def get_tenant_token(cfg: dict) -> str:
    resp = httpx.post(
        f'{BASE_URL}/auth/v3/tenant_access_token/internal',
        json={'app_id': cfg['app_id'], 'app_secret': cfg['app_secret']},
        timeout=10,
    ).json()
    return resp.get('tenant_access_token', '') if resp.get('code') == 0 else ''


def feishu_get(token: str, path: str, params: dict = None):
    return httpx.get(
        f'{BASE_URL}/{path}',
        headers={'Authorization': f'Bearer {token}'},
        params=params, timeout=10,
    ).json()


def feishu_post(token: str, path: str, body: dict = None):
    return httpx.post(
        f'{BASE_URL}/{path}',
        headers={'Authorization': f'Bearer {token}'},
        json=body or {}, timeout=10,
    ).json()


# ── 各项测试 ───────────────────────────────────────────────────────────────────
def test_tenant_token(cfg: dict) -> str:
    section('Step 1：获取 tenant_access_token（应用凭证验证）')
    token = get_tenant_token(cfg)
    if token:
        ok(f'tenant_access_token 获取成功（前20位：{token[:20]}...）')
    else:
        fail('无法获取 tenant_access_token — App Secret 可能错误，或应用未启用')
    return token


def test_find_user(token: str, email: str) -> str:
    """通过邮箱查找用户 open_id"""
    section(f'Step 2：通过邮箱查找用户 open_id（需要 contact:user.email:readonly）')
    info(f'查询邮箱：{email}')
    resp = httpx.post(
        f'{BASE_URL}/contact/v3/users/batch_get_id',
        headers={'Authorization': f'Bearer {token}'},
        json={'emails': [email], 'user_id_type': 'open_id'},
        timeout=10,
    ).json()
    info(f'API 响应：{json.dumps(resp, ensure_ascii=False)[:200]}')
    if resp.get('code') == 0:
        user_list = resp.get('data', {}).get('user_list', [])
        if user_list and user_list[0].get('user_id'):
            open_id = user_list[0]['user_id']
            ok(f'找到用户：open_id={open_id}')
            return open_id
        warn(f'未找到 {email} 对应的用户（邮箱可能不在飞书组织中）')
    elif resp.get('code') == 99991663:
        fail('权限不足：contact:user.email:readonly 未开通')
    else:
        fail(f'查询失败：code={resp.get("code")} msg={resp.get("msg")}')
    return ''


def test_send_message(token: str, open_id: str):
    section('Step 3：发送测试私信（需要 im:message）')
    resp = feishu_post(
        token,
        'im/v1/messages?receive_id_type=open_id',
        body={
            'receive_id': open_id,
            'msg_type': 'text',
            'content': json.dumps({'text': '🤖 飞书应用权限测试消息 — 收到此消息说明 im:message 权限正常！'}),
        },
    )
    info(f'API 响应：code={resp.get("code")} msg={resp.get("msg")}')
    if resp.get('code') == 0:
        ok('私信发送成功 — im:message 权限 ✅')
    elif resp.get('code') == 230013:
        warn('用户需先向机器人发一条消息（飞书限制），才能接收机器人私信')
    elif resp.get('code') == 99991668:
        fail('权限不足：im:message 未开通')
    else:
        fail(f'发消息失败：code={resp.get("code")} msg={resp.get("msg")}')


def test_create_chat(token: str, owner_open_id: str, chat_name: str):
    section(f'Step 4：创建群聊「{chat_name}」（需要 im:chat）')
    resp = feishu_post(token, 'im/v1/chats', body={
        'name': chat_name,
        'description': '开发团队协作群 — GitHub 事件通知 + 任务协调',
        'owner_id': owner_open_id,
        'owner_id_type': 'open_id',
        'chat_type': 'group',
    })
    info(f'API 响应：{json.dumps(resp, ensure_ascii=False)[:300]}')
    if resp.get('code') == 0:
        chat_id = resp.get('data', {}).get('chat_id', '')
        ok(f'群聊创建成功！chat_id={chat_id}')
        return chat_id
    elif resp.get('code') == 99991668:
        fail('权限不足：im:chat 未开通')
    else:
        fail(f'创建群聊失败：code={resp.get("code")} msg={resp.get("msg")}')
    return ''


def test_list_wiki_spaces(token: str):
    section('Step 5：列出知识库空间（需要 wiki:wiki）')
    resp = feishu_get(token, 'wiki/v2/spaces', params={'page_size': 10})
    info(f'API 响应：{json.dumps(resp, ensure_ascii=False)[:300]}')
    if resp.get('code') == 0:
        items = resp.get('data', {}).get('items', [])
        ok(f'wiki:wiki 权限正常，可见知识库：{len(items)} 个')
        for space in items:
            info(f'  {space.get("name")}  space_id={space.get("space_id")}')
    elif resp.get('code') == 99991668:
        fail('权限不足：wiki:wiki 未开通')
    else:
        fail(f'查询失败：code={resp.get("code")} msg={resp.get("msg")}')


def test_create_document(token: str):
    section('Step 6：测试文档创建权限（需要 docx:document）')
    resp = feishu_post(token, 'docx/v1/documents', body={
        'title': '__权限测试文档__（可删除）',
        'folder_token': '',
    })
    info(f'API 响应：code={resp.get("code")} msg={resp.get("msg")}')
    if resp.get('code') == 0:
        doc_id = resp.get('data', {}).get('document', {}).get('document_id', '')
        ok(f'文档创建成功！document_id={doc_id}  docx:document 权限 ✅')
    elif resp.get('code') == 99991668:
        fail('权限不足：docx:document 未开通')
    else:
        warn(f'文档创建失败（code={resp.get("code")}）——可能是正常的权限限制')


# ── 主流程 ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description='飞书应用权限逐项测试',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
环境变量（优先级低于命令行参数）：
  FEISHU_APP_ID          飞书应用 ID
  FEISHU_APP_SECRET      飞书应用密钥（敏感，勿提交代码）
  FEISHU_TEST_EMAIL      用于测试用户查询的飞书邮箱
        """,
    )
    parser.add_argument('--app-id',   help='飞书应用 ID（覆盖 FEISHU_APP_ID）')
    parser.add_argument('--secret',   help='飞书应用密钥（覆盖 FEISHU_APP_SECRET）')
    parser.add_argument('--test-email', help='用于测试用户查询的飞书邮箱（覆盖 FEISHU_TEST_EMAIL）')
    parser.add_argument('--chat-name', default='CN_KIS_PLATFORM开发小组',
                        help='测试创建的群聊名称（默认：CN_KIS_PLATFORM开发小组）')
    parser.add_argument('--skip-create-chat', action='store_true',
                        help='跳过群聊创建（避免重复创建）')
    parser.add_argument('--skip-send-message', action='store_true',
                        help='跳过私信发送')
    args = parser.parse_args()

    cfg = resolve_config(args)

    print(f'\n{BOLD}{"═"*55}')
    print(f'  飞书应用权限测试')
    print(f'  app_id：{cfg["app_id"]}')
    if cfg['test_email']:
        print(f'  测试邮箱：{cfg["test_email"]}')
    print(f'{"═"*55}{RESET}')

    # Step 1
    token = test_tenant_token(cfg)
    if not token:
        print(f'\n{RED}❌ 无法继续，请确认 App ID 和 Secret 正确{RESET}')
        sys.exit(1)

    # Step 2
    open_id = ''
    if cfg['test_email']:
        open_id = test_find_user(token, cfg['test_email'])
    else:
        section('Step 2：跳过（未提供 --test-email 或 FEISHU_TEST_EMAIL）')

    # Step 3
    if not args.skip_send_message and open_id:
        test_send_message(token, open_id)
    elif not open_id:
        section('Step 3：跳过（无用户 open_id）')
    else:
        section('Step 3：跳过（--skip-send-message）')

    # Step 4
    chat_id = ''
    if args.skip_create_chat:
        section('Step 4：跳过（--skip-create-chat）')
    elif open_id:
        chat_id = test_create_chat(token, open_id, args.chat_name)
    else:
        section('Step 4：跳过（无群主 open_id）')

    # Step 5
    test_list_wiki_spaces(token)

    # Step 6
    test_create_document(token)

    # 总结
    print(f'\n{BOLD}{"═"*55}')
    print(f'  测试完成！')
    if chat_id:
        print(f'  新建群聊 chat_id：{chat_id}')
        print(f'  ⚠️  请将 chat_id 写入 FEISHU_DEV_GROUP_CHAT_ID 环境变量')
    print(f'{"═"*55}{RESET}\n')


if __name__ == '__main__':
    main()
