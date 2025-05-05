# Medplum Agent Installer Builder
# For use with NSIS 3.0+
# See: https://nsis.sourceforge.io/

!define COMPANY_NAME             "Medplum"
!define APP_NAME                 "Medplum Agent"
!define BASE_SERVICE_NAME        "MedplumAgent"
!define SERVICE_NAME             "${BASE_SERVICE_NAME}_$%MEDPLUM_VERSION%"
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
!include "StrFunc.nsh"

# Init StrStr fn
${StrStr}

RequestExecutionLevel admin

; Trim
;   Removes leading & trailing whitespace from a string
; Usage:
;   Push 
;   Call Trim
;   Pop 
Function Trim
	Exch $R1 ; Original string
	Push $R2
 
Loop:
	StrCpy $R2 "$R1" 1
	StrCmp "$R2" " " TrimLeft
	StrCmp "$R2" "$\r" TrimLeft
	StrCmp "$R2" "$\n" TrimLeft
	StrCmp "$R2" "$\t" TrimLeft
	GoTo Loop2
TrimLeft:	
	StrCpy $R1 "$R1" "" 1
	Goto Loop
 
Loop2:
	StrCpy $R2 "$R1" 1 -1
	StrCmp "$R2" " " TrimRight
	StrCmp "$R2" "$\r" TrimRight
	StrCmp "$R2" "$\n" TrimRight
	StrCmp "$R2" "$\t" TrimRight
	GoTo Done
TrimRight:	
	StrCpy $R1 "$R1" -1
	Goto Loop2
 
Done:
	Pop $R2
	Exch $R1
FunctionEnd

; Usage:
; ${Trim} $trimmedString $originalString
 
!define Trim "!insertmacro Trim"
 
!macro Trim ResultVar String
  Push "${String}"
  Call Trim
  Pop "${ResultVar}"
!macroend

Var WelcomeDialog
Var WelcomeLabel
Var alreadyInstalled
Var foundPropertiesFile
Var baseUrl
Var clientId
Var clientSecret
Var agentId

# Vars for Section StopAndDeleteOldMedplumServices
Var ServicesList
Var ProcessedList
Var CurrentLine
Var WorkingList
Var TempStr
Var PrefixPos
Var LineLen
Var TempLen
Var CurrentLen
Var CurrentServiceName

