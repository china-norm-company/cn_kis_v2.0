#!/usr/bin/env python3
"""
飞书 Wiki 知识库初始化脚本
============================
通过飞书 OAuth v2 授权码流程获取知识库管理员的 user_access_token，然后：
  1. 初始化 CN_KIS_PLATFORM 技术知识库目录结构
  2. 将 user_access_token 持久化到 backend/data/feishu_user_tokens.json

⚠️ 飞书知识库访问机制说明（重要）：
  - 飞书知识库 API 只接受 user_access_token，不支持 tenant_access_token
  - 飞书不支持将 App/Bot 直接添加为知识库成员（member_type: appid 的方式不可用）
  - 正确做法：知识库管理员（真实用户）的 user_access_token 持久化到
    backend/data/feishu_user_tokens.json，系统以该用户身份代理读写知识库
  - 后续维护：token 失效时重新运行此脚本获取新 token 即可

参考飞书 API：
  - OAuth v2: https://open.feishu.cn/document/uAjLw4CM/uYjL24iN/authen-overview

使用方法（推荐从项目根目录执行）：
  # 全部通过环境变量配置（推荐）
  export FEISHU_APP_ID=cli_xxx
  export FEISHU_APP_SECRET=xxx
  export FEISHU_WIKI_SPACE_ID=xxx
  python3 ops/scripts/init_wiki.py

  # 或通过命令行参数（适合临时调试）
  python3 ops/scripts/init_wiki.py \\
      --app-id cli_xxx \\
      --app-secret xxx \\
      --space-id xxx

  # 仅初始化目录结构（已有缓存 token 时跳过授权）
  python3 ops/scripts/init_wiki.py --skip-auth

  # 只授权，不创建节点
  python3 ops/scripts/init_wiki.py --auth-only
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import quote

try:
    import httpx
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'httpx', '-q'])
    import httpx


# ── 颜色 ──────────────────────────────────────────────────────────────────────
GREEN  = '\033[92m'; RED = '\033[91m'; YELLOW = '\033[93m'
CYAN   = '\033[96m'; BOLD = '\033[1m'; RESET  = '\033[0m'

def ok(m):   print(f'  {GREEN}✅ {m}{RESET}')
def fail(m): print(f'  {RED}❌ {m}{RESET}')
def warn(m): print(f'  {YELLOW}⚠️  {m}{RESET}')
def info(m): print(f'  {CYAN}→  {m}{RESET}')
def step(m): print(f'\n{BOLD}【{m}】{RESET}')

BASE_URL = 'https://open.feishu.cn/open-apis'

# 默认 redirect_uri：飞书重定向后，code 参数出现在 URL 栏中
# 即使页面返回 404，用户仍可从地址栏复制 code
_DEFAULT_REDIRECT = 'https://open.feishu.cn/connect/qrconnect/page/sso/index.html'

# token 缓存路径（本脚本内复用，避免每次都重新授权）
_TMP_TOKEN_PATH = Path('/tmp/feishu_wiki_token.json')


# ════════════════════════════════════════════════════════════════════════════════
# 配置解析
# ════════════════════════════════════════════════════════════════════════════════

def _read_dotenv(dotenv_path: Path) -> dict:
    """从 .env 文件读取键值对（仅处理简单赋值行，不解析引用变量）"""
    result = {}
    if not dotenv_path.exists():
        return result
    for line in dotenv_path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, val = line.partition('=')
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        result[key] = val
    return result


def load_config(args: argparse.Namespace) -> dict:
    """
    按优先级加载配置：CLI 参数 > 环境变量 > backend/.env 文件。
    返回包含 app_id / app_secret / space_id / redirect_uri / wiki_url 的字典。
    缺少必填项时直接退出并打印明确错误。
    """
    # 尝试读取 backend/.env
    script_dir = Path(__file__).resolve().parent    # ops/scripts/
    repo_root = script_dir.parent.parent            # 项目根目录
    env_file = repo_root / 'backend' / '.env'
    dotenv = _read_dotenv(env_file)
    if dotenv:
        info(f'已从 {env_file} 读取环境变量')

    def get(cli_val, env_key, dotenv_key=None):
        """CLI > os.environ > dotenv"""
        if cli_val:
            return cli_val
        if os.environ.get(env_key):
            return os.environ[env_key]
        key = dotenv_key or env_key
        return dotenv.get(key, '')

    redirect_base = get(None, 'FEISHU_REDIRECT_BASE').rstrip('/')
    redirect_uri = (
        args.redirect_uri
        or os.environ.get('FEISHU_REDIRECT_URI')
        or (f'{redirect_base}/secretary/' if redirect_base else _DEFAULT_REDIRECT)
    )

    cfg = {
        'app_id':       get(args.app_id,     'FEISHU_APP_ID'),
        'app_secret':   get(args.app_secret, 'FEISHU_APP_SECRET'),
        'space_id':     get(args.space_id,   'FEISHU_WIKI_SPACE_ID'),
        'redirect_uri': redirect_uri,
        'wiki_url':     args.wiki_url or os.environ.get('FEISHU_WIKI_URL', ''),
        'repo_root':    repo_root,
    }

    # 校验必填项
    missing = []
    if not cfg['app_id']:
        missing.append('FEISHU_APP_ID（或 --app-id）')
    if not cfg['app_secret']:
        missing.append('FEISHU_APP_SECRET（或 --app-secret）')
    if not cfg['space_id']:
        missing.append('FEISHU_WIKI_SPACE_ID（或 --space-id）')
    if missing:
        print(f'\n{RED}缺少必要配置，请通过环境变量或参数提供：{RESET}')
        for m in missing:
            print(f'  {RED}• {m}{RESET}')
        print('\n示例：')
        print('  export FEISHU_APP_ID=cli_xxx')
        print('  export FEISHU_APP_SECRET=xxx')
        print('  export FEISHU_WIKI_SPACE_ID=xxx')
        print('  python3 ops/scripts/init_wiki.py')
        sys.exit(1)

    return cfg


# ════════════════════════════════════════════════════════════════════════════════
# Step 1：通过 OAuth v2 授权码流程获取 user_access_token
# ════════════════════════════════════════════════════════════════════════════════

def get_user_access_token(cfg: dict) -> str:
    """
    返回 user_access_token 字符串。

    飞书 OAuth v2 授权码流程：
      1. 生成授权 URL（含 scope=offline_access 确保返回 refresh_token）
      2. 操作者在浏览器中使用知识库管理员账号授权
      3. 从重定向 URL 的 code 参数获取授权码
      4. 用授权码换取 user_access_token
         （飞书 v2 端点 token 交换不校验 redirect_uri）
    """
    step('Step 1：获取知识库管理员的 user_access_token（飞书 OAuth v2）')

    # scope 说明：
    #   offline_access — 必须，确保返回 refresh_token 以持久化授权
    #   wiki:wiki      — 知识库读写及管理员操作（含添加/删除成员）
    #                    注意：飞书无 wiki:wiki:admin scope；
    #                    成员管理权限来自「用户是空间管理员」身份，不是 scope
    #   docx:document  — 文档读写
    #   drive:drive    — 云空间文件操作
    scopes = ' '.join([
        'offline_access',
        'contact:user.base:readonly',
        'wiki:wiki',
        'docx:document',
        'drive:drive',
    ])

    auth_url = (
        f'{BASE_URL}/authen/v1/authorize'
        f'?client_id={cfg["app_id"]}'
        f'&redirect_uri={quote(cfg["redirect_uri"])}'
        f'&response_type=code'
        f'&scope={quote(scopes)}'
        f'&state=wiki_setup'
    )

    print(f'\n{BOLD}请用知识库管理员账号在浏览器中打开以下授权链接：{RESET}')
    print(f'\n{CYAN}{auth_url}{RESET}\n')
    print('授权完成后，浏览器会跳转到以下地址（页面可能显示错误，这是正常的）：')
    print(f'  {cfg["redirect_uri"]}?code=XXXXXXX&state=wiki_setup')
    print('请从地址栏复制 code= 后面的值，粘贴到下方（可粘贴完整 URL）：\n')

    try:
        raw = input('code = ').strip()
    except (EOFError, KeyboardInterrupt):
        print('\n操作已取消')
        sys.exit(0)

    # 支持粘贴完整 URL
    code = raw
    if 'code=' in raw:
        code = raw.split('code=')[1].split('&')[0]

    if not code:
        print('未获取到 code，操作取消')
        sys.exit(1)

    info(f'code（前10位）：{code[:10]}...')

    # ── 用 code 换取 user_access_token ─────────────────────────────────────
    # 飞书 v2 token 交换 body 中不携带 redirect_uri（与 v1 不同）
    resp = httpx.post(
        f'{BASE_URL}/authen/v2/oauth/token',
        headers={'Content-Type': 'application/json; charset=utf-8'},
        json={
            'grant_type': 'authorization_code',
            'client_id': cfg['app_id'],
            'client_secret': cfg['app_secret'],
            'code': code,
        },
        timeout=15.0,
    )
    result = resp.json()
    info(f'token 换取响应：code={result.get("code")} msg={result.get("msg", result.get("error_description", ""))}')

    # v2 端点：token 在顶层（code=0）
    if result.get('code') == 0:
        access_token  = result.get('access_token', '')
        refresh_token = result.get('refresh_token', '')
        open_id       = result.get('open_id', '')
        name          = result.get('name', '未知')
        expires_in    = result.get('expires_in', 7200)

        ok(f'user_access_token 获取成功  用户：{name}（{open_id}）')
        ok(f'有效期：{expires_in}s  refresh_token：{"已获取" if refresh_token else "未获取（缺少 offline_access scope）"}')

        _save_token(cfg, {
            'access_token':  access_token,
            'refresh_token': refresh_token,
            'open_id':       open_id,
            'name':          name,
            'expires_at':    time.time() + expires_in - 300,
            'obtained_at':   time.strftime('%Y-%m-%dT%H:%M:%S'),
        })
        return access_token

    # 兼容 v2 data 字段格式（旧版）
    data = result.get('data', {})
    if data.get('access_token'):
        ok(f'user_access_token 获取成功（data 格式）open_id={data.get("open_id")}')
        _save_token(cfg, {**data, 'obtained_at': time.strftime('%Y-%m-%dT%H:%M:%S')})
        return data['access_token']

    fail(f'获取失败：{json.dumps(result, ensure_ascii=False)[:300]}')
    fail('常见原因：code 已失效（每个 code 只能用一次）；请重新运行脚本')
    sys.exit(1)


def _save_token(cfg: dict, data: dict):
    """将 user_access_token 持久化到两个位置"""
    # 1. 临时缓存（本脚本复用，避免 2h 内重复授权）
    _TMP_TOKEN_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8'
    )
    # 2. Django 标准路径（供 feishu_client.get_user_token() 自动续期使用）
    backend_data = cfg['repo_root'] / 'backend' / 'data'
    backend_data.mkdir(parents=True, exist_ok=True)
    django_path = backend_data / 'feishu_user_tokens.json'
    django_data = {**data, 'updated_at': data.get('obtained_at', '')}
    django_path.write_text(
        json.dumps(django_data, ensure_ascii=False, indent=2), encoding='utf-8'
    )
    info(f'token 已保存：')
    info(f'  缓存：{_TMP_TOKEN_PATH}')
    info(f'  Django：{django_path}')


def load_cached_token() -> str:
    """尝试加载未过期的缓存 token，避免重复授权"""
    try:
        cache = json.loads(_TMP_TOKEN_PATH.read_text(encoding='utf-8'))
        if cache.get('expires_at', 0) > time.time():
            expires_str = time.strftime('%H:%M:%S', time.localtime(cache['expires_at']))
            info(f'使用缓存 token  用户：{cache.get("name", "未知")}  有效至：{expires_str}')
            info(f'如需重新授权，删除 {_TMP_TOKEN_PATH} 后重新运行')
            return cache['access_token']
        else:
            info('缓存 token 已过期，需重新授权')
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        pass
    return ''


# ════════════════════════════════════════════════════════════════════════════════
# Step 2：初始化知识库目录结构（原 Step 3）
# ════════════════════════════════════════════════════════════════════════════════
# 注：飞书不支持将 App/Bot 添加为知识库成员，已移除该步骤。
# 知识库操作统一使用管理员 user_access_token 代理执行。


# ════════════════════════════════════════════════════════════════════════════════
# Step 2：初始化知识库目录结构
# ════════════════════════════════════════════════════════════════════════════════
# 知识库操作必须使用管理员 user_access_token。
# 飞书不支持 member_type=appid，应用/Bot 无法成为知识库成员，已移除该步骤。

def init_wiki_structure(cfg: dict, user_token: str = ''):
    """
    创建知识库完整目录节点。

    知识库节点访问统一使用知识库创建者/管理员的 user_access_token（持久化于
    backend/data/feishu_user_tokens.json）。飞书知识库 API 不接受 tenant token，
    也不支持将 App/Bot 设为成员，user_access_token 代理是唯一可行路径。
    """
    step('Step 2：初始化知识库目录结构')
    if not user_token:
        fail('缺少 user_access_token，无法初始化知识库目录结构')
        sys.exit(1)

    space_id = cfg['space_id']

    def create_node(title: str, parent: str = '') -> str:
        body = {'node_type': 'origin', 'obj_type': 'docx', 'title': title}
        if parent:
            body['parent_node_token'] = parent
        r = httpx.post(
            f'{BASE_URL}/wiki/v2/spaces/{space_id}/nodes',
            headers={'Authorization': f'Bearer {user_token}', 'Content-Type': 'application/json'},
            json=body, timeout=10.0,
        )
        result = r.json()
        if result.get('code') == 0:
            nt = result['data']['node']['node_token']
            indent = '      ' if parent else '    '
            print(f'{indent}{GREEN}✅{RESET} {title}  [{nt[:12]}...]')
            return nt
        print(f'    {RED}❌{RESET} {title}  code={result.get("code")} {result.get("msg")}')
        return ''

    # 读取现有顶级节点，避免重复创建
    check = httpx.get(
        f'{BASE_URL}/wiki/v2/spaces/{space_id}/nodes',
        headers={'Authorization': f'Bearer {user_token}'},
        params={'page_size': 50}, timeout=10.0,
    ).json()

    if check.get('code') == 0:
        existing = {n.get('title') for n in check.get('data', {}).get('items', [])}
        info(f'现有顶级节点：{existing or "（空）"}')
    else:
        existing = set()
        warn(f'无法读取现有节点（code={check.get("code")}），将全量创建')

    time.sleep(0.3)

    SECTIONS = [
        ('📌 快速入口', [
            '🆕 新人入驻手册（必读）',
            '⚡ 命令速查（dev-task.sh）',
            '🔑 四条红线（不可违反）',
        ]),
        ('🔧 操作规范', [
            '分支与 PR 规范',
            '提交信息格式（Conventional Commits）',
            '环境隔离规范',
            '数据库迁移规范',
        ]),
        ('💡 Cursor AI 提示词', [
            '开始任务口令',
            '同步代码口令',
            '解决冲突口令',
            'PR 描述生成口令',
            '上下文恢复口令',
        ]),
        ('🏗 工作台说明', [
            '秘书台（secretary）',
            '质量台（quality）',
            '研究台（research）',
            '财务台（finance）',
            '执行台（execution）',
        ]),
        ('🚨 故障排查', [
            '飞书 Token 问题',
            'CI 失败排查',
            '数据库迁移冲突',
            '部署失败排查',
        ]),
        ('📋 变更日志', []),
    ]

    print()
    for section_title, sub_titles in SECTIONS:
        if section_title in existing:
            info(f'已存在，跳过：{section_title}')
            continue
        time.sleep(0.3)
        parent_token = create_node(section_title)
        if parent_token:
            for sub_title in sub_titles:
                time.sleep(0.2)
                create_node(sub_title, parent=parent_token)

    wiki_url = cfg.get('wiki_url') or '（请在 FEISHU_WIKI_URL 中配置知识库链接）'
    ok('知识库目录初始化完成！')
    print(f'  知识库链接：{wiki_url}')
    return True


# ════════════════════════════════════════════════════════════════════════════════
# CLI 入口
# ════════════════════════════════════════════════════════════════════════════════

def parse_args():
    parser = argparse.ArgumentParser(
        description='初始化飞书知识库：授权 → 添加应用成员 → 创建目录结构',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
环境变量（优先级低于命令行参数）：
  FEISHU_APP_ID          飞书应用 ID
  FEISHU_APP_SECRET      飞书应用密钥（敏感，勿提交代码）
  FEISHU_WIKI_SPACE_ID   知识库 space_id
  FEISHU_REDIRECT_BASE   基础域名，如 https://china-norm.com
  FEISHU_REDIRECT_URI    完整 redirect_uri（覆盖 FEISHU_REDIRECT_BASE）
  FEISHU_WIKI_URL        知识库访问链接（仅用于输出提示）

也可在 backend/.env 中配置以上变量，脚本会自动读取。
        """,
    )
    parser.add_argument('--app-id',      help='飞书应用 ID（覆盖 FEISHU_APP_ID）')
    parser.add_argument('--app-secret',  help='飞书应用密钥（覆盖 FEISHU_APP_SECRET）')
    parser.add_argument('--space-id',    help='知识库 space_id（覆盖 FEISHU_WIKI_SPACE_ID）')
    parser.add_argument('--redirect-uri',help='OAuth redirect_uri（必须在飞书应用安全设置中已注册）')
    parser.add_argument('--wiki-url',    help='知识库访问链接（仅用于输出提示）')
    parser.add_argument('--skip-auth',   action='store_true',
                        help='跳过 OAuth 授权步骤（使用缓存的 token）')
    parser.add_argument('--auth-only',   action='store_true',
                        help='只执行授权，不初始化目录结构')
    return parser.parse_args()


