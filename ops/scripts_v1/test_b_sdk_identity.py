"""
测试 B：SDK 直调（volc-sdk-python VisualService）
==================================================
使用 volcengine 官方 Python SDK 中的 VisualService，
通过 AK/SK 签名直接调用身份认证 API。

这是火山引擎官方推荐的身份认证集成方式：
  - 服务入口：visual.volcengineapi.com
  - 签名：HMAC-SHA256（AK/SK）
  - SDK 封装：VisualService.cert_h5_config_init / cert_h5_token / cert_verify_query

需要配置：
  VOLC_ACCESSKEY=xxx
  VOLC_SECRETKEY=xxx
"""
import json
import os
import sys

# 从 .env 加载
try:
    from dotenv import load_dotenv

    env_files = [
        os.path.join(os.path.dirname(__file__), "..", "deploy", ".env.volcengine.plan-a"),
        os.path.join(os.path.dirname(__file__), "..", "backend", ".env"),
    ]
    for ef in env_files:
        if os.path.exists(ef):
            load_dotenv(ef, override=False)
except ImportError:
    pass


VOLC_AK = os.getenv("VOLC_ACCESSKEY", "")
VOLC_SK = os.getenv("VOLC_SECRETKEY", "")


def test_sdk_import():
    """步骤 0：确认 volcengine SDK 可导入"""
    print("=" * 60)
    print("步骤 0：volcengine SDK 导入测试")
    print("=" * 60)
    try:
        from volcengine.visual.VisualService import VisualService

        print("  ✅ VisualService 导入成功")
        svc = VisualService()
        print(f"  ✅ VisualService 实例化成功")
        print(f"     Host: {svc.service_info.host}")
        print(f"     Credentials Service: {svc.service_info.credentials.service}")
        print(f"     Credentials Region: {svc.service_info.credentials.region}")
        return True
    except Exception as e:
        print(f"  ❌ SDK 导入失败: {e}")
        return False


def test_sdk_credentials():
    """步骤 1：检查 AK/SK 是否已配置"""
    print("\n" + "=" * 60)
    print("步骤 1：AK/SK 凭证检查")
    print("=" * 60)

    if VOLC_AK and VOLC_SK:
        print(f"  VOLC_ACCESSKEY: {VOLC_AK[:8]}...{VOLC_AK[-4:]}")
        print(f"  VOLC_SECRETKEY: {VOLC_SK[:4]}...{VOLC_SK[-4:]}")
        print("  ✅ AK/SK 已配置")
        return True
    else:
        print("  ❌ VOLC_ACCESSKEY 或 VOLC_SECRETKEY 未配置")
        print("  请在 deploy/.env.volcengine.plan-a 中填入：")
        print("    VOLC_ACCESSKEY=你的AccessKey")
        print("    VOLC_SECRETKEY=你的SecretKey")
        print("  获取方式：火山引擎控制台 → 密钥管理 → Access Key")
        return False


def test_sdk_cert_h5_config_init():
    """步骤 2：调用 CertH5ConfigInit — 创建 H5 认证配置（获取 h5_config_id）"""
    print("\n" + "=" * 60)
    print("步骤 2：CertH5ConfigInit — 创建 H5 认证配置")
    print("=" * 60)
    from volcengine.visual.VisualService import VisualService

    svc = VisualService()
    svc.set_ak(VOLC_AK)
    svc.set_sk(VOLC_SK)

    form = {
        "req_key": "cert_h5_config_init",
        "h5_config": {
            "type": "1",
            "redirect_url": "https://118.196.64.48/secretary/identity/callback",
        },
        "liveness_config": {
            "ref_source": "1",
            "liveness_type": "motion",
        },
    }

    try:
        resp = svc.cert_h5_config_init(form)
        print(f"  原始响应: {json.dumps(resp, ensure_ascii=False, indent=2)[:500]}")

        if resp.get("code") == 10000 or resp.get("status") == 10000:
            data = resp.get("data", {})
            h5_config_id = data.get("h5_config_id", "")
            print(f"  ✅ CertH5ConfigInit 成功！")
            print(f"     h5_config_id: {h5_config_id}")
            return h5_config_id
        else:
            print(f"  ❌ CertH5ConfigInit 失败")
            print(f"     code: {resp.get('code')}, message: {resp.get('message')}")
            return None
    except Exception as e:
        print(f"  ❌ 调用异常: {e}")
        return None


