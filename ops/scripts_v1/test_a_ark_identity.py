"""
测试 A：方舟 (Ark) 通道调用身份认证
======================================
方舟是火山引擎的大模型推理平台，支持 OpenAI 兼容 API。
本脚本测试两种可能的方舟调用路径：

  路径 1：方舟内置工具（联网搜索、图像处理等）是否包含身份认证能力
  路径 2：方舟 Function Calling —— 将身份认证定义为 tool，让模型编排调用

使用已有配置：
  ARK_API_KEY=9a4c7a3a-fede-492d-aa71-270a6a604bcd
  ARK_API_BASE=https://ark.cn-beijing.volces.com/api/v3
  ARK_DEFAULT_MODEL=ep-20260209161859-tcxwx
"""
import json
import os
import sys

from openai import OpenAI

ARK_API_KEY = os.getenv("ARK_API_KEY", "9a4c7a3a-fede-492d-aa71-270a6a604bcd")
ARK_API_BASE = os.getenv("ARK_API_BASE", "https://ark.cn-beijing.volces.com/api/v3")
ARK_MODEL = os.getenv("ARK_DEFAULT_MODEL", "ep-20260209161859-tcxwx")


def test_ark_basic_connectivity():
    """步骤 0：确认方舟 API 连通"""
    print("=" * 60)
    print("步骤 0：方舟 API 基本连通性测试")
    print("=" * 60)
    client = OpenAI(api_key=ARK_API_KEY, base_url=ARK_API_BASE)
    try:
        resp = client.chat.completions.create(
            model=ARK_MODEL,
            messages=[{"role": "user", "content": "你好，简单回答：你是哪个模型？"}],
            max_tokens=50,
        )
        content = resp.choices[0].message.content
        print(f"  模型回复: {content}")
        print(f"  model字段: {resp.model}")
        print(f"  usage: {resp.usage}")
        print("  ✅ 方舟 API 连通正常\n")
        return True
    except Exception as e:
        print(f"  ❌ 方舟 API 连通失败: {e}\n")
        return False


def test_ark_builtin_tools():
    """步骤 1：测试方舟内置工具是否包含身份认证能力"""
    print("=" * 60)
    print("步骤 1：方舟内置工具探测（图像处理 / 联网搜索）")
    print("=" * 60)
    client = OpenAI(api_key=ARK_API_KEY, base_url=ARK_API_BASE)

    prompts_to_test = [
        "请帮我进行身份认证，我需要用人脸识别验证我的身份证信息",
        "请调用身份认证服务，生成一个 byted_token 用于 H5 人脸核身",
        "你有哪些内置工具可以使用？请列出所有可用的工具和能力",
    ]

    for i, prompt in enumerate(prompts_to_test, 1):
        print(f"\n  探测 {i}: {prompt[:40]}...")
        try:
            resp = client.chat.completions.create(
                model=ARK_MODEL,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=300,
            )
            msg = resp.choices[0].message
            print(f"    回复: {msg.content[:200] if msg.content else '(无文本)'}")
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                print(f"    🔧 模型发起了工具调用: {msg.tool_calls}")
            else:
                print("    ℹ️ 模型未发起工具调用（纯文本回复）")
        except Exception as e:
            print(f"    ❌ 调用失败: {e}")

    print()


def test_ark_function_calling_for_identity():
    """步骤 2：Function Calling — 定义身份认证为 tool，看模型能否编排"""
    print("=" * 60)
    print("步骤 2：方舟 Function Calling + 身份认证工具定义")
    print("=" * 60)

    identity_tools = [
        {
            "type": "function",
            "function": {
                "name": "create_identity_verification_session",
                "description": "创建一次身份认证会话，获取 byted_token 和认证 URL。用户可通过该 URL 完成人脸核身。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "idcard_name": {
                            "type": "string",
                            "description": "身份证姓名",
                        },
                        "idcard_no": {
                            "type": "string",
                            "description": "身份证号码",
                        },
                        "redirect_url": {
                            "type": "string",
                            "description": "认证完成后的回跳地址",
                        },
                    },
                    "required": ["idcard_name", "idcard_no"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "query_identity_verification_result",
                "description": "查询身份认证结果，传入 byted_token 返回认证状态",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "byted_token": {
                            "type": "string",
                            "description": "之前创建会话时获得的 byted_token",
                        },
                    },
                    "required": ["byted_token"],
                },
            },
        },
    ]

    client = OpenAI(api_key=ARK_API_KEY, base_url=ARK_API_BASE)

    try:
        resp = client.chat.completions.create(
            model=ARK_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "你是一个身份认证助手，可以帮助用户完成实名认证。当用户需要进行身份认证时，请调用相应的工具。",
                },
                {
                    "role": "user",
                    "content": "我需要进行身份认证，请帮我创建一个认证会话。我的姓名是张三，身份证号是110101199001011234。",
                },
            ],
            tools=identity_tools,
            tool_choice="auto",
            max_tokens=300,
        )

        msg = resp.choices[0].message
        print(f"  finish_reason: {resp.choices[0].finish_reason}")

        if msg.tool_calls:
            print(f"  ✅ 模型触发了工具调用！")
            for tc in msg.tool_calls:
                print(f"    工具名: {tc.function.name}")
                print(f"    参数: {tc.function.arguments}")
            print(
                "\n  结论：方舟 Function Calling 可用。"
                "模型能正确识别意图并调用定义的身份认证工具。"
            )
            print(
                "  但注意：实际的身份认证逻辑（调 CertH5Token API）仍需后端执行，"
                "方舟只负责「编排」。"
            )
        else:
            print(f"  回复内容: {msg.content[:200] if msg.content else '(无)'}")
            print("  ℹ️ 模型未触发工具调用")

    except Exception as e:
        print(f"  ❌ Function Calling 测试失败: {e}")

    print()


def test_ark_bot_api():
    """步骤 3：尝试方舟 Bot API（如果在控制台配置了 Bot 应用）"""
    print("=" * 60)
    print("步骤 3：方舟 Bot API 探测")
    print("=" * 60)

    client = OpenAI(api_key=ARK_API_KEY, base_url=ARK_API_BASE)

    try:
        resp = client.chat.completions.create(
            model=ARK_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": "请列出你当前可以使用的所有工具（tools），包括联网搜索、图像处理等。如果没有工具，请直接说明。",
                }
            ],
            max_tokens=500,
        )
        content = resp.choices[0].message.content
        print(f"  模型回复:\n    {content[:400]}")
    except Exception as e:
        print(f"  ❌ Bot API 测试失败: {e}")

    print()


if __name__ == "__main__":
    print("\n" + "🔬 " * 20)
    print("  测试 A：方舟 (Ark) 通道身份认证可行性探测")
    print("🔬 " * 20 + "\n")

    ok = test_ark_basic_connectivity()
    if not ok:
        print("方舟连通失败，终止后续测试")
        sys.exit(1)

    test_ark_builtin_tools()
    test_ark_function_calling_for_identity()
    test_ark_bot_api()

    print("=" * 60)
    print("测试 A 总结")
    print("=" * 60)
    print(
        "方舟本质是 LLM 推理平台，提供的身份认证能力路径：\n"
        "  1. 内置工具：联网搜索 / 图像处理 —— 不直接包含身份认证\n"
        "  2. Function Calling：可以定义身份认证为 tool，模型负责编排\n"
        "     但实际的 CertH5Token / CertVerify 调用仍需后端执行\n"
        "  3. Bot 应用：在方舟控制台配置 Bot + 挂载工具/插件\n"
        "\n方舟的定位：AI 编排层，不是身份认证引擎本身。\n"
    )
