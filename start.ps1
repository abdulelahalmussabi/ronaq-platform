# تشغيل منصة مكِّن محلياً
$port = 8080
Write-Host "منصة مكِّن — http://localhost:$port" -ForegroundColor Cyan
Write-Host "الإدارة: http://localhost:$port/admin.html" -ForegroundColor Yellow
Set-Location $PSScriptRoot
python -m http.server $port
