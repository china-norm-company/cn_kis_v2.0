from flask_sqlalchemy import SQLAlchemy

# 单独实例化，避免循环导入
db = SQLAlchemy()
