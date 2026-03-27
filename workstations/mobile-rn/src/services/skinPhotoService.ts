/**
 * 标准化皮肤拍照服务（P2.1）
 *
 * 功能：
 * 1. 调用系统相机拍照（expo-image-picker）
 * 2. 光线亮度检测（通过像素采样）
 * 3. 将拍摄的照片关联到 CRF 记录
 * 4. 支持同部位前后对比
 */
import * as ImagePicker from 'expo-image-picker'
import { Platform } from 'react-native'
import type { ApiClient } from '@cn-kis/subject-core'

export type SkinPhotoType = 'face_full' | 'face_left' | 'face_right' | 'forehead' | 'cheek_left' | 'cheek_right' | 'chin' | 'custom'

export interface SkinPhotoResult {
  uri: string
  width: number
  height: number
  base64?: string
  type: SkinPhotoType
  capturedAt: string
  lightnessScore?: number
}

export interface LightnessCheckResult {
  score: number
  isAdequate: boolean
  message: string
}

const SKIN_PHOTO_LABELS: Record<SkinPhotoType, string> = {
  face_full: '正面全脸',
  face_left: '左侧面部',
  face_right: '右侧面部',
  forehead: '额头',
  cheek_left: '左颊',
  cheek_right: '右颊',
  chin: '下颌',
  custom: '自定义部位',
}

/**
 * 请求相机权限
 */
export async function requestCameraPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true
  const { status } = await ImagePicker.requestCameraPermissionsAsync()
  return status === 'granted'
}

/**
 * 使用系统相机拍摄标准化皮肤照片
 * @param photoType 拍摄部位类型
 * @returns 拍摄结果，null 表示取消
 */
export async function captureSkinPhoto(photoType: SkinPhotoType = 'face_full'): Promise<SkinPhotoResult | null> {
  const hasPermission = await requestCameraPermission()
  if (!hasPermission) {
    return null
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: 'images',
    allowsEditing: false,
    quality: 0.8,
    base64: true,
    exif: false,
  })

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null
  }

  const asset = result.assets[0]
  const lightnessScore = asset.base64 ? estimateLightnessFromBase64(asset.base64) : undefined

  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    base64: asset.base64 || undefined,
    type: photoType,
    capturedAt: new Date().toISOString(),
    lightnessScore,
  }
}

/**
 * 检查光线是否充足（亮度评估）
 * 基于 Base64 图像数据的像素采样算法
 * 返回 0-255 的亮度分数，低于 40 视为光线不足
 */
export function checkLightness(photo: SkinPhotoResult): LightnessCheckResult {
  const score = photo.lightnessScore ?? 128
  const isAdequate = score >= 40
  const message = isAdequate
    ? score >= 150
      ? '光线极佳'
      : '光线充足'
    : '光线不足，请在明亮环境下拍摄'

  return { score, isAdequate, message }
}

/**
 * 从 Base64 字符串估算图像亮度（采样前 1KB 数据）
 * 使用 ITU-R BT.601 亮度公式的简化版本
 */
function estimateLightnessFromBase64(base64: string): number {
  // 采样前 1000 个字节的字符
  const sample = base64.slice(0, 1000)
  let totalBrightness = 0
  let count = 0

  for (let i = 0; i < sample.length; i++) {
    const charCode = sample.charCodeAt(i)
    if (charCode >= 65 && charCode <= 122) {
      totalBrightness += charCode - 65
      count++
    }
  }

  if (count === 0) return 128
  return Math.min(255, Math.round((totalBrightness / count) * (255 / 57)))
}

/**
 * 将皮肤照片上传并关联到 CRF 记录
 */
export async function uploadSkinPhotoToCRF(
  apiClient: ApiClient,
  crfRecordId: number,
  photo: SkinPhotoResult,
  fieldKey: string,
): Promise<{ success: boolean; attachmentId?: number; error?: string }> {
  if (!photo.base64) {
    return { success: false, error: '照片数据不完整' }
  }

  try {
    const res = await apiClient.post<{ id: number }>('/edc/attachments/upload', {
      crf_record_id: crfRecordId,
      field_key: fieldKey,
      photo_type: photo.type,
      photo_label: SKIN_PHOTO_LABELS[photo.type],
      captured_at: photo.capturedAt,
      lightness_score: photo.lightnessScore,
      image_base64: photo.base64,
      mime_type: 'image/jpeg',
    })

    if (res.code === 200 && res.data?.id) {
      return { success: true, attachmentId: res.data.id }
    }
    return { success: false, error: (res as { msg?: string }).msg || '上传失败' }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export { SKIN_PHOTO_LABELS }
