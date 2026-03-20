# CN KIS V1.0 - 火山云部署脚本 (PowerShell)
# 服务器: 118.196.64.48
# 用法: .\scripts\deploy_volcengine.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = "d:\KIS1.0\cn_kis_v1.0"
$Staging = "$env:TEMP\cn-kis-deploy"
$RemoteDir = "/opt/cn-kis"
$SshHost = "root@118.196.64.48"

# 加载 secrets.env
$SecretsPath = "$ProjectRoot\deploy\secrets.env"
if (Test-Path $SecretsPath) {
    Get-Content $SecretsPath | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
        }
    }
}

$SshKey = $env:VOLCENGINE_SSH_KEY
$SshPass = $env:VOLCENGINE_SSH_PASS

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CN KIS V1.0 部署到火山云" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: 准备部署包
Write-Host "`n[1/4] 准备部署包..." -ForegroundColor Yellow
if (Test-Path $Staging) { Remove-Item -Recurse -Force $Staging }
New-Item -ItemType Directory -Path $Staging -Force | Out-Null

# 后端
New-Item -ItemType Directory -Path "$Staging\backend" -Force | Out-Null
Copy-Item -Path "$ProjectRoot\backend\apps" -Destination "$Staging\backend\" -Recurse -Force
Copy-Item -Path "$ProjectRoot\backend\middleware" -Destination "$Staging\backend\" -Recurse -Force
Copy-Item -Path "$ProjectRoot\backend\manage.py","$ProjectRoot\backend\settings.py","$ProjectRoot\backend\urls.py","$ProjectRoot\backend\wsgi.py","$ProjectRoot\backend\requirements.txt","$ProjectRoot\backend\db_router.py" -Destination "$Staging\backend\" -Force
if (Test-Path "$ProjectRoot\backend\libs") { Copy-Item -Path "$ProjectRoot\backend\libs" -Destination "$Staging\backend\" -Recurse -Force }

# 前端
$Workstations = @("secretary","research","quality","finance","hr","crm","recruitment","execution","equipment","material","facility","evaluator","lab-personnel","ethics","reception")
foreach ($app in $Workstations) {
    $src = "$ProjectRoot\apps\$app\dist"
    if (Test-Path $src) {
        New-Item -ItemType Directory -Path "$Staging\frontend_dist\$app" -Force | Out-Null
        Copy-Item -Path "$src\*" -Destination "$Staging\frontend_dist\$app\" -Recurse -Force
        Write-Host "  已复制 $app" -ForegroundColor Gray
    }
}

# 部署配置
Copy-Item -Path "$ProjectRoot\deploy" -Destination "$Staging\" -Recurse -Force
New-Item -ItemType Directory -Path "$Staging\config" -Force | Out-Null
if (Test-Path "$ProjectRoot\config") { Copy-Item -Path "$ProjectRoot\config\*" -Destination "$Staging\config\" -Recurse -Force }

Write-Host "  部署包已准备: $Staging" -ForegroundColor Green

# Step 2: 上传
Write-Host "`n[2/4] 上传到服务器..." -ForegroundColor Yellow
$ScpArgs = @("-o", "StrictHostKeyChecking=no", "-r", "$Staging\*", "${SshHost}:${RemoteDir}/")
if ($SshKey -and (Test-Path $SshKey)) {
    scp -i $SshKey @ScpArgs
} else {
    Write-Host "  请手动执行以下命令上传（需输入密码）:" -ForegroundColor Yellow
    Write-Host "  scp -o StrictHostKeyChecking=no -r $Staging\* ${SshHost}:${RemoteDir}/" -ForegroundColor White
    $confirm = Read-Host "  上传完成后按 Enter 继续"
}

# Step 3: 远程配置
Write-Host "`n[3/4] 配置服务器（需 SSH 登录）..." -ForegroundColor Yellow
Write-Host "  请执行: ssh $SshHost" -ForegroundColor White
Write-Host "  登录后依次执行以下命令:" -ForegroundColor White
@"
cd $RemoteDir/backend
python3 -m venv venv
. venv/bin/activate
pip install --quiet -r requirements.txt
[ -f ../deploy/.env.volcengine.plan-a ] && grep -E '^FEISHU_|^ARK_|^KIMI_|^REDIS_URL=' ../deploy/.env.volcengine.plan-a >> .env 2>/dev/null
python manage.py migrate --noinput
mkdir -p logs media

# 部署前端
for app in secretary research quality finance hr crm recruitment execution equipment material facility evaluator lab-personnel ethics reception; do
  mkdir -p /var/www/cn-kis/\$app
  cp -r $RemoteDir/frontend_dist/\$app/* /var/www/cn-kis/\$app/ 2>/dev/null || true
done

# Nginx
cp $RemoteDir/deploy/nginx.conf /etc/nginx/sites-available/cn-kis.conf
sed -i 's/server_name localhost;/server_name 118.196.64.48;/' /etc/nginx/sites-available/cn-kis.conf
ln -sf /etc/nginx/sites-available/cn-kis.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 重启 API
systemctl restart cn-kis-api
"@ | Write-Host -ForegroundColor Cyan

Write-Host "`n[4/4] 验证" -ForegroundColor Yellow
Write-Host "  坤元设施台: http://118.196.64.48/facility/" -ForegroundColor Green
Write-Host "  API 文档: http://118.196.64.48/api/v1/docs" -ForegroundColor Green
Write-Host "`n部署包位置: $Staging" -ForegroundColor Gray
