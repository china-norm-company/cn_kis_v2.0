"""
唇部脱屑检测服务 v5

核心设计（基于真实样本数据逆向分析）：
  ─────────────────────────────────────────────────────────────────────────
  参考数据（processed/ 原始算法输出）：
    RD007 T3d → 2.82% 覆盖，RD007 T0 → 6.28% 覆盖
    原始检测区域：y=21-75%，x=16-79%（相对整图）
    原始检测像素特征：TopHat 均值=27，BlackHat-A 均值=9
  ─────────────────────────────────────────────────────────────────────────

  算法思路（v5 重构）：

  1. 宽 ROI（y=15-78%，x=4-96%）覆盖上下唇，同时排除极边缘的图像噪声
  2. A >= 140 作为唇部组织约束——在标准近景唇部图片中，y < 20% 的
     人中/上方皮肤 A 值约 135-139，可被此阈值排除；y=15-78% 以外靠硬
     边界切断
  3. TopHat（51×51 灰度白顶帽）AND BlackHat-A（51×51 A通道黑顶帽）
     严格合取，同时满足「局部亮斑 + 局部去红/发白」才标记：
       ─ 普通条件：TopHat >= 28 AND BlackHat-A >= 10
       ─ 强亮斑加成：TopHat >= 44（单独触发，对应大块脱屑反光）
  4. L 范围过滤：100-240（排除暗缝区和镜面高光）
  5. 形态学精修：开运算去孤立噪点 + 闭运算合并相邻碎斑
  6. 最小连通域剔除（< 15px = 噪点）

  效果验证（RD007）：
    T3d：覆盖 2.86%（原始 2.82%）✓
    T0 ：覆盖 3.98-5%（原始 6.28%）——保形，轻度偏低

颜色：BGR (255, 80, 0)（纯蓝）
"""

from __future__ import annotations

import base64
import logging
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ─── 算法参数（基于真实样本逆向分析定标）────────────────────────────────────

_MAX_SIDE = 1200

# 宽 ROI 边界（上下唇整体区域）
_ROI_Y_START = 0.15
_ROI_Y_END   = 0.78
_ROI_X_START = 0.04   # 横向缩进，消除侧边伪响应
_ROI_X_END   = 0.96

# 唇部 A 通道约束（LAB-A >= 140 对应唇部红色组织）
_A_LIP_MIN = 140

# 检测核大小（51×51 匹配脱皮斑块尺寸）
_KERNEL_SIZE = 51

# 普通脱皮：TopHat AND BlackHat-A 严格合取
_TOPHAT_THRESH   = 28   # 局部亮斑阈值
_BLACKHAT_THRESH = 10   # 局部去红/发白阈值

# 强亮斑单独触发（大块角质反光，不需要 BlackHat-A 配合）
_TOPHAT_STRONG = 44

# 亮度范围（排除口缝深阴影和镜面高光/牙齿）
_L_MIN = 100
_L_MAX = 240

# 形态学精修
_MORPH_OPEN_K  = 3
_MORPH_CLOSE_K = 5

# 最小连通域（< 15px 为噪点）
_MIN_REGION_PX = 15

# 蓝色标注 BGR
_BLUE_COLOR_BGR = (255, 80, 0)


# ─── 工具函数 ────────────────────────────────────────────────────────────────

def _to_jpeg_b64(img_bgr: np.ndarray) -> str:
    ok, buf = cv2.imencode('.jpg', img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 88])
    if not ok:
        raise RuntimeError('JPEG encode failed')
    return base64.b64encode(buf.tobytes()).decode()


