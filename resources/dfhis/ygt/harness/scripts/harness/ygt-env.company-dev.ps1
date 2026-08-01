# YGT company development environment.
# Dot-source before running local verification or workflow scripts:
# . .\scripts\harness\ygt-env.company-dev.ps1
#
# This shared file intentionally does not contain passwords or tokens. It loads
# ignored local overrides and the installed dfhis-company-environment reference.

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

function Join-YgtPath {
    param([Parameter(Mandatory = $true)][string[]]$Parts)

    $path = $Parts[0]
    foreach ($part in $Parts[1..($Parts.Count - 1)]) {
        $path = Join-Path $path $part
    }
    return $path
}

function Get-YgtCompanyEnvironmentReference {
    $referenceParts = @("dfhis-company-environment", "references", "company-environment", "医共体公司开发环境信息.md")
    $homeDir = if ($HOME) { $HOME } else { [Environment]::GetFolderPath("UserProfile") }
    $candidates = @()
    if ($homeDir) {
        $candidates += Join-YgtPath (@($homeDir, ".agents", "skills") + $referenceParts)
        $candidates += Join-YgtPath (@($homeDir, ".codex", "skills") + $referenceParts)
        $candidates += Join-YgtPath (@($homeDir, ".claude", "skills") + $referenceParts)
    }

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }
    return $null
}

function Get-YgtReferenceSection {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string]$Heading
    )

    $start = $Text.IndexOf($Heading, [StringComparison]::OrdinalIgnoreCase)
    if ($start -lt 0) {
        return ""
    }

    $rest = $Text.Substring($start)
    $next = [regex]::Match($rest.Substring(1), "`n\s*\*\*")
    if (-not $next.Success) {
        return $rest
    }
    return $rest.Substring(0, $next.Index + 1)
}

function Get-YgtCredentialLines {
    param([Parameter(Mandatory = $true)][string]$Section)

    $Section -split "`n+" |
        ForEach-Object {
            ($_ -replace "\[([^\]]+)\]\([^)]+\)", '$1' -replace "\*\*", "").Trim()
        } |
        Where-Object {
            $_ -and
            ($_ -notmatch "^#+\s*") -and
            ($_ -notmatch "^[-*]\s*$") -and
            ($_ -notmatch "https?://") -and
            ($_ -notmatch "^\$") -and
            ($_ -notmatch "(?i)^mvn\b")
        }
}

function Set-YgtSlashCredential {
    param(
        [Parameter(Mandatory = $true)][string]$UserKey,
        [Parameter(Mandatory = $true)][string]$PasswordKey,
        [Parameter(Mandatory = $true)][string]$Section
    )

    $line = Get-YgtCredentialLines $Section | Where-Object { $_ -match "^[^/\s]+/[^/\s]+$" } | Select-Object -First 1
    if (-not $line) {
        return
    }

    $parts = $line -split "/", 2
    Set-YgtDefault $UserKey $parts[0]
    Set-YgtDefault $PasswordKey $parts[1]
}

function Set-YgtLineCredentials {
    param(
        [Parameter(Mandatory = $true)][string]$UserKey,
        [Parameter(Mandatory = $true)][string]$PasswordKey,
        [Parameter(Mandatory = $true)][string]$Section
    )

    $lines = @(Get-YgtCredentialLines $Section | Where-Object { $_ -notmatch ":" })
    if ($lines.Count -lt 2) {
        return
    }

    Set-YgtDefault $UserKey $lines[0]
    Set-YgtDefault $PasswordKey $lines[1]
}

function Import-YgtCompanyEnvironmentReference {
    if ($env:YGT_HARNESS_SKIP_COMPANY_REFERENCE -eq "1") {
        return
    }

    $referencePath = Get-YgtCompanyEnvironmentReference
    if (-not $referencePath) {
        return
    }

    $text = (Get-Content -LiteralPath $referencePath -Raw) -replace "`r", "" -replace [char]0x00a0, " " -replace "\\_", "_"
    Set-YgtSlashCredential "YGT_MAIN_USER" "YGT_MAIN_PASSWORD" (Get-YgtReferenceSection $text "主应用")
    Set-YgtLineCredentials "YGT_GATEWAY_USER" "YGT_GATEWAY_PASSWORD" (Get-YgtReferenceSection $text "公司开发环境网关管理")
    Set-YgtLineCredentials "YGT_NACOS_USER" "YGT_NACOS_PASSWORD" (Get-YgtReferenceSection $text "公司开发环境nacos信息")
    Set-YgtSlashCredential "YGT_DORIS_USER" "YGT_DORIS_PASSWORD" (Get-YgtReferenceSection $text "公司开发环境数据库doris信息")

    $jenkinsSection = Get-YgtReferenceSection $text "公司开发环境jekins"
    if (-not $jenkinsSection) {
        $jenkinsSection = Get-YgtReferenceSection $text "公司开发环境jenkins"
    }
    Set-YgtSlashCredential "YGT_JENKINS_USER" "YGT_JENKINS_PASSWORD" $jenkinsSection
    Set-YgtDefault "YGT_COMPANY_REFERENCE_PATH" $referencePath
}

$localEnvFile = Join-Path $PSScriptRoot "ygt-env.company-dev.local.ps1"
if (Test-Path -LiteralPath $localEnvFile) {
    . $localEnvFile
}

Import-YgtCompanyEnvironmentReference

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