def test_sdk_cert_h5_token(h5_config_id: str):
    """步骤 3：调用 CertH5Token — 获取 byted_token"""
    print("\n" + "=" * 60)
    print("步骤 3：CertH5Token — 获取 byted_token")
    print("=" * 60)
    from volcengine.visual.VisualService import VisualService

    svc = VisualService()
    svc.set_ak(VOLC_AK)
    svc.set_sk(VOLC_SK)

    form = {
        "req_key": "cert_h5_token",
        "h5_config_id": h5_config_id,
        "sts_token": "",
        "idcard_name": "张三",
        "idcard_no": "110101199001011234",
    }

    try:
        resp = svc.cert_h5_token(form)
        print(f"  原始响应: {json.dumps(resp, ensure_ascii=False, indent=2)[:500]}")

        if resp.get("code") == 10000 or resp.get("status") == 10000:
            data = resp.get("data", {})
            byted_token = data.get("byted_token", "")
            h5_url = data.get("h5_url", "")
            print(f"  ✅ CertH5Token 成功！")
            print(f"     byted_token: {byted_token[:30]}..." if byted_token else "     byted_token: (空)")
            print(f"     h5_url: {h5_url}" if h5_url else "     h5_url: (空)")
            return byted_token
        else:
            print(f"  ❌ CertH5Token 失败")
            print(f"     code: {resp.get('code')}, message: {resp.get('message')}")
            return None
    except Exception as e:
        print(f"  ❌ 调用异常: {e}")
        return None


def test_sdk_cert_verify_query(byted_token: str):
    """步骤 4：调用 CertVerifyQuery — 查询认证结果"""
    print("\n" + "=" * 60)
    print("步骤 4：CertVerifyQuery — 查询认证结果")
    print("=" * 60)
    from volcengine.visual.VisualService import VisualService

    svc = VisualService()
    svc.set_ak(VOLC_AK)
    svc.set_sk(VOLC_SK)

    form = {
        "req_key": "cert_verify_query",
        "byted_token": byted_token,
    }

    try:
        resp = svc.cert_verify_query(form)
        print(f"  原始响应: {json.dumps(resp, ensure_ascii=False, indent=2)[:500]}")
    except Exception as e:
        print(f"  ❌ 调用异常: {e}")


if __name__ == "__main__":
    print("\n" + "🔬 " * 20)
    print("  测试 B：SDK 直调（volc-sdk-python VisualService）")
    print("🔬 " * 20 + "\n")

    if not test_sdk_import():
        sys.exit(1)

    if not test_sdk_credentials():
        print("\n⛔ AK/SK 未配置，无法继续 SDK 测试。")
        print("请先配置后重新运行。\n")
        sys.exit(1)

    h5_config_id = test_sdk_cert_h5_config_init()

    if h5_config_id:
        byted_token = test_sdk_cert_h5_token(h5_config_id)
        if byted_token:
            test_sdk_cert_verify_query(byted_token)
    else:
        print("\n⚠️  如果已有 h5_config_id，可设置环境变量 H5_CONFIG_ID 跳过步骤 2")
        existing_id = os.getenv("H5_CONFIG_ID", "")
        if existing_id:
            byted_token = test_sdk_cert_h5_token(existing_id)
            if byted_token:
                test_sdk_cert_verify_query(byted_token)

    print("\n" + "=" * 60)
    print("测试 B 总结")
    print("=" * 60)
    print(
        "SDK 直调是火山引擎身份认证的标准集成方式：\n"
        "  1. VisualService + AK/SK 签名 → visual.volcengineapi.com\n"
        "  2. CertH5ConfigInit → 创建 H5 认证配置（一次性）\n"
        "  3. CertH5Token → 每次认证生成 byted_token + H5 URL\n"
        "  4. 用户在 H5 页面完成人脸核身\n"
        "  5. CertVerifyQuery → 后端查询认证结果\n"
        "\n无需 LLM 参与，直接调用即可。\n"
    )
