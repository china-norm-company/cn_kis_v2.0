/**
 * P4.5: 移动端 CRF 表单字段渲染组件
 *
 * 支持字段类型：text / number / select / radio / checkbox / date / textarea / scale / image-upload
 */
import { View, Text, Input, Textarea, Picker, Image, Slider } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'

interface CRFQuestion {
  id: string
  type: string
  title: string
  required?: boolean
  options?: Array<{ label: string; value: string }>
  min?: number
  max?: number
  unit?: string
  repeat?: number
  auto_average?: boolean
  placeholder?: string
}

interface Props {
  question: CRFQuestion
  value: unknown
  onChange: (id: string, value: unknown) => void
  error?: string
  readOnly?: boolean
}

function toPickerIndex(value: string | number): number {
  return typeof value === 'number' ? value : parseInt(value, 10)
}

export default function MiniCRFField({ question, value, onChange, error, readOnly }: Props) {
  const [imageList, setImageList] = useState<string[]>(
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
  )
  const valueAsText =
    typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  const valueAsDate = typeof value === 'string' ? value : ''
  const valueAsNumber = typeof value === 'number' ? value : 0

  const handleImageUpload = async () => {
    if (readOnly) return
    try {
      const res = await Taro.chooseImage({ count: 3, sizeType: ['compressed'] })
      const newImages = [...imageList, ...res.tempFilePaths]
      setImageList(newImages)
      onChange(question.id, newImages)
    } catch {
      // cancelled
    }
  }

  const renderField = () => {
    switch (question.type) {
      case 'text':
        return (
          <Input
            className="crf-input"
            value={valueAsText}
            placeholder={question.placeholder || `请输入${question.title}`}
            disabled={readOnly}
            onInput={(e) => onChange(question.id, e.detail.value)}
          />
        )

      case 'number':
        if (question.repeat && question.repeat > 1) {
          return <RepeatedNumber question={question} value={value} onChange={onChange} readOnly={readOnly} />
        }
        return (
          <View className="number-field">
            <Input
              className="crf-input"
              type="digit"
              value={value?.toString() || ''}
              placeholder={question.placeholder || `${question.min ?? ''} - ${question.max ?? ''}`}
              disabled={readOnly}
              onInput={(e) => onChange(question.id, e.detail.value ? parseFloat(e.detail.value) : null)}
            />
            {question.unit && <Text className="unit">{question.unit}</Text>}
          </View>
        )

      case 'select':
        return (
          <Picker
            mode="selector"
            range={question.options?.map(o => o.label) || []}
            disabled={readOnly}
            onChange={(e) => {
              const idx = toPickerIndex(e.detail.value)
              onChange(question.id, question.options?.[idx]?.value)
            }}
          >
            <View className="crf-picker">
              <Text>{question.options?.find(o => o.value === value)?.label || '请选择'}</Text>
            </View>
          </Picker>
        )

      case 'radio':
        return (
          <View className="radio-group">
            {question.options?.map((opt) => (
              <View
                key={opt.value}
                className={`radio-item ${value === opt.value ? 'active' : ''}`}
                onClick={() => !readOnly && onChange(question.id, opt.value)}
              >
                <View className={`radio-dot ${value === opt.value ? 'checked' : ''}`} />
                <Text>{opt.label}</Text>
              </View>
            ))}
          </View>
        )

      case 'checkbox':
        return (
          <View className="checkbox-group">
            {question.options?.map((opt) => {
              const checked = Array.isArray(value) && value.includes(opt.value)
              return (
                <View
                  key={opt.value}
                  className={`checkbox-item ${checked ? 'active' : ''}`}
                  onClick={() => {
                    if (readOnly) return
                    const arr = Array.isArray(value)
                      ? value.filter((v): v is string => typeof v === 'string')
                      : []
                    if (checked) {
                      onChange(question.id, arr.filter(v => v !== opt.value))
                    } else {
                      onChange(question.id, [...arr, opt.value])
                    }
                  }}
                >
                  <View className={`checkbox-box ${checked ? 'checked' : ''}`} />
                  <Text>{opt.label}</Text>
                </View>
              )
            })}
          </View>
        )

      case 'date':
        return (
          <Picker
            mode="date"
            value={valueAsDate}
            disabled={readOnly}
            onChange={(e) => onChange(question.id, e.detail.value)}
          >
            <View className="crf-picker">
              <Text>{valueAsDate || '请选择日期'}</Text>
            </View>
          </Picker>
        )

      case 'textarea':
        return (
          <Textarea
            className="crf-textarea"
            value={valueAsText}
            placeholder={question.placeholder || `请输入${question.title}`}
            disabled={readOnly}
            onInput={(e) => onChange(question.id, e.detail.value)}
            maxlength={2000}
          />
        )

      case 'scale':
        return (
          <View className="scale-field">
            <Slider
              min={question.min || 0}
              max={question.max || 10}
              value={valueAsNumber}
              step={1}
              showValue
              disabled={readOnly}
              onChange={(e) => onChange(question.id, e.detail.value)}
            />
            <View className="scale-labels">
              <Text>{question.min || 0}</Text>
              <Text>{question.max || 10}</Text>
            </View>
          </View>
        )

      case 'image-upload':
        return (
          <View className="image-upload">
            <View className="image-list">
              {imageList.map((img, i) => (
                <Image key={i} src={img} className="uploaded-img" mode="aspectFill" />
              ))}
              {!readOnly && imageList.length < 3 && (
                <View className="upload-btn" onClick={handleImageUpload}>
                  <Text className="upload-icon">+</Text>
                </View>
              )}
            </View>
          </View>
        )

      default:
        return (
          <Input
            className="crf-input"
            value={valueAsText}
            placeholder={`请输入${question.title}`}
            disabled={readOnly}
            onInput={(e) => onChange(question.id, e.detail.value)}
          />
        )
    }
  }

  return (
    <View className={`crf-field ${error ? 'has-error' : ''}`}>
      <View className="field-label">
        {question.required && <Text className="required-star">*</Text>}
        <Text>{question.title}</Text>
        {question.unit && question.type !== 'number' && (
          <Text className="unit-hint">({question.unit})</Text>
        )}
      </View>
      {renderField()}
      {error && <Text className="error-msg">{error}</Text>}
    </View>
  )
}

function RepeatedNumber({
  question,
  value,
  onChange,
  readOnly,
}: { question: CRFQuestion; value: unknown; onChange: (id: string, v: unknown) => void; readOnly?: boolean }) {
  const count = question.repeat || 3
  const values: (number | null)[] = Array.isArray(value)
    ? value.map((v) => (typeof v === 'number' ? v : null))
    : new Array(count).fill(null)

  const handleChange = (idx: number, val: string) => {
    const newValues = [...values]
    newValues[idx] = val ? parseFloat(val) : null
    onChange(question.id + '__repeats', newValues)

    // Auto average
    const valid = newValues.filter((v): v is number => v !== null && !isNaN(v))
    if (valid.length > 0 && question.auto_average !== false) {
      const avg = valid.reduce((s, v) => s + v, 0) / valid.length
      onChange(question.id, Math.round(avg * 100) / 100)
    }
  }

  return (
    <View className="repeated-number">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} className="repeat-row">
          <Text className="repeat-label">第{i + 1}次</Text>
          <Input
            className="crf-input small"
            type="digit"
            value={values[i]?.toString() || ''}
            disabled={readOnly}
            onInput={(e) => handleChange(i, e.detail.value)}
          />
          {question.unit && <Text className="unit">{question.unit}</Text>}
        </View>
      ))}
    </View>
  )
}
