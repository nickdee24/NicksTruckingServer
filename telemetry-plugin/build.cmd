@echo off
rem Builds nts_telemetry.dll with the Visual Studio C++ tools (x64).
setlocal
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
for /f "usebackq delims=" %%i in (`call "%%VSWHERE%%" -latest -property installationPath`) do set "VS=%%i"
if not defined VS (echo Visual Studio C++ tools not found & exit /b 1)
call "%VS%\VC\Auxiliary\Build\vcvars64.bat" >nul || exit /b 1
cd /d "%~dp0"
if not exist build mkdir build
cl /nologo /LD /O2 /EHsc /W3 /I sdk\include nts_telemetry.cpp ws2_32.lib /Fobuild\ /Fe:build\nts_telemetry.dll /link /DEF:nts_telemetry.def || exit /b 1
echo Built build\nts_telemetry.dll
