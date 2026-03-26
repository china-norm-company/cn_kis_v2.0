/**
 * P4.5: 受试者二维码展示页
 *
 * 受试者在小程序中查看自己的二维码，供技术员扫描
 */
import { useState, useEffect } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { buildSubjectEndpoints } from '@cn-kis/subject-core'
import { taroApiClient, taroAuthProvider } from '@/adapters/subject-core'

const subjectApi = buildSubjectEndpoints(taroApiClient)
import { MiniEmpty } from '@/components/ui'
import { PAGE_COPY } from '@/constants/copy'
import './index.scss'

interface QRInfo {
  qr_data: string
  qr_hash: string
  label: string
}

export default function MyQRCodePage() {
  const [qrInfo, setQrInfo] = useState<QRInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [emptyReason, setEmptyReason] = useState<string>(PAGE_COPY.myqrcode.defaultDescription)

  useEffect(() => {
    loadQRCode()
  }, [])

  const loadQRCode = async () => {
    setLoading(true)
    try {
      const userInfo = taroAuthProvider.getLocalUserInfo()
      if (!userInfo?.subjectId) {
        setEmptyReason(PAGE_COPY.myqrcode.noSubjectDescription)
        return
      }

      const res = await taroApiClient.post('/qrcode/generate', {
        entity_type: 'subject',
        entity_id: userInfo.subjectId,
      })

      if (res.code === 200 && res.data) {
        setQrInfo(res.data as unknown as QRInfo)
      }
    } catch (e) {
      console.error('加载二维码失败', e)
      setEmptyReason(PAGE_COPY.myqrcode.loadFailDescription)
    } finally {
      setLoading(false)
    }
  }

  const qrImageUrl = qrInfo?.qr_data ? subjectApi.getQrcodeImageUrl(qrInfo.qr_data) : null

  const handleSaveImage = async () => {
    if (!qrImageUrl) return
    try {
      const res = await Taro.downloadFile({ url: qrImageUrl })
      await Taro.saveImageToPhotosAlbum({ filePath: res.tempFilePath })
      Taro.showToast({ title: '已保存到相册', icon: 'success' })
    } catch {
      Taro.showToast({ title: '保存失败', icon: 'none' })
    }
  }

  return (
    <View className="myqr-page">
      <View className="header">
        <Text className="title">我的二维码</Text>
        <Text className="subtitle">向技术员出示此二维码进行身份确认</Text>
      </View>

      <View className="qr-container">
        {loading ? (
          <MiniEmpty
            title={PAGE_COPY.myqrcode.loading.title}
            description={PAGE_COPY.myqrcode.loading.description}
            icon={PAGE_COPY.myqrcode.loading.icon}
          />
        ) : qrInfo && qrImageUrl ? (
          <>
            <Image
              className="qr-image"
              src={qrImageUrl}
              mode="aspectFit"
            />
            <Text className="qr-label">{qrInfo.label}</Text>
            <View className="qr-actions">
              <View className="action-btn" onClick={handleSaveImage}>
                <Text>保存到相册</Text>
              </View>
              <View className="action-btn refresh" onClick={loadQRCode}>
                <Text>刷新</Text>
              </View>
            </View>
          </>
        ) : (
          <MiniEmpty
            title={PAGE_COPY.myqrcode.empty.title}
            description={emptyReason}
            icon={PAGE_COPY.myqrcode.empty.icon}
            actionText={PAGE_COPY.myqrcode.empty.actionText}
            onAction={() => Taro.navigateTo({ url: '/subpackages/pkg/pages/projects/index' })}
          />
        )}
      </View>

      <View className="tips">
        <Text className="tip-title">使用说明</Text>
        <Text className="tip-item">1. 到访检测机构时，向技术员出示此二维码</Text>
        <Text className="tip-item">2. 技术员扫码后将自动确认您的身份</Text>
        <Text className="tip-item">3. 请勿将二维码分享给他人</Text>
      </View>
    </View>
  )
}
