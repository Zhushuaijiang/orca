# YGT workflow harness environment template.
# Copy this file to a local-only location, fill credentials there, then dot-source it:
# . D:\path\to\ygt-env.local.ps1

$env:YGT_MAIN_URL = "http://192.168.199.41:8001"
$env:YGT_GATEWAY_URL = "http://192.168.199.41:9000/console"
$env:YGT_NACOS_URL = "http://192.168.199.42:8848"
$env:YGT_NACOS_CONSOLE_URL = "http://192.168.199.42:18848"
$env:YGT_JENKINS_URL = "http://192.168.199.42:8082"
$env:YGT_DEPLOY_HOST = "192.168.199.42"
$env:YGT_DEPLOY_USER = "root"
$env:YGT_K8S_NAMESPACE = "prod"

$env:YGT_DORIS_HOST = "192.168.1.10"
$env:YGT_DORIS_PORT = "9030"
$env:YGT_DORIS_DATABASE = "df_ygt"

# Credentials. Keep these out of git.
$env:YGT_JENKINS_USER = "<jenkins-user>"
$env:YGT_JENKINS_TOKEN = "<jenkins-token-or-password>"
$env:YGT_NACOS_USER = "<nacos-user>"
$env:YGT_NACOS_PASSWORD = "<nacos-password>"
$env:YGT_DORIS_USER = "<doris-user>"
$env:YGT_DORIS_PASSWORD = "<doris-password>"

# Local backend verification.
$env:JAVA_HOME = "D:\Program Files\Java\jdk-25.0.2.10-hotspot"
$env:Path = "$env:JAVA_HOME\bin;" + $env:Path
