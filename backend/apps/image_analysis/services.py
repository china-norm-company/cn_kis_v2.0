"""
唇部脱屑检测服务

算法原理（逆向自原始开发样本 processed/*_flaky_blue.jpg + batch_final/v22 比对）：
  1. 限定 ROI：图像垂直方向 30%~90% 为唇部有效区域，避免检测扩散到人中/下巴皮肤
  2. White Top-Hat 变换：用大椭圆核（51×51）提取「相对周围更亮的小斑片」
     —— 脱屑皮屑（干燥角质层翘起）比周围唇组织反光更强，正好符合 top-hat 特征
  3. LAB-L 亮度过滤：只保留 L >= 150 的像素，排除图像阴影区的噪声
  4. 形态学精修：开运算去碎点 + 闭运算填孔 + 小区域剔除
  5. 蓝色标注：直接替换像素（BGR 255,80,0），与原始样本完全一致

颜色依据：
  统计 processed/*_flaky_blue.jpg 中最高频蓝色值 → BGR (255, 80, 0)

输出格式（均为 JPEG base64 字符串）：
  blue_b64  — 蓝色标注图（唇部脱屑区域替换为蓝色）
  comp_b64  — 对比图（原图 | 标注图，左右拼接）
  orig_b64  — 原图（等比缩放到处理尺寸）
  peeling_pct — 脱屑像素占总唇部 ROI 像素百分比（保留 2 位小数）
  filename  — 原始文件名
"""

from __future__ import annotations

import base64
import logging
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ─── 算法参数 ─────────────────────────────────────────────────────────────────

# 输入图像最长边限制（过大的图会较慢）
_MAX_SIDE = 1200

# 唇部 ROI 垂直范围（占图像高度比例）
# 依据：batch_final / v22 所有样本的蓝色行范围均落在 30%~90% 内
_ROI_Y_START = 0.30
_ROI_Y_END   = 0.90

# White Top-Hat 核大小（椭圆形）
# 核越大，提取的「亮斑」越大；51 对应 800px 高的图约 6% 高度，适合脱屑斑片尺寸
_TOPHAT_KERNEL_SIZE = 51

# LAB-L 通道亮度阈值（只保留足够亮的区域，排除阴影噪声）
_L_BRIGHTNESS_THRESH = 150   # [0,255]

# Top-Hat 差值阈值
_TOPHAT_THRESH = 30          # 越大越严格；30 在 batch_final 上 F1=0.51

# 形态学操作核大小
_MORPH_OPEN_K  = 3    # 开运算（去细碎噪点）
_MORPH_CLOSE_K = 11   # 闭运算（填小孔）

# 最小连通区域像素数（小于此视为噪声）
_MIN_REGION_PX = 30

# 蓝色标注色（BGR）：直接替换像素
# 逆向依据：统计 processed/*_flaky_blue.jpg 最高频像素 → B=255, G=80, R=0
_BLUE_COLOR_BGR = (255, 80, 0)


# ─── 工具函数 ────────────────────────────────────────────────────────────────

def _to_jpeg_b64(img_bgr: np.ndarray) -> str:
    """BGR ndarray → JPEG base64 字符串"""
    ok, buf = cv2.imencode('.jpg', img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 88])
    if not ok:
        raise RuntimeError('JPEG encode failed')
    return base64.b64encode(buf.tobytes()).decode()


def _load_and_resize(data: bytes) -> np.ndarray:
    """bytes → BGR ndarray，等比缩放到 _MAX_SIDE"""
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError('无法解码图像，请确认文件格式为 JPG/PNG')
    h, w = img.shape[:2]
    if max(h, w) > _MAX_SIDE:
        scale = _MAX_SIDE / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)),
                         interpolation=cv2.INTER_AREA)
    return img


# ─── 核心检测 ─────────────────────────────────────────────────────────────────

def detect_lip_scaliness(image_bytes: bytes,
                         filename: str = 'image.jpg') -> dict[str, Any]:
    """
    唇部脱屑检测主入口。

    Returns:
        {
            'blue_b64':    str,    # 蓝色标注图（base64 JPEG）
            'comp_b64':    str,    # 左右对比拼接图（base64 JPEG）
            'orig_b64':    str,    # 原图（base64 JPEG）
            'peeling_pct': float,  # 脱屑面积占比 %
            'filename':    str,
        }
    """
    img = _load_and_resize(image_bytes)
    h, w = img.shape[:2]

    # 1. 确定唇部 ROI（垂直限定，避免超出唇部范围）
    y_lo = int(h * _ROI_Y_START)
    y_hi = int(h * _ROI_Y_END)
    roi = img[y_lo:y_hi, :]

    # 2. 转灰度，做 White Top-Hat（提取相对周围更亮的小斑片）
    gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    kernel_th = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (_TOPHAT_KERNEL_SIZE, _TOPHAT_KERNEL_SIZE)
    )
    tophat = cv2.morphologyEx(gray_roi, cv2.MORPH_TOPHAT, kernel_th)

    # 3. 转 LAB，取 L 通道做亮度过滤
    lab_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2LAB)
    L_roi = lab_roi[:, :, 0]

    # 4. 脱屑初始掩膜 = top-hat 高 AND 亮度足够
    raw_mask = (
        (tophat.astype(np.int32) >= _TOPHAT_THRESH) &
        (L_roi.astype(np.int32) >= _L_BRIGHTNESS_THRESH)
    ).astype(np.uint8) * 255

    # 5. 形态学去噪 + 填孔
    k_open  = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (_MORPH_OPEN_K, _MORPH_OPEN_K))
    k_close = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (_MORPH_CLOSE_K, _MORPH_CLOSE_K))
    clean = cv2.morphologyEx(raw_mask, cv2.MORPH_OPEN,  k_open)
    clean = cv2.morphologyEx(clean,    cv2.MORPH_CLOSE, k_close)

    # 6. 剔除小连通域
    n_labels, labels, stats, _ = cv2.connectedComponentsWithStats(
        clean, connectivity=8)
    roi_mask = np.zeros_like(clean)
    for lbl in range(1, n_labels):
        if stats[lbl, cv2.CC_STAT_AREA] >= _MIN_REGION_PX:
            roi_mask[labels == lbl] = 255

    # 7. 将 ROI 掩膜放回全图尺寸
    full_mask = np.zeros((h, w), dtype=np.uint8)
    full_mask[y_lo:y_hi, :] = roi_mask

    # 8. 计算脱屑占比（分母用全图像素，与原始版本一致）
    peeling_px  = int(full_mask.sum() // 255)
    total_px    = h * w
    peeling_pct = round(peeling_px / total_px * 100, 2) if total_px else 0.0

    # 9. 蓝色标注图（直接替换像素，颜色与原始样本一致）
    blue_img = img.copy()
    blue_img[full_mask == 255] = _BLUE_COLOR_BGR

    # 10. 对比拼接图（左：原图，右：标注图）
    sep      = np.full((h, 3, 3), 200, dtype=np.uint8)
    comp_img = np.concatenate([img, sep, blue_img], axis=1)

    return {
        'blue_b64':    _to_jpeg_b64(blue_img),
        'comp_b64':    _to_jpeg_b64(comp_img),
        'orig_b64':    _to_jpeg_b64(img),
        'peeling_pct': peeling_pct,
        'filename':    filename,
    }