def _load_and_resize(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError('无法解码图像，请确认文件格式为 JPG/PNG')
    h, w = img.shape[:2]
    if max(h, w) > _MAX_SIDE:
        s = _MAX_SIDE / max(h, w)
        img = cv2.resize(img, (int(w * s), int(h * s)),
                         interpolation=cv2.INTER_AREA)
    return img


# ─── 核心检测 ─────────────────────────────────────────────────────────────────

def detect_lip_scaliness(image_bytes: bytes,
                         filename: str = 'image.jpg') -> dict[str, Any]:
    """
    唇部脱屑检测主入口。

    Returns:
        {
            'blue_b64':    str,
            'comp_b64':    str,
            'orig_b64':    str,
            'peeling_pct': float,
            'filename':    str,
        }
    """
    img = _load_and_resize(image_bytes)
    h, w = img.shape[:2]

    # ── 1. 预计算通道（全图）─────────────────────────────────────────────────
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    lab  = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    A_ch = lab[:, :, 1].astype(np.int32)
    L_ch = lab[:, :, 0].astype(np.int32)

    # ── 2. 形态学信号（全图计算，避免边界截断误差）───────────────────────────
    k_morph = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (_KERNEL_SIZE, _KERNEL_SIZE))

    tophat     = cv2.morphologyEx(gray,        cv2.MORPH_TOPHAT,   k_morph).astype(np.int32)
    blackhat_a = cv2.morphologyEx(lab[:, :, 1], cv2.MORPH_BLACKHAT, k_morph).astype(np.int32)

    # ── 3. ROI 范围 ───────────────────────────────────────────────────────────
    y_lo = int(h * _ROI_Y_START)
    y_hi = int(h * _ROI_Y_END)
    x_lo = int(w * _ROI_X_START)
    x_hi = int(w * _ROI_X_END)

    # ── 4. 候选掩膜 ───────────────────────────────────────────────────────────
    #
    #  条件 A：A >= 140（唇部红色组织，排除上方人中/皮肤区）
    #  条件 B：(TopHat>=28 AND BlackHat-A>=10) OR TopHat>=44
    #           ─ 普通：局部亮斑 + 局部去红，同时满足
    #           ─ 强亮：极亮局部斑块（大块角质剥离），单独触发
    #  条件 C：L 在 100-240（排除深阴影/口缝，以及高光/牙齿）
    #
    raw_mask = np.zeros((h, w), dtype=np.uint8)
    roi_cond = (
        (A_ch[y_lo:y_hi, x_lo:x_hi] >= _A_LIP_MIN) &
        (
            ((tophat[y_lo:y_hi, x_lo:x_hi] >= _TOPHAT_THRESH) &
             (blackhat_a[y_lo:y_hi, x_lo:x_hi] >= _BLACKHAT_THRESH))
            |
            (tophat[y_lo:y_hi, x_lo:x_hi] >= _TOPHAT_STRONG)
        ) &
        (L_ch[y_lo:y_hi, x_lo:x_hi] >= _L_MIN) &
        (L_ch[y_lo:y_hi, x_lo:x_hi] <= _L_MAX)
    )
    raw_mask[y_lo:y_hi, x_lo:x_hi] = roi_cond.astype(np.uint8) * 255

    # ── 5. 形态学精修 ─────────────────────────────────────────────────────────
    k_open  = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (_MORPH_OPEN_K,  _MORPH_OPEN_K))
    k_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (_MORPH_CLOSE_K, _MORPH_CLOSE_K))
    clean   = cv2.morphologyEx(raw_mask, cv2.MORPH_OPEN,  k_open)
    clean   = cv2.morphologyEx(clean,    cv2.MORPH_CLOSE, k_close)

    # ── 6. 剔除极小连通域 ─────────────────────────────────────────────────────
    n_labels, labels, stats, _ = cv2.connectedComponentsWithStats(
        clean, connectivity=8)
    full_mask = np.zeros((h, w), dtype=np.uint8)
    for lbl in range(1, n_labels):
        if stats[lbl, cv2.CC_STAT_AREA] >= _MIN_REGION_PX:
            full_mask[labels == lbl] = 255

    # ── 7. 脱屑占比 ───────────────────────────────────────────────────────────
    peeling_px  = int(full_mask.sum() // 255)
    peeling_pct = round(peeling_px / (h * w) * 100, 2) if h * w else 0.0
    logger.debug('lip_scaliness detected=%d px (%.2f%%)', peeling_px, peeling_pct)

    # ── 8. 蓝色标注图 ─────────────────────────────────────────────────────────
    blue_img = img.copy()
    blue_img[full_mask == 255] = _BLUE_COLOR_BGR

    # ── 9. 对比拼接图（原图 | 分隔线 | 蓝色叠加图）───────────────────────────
    sep      = np.full((h, 3, 3), 200, dtype=np.uint8)
    comp_img = np.concatenate([img, sep, blue_img], axis=1)

    return {
        'blue_b64':    _to_jpeg_b64(blue_img),
        'comp_b64':    _to_jpeg_b64(comp_img),
        'orig_b64':    _to_jpeg_b64(img),
        'peeling_pct': peeling_pct,
        'filename':    filename,
    }
