#!/usr/bin/expect -f
# 微信云托管 CLI 非交互部署（expect 驱动）
set env_id [lindex $argv 0]
if {$env_id == ""} { set env_id "prod-3gfhkz1551e76534" }
set svc [lindex $argv 1]
if {$svc == ""} { set svc "utest" }

set timeout 600
spawn wxcloud run:deploy . -e $env_id -s $svc --noConfirm

expect {
    "请选择部署方式" { send "\r"; exp_continue }
    "工作目录" { send "\r"; exp_continue }
    "请输入" { send "\r"; exp_continue }
    "部署成功" { exit 0 }
    "部署失败" { exit 1 }
    "error" { exit 1 }
    eof { exit 0 }
    timeout { exit 0 }
}
