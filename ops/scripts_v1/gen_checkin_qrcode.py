#!/usr/bin/env python3
"""
生成受试者签到用二维码图片

用法: python scripts/gen_checkin_qrcode.py
输出: docs/checkin-qrcode.png

小程序扫码签到流程：受试者扫此二维码 -> 调用 /my/scan-checkin
当前后端不校验 qr_content，仅用 JWT subject_id 完成签到。
"""
import os
import sys

# 签到二维码内容（现场放置用，受试者扫此码触发签到）
CHECKIN_QR_DATA = "CN-KIS-CHECKIN"

def main():
    try:
        import qrcode
    except ImportError:
        print("请先安装: pip install qrcode[pil]")
        sys.exit(1)

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_path = os.path.join(root, "docs", "checkin-qrcode.png")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    qr = qrcode.QRCode(version=1, box_size=16, border=4)
    qr.add_data(CHECKIN_QR_DATA)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    img.save(out_path)

    print(f"签到二维码已生成: {out_path}")
    print(f"  内容: {CHECKIN_QR_DATA}")
    print("  用途: 受试者在小程序「扫码签到」页扫描此二维码进行验证")


if __name__ == "__main__":
    main()
