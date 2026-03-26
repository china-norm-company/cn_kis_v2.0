/**
 * 仪器数据 OCR 提取服务（P3.3）
 *
 * 功能：
 * 1. 拍摄仪器屏幕照片
 * 2. 通过后端 OCR 接口提取仪器读数
 * 3. 与 EDC 字段自动关联
 */
import * as ImagePicker from 'expo-image-picker'
import type { ApiClient } from '@cn-kis/subject-core'

export type InstrumentType =
  | 'blood_pressure'
  | 'heart_rate'
  | 'weight_scale'
  | 'thermometer'
  | 'spirometer'
  | 'dermatoscope'
  | 'other'

export interface OcrExtractedField {
  field_key: string
  label: string
  value: string
  unit?: string
  confidence: number
}

export interface OcrResult {
  success: boolean
  instrument_type?: InstrumentType
  extracted_fields: OcrExtractedField[]
  raw_text?: string
  error?: string
}

export const INSTRUMENT_LABELS: Record<InstrumentType, string> = {
  blood_pressure: '血压计',
  heart_rate: '心率仪',
  weight_scale: '体重秤',
  thermometer: '体温计',
  spirometer: '肺功能仪',
  dermatoscope: '皮肤镜',
  other: '其他仪器',
}

export async function captureInstrumentPhoto(): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync()
  if (status !== 'granted') return null

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: 'images',
    allowsEditing: false,
    quality: 0.9,
    base64: true,
  })

  if (result.canceled || !result.assets?.[0]) return null
  const asset = result.assets[0]
  return asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : null
}

export async function extractInstrumentData(
  apiClient: ApiClient,
  imageBase64: string,
  instrumentType?: InstrumentType,
): Promise<OcrResult> {
  try {
    const res = await apiClient.post<OcrResult>('/edc/ocr/extract', {
      image_base64: imageBase64,
      instrument_type: instrumentType,
    })
    const data = res.data as OcrResult
    if ((res as { code?: number }).code === 200 && data) {
      return data
    }
    return {
      success: false,
      extracted_fields: [],
      error: (res as { msg?: string }).msg || 'OCR 提取失败',
    }
  } catch (error) {
    return { success: false, extracted_fields: [], error: String(error) }
  }
}

/**
 * 将 OCR 结果自动填入 EDC 字段
 */
export async function autofillEdcFromOcr(
  apiClient: ApiClient,
  crfRecordId: number,
  extractedFields: OcrExtractedField[],
): Promise<{ filled_count: number; errors: string[] }> {
  const errors: string[] = []
  let filledCount = 0

  for (const field of extractedFields) {
    if (field.confidence < 0.7) {
      errors.push(`${field.label} 置信度不足（${(field.confidence * 100).toFixed(0)}%），跳过自动填写`)
      continue
    }
    try {
      const res = await apiClient.post(`/edc/crf-records/${crfRecordId}/fields`, {
        field_key: field.field_key,
        value: field.value,
        source: 'ocr_autofill',
      })
      if ((res as { code?: number }).code === 200) {
        filledCount++
      } else {
        errors.push(`${field.label} 填写失败`)
      }
    } catch {
      errors.push(`${field.label} 提交异常`)
    }
  }

  return { filled_count: filledCount, errors }
}
