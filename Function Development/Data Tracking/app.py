"""
EDC BI Dashboard - Flask 后端主入口

⚠️  安全警告：数据库密码当前以明文写入代码，仅供本地开发测试使用。
    生产环境请务必改用 .env 文件 + python-dotenv，并将 .env 加入 .gitignore，
    绝不将明文密码提交到 Git 仓库。
"""

import os
import math
import logging
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from sqlalchemy import text
import pandas as pd
from dotenv import load_dotenv

from extensions import db
from models import ObservationData

# ── 加载 .env（如存在）────────────────────────────────────────────────────────
load_dotenv()

# ── 日志配置 ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # ── 数据库连接配置 ────────────────────────────────────────────────────────
    # 优先读取环境变量，回退到硬编码测试值
    DB_HOST = os.getenv("DB_HOST", "106.14.119.61")
    DB_PORT = os.getenv("DB_PORT", "5432")
    DB_USER = os.getenv("DB_USER", "workbench")
    DB_PASS = os.getenv("DB_PASS", "workbench123")
    DB_NAME = os.getenv("DB_NAME", "cn_kis")

    app.config["SQLALCHEMY_DATABASE_URI"] = (
        f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_pre_ping": True,       # 每次使用前探活，避免断连后报错
        "pool_recycle": 1800,        # 30 分钟回收连接
        "connect_args": {"connect_timeout": 10},
    }

    db.init_app(app)

    # ── 注册路由 ──────────────────────────────────────────────────────────────
    register_routes(app)
    return app


def register_routes(app: Flask) -> None:

    @app.route("/")
    def index():
        return render_template("index.html")

    # ── 健康检查 ──────────────────────────────────────────────────────────────
    @app.route("/api/health")
    def health():
        try:
            db.session.execute(text("SELECT 1"))
            return jsonify({"status": "ok", "db": "connected"})
        except Exception as exc:
            logger.error("DB health check failed: %s", exc)
            return jsonify({"status": "error", "db": str(exc)}), 503

    # ── 获取所有项目编号（用于项目编号模糊单选） ─────────────────────────────
    @app.route("/api/study_codes")
    def get_study_codes():
        try:
            rows = (
                db.session.query(ObservationData.study_code)
                .filter(ObservationData.study_code.isnot(None))
                .distinct()
                .order_by(ObservationData.study_code)
                .all()
            )
            return jsonify({"study_codes": [r[0] for r in rows]})
        except Exception as exc:
            logger.exception("Failed to fetch study codes")
            return jsonify({"error": str(exc)}), 500

    # ── 获取筛选项可选值（用于前端动态下拉） ─────────────────────────────────
    @app.route("/api/options")
    def get_options():
        """
        根据 study_code 返回该项目下可选的 subject_code / time_point / probe /
        position_code / attribute_name 列表，辅助前端多选框填充。
        """
        study_code = request.args.get("study_code", "").strip()
        try:
            base = db.session.query(ObservationData)
            if study_code:
                base = base.filter(ObservationData.study_code == study_code)

            def distinct_vals(col):
                rows = (
                    base.with_entities(col)
                    .filter(col.isnot(None))
                    .distinct()
                    .order_by(col)
                    .all()
                )
                return [r[0] for r in rows]

            return jsonify(
                {
                    "subject_codes": distinct_vals(ObservationData.subject_code),
                    "time_points": distinct_vals(ObservationData.time_point),
                    "probes": distinct_vals(ObservationData.probe),
                    "position_codes": distinct_vals(ObservationData.position_code),
                    "attribute_names": distinct_vals(ObservationData.attribute_name),
                }
            )
        except Exception as exc:
            logger.exception("Failed to fetch options")
            return jsonify({"error": str(exc)}), 500

    # ── 核心数据查询接口 ──────────────────────────────────────────────────────
    @app.route("/api/data")
    def get_data():
        """
        接收筛选参数，返回：
          - stats        : 汇总统计（count / mean / max / min）
          - chart_data   : 图表数据（均值趋势 + 可选个体散点）
          - table_data   : 当前页详细记录
          - pagination   : 分页信息
        """
        # ---- 解析参数 --------------------------------------------------------
        study_code    = request.args.get("study_code", "").strip()
        is_current_raw = request.args.get("is_current", "1").strip()

        # 逗号分隔的多值参数
        probes         = _parse_multi(request.args.get("probe", ""))
        position_codes = _parse_multi(request.args.get("position_code", ""))
        attribute_names = _parse_multi(request.args.get("attribute_name", ""))
        subject_codes  = _parse_multi(request.args.get("subject_code", ""))
        time_points    = _parse_multi(request.args.get("time_point", ""))

        # 分页
        try:
            page = max(1, int(request.args.get("page", 1)))
            page_size = max(1, min(200, int(request.args.get("page_size", 20))))
        except ValueError:
            page, page_size = 1, 20

        # ---- 构建查询 --------------------------------------------------------
        try:
            query = db.session.query(ObservationData)

            if study_code:
                query = query.filter(ObservationData.study_code == study_code)
            if probes:
                query = query.filter(ObservationData.probe.in_(probes))
            if position_codes:
                query = query.filter(ObservationData.position_code.in_(position_codes))
            if attribute_names:
                query = query.filter(ObservationData.attribute_name.in_(attribute_names))
            if subject_codes:
                query = query.filter(ObservationData.subject_code.in_(subject_codes))
            if time_points:
                query = query.filter(ObservationData.time_point.in_(time_points))

            # is_current：空字符串 / "all" 表示不过滤，其他值按整数过滤
            if is_current_raw not in ("", "all"):
                try:
                    query = query.filter(
                        ObservationData.is_current == int(is_current_raw)
                    )
                except ValueError:
                    pass

            query = query.order_by(ObservationData.observation_time.asc())

            # ---- 全量数据用于统计和图表（不分页） ----------------------------
            all_records = query.all()
            total = len(all_records)

            if total == 0:
                return jsonify(
                    {
                        "stats": {"count": 0, "mean": None, "max": None, "min": None},
                        "chart_data": [],
                        "table_data": [],
                        "pagination": {
                            "total": 0,
                            "page": page,
                            "page_size": page_size,
                            "total_pages": 0,
                        },
                    }
                )

            # ---- Pandas 统计 -------------------------------------------------
            df = pd.DataFrame(
                [
                    {
                        "subject_code": r.subject_code,
                        "time_point": r.time_point,
                        "observation_time": r.observation_time,
                        "probe": r.probe or "(未知设备)",
                        "attribute_name": r.attribute_name or "(未知指标)",
                        "attribute_value": (
                            float(r.attribute_value)
                            if r.attribute_value is not None
                            else None
                        ),
                    }
                    for r in all_records
                ]
            )
            df["attribute_value"] = pd.to_numeric(
                df["attribute_value"], errors="coerce"
            )
            val_series = df["attribute_value"].dropna()

            stats = {
                "count": int(total),
                "device_count": int(df["probe"].nunique()),
                "attribute_count": int(df["attribute_name"].nunique()),
            }

            # ---- 图表数据：按 probe × attribute_name 分组，每组一张图 --------
            chart_groups = []
            for (probe_val, attr_val), grp in df.groupby(
                ["probe", "attribute_name"], sort=True
            ):
                series = _build_chart_data(grp)
                if series:
                    chart_groups.append(
                        {
                            "probe": probe_val,
                            "attribute_name": attr_val,
                            "series": series,
                            "subject_count": int(grp["subject_code"].nunique()),
                        }
                    )

            # ---- 分页表格数据 ------------------------------------------------
            total_pages = math.ceil(total / page_size)
            offset = (page - 1) * page_size
            paged_records = all_records[offset : offset + page_size]
            table_data = [r.to_dict() for r in paged_records]

            return jsonify(
                {
                    "stats": stats,
                    "chart_groups": chart_groups,
                    "table_data": table_data,
                    "pagination": {
                        "total": total,
                        "page": page,
                        "page_size": page_size,
                        "total_pages": total_pages,
                    },
                }
            )

        except Exception as exc:
            logger.exception("Error in /api/data")
            return jsonify({"error": f"数据查询失败：{str(exc)}"}), 500


