@echo off
REM Wrapper batch pour execution planifiee Windows
cd /d "%~dp0"
"C:\Program Files\Git\bin\bash.exe" run-daily-optimizer.sh
