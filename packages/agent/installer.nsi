# Medplum Agent Installer Builder
# For use with NSIS 3.0+
# See: https://nsis.sourceforge.io/

!define COMPANY_NAME             "Medplum"
!define APP_NAME                 "Medplum Agent"
!define SERVICE_NAME             "MedplumAgent"
!define INSTALLER_FILE_NAME      "medplum-agent-installer.exe"
!define DEFAULT_BASE_URL         "https://api.medplum.com/"

Name                             "${APP_NAME}"
OutFile                          "${INSTALLER_FILE_NAME}"
VIProductVersion                 "1.0.0.0"
VIAddVersionKey ProductName      "${APP_NAME}"
VIAddVersionKey Comments         "${APP_NAME}"
VIAddVersionKey CompanyName      "${COMPANY_NAME}"
VIAddVersionKey LegalCopyright   "${COMPANY_NAME}"
VIAddVersionKey FileDescription  "${APP_NAME}"
VIAddVersionKey FileVersion      1
VIAddVersionKey ProductVersion   1
VIAddVersionKey InternalName     "${APP_NAME}"
VIAddVersionKey LegalTrademarks  "${COMPANY_NAME}"
VIAddVersionKey OriginalFilename "${INSTALLER_FILE_NAME}"

InstallDir "$PROGRAMFILES64\${APP_NAME}"

!include "nsDialogs.nsh"

RequestExecutionLevel admin

Var WelcomeDialog
Var WelcomeLabel
Var baseUrl
Var clientId
Var clientSecret
Var agentId

Page custom WelcomePage
Page custom InputPage InputPageLeave
Page instfiles

# The WelcomePage is a simple static screen that displays a friendly message.
Function WelcomePage
    nsDialogs::Create 1018
    Pop $WelcomeDialog

    ${If} $WelcomeDialog == error
        Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 50u "Welcome to the ${APP_NAME} Installer!$\r$\n$\r$\nClick next to continue."
    Pop $WelcomeLabel

    nsDialogs::Show
FunctionEnd

# The InputPage captures all of the user input for the agent.
Function InputPage
    nsDialogs::Create 1018
    Pop $0

    StrCpy $baseUrl "${DEFAULT_BASE_URL}"
    ${NSD_CreateLabel} 0 0 30% 12u "Base URL:"
    Pop $R0
    ${NSD_CreateText} 35% 0 65% 12u $baseUrl
    Pop $R1

    ${NSD_CreateLabel} 0 15u 30% 12u "Client ID:"
    Pop $R2
    ${NSD_CreateText} 35% 15u 65% 12u $clientId
    Pop $R3

    ${NSD_CreateLabel} 0 30u 30% 12u "Client Secret:"
    Pop $R4
    ${NSD_CreateText} 35% 30u 65% 12u $clientSecret
    Pop $R5

    ${NSD_CreateLabel} 0 45u 30% 12u "Agent ID:"
    Pop $R6
    ${NSD_CreateText} 35% 45u 65% 12u $agentId
    Pop $R7

    ${NSD_SetFocus} $R3
    nsDialogs::Show
FunctionEnd

Function InputPageLeave
    ${NSD_GetText} $R1 $baseUrl
    ${NSD_GetText} $R3 $clientId
    ${NSD_GetText} $R5 $clientSecret
    ${NSD_GetText} $R7 $agentId
FunctionEnd

# Do the actual installation.
# Install all of the files.
# Install the Windows Service.
Section
    DetailPrint "${APP_NAME}"

    # Call userInfo plugin to get user info.  The plugin puts the result in the stack
    userInfo::getAccountType

    # Pop the result from the stack into $0
    Pop $0

    # Compare the result with the string "Admin" to see if the user is admin.
    # If match, jump 3 lines down.
    strCmp $0 "Admin" +3

    # If there is not a match, print message and return
    DetailPrint "User is not admin: $0"
    return

    # Otherwise, confirm and return
    DetailPrint "User is admin"

    # Print user input
    DetailPrint "Base URL: $baseUrl"
    DetailPrint "Client ID: $clientId"
    DetailPrint "Client Secret: $clientSecret"
    DetailPrint "Agent ID: $agentId"

    # Copy the service files to the root directory
    SetOutPath "$INSTDIR"
    File ..\..\node_modules\node-windows\bin\winsw\winsw.exe
    File dist\medplum-agent-win-x64.exe
    File README.md

    # Create the winsw.xml config file
    # See config file format: https://github.com/winsw/winsw/blob/v3/docs/xml-config-file.md
    FileOpen $9 winsw.xml w
    FileWrite $9 "<service>$\r$\n"
    FileWrite $9 "<id>${SERVICE_NAME}</id>$\r$\n"
    FileWrite $9 "<name>${APP_NAME}</name>$\r$\n"
    FileWrite $9 "<description>Securely connects local devices to ${COMPANY_NAME} cloud</description>$\r$\n"
    FileWrite $9 "<executable>$INSTDIR\medplum-agent-win-x64.exe</executable>$\r$\n"
    FileWrite $9 "<arguments>$\"$baseUrl$\" $\"$clientId$\" $\"$clientSecret$\" $\"$agentId$\"</arguments>$\r$\n"
    FileWrite $9 "<startmode>Automatic</startmode>$\r$\n"
    FileWrite $9 "</service>$\r$\n"
    FileClose $9

    # Install the service
    DetailPrint "Installing service..."
    StrCpy $0 "winsw.exe install"
    #DetailPrint "$0"
    ExecWait $0 $1
    DetailPrint "Install returned $1"

    # Start the service
    DetailPrint "Starting service..."
    StrCpy $0 "winsw.exe start"
    #DetailPrint "$0"
    ExecWait $0 $1
    DetailPrint "Start service returned $1"

    # Create the uninstaller
    DetailPrint "Creating the uninstaller..."
    SetOutPath $INSTDIR
    WriteUninstaller "$INSTDIR\uninstall.exe"

    # Register the uninstaller
    DetailPrint "Registering the uninstaller..."
    WriteRegStr HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\${SERVICE_NAME}" "DisplayName" "${APP_NAME}"
    WriteRegStr HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\${SERVICE_NAME}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
    WriteRegStr HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\${SERVICE_NAME}" "QuietUninstallString" "$\"$INSTDIR\uninstall.exe$\" /S"
    DetailPrint "Uninstaller complete"

    # Create Start menu shortcuts
    DetailPrint "$SMPROGRAMS\${APP_NAME}\${APP_NAME} Uninstall.lnk"
    CreateDirectory "$SMPROGRAMS\${APP_NAME}"
    CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME} Uninstall.lnk" "$INSTDIR\uninstall.exe"

# default section end
SectionEnd

# Start the uninstaller
Section Uninstall

    # Uninstall the service
    DetailPrint "Uninstalling service..."
    SetOutPath "$INSTDIR"
    StrCpy $0 "winsw.exe uninstall"
    #DetailPrint "$0"
    ExecWait $0 $1
    DetailPrint "Uninstall returned $1"

    # Get out of the service directory so we can delete it
    SetOutPath "$PROGRAMFILES64"

    # Uninstall the Start menu shortcuts
    RMDir /r /REBOOTOK "$SMPROGRAMS\${APP_NAME}"

    # Delete the files
    RMDir /r /REBOOTOK "$INSTDIR"

    # Unregister the program
    DeleteRegKey HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\${SERVICE_NAME}"

SectionEnd
