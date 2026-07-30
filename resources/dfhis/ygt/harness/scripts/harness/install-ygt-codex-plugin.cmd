@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "YGT_SKILL=%USERPROFILE%\.codex\skills\ygt\SKILL.md"
set "YGT_LOCAL_ENV=%SCRIPT_DIR%ygt-env.company-dev.local.ps1"

pushd "%SCRIPT_DIR%\..\.." >nul

echo Installing YGT Codex plugin...
echo Repository: %CD%
echo.

where node >nul 2>nul
if errorlevel 1 goto :node_missing

call node "%SCRIPT_DIR%install-ygt-codex-plugin.mjs" %*

if exist "%YGT_SKILL%" goto :install_ok
goto :install_failed

:install_ok
echo.
if exist "%YGT_LOCAL_ENV%" goto :local_env_found
goto :local_env_missing

:local_env_found
echo Local YGT env file found:
echo   %YGT_LOCAL_ENV%
echo The installed YGT skill will load it before running harness commands.
goto :done

:local_env_missing
echo Local YGT env file was not found.
echo Create your personal credential file before Jenkins/smoke/rollout:
echo   %YGT_LOCAL_ENV%
echo You can copy from:
echo   %SCRIPT_DIR%ygt-env.example.ps1
goto :done

:done
echo.
echo Installation completed. Start a new Codex session, then use:
echo   $ygt menu issue example
echo.
popd >nul
pause
exit /b 0

:node_missing
echo node was not found. Please install Node.js or add node to PATH.
popd >nul
pause
exit /b 1

:install_failed
echo.
echo Installation failed. YGT skill was not found:
echo   %YGT_SKILL%
popd >nul
pause
exit /b 1