# ── 辅助函数 ──────────────────────────────────────────────────────────────────

def _parse_multi(raw: str) -> list[str]:
    """将逗号分隔的字符串解析为非空列表；空字符串返回空列表（即全选）。"""
    if not raw or not raw.strip():
        return []
    return [v.strip() for v in raw.split(",") if v.strip()]


def _build_chart_data(df: pd.DataFrame) -> list[dict]:
    """
    构建 ECharts 所需的 series 列表。

    策略（固定）：
      - X 轴：time_point（类目轴）
      - Y 轴：各时间点的 attribute_value 均值
      - 排序：按各时间点下 observation_time 的中位数升序，保证时间自然顺序
      - 每个数据点附带 count（样本量），供前端 tooltip 展示
    """
    df_valid = df.dropna(subset=["time_point", "attribute_value"])
    if df_valid.empty:
        return []

    # 按时间点分组，计算均值、受试者数（唯一 subject_code）和中位 observation_time
    agg = (
        df_valid.groupby("time_point", sort=False)
        .agg(
            mean_value=("attribute_value", "mean"),
            n_subjects=("subject_code", "nunique"),
            median_obs_time=(
                "observation_time",
                lambda x: x.dropna().median() if x.notna().any() else pd.NaT,
            ),
        )
        .reset_index()
    )

    # 按中位观测时间升序排列（无时间的放最后）
    agg = agg.sort_values("median_obs_time", na_position="last").reset_index(drop=True)

    data_points = [
        {
            "x": str(row["time_point"]),
            "y": round(float(row["mean_value"]), 4),
            "n": int(row["n_subjects"]),
        }
        for _, row in agg.iterrows()
    ]

    return [{"name": "均值趋势", "type": "line", "data": data_points}]


# ── 启动入口 ──────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    flask_app = create_app()
    flask_app.run(host="0.0.0.0", port=5001, debug=True)
