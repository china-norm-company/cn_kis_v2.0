from extensions import db


class ObservationData(db.Model):
    """临床试验观测数据表模型"""

    __tablename__ = "instrument_readings"

    # 主键：与数据库实际主键 id (bigint) 一致
    id = db.Column(db.BigInteger, primary_key=True)

    # 核心业务字段
    record_id = db.Column(db.String(100), nullable=True, index=True)
    study_code = db.Column(db.String(100), nullable=True, index=True)
    subject_code = db.Column(db.String(100), nullable=True, index=True)
    time_point = db.Column(db.String(50), nullable=True, index=True)
    observation_time = db.Column(db.DateTime(timezone=True), nullable=True, index=True)
    probe = db.Column(db.String(100), nullable=True, index=True)
    sn = db.Column(db.String(100), nullable=True)
    position_code = db.Column(db.String(50), nullable=True, index=True)
    take_order = db.Column(db.Integer, nullable=True)
    attribute_name = db.Column(db.String(100), nullable=True, index=True)
    attribute_value = db.Column(db.Numeric(18, 6), nullable=True)
    is_current = db.Column(db.SmallInteger, nullable=True, default=1, index=True)

    # 审计字段（保留但不参与展示）
    created_at = db.Column(db.DateTime(timezone=True), nullable=True)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_by = db.Column(db.Integer, nullable=True)
    updated_by = db.Column(db.Integer, nullable=True)

    def to_dict(self) -> dict:
        """将模型实例序列化为字典，供 JSON 返回使用"""
        return {
            "record_id": self.record_id,
            "study_code": self.study_code,
            "subject_code": self.subject_code,
            "time_point": self.time_point,
            "observation_time": (
                self.observation_time.isoformat() if self.observation_time else None
            ),
            "probe": self.probe,
            "position_code": self.position_code,
            "attribute_name": self.attribute_name,
            "attribute_value": (
                float(self.attribute_value) if self.attribute_value is not None else None
            ),
            "is_current": self.is_current,
        }
