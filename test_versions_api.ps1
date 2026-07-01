# 测试 /api/versions 接口
# ============================================================

$base_url = "http://localhost:5000"

Write-Host "测试 /api/versions 接口..." -ForegroundColor Cyan
Write-Host ""

try {
    $url = "$base_url/api/versions"
    Write-Host "请求 URL: $url" -ForegroundColor Yellow
    
    $response = Invoke-RestMethod -Uri $url -Method Get -ContentType "application/json"
    
    Write-Host "响应状态: $([int]$response.StatusCode -replace '^(OK|Created|NoContent)$', '200')" -ForegroundColor Green
    Write-Host ""
    
    # 显示版本列表
    if ($response.versions) {
        Write-Host "版本数量: $($response.versions.Count)" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "版本列表:" -ForegroundColor Yellow
        
        $response.versions | ForEach-Object -Index {
            Write-Host "  [$($_.Index + 1)] $($_.Value)" -ForegroundColor White
        }
    } else {
        Write-Host "版本列表为空" -ForegroundColor Red
    }
    
    # 显示原始 JSON
    Write-Host ""
    Write-Host "原始响应:" -ForegroundColor Yellow
    $response | ConvertTo-Json -Depth 10 | Write-Host
    
} catch {
    Write-Host "请求失败: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "错误详情: $($_.ErrorDetails)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "测试完成" -ForegroundColor Cyan
