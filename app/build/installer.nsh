!include "LogicLib.nsh"

; osu! mapping utility v1 was a separate Tauri-based app (different install technology
; entirely). Its NSIS-generated uninstall entry registers under HKCU using the literal
; product name as the registry key (not a GUID, unlike this installer's own
; electron-builder-generated key), and installs to a fixed "%LOCALAPPDATA%\osu! mapping
; utility" folder under Tauri's "currentUser" install mode. Detect and silently remove it
; before installing v2, so users don't end up with both versions side by side.
!macro customInit
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\osu! mapping utility" "UninstallString"
  ${If} $0 != ""
    DetailPrint "Removing previous osu! mapping utility (v1) installation..."
    ; ExecWait only waits for the uninstaller's initial process - NSIS uninstallers
    ; typically relaunch a copy of themselves in %TEMP% to delete their own original exe
    ; and registry entries asynchronously, so that cleanup isn't guaranteed to finish
    ; before this returns. Don't rely on it: remove the registry key and any leftover
    ; files ourselves regardless of what the old uninstaller managed to finish.
    ExecWait '$0 /S'
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\osu! mapping utility"
    RMDir /r "$LOCALAPPDATA\osu! mapping utility"
  ${EndIf}
!macroend
