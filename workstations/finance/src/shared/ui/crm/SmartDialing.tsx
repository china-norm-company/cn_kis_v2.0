/**
 * 智能拨号组件
 * 
 * 支持一键拨号、通话记录自动保存
 */
import React, { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Phone, PhoneCall, PhoneOff, Clock } from "lucide-react";
import { useToast } from "@/shared/ui/use-toast";
import { Badge } from "@/shared/ui/badge";

interface SmartDialingProps {
  /** 被叫号码 */
  phoneNumber: string;
  /** 客户ID（可选） */
  clientId?: number;
  /** 联系人ID（可选） */
  contactId?: number;
  /** 线索ID（可选） */
  leadId?: number;
  /** 商机ID（可选） */
  opportunityId?: number;
  /** 联系人姓名（用于显示） */
  contactName?: string;
  /** 通话完成回调 */
  onCallComplete?: (callRecord: CallRecord) => void;
}

export type CallRecord = {
  id: string;
  caller_number: string;
  callee_number: string;
  call_direction: "outbound" | "inbound";
  call_status: "created" | "answered" | "completed" | "failed";
  client_id?: number;
  contact_id?: number;
  lead_id?: number;
  opportunity_id?: number;
  duration_seconds?: number;
  created_at: string;
  updated_at: string;
};

const CALL_RECORDS_KEY = "mock_call_records_v1";

const loadRecords = (): CallRecord[] => {
  try {
    const raw = localStorage.getItem(CALL_RECORDS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as CallRecord[]) : [];
  } catch {
    return [];
  }
};

const saveRecords = (records: CallRecord[]) => {
  try {
    localStorage.setItem(CALL_RECORDS_KEY, JSON.stringify(records));
  } catch {
    // ignore
  }
};

export const SmartDialing = ({
  phoneNumber,
  clientId,
  contactId,
  leadId,
  opportunityId,
  contactName,
  onCallComplete,
}: SmartDialingProps) => {
  const [isCalling, setIsCalling] = useState(false);
  const [callRecord, setCallRecord] = useState<CallRecord | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  const { toast } = useToast();

  // 格式化通话时长
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // 拨号
  const handleDial = async () => {
    try {
      setIsCalling(true);
      setCallStartTime(new Date());

      // 创建通话记录（纯本地 mock，不调接口）
      const nowIso = new Date().toISOString();
      const record: CallRecord = {
        id: `CALL-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        caller_number: "",
        callee_number: phoneNumber,
        call_direction: "outbound",
        call_status: "created",
        client_id: clientId,
        contact_id: contactId,
        lead_id: leadId,
        opportunity_id: opportunityId,
        created_at: nowIso,
        updated_at: nowIso,
      };
      const existing = loadRecords();
      saveRecords([record, ...existing].slice(0, 2000));

      setCallRecord(record);

      // 使用tel:协议拨号（浏览器会调用系统拨号应用）
      window.location.href = `tel:${phoneNumber}`;

      // 更新状态为已接通（模拟）
      setTimeout(async () => {
        try {
          const all = loadRecords();
          const idx = all.findIndex((x) => x.id === record.id);
          if (idx >= 0) {
            all[idx] = { ...all[idx], call_status: "answered", updated_at: new Date().toISOString() };
            saveRecords(all);
          }
        } catch (error) {
          console.error("更新通话状态失败:", error);
        }
      }, 1000);

      toast({
        title: "正在拨号",
        description: `正在拨打 ${contactName || phoneNumber} 的电话`,
      });
    } catch (error) {
      console.error("拨号失败:", error);
      toast({
        title: "拨号失败",
        description: error instanceof Error ? error.message : "无法创建通话记录",
        variant: "destructive",
      });
      setIsCalling(false);
    }
  };

  // 挂断
  const handleHangup = async () => {
    if (!callRecord) return;

    try {
      const duration = callStartTime
        ? Math.floor((new Date().getTime() - callStartTime.getTime()) / 1000)
        : 0;

      // 完成通话记录（纯本地 mock）
      const completedRecord: CallRecord = {
        ...callRecord,
        call_status: "completed",
        duration_seconds: duration,
        updated_at: new Date().toISOString(),
      };
      const all = loadRecords();
      const idx = all.findIndex((x) => x.id === callRecord.id);
      if (idx >= 0) {
        all[idx] = completedRecord;
      } else {
        all.unshift(completedRecord);
      }
      saveRecords(all.slice(0, 2000));

      setCallRecord(null);
      setIsCalling(false);
      setCallDuration(0);
      setCallStartTime(null);

      if (onCallComplete) {
        onCallComplete(completedRecord);
      }

      toast({
        title: "通话已结束",
        description: `通话时长: ${formatDuration(duration)}`,
      });
    } catch (error) {
      console.error("挂断失败:", error);
      toast({
        title: "操作失败",
        description: error instanceof Error ? error.message : "无法更新通话记录",
        variant: "destructive",
      });
    }
  };

  // 通话时长计时器
  React.useEffect(() => {
    if (isCalling && callStartTime) {
      const interval = setInterval(() => {
        const duration = Math.floor(
          (new Date().getTime() - callStartTime.getTime()) / 1000
        );
        setCallDuration(duration);
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isCalling, callStartTime]);

  return (
    <div className="flex items-center gap-2">
      {!isCalling ? (
        <Button
          onClick={handleDial}
          size="sm"
          variant="outline"
          className="gap-2"
        >
          <Phone className="h-4 w-4" />
          拨号
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <PhoneCall className="h-3 w-3 animate-pulse" />
            通话中
          </Badge>
          {callDuration > 0 && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDuration(callDuration)}
            </div>
          )}
          <Button
            onClick={handleHangup}
            size="sm"
            variant="destructive"
            className="gap-2"
          >
            <PhoneOff className="h-4 w-4" />
            挂断
          </Button>
        </div>
      )}
    </div>
  );
};

