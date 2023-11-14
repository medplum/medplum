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
Var alreadyInstalled
Var baseUrl
Var clientId
Var clientSecret
Var agentId

# The onInit handler is called when the installer is nearly finished initializing.
# See: https://nsis.sourceforge.io/Reference/.onInit
Function .onInit
    ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Services\${SERVICE_NAME}" "ImagePath"
    ${If} $0 != ""
        StrCpy $alreadyInstalled 1
    ${EndIf}
FunctionEnd

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
    ${If} $alreadyInstalled == 1
        Abort ; This skips the page
    ${EndIf}

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

# Main installation entry point.
Section
    DetailPrint "${APP_NAME}"
    SetOutPath "$INSTDIR"

    ${If} $alreadyInstalled == 1
        Call UpgradeApp
    ${Else}
        Call InstallApp
    ${EndIf}

SectionEnd

# Upgrade an existing installation.
# This only copies files, and restarts the Windows Service.
# It does not modify the existing configuration settings.
Function UpgradeApp

    # Stop the service
    DetailPrint "Stopping service..."
    ExecWait "sc.exe stop ${SERVICE_NAME}" $1
    DetailPrint "Exit code $1"

    # Sleep for 3 seconds to let the service fully stop
    # We cannot write the new version of the exe while the process is running
    DetailPrint "Sleeping..."
    Sleep 3000

    # Copy the new files to the installation directory
    File dist\medplum-agent-win-x64.exe
    File README.md

    # Start the service
    DetailPrint "Starting service..."
    ExecWait "sc.exe start ${SERVICE_NAME}" $1
    DetailPrint "Start service returned $1"

FunctionEnd

# Do the actual installation.
# Install all of the files.
# Install the Windows Service.
Function InstallApp
    # Print user input
    DetailPrint "Base URL: $baseUrl"
    DetailPrint "Client ID: $clientId"
    DetailPrint "Client Secret: $clientSecret"
    DetailPrint "Agent ID: $agentId"

    # Copy the service files to the root directory
    File ..\..\node_modules\node-shawl\bin\shawl-v1.3.0-legal.txt
    File ..\..\node_modules\node-shawl\bin\shawl-v1.3.0-win64.exe
    File dist\medplum-agent-win-x64.exe
    File README.md

    # Create the service
    DetailPrint "Creating service..."
    ExecWait "shawl-v1.3.0-win64.exe add --name $\"${SERVICE_NAME}$\" -- $\"$INSTDIR\medplum-agent-win-x64.exe$\" $\"$baseUrl$\" $\"$clientId$\" $\"$clientSecret$\" $\"$agentId$\"" $1
    DetailPrint "Exit code $1"

    # Set service description
    DetailPrint "Setting service description..."
    ExecWait "sc.exe description $\"${SERVICE_NAME}$\" $\"Securely connects local devices to ${COMPANY_NAME} cloud$\"" $1
    DetailPrint "Exit code $1"

    # Start the service
    DetailPrint "Starting service..."
    ExecWait "sc.exe start $\"${SERVICE_NAME}$\"" $1
    DetailPrint "Exit code $1"

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

FunctionEnd

# Start the uninstaller
Section Uninstall

    # Stop the service
    DetailPrint "Stopping service..."
    ExecWait "sc.exe stop ${SERVICE_NAME}" $1
    DetailPrint "Exit code $1"

    # Sleep for 3 seconds to let the service fully stop
    # We cannot delete the file until the service is fully stopped
    DetailPrint "Sleeping..."
    Sleep 3000

    # Deleting the service
    DetailPrint "Deleting service..."
    ExecWait "sc.exe delete ${SERVICE_NAME}" $1
    DetailPrint "Exit code $1"

    # Get out of the service directory so we can delete it
    SetOutPath "$PROGRAMFILES64"

    # Uninstall the Start menu shortcuts
    RMDir /r /REBOOTOK "$SMPROGRAMS\${APP_NAME}"

    # Delete the files
    RMDir /r /REBOOTOK "$INSTDIR"

    # Unregister the program
    DeleteRegKey HKLM "SYSTEM\CurrentControlSet\Services\${SERVICE_NAME}"
    DeleteRegKey HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\${SERVICE_NAME}"

SectionEnd
