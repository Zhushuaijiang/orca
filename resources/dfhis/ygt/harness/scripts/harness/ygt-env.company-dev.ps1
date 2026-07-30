# YGT company development environment.
# Dot-source before running local verification or workflow scripts:
# . .\scripts\harness\ygt-env.company-dev.ps1
#
# This shared file intentionally does not contain passwords or tokens.
# Put personal secrets in your shell profile, password manager loader, or a local
# ignored file before dot-sourcing this script.

function Set-YgtDefault {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Value
    )

    if (-not [Environment]::GetEnvironmentVariable($Name, "Process")) {
        Set-Item -Path "Env:$Name" -Value $Value
    }
}

function Assert-YgtSecret {
    param([Parameter(Mandatory = $true)][string]$Name)

    if (-not [Environment]::GetEnvironmentVariable($Name, "Process")) {
        Write-Warning "$Name is not set. Set it in your local environment before login, Jenkins, Doris, or Nacos operations."
    }
}

$localEnvFile = Join-Path $PSScriptRoot "ygt-env.company-dev.local.ps1"
if (Test-Path -LiteralPath $localEnvFile) {
    . $localEnvFile
}

# Main application.
Set-YgtDefault "YGT_MAIN_URL" "http://192.168.199.41:8001"
Set-YgtDefault "YGT_MAIN_LOGIN_URL" "http://192.168.199.41:8001/login"
Set-YgtDefault "YGT_MAIN_USER" "admin"
Assert-YgtSecret "YGT_MAIN_PASSWORD"

# Gateway and Nacos.
Set-YgtDefault "YGT_GATEWAY_URL" "http://192.168.199.41:9000/console"
Set-YgtDefault "YGT_GATEWAY_USER" "nacos"
Assert-YgtSecret "YGT_GATEWAY_PASSWORD"
Set-YgtDefault "YGT_NACOS_URL" "http://192.168.199.42:8848"
Set-YgtDefault "YGT_NACOS_CONSOLE_URL" "http://192.168.199.42:18848"
Set-YgtDefault "YGT_NACOS_USER" "nacos"
Assert-YgtSecret "YGT_NACOS_PASSWORD"

# Published services.
Set-YgtDefault "YGT_BIZ_BASE_SWAGGER_URL" "http://192.168.199.41:9001/swagger-ui/index.html"
Set-YgtDefault "YGT_BIZ_ZHUSUOYIN_HEALTH_URL" "http://192.168.199.41:9002/actuator/health"
Set-YgtDefault "YGT_BIZ_SHUJUMX_SWAGGER_URL" "http://192.168.199.41:9003/swagger-ui/index.html"
Set-YgtDefault "YGT_BIZ_HUANZHE360_SWAGGER_URL" "http://192.168.199.41:9004/swagger-ui/index.html"

# Doris.
Set-YgtDefault "YGT_DORIS_HOST" "192.168.1.10"
Set-YgtDefault "YGT_DORIS_PORT" "9030"
Set-YgtDefault "YGT_DORIS_DATABASE" "df_ygt"
Set-YgtDefault "YGT_DORIS_URL" "jdbc:mysql://192.168.1.10:9030/df_ygt"
Set-YgtDefault "YGT_DORIS_USER" "df_admin"
Assert-YgtSecret "YGT_DORIS_PASSWORD"

# Jenkins and deployment defaults.
Set-YgtDefault "YGT_JENKINS_URL" "http://192.168.199.42:8082"
Set-YgtDefault "YGT_JENKINS_USER" "admin"
Assert-YgtSecret "YGT_JENKINS_PASSWORD"
Set-YgtDefault "YGT_DEPLOY_HOST" "192.168.199.42"
Set-YgtDefault "YGT_DEPLOY_USER" "root"
Set-YgtDefault "YGT_K8S_NAMESPACE" "prod"

# Local backend verification.
Set-YgtDefault "JAVA_HOME" "D:\Program Files\Java\jdk-25.0.2.10-hotspot"
if ($env:JAVA_HOME -and ($env:Path -notlike "$env:JAVA_HOME\bin*")) {
    $env:Path = "$env:JAVA_HOME\bin;" + $env:Path
}
Set-YgtDefault "YGT_LOCAL_BACKEND_PORT" "8085"
Set-YgtDefault "YGT_LOCAL_BACKEND_RUN_ARGS" "--server.port=8085"