# The onInit handler is called when the installer is nearly finished initializing.
# See: https://nsis.sourceforge.io/Reference/.onInit
Function .onInit
    ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\${BASE_SERVICE_NAME}" "DisplayName"
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
    # Copy the new files to the installation directory
    SetOverwrite ifdiff
    File dist\shawl-v1.5.0-legal.txt
    File dist\shawl-v1.5.0-win64.exe
    File dist\${SERVICE_FILE_NAME}
    File README.md
    SetOverwrite on

    # Create the service
    DetailPrint "Creating service..."
    ExecWait "shawl-v1.5.0-win64.exe add --name $\"${SERVICE_NAME}$\" --log-as $\"${SERVICE_NAME}$\" --cwd $\"$INSTDIR$\" -- $\"$INSTDIR\${SERVICE_FILE_NAME}$\"" $1
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

    # Set service to restart on failure
    DetailPrint "Setting service to restart on failure..."
    ExecWait "sc.exe failure $\"${SERVICE_NAME}$\" reset= 0 actions= restart/0/restart/0/restart/0"
    DetailPrint "Exit code $1"

    # Check if there is an upgrade manifest already, if not, add one without a callback
    # This is to activate the "maybeFinalizeUpgrade" path in the agent, which will make sure we delete the upgrade manifest
    # Which we use as a signal to continue after the agent has either bound or started its loop to attempt to bind to all the server ports
    ${If} ${FileExists} "$INSTDIR\upgrade.json"
        DetailPrint "upgrade.json already exists, skipping creation"
    ${Else}
        DetailPrint "Creating upgrade.json file"
        # Create the file with JSON content
        FileOpen $1 "$INSTDIR\upgrade.json" w
        FileWrite $1 '{ "previousVersion": "UNKNOWN", "targetVersion": "$%MEDPLUM_VERSION%", "callback": null }'
        FileClose $1
    ${EndIf}

    # Start the service
    DetailPrint "Starting service..."
    ExecWait "sc.exe start $\"${SERVICE_NAME}$\"" $1
    DetailPrint "Exit code $1"

    # Check if service attempting to bind to ports
    # The agent should be attempting to bind to the ports, or already bound to ports if old service not running
    ${Do}
        ${If} ${FileExists} "$INSTDIR\upgrade.json"
            DetailPrint "Waiting for upgrade.json to be removed..."
            Sleep 500
        ${Else}
            DetailPrint "upgrade.json removed, continuing..."
            ${Break}
        ${EndIf}
    ${Loop}

    ; # TODO: Stop all running MedplumAgent services that are not the new service and delete them
    ; DetailPrint "Stopping and deleting all old MedplumAgent services..."
    ; # Get a list of services, pipe to findstr to find MedplumAgent services
    ; # Use net stop to gracefully stop each service, then delete it
    ; # We use net stop specifically because it waits for the service to gracefully stop before returning
    ; ; ExecWait 'cmd.exe /c "for /f "tokens=2 delims=: " %s in (''sc query state^= all ^| findstr /i "SERVICE_NAME.*MedplumAgent"'') do (if not "%s"=="${SERVICE_NAME}" (echo Stopping and deleting service: %s & net stop %s && sc delete %s))"' $1
    ; DetailPrint "Exit code $1"
    DetailPrint "Stopping and deleting old Medplum Agent service..."
    Call StopAndDeleteOldMedplumServices

FunctionEnd

