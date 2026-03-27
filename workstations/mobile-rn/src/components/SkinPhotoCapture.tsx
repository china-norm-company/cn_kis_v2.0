/**
 * 标准化皮肤拍照组件（P2.1）
 *
 * 包含：
 * - 面部轮廓引导框
 * - 光线充足性检测提示
 * - 拍照与重拍功能
 * - 与 CRF 记录关联
 */
import React, { useState } from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from 'react-native'
import {
  captureSkinPhoto,
  checkLightness,
  uploadSkinPhotoToCRF,
  SKIN_PHOTO_LABELS,
  type SkinPhotoType,
  type SkinPhotoResult,
} from '../services/skinPhotoService'
import { rnApiClient } from '../adapters/rnApiClient'
import { theme } from '../theme'

interface SkinPhotoCaptureProps {
  crfRecordId: number
  fieldKey: string
  photoType?: SkinPhotoType
  onComplete?: (attachmentId: number) => void
  onCancel?: () => void
}

export function SkinPhotoCapture({
  crfRecordId,
  fieldKey,
  photoType = 'face_full',
  onComplete,
  onCancel,
}: SkinPhotoCaptureProps) {
  const [photo, setPhoto] = useState<SkinPhotoResult | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(true)

  const handleCapture = async () => {
    setError(null)
    const result = await captureSkinPhoto(photoType)
    if (!result) return

    const lightnessCheck = checkLightness(result)
    if (!lightnessCheck.isAdequate) {
      setError(lightnessCheck.message)
      return
    }
    setPhoto(result)
    setShowGuide(false)
  }

  const handleRetake = () => {
    setPhoto(null)
    setShowGuide(true)
    setError(null)
  }

  const handleConfirm = async () => {
    if (!photo) return
    setUploading(true)
    setError(null)
    const uploadResult = await uploadSkinPhotoToCRF(rnApiClient, crfRecordId, photo, fieldKey)
    setUploading(false)
    if (uploadResult.success && uploadResult.attachmentId) {
      onComplete?.(uploadResult.attachmentId)
    } else {
      setError(uploadResult.error || '上传失败，请重试')
    }
  }

  const lightnessCheck = photo ? checkLightness(photo) : null

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{SKIN_PHOTO_LABELS[photoType]} 拍摄</Text>
      <Text style={styles.subtitle}>请将部位置于引导框内，确保光线充足</Text>

      {showGuide && !photo && (
        <View style={styles.guideContainer}>
          {/* 面部轮廓引导框 */}
          <View style={styles.guideFrame}>
            <View style={styles.ovalGuide} />
            <Text style={styles.guideText}>将脸部对准此框</Text>
          </View>

          <View style={styles.tipList}>
            <Text style={styles.tip}>• 保持自然表情，头部正视</Text>
            <Text style={styles.tip}>• 在明亮的自然光或均匀灯光下拍摄</Text>
            <Text style={styles.tip}>• 避免逆光、强烈阴影</Text>
            <Text style={styles.tip}>• 距离相机约 30-40cm</Text>
          </View>
        </View>
      )}

      {photo && (
        <View style={styles.previewContainer}>
          <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="contain" />
          {lightnessCheck && (
            <View
              style={[
                styles.lightnessIndicator,
                lightnessCheck.isAdequate
                  ? styles.lightnessOk
                  : styles.lightnessWarn,
              ]}
            >
              <Text style={styles.lightnessText}>{lightnessCheck.message}</Text>
            </View>
          )}
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.actions}>
        {!photo ? (
          <>
            <Pressable style={styles.captureBtn} onPress={handleCapture}>
              <Text style={styles.captureBtnText}>拍摄照片</Text>
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>取消</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              style={[styles.confirmBtn, uploading && styles.btnDisabled]}
              onPress={handleConfirm}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.confirmBtnText}>确认使用此照片</Text>
              )}
            </Pressable>
            <Pressable style={styles.retakeBtn} onPress={handleRetake} disabled={uploading}>
              <Text style={styles.retakeBtnText}>重新拍摄</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  )
}

/**
 * 模态框包装版本
 */
interface SkinPhotoCaptureModalProps extends SkinPhotoCaptureProps {
  visible: boolean
}

export function SkinPhotoCaptureModal({ visible, onCancel, ...props }: SkinPhotoCaptureModalProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={styles.modalContainer}>
        <SkinPhotoCapture {...props} onCancel={onCancel} />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.lg,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: theme.color.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  guideContainer: {
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  guideFrame: {
    width: 240,
    height: 300,
    borderWidth: 2,
    borderColor: theme.color.primary,
    borderRadius: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f6ff',
    position: 'relative',
  },
  ovalGuide: {
    width: 180,
    height: 240,
    borderWidth: 1,
    borderColor: theme.color.primary,
    borderRadius: 90,
    borderStyle: 'dashed',
    opacity: 0.5,
  },
  guideText: {
    position: 'absolute',
    bottom: -28,
    fontSize: theme.fontSize.xs,
    color: theme.color.primary,
  },
  tipList: {
    alignSelf: 'stretch',
    gap: 6,
  },
  tip: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
    lineHeight: 20,
  },
  previewContainer: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  preview: {
    width: '100%',
    height: 320,
    borderRadius: theme.radius.md,
    backgroundColor: '#f8f9fa',
  },
  lightnessIndicator: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: 'center',
  },
  lightnessOk: {
    backgroundColor: '#dcfce7',
  },
  lightnessWarn: {
    backgroundColor: '#fef3c7',
  },
  lightnessText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '500',
    color: '#374151',
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    padding: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    marginVertical: theme.spacing.sm,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: '#dc2626',
  },
  actions: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  captureBtn: {
    backgroundColor: theme.color.primary,
    padding: 14,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  captureBtnText: {
    color: '#fff',
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  confirmBtn: {
    backgroundColor: '#16a34a',
    padding: 14,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  retakeBtn: {
    backgroundColor: '#f1f5f9',
    padding: 14,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  retakeBtnText: {
    color: theme.color.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: '500',
  },
  cancelBtn: {
    padding: 14,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: theme.color.textSecondary,
    fontSize: theme.fontSize.md,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  modalContainer: {
    flex: 1,
  },
})
