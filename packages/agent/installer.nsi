# Medplum Agent Installer Builder
# For use with NSIS 3.0+
# See: https://nsis.sourceforge.io/

!define COMPANY_NAME             "Medplum"
!define APP_NAME                 "Medplum Agent"
!define SERVICE_NAME             "MedplumAgent"
!define SERVICE_DESCRIPTION      "Securely connects local devices to ${COMPANY_NAME} cloud"
!define SERVICE_FILE_NAME        "medplum-agent-$%MEDPLUM_VERSION%-win64.exe"
!define INSTALLER_FILE_NAME      "medplum-agent-installer-$%MEDPLUM_VERSION%.exe"
!define PRODUCT_VERSION          "$%MEDPLUM_VERSION%.0"
!define DEFAULT_BASE_URL         "https://api.medplum.com/"

Name                             "${APP_NAME}"
OutFile                          "${INSTALLER_FILE_NAME}"
VIProductVersion                 "${PRODUCT_VERSION}"
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
!include "x64.nsh"
!include "LogicLib.nsh"

RequestExecutionLevel admin

Var WelcomeDialog
Var WelcomeLabel
Var alreadyInstalled
Var foundPropertiesFile
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
    ${Else}
        StrCpy $alreadyInstalled 0
    ${EndIf}

    ${If} ${FileExists} "$INSTDIR\agent.properties"
        StrCpy $foundPropertiesFile 1
    ${Else}
        StrCpy $foundPropertiesFile 0
    ${EndIf}

    # Check if already installed and properties file not found
    ${If} $alreadyInstalled == 1
    ${AndIf} $foundPropertiesFile == 0
        MessageBox MB_ICONSTOP "The currently installed version is too old and needs to be uninstalled manually before proceeding."
        Quit
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

    StrCmp $baseUrl "" inputError
    StrCmp $clientId "" inputError
    StrCmp $clientSecret "" inputError
    StrCmp $agentId "" inputError
    Goto inputOK
    inputError:
        MessageBox MB_OK|MB_ICONEXCLAMATION "Please fill in all required fields."
        Abort
    inputOK:
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

    # Deleting the service
    DetailPrint "Deleting service..."
    ExecWait "sc.exe delete ${SERVICE_NAME}" $1
    DetailPrint "Exit code $1"

    # Copy the new files to the installation directory
    File dist\shawl-v1.4.0-legal.txt
    File dist\shawl-v1.4.0-win64.exe
    File dist\${SERVICE_FILE_NAME}
    File README.md

    # Create the service
    DetailPrint "Creating service..."
    ExecWait "shawl-v1.4.0-win64.exe add --name $\"${SERVICE_NAME}$\" --log-as $\"${SERVICE_NAME}$\" --cwd $\"$INSTDIR$\" -- $\"$INSTDIR\${SERVICE_FILE_NAME}$\"" $1
    DetailPrint "Exit code $1"

    # Set service display name
    DetailPrint "Setting service display name..."
    ExecWait "sc.exe config $\"${SERVICE_NAME}$\" displayname= $\"${APP_NAME}$\"" $1
    DetailPrint "Exit code $1"

    # Set service description
    DetailPrint "Setting service description..."
    ExecWait "sc.exe description $\"${SERVICE_NAME}$\" $\"${SERVICE_DESCRIPTION}$\"" $1
    DetailPrint "Exit code $1"

    # Set service to start automatically
    DetailPrint "Setting service to start automatically..."
    ExecWait "sc.exe config $\"${SERVICE_NAME}$\" start= auto" $1
    DetailPrint "Exit code $1"

    # Start the service
    DetailPrint "Starting service..."
    ExecWait "sc.exe start $\"${SERVICE_NAME}$\"" $1
    DetailPrint "Exit code $1"

FunctionEnd

# Do the actual installation.
# Install all of the files.
# Install the Windows Service.
Function InstallApp
    # Show architecture
    !if "${NSIS_PTR_SIZE}" >= 8
      DetailPrint "64-bit installer"
    !else
      ${If} ${RunningX64}
        DetailPrint "32-bit installer on a 64-bit OS"
      ${Else}
        DetailPrint "32-bit installer on a 32-bit OS"
      ${EndIf}
    !endif

    # Print user input
    DetailPrint "Base URL: $baseUrl"
    DetailPrint "Client ID: $clientId"
    DetailPrint "Client Secret: $clientSecret"
    DetailPrint "Agent ID: $agentId"

    # Copy the service files to the root directory
    File dist\shawl-v1.4.0-legal.txt
    File dist\shawl-v1.4.0-win64.exe
    File dist\${SERVICE_FILE_NAME}
    File README.md

    # Create the agent.properties config file
    FileOpen $9 agent.properties w
    FileWrite $9 "baseUrl=$baseUrl$\r$\n"
    FileWrite $9 "clientId=$clientId$\r$\n"
    FileWrite $9 "clientSecret=$clientSecret$\r$\n"
    FileWrite $9 "agentId=$agentId$\r$\n"
    FileClose $9

    # Create the service
    DetailPrint "Creating service..."
    ExecWait "shawl-v1.4.0-win64.exe add --name $\"${SERVICE_NAME}$\" --log-as $\"${SERVICE_NAME}$\" --cwd $\"$INSTDIR$\" -- $\"$INSTDIR\${SERVICE_FILE_NAME}$\"" $1
    DetailPrint "Exit code $1"

    # Set service display name
    DetailPrint "Setting service display name..."
    ExecWait "sc.exe config $\"${SERVICE_NAME}$\" displayname= $\"${APP_NAME}$\"" $1
    DetailPrint "Exit code $1"

    # Set service description
    DetailPrint "Setting service description..."
    ExecWait "sc.exe description $\"${SERVICE_NAME}$\" $\"${SERVICE_DESCRIPTION}$\"" $1
    DetailPrint "Exit code $1"

    # Set service to start automatically
    DetailPrint "Setting service to start automatically..."
    ExecWait "sc.exe config $\"${SERVICE_NAME}$\" start= auto" $1
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

# Check if we should skip signing... this can be set via /D cli arg
!ifndef SKIP_SIGNING
    # Sign the installer and uninstaller
    # Keep in mind that you must append = 0 at !finalize and !uninstfinalize.
    # That will stop running both in parallel.
    !finalize 'java -jar jsign-5.0.jar --storetype DIGICERTONE --storepass "$%SM_API_KEY%|$%SM_CLIENT_CERT_FILE%|$%SM_CLIENT_CERT_PASSWORD%" --alias "$%SM_CERT_ALIAS%" "%1"' = 0
    !uninstfinalize 'java -jar jsign-5.0.jar --storetype DIGICERTONE --storepass "$%SM_API_KEY%|$%SM_CLIENT_CERT_FILE%|$%SM_CLIENT_CERT_PASSWORD%" --alias "$%SM_CERT_ALIAS%" "%1"' = 0
!endif
