!include LogicLib.nsh

!ifdef BUILD_UNINSTALLER
Var /GLOBAL UninstallShouldDeleteAppData
!endif

!macro customUnInit
  StrCpy $UninstallShouldDeleteAppData "0"
  ${GetParameters} $R0
  ${GetOptions} $R0 "--delete-app-data" $R1
  ${Unless} ${Errors}
    StrCpy $UninstallShouldDeleteAppData "1"
  ${EndUnless}
!macroend

!macro customUnInstall
  ${If} ${Silent}
    Call un.DeleteAutoEmailSenderAppData
    Goto done
  ${EndIf}

  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 "是否同时删除本地数据（数据库、材料、缓存和本地配置）？选择否将保留本地数据，重新安装后仍可继续使用。" IDYES confirm_delete IDNO skip_delete

  confirm_delete:
    MessageBox MB_ICONEXCLAMATION|MB_YESNO|MB_DEFBUTTON2 "这将永久删除 Auto Email Sender 的本地数据，包括数据库、上传材料、缓存和本地配置。删除后无法通过重新安装恢复。是否继续？" IDYES delete_data IDNO skip_delete

  delete_data:
    StrCpy $UninstallShouldDeleteAppData "1"
    Call un.DeleteAutoEmailSenderAppData
    Goto done

  skip_delete:
    StrCpy $UninstallShouldDeleteAppData "0"
    Goto done

  done:
!macroend

!ifdef BUILD_UNINSTALLER
Function un.DeleteAutoEmailSenderAppData
  ${If} $UninstallShouldDeleteAppData != "1"
    Return
  ${EndIf}

  SetShellVarContext current
  StrCpy $R0 "$APPDATA\Auto Email Sender"

  ${If} $R0 == ""
    Return
  ${EndIf}

  ${If} $R0 == "$APPDATA"
    Return
  ${EndIf}

  ${If} ${FileExists} "$R0\*.*"
    RMDir /r "$R0"
  ${EndIf}
FunctionEnd
!endif