Function StopAndDeleteOldMedplumServices
    # Get list of services - simplified command without filtering
    nsExec::ExecToStack 'cmd.exe -c "sc query type= service state= all | findstr /i \"SERVICE_NAME.MedplumAgent\" | findstr /v /i \"SERVICE_NAME.${SERVICE_NAME}\""'
    Pop $0 # Return value
    Pop $ServicesList # Command output

    DetailPrint "Raw services output: $ServicesList"
    
    # Create empty list for processed service names
    StrCpy $ProcessedList ""
    StrCpy $CurrentLine ""
    StrCpy $WorkingList "$ServicesList"
    
    # Process the output line by line to remove SERVICE_NAME: prefix
    ${Do}
        # If no more text to process, exit loop
        ${If} $WorkingList == ""
            ${Break}
        ${EndIf}

        # Find position of next line break
        ${StrStr} $TempStr "$WorkingList" "$\r$\n"

        # If no more line breaks, process remaining text as the last line
        ${If} $TempStr == ""
            StrCpy $CurrentLine "$WorkingList"
            StrCpy $WorkingList "" # Clear remaining text to exit after this iteration
        ${Else}
            # Extract current line (up to line break)
            StrLen $LineLen "$WorkingList"
            StrLen $TempLen "$TempStr"
            IntOp $CurrentLen $LineLen - $TempLen
            StrCpy $CurrentLine "$WorkingList" $CurrentLen
            
            # Remove processed line from working list
            StrCpy $WorkingList "$TempStr" "" 2 # Skip the \r\n
        ${EndIf}

        # Skip empty lines
        ${If} $CurrentLine == ""
            ${Continue}
        ${EndIf}

        # Remove SERVICE_NAME: prefix if present
        ${StrStr} $PrefixPos "$CurrentLine" "SERVICE_NAME:"
        ${If} $PrefixPos != ""
            StrCpy $CurrentLine "$CurrentLine" "" 12 # Skip "SERVICE_NAME:"
        ${EndIf}

        # Trim any leading/trailing spaces
        ${Trim} $CurrentLine $CurrentLine

        # Add to processed list if not empty
        ${If} $CurrentLine != ""
            ${If} $ProcessedList == ""
                StrCpy $ProcessedList "$CurrentLine"
            ${Else}
                StrCpy $ProcessedList "$ProcessedList$\r$\n$CurrentLine"
            ${EndIf}
        ${EndIf}
    ${Loop}

    DetailPrint "Processed services: $ProcessedList"
    StrCpy $WorkingList "$ProcessedList"

    # Process each service in the filtered list
    ${Do}
        # If no more services to process, exit loop
        ${If} $WorkingList == ""
            DetailPrint "Finished cleaning up all old Medplum services"
            ${Break}
        ${EndIf}

        # Find position of next line break
        ${StrStr} $TempStr "$WorkingList" "$\r$\n"

        # If no more line breaks, process remaining text as the last service
        ${If} $TempStr == ""
            StrCpy $CurrentServiceName "$WorkingList"
            StrCpy $WorkingList "" # Clear remaining list to exit after this iteration
        ${Else}
            # Extract current service name
            StrLen $LineLen "$WorkingList"
            StrLen $TempLen "$TempStr"
            IntOp $CurrentLen $LineLen - $TempLen
            StrCpy $CurrentServiceName "$WorkingList" $CurrentLen
            
            # Remove processed service from working list
            StrCpy $WorkingList "$TempStr" "" 2 # Skip the \r\n
        ${EndIf}

        # Skip empty service names
        ${If} $CurrentServiceName == ""
            ${Continue}
        ${EndIf}

        # Stop the service
        DetailPrint "Stopping service: $CurrentServiceName"
        nsExec::ExecToStack 'net stop "$CurrentServiceName"'
        Pop $0 # Return value
        Pop $1 # Output
        DetailPrint "Stop result: $0"

        # Delete the service
        DetailPrint "Deleting service: $CurrentServiceName"
        nsExec::ExecToStack 'sc delete "$CurrentServiceName"'
        Pop $0 # Return value
        Pop $1 # Output
        DetailPrint "Delete result: $0"
    ${Loop}
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
    File dist\shawl-v1.5.0-legal.txt
    File dist\shawl-v1.5.0-win64.exe
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
    ExecWait "shawl-v1.5.0-win64.exe add --name $\"${SERVICE_NAME}$\" --log-as $\"${SERVICE_NAME}$\" --cwd $\"$INSTDIR$\" -- $\"$INSTDIR\${SERVICE_FILE_NAME}$\"" $1
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

    # Set service to restart on failure
    DetailPrint "Setting service to restart on failure..."
    ExecWait "sc.exe failure $\"${SERVICE_NAME}$\" reset= 0 actions= restart/0/restart/0/restart/0"
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
    WriteRegStr HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\${BASE_SERVICE_NAME}" "DisplayName" "${APP_NAME}"
    WriteRegStr HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\${BASE_SERVICE_NAME}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
    WriteRegStr HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\${BASE_SERVICE_NAME}" "QuietUninstallString" "$\"$INSTDIR\uninstall.exe$\" /S"
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
    DeleteRegKey HKLM "SYSTEM\CurrentControlSet\Services\${BASE_SERVICE_NAME}"
    DeleteRegKey HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\${BASE_SERVICE_NAME}"

SectionEnd

# Check if we should skip signing... this can be set via /D cli arg
!ifndef SKIP_SIGNING
    # Sign the installer and uninstaller
    # Keep in mind that you must append = 0 at !finalize and !uninstfinalize.
    # That will stop running both in parallel.
    !finalize 'java -jar jsign-5.0.jar --storetype DIGICERTONE --storepass "$%SM_API_KEY%|$%SM_CLIENT_CERT_FILE%|$%SM_CLIENT_CERT_PASSWORD%" --alias "$%SM_CERT_ALIAS%" "%1"' = 0
    !uninstfinalize 'java -jar jsign-5.0.jar --storetype DIGICERTONE --storepass "$%SM_API_KEY%|$%SM_CLIENT_CERT_FILE%|$%SM_CLIENT_CERT_PASSWORD%" --alias "$%SM_CERT_ALIAS%" "%1"' = 0
!endif