def main():
    args = parse_args()
    cfg  = load_config(args)

    print(f'\n{BOLD}{"═"*60}')
    print(f'  CN_KIS_PLATFORM 飞书知识库初始化')
    print(f'  app_id：{cfg["app_id"]}')
    print(f'  space_id：{cfg["space_id"]}')
    print(f'{"═"*60}{RESET}')

    # ── Step 1：获取 user_access_token ───────────────────────────────────────
    user_token = ''
    if args.skip_auth:
        user_token = load_cached_token()
        if not user_token:
            fail('--skip-auth 指定跳过授权，但缓存 token 不存在或已过期')
            fail(f'请删除 {_TMP_TOKEN_PATH} 并重新运行（去掉 --skip-auth）')
            sys.exit(1)
    else:
        user_token = load_cached_token() or get_user_access_token(cfg)

    if args.auth_only:
        ok('--auth-only：授权完成，退出（未修改知识库）')
        return

    # ── Step 2：初始化目录结构（user_access_token 代理执行）────────────────────
    init_wiki_structure(cfg, user_token=user_token)

    print(f'\n{BOLD}{"═"*60}')
    print(f'  ✅ 全部完成！')
    if cfg.get('wiki_url'):
        print(f'  {cfg["wiki_url"]}')
    print(f'{"═"*60}{RESET}\n')


if __name__ == '__main__':
    main()
