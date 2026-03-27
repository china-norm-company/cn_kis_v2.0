"""
图像分析 API

路由前缀：/api/v1/lip-scaliness/

端点：
  POST /process  — 单张图片脱屑检测
  POST /batch    — 批量检测，返回 ZIP
"""

from __future__ import annotations

import io
import logging
import zipfile

from django.http import HttpResponse
from ninja import File, Router
from ninja.files import UploadedFile

from .services import detect_lip_scaliness

logger = logging.getLogger(__name__)

router = Router()


@router.post('/process')
def process_single(request, file: UploadedFile = File(...)):
    """单张唇部图片脱屑识别"""
    try:
        data = file.read()
        result = detect_lip_scaliness(data, filename=file.name or 'image.jpg')
        return {'code': 0, 'msg': 'ok', 'data': result}
    except ValueError as e:
        return {'code': 400, 'msg': str(e), 'data': None}
    except Exception as e:
        logger.exception('lip-scaliness process error: %s', e)
        return {'code': 500, 'msg': f'服务内部错误：{e}', 'data': None}


@router.post('/batch')
def process_batch(request, files: list[UploadedFile] = File(...)):
    """
    批量唇部图片脱屑识别，返回 ZIP 压缩包。
    ZIP 内每张图对应 3 个文件：
      {name}_blue.jpg     蓝色标注图
      {name}_comp.jpg     对比拼接图
      {name}_orig.jpg     原图
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            try:
                data = f.read()
                result = detect_lip_scaliness(data, filename=f.name or 'image.jpg')
                stem = (f.name or 'image').rsplit('.', 1)[0]

                import base64
                zf.writestr(f'{stem}_blue.jpg', base64.b64decode(result['blue_b64']))
                zf.writestr(f'{stem}_comp.jpg', base64.b64decode(result['comp_b64']))
                zf.writestr(f'{stem}_orig.jpg', base64.b64decode(result['orig_b64']))
            except Exception as e:
                logger.warning('batch skip %s: %s', f.name, e)
                zf.writestr(f'{f.name}.error.txt', str(e))

    buf.seek(0)
    return HttpResponse(
        buf.read(),
        content_type='application/zip',
        headers={'Content-Disposition': 'attachment; filename="lip_flaky_results.zip"'},
    )
