# 测试文件 - 模拟开发者提交了有 lint 错误的 Python 代码
# 真实场景：不做 ruff check 直接 git push

import os, sys, json  # noqa: F401  <-- 未使用的导入（ruff E401 + F401）

def broken_function( x,y ):  # 空格违规（ruff E231）
    unused_var = "永远不会被使用"  # F841
    if x == True:  # E712 比较应用 is
        return None
    return x+y  # E225 运算符周围缺空格
