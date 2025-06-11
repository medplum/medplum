import { WebSiteManagementClient, FunctionEnvelope, StringDictionary } from '@azure/arm-appservice';
import { DefaultAzureCredential, DefaultAzureCredentialOptions, AzureAuthorityHosts } from '@azure/identity';
import { Hl7Message, ContentType, MedplumClient, normalizeErrorString, sleep } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import axios, { AxiosRequestConfig, AxiosError } from 'axios';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getConfig } from '../../config/loader';
import { getLogger } from '../../logger';

interface AzureDeployConfig {
  botAzureSubscriptionId: string;
  botAzureResourceGroup: string;
  botAzureFunctionName: string; 
  fontDirectoryPath?: string;
}


const DEFAULT_HOST_JSON = `{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": true,
        "excludedTypes": "Request"
      }
    },
    "logLevel": {
       "default": "Information",
       "Host.Results": "Information",
       "Function": "Information",
       "Host.Aggregator": "Information"
    }
  },
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)" 
  },
  "functionTimeout": "00:10:00" 
}`;

const DEFAULT_PACKAGE_JSON = `{
  "name": "medplum-bots-function-app",
  "version": "1.0.0",
  "description": "Azure Function App hosting Medplum bots (requires dependencies)",
  "main": "index.js",
  "scripts": {
    "start": "func start",
    "test": "echo \\"Error: no test specified\\" && exit 1"
  },
  "dependencies": {
    "@medplum/core": "^3.0.17",
    "node-fetch": "^2.7.0",
    "pdfmake": "^0.2.10"
  },
  "devDependencies": {},
  "author": "",
  "license": "ISC"
}`;


export const AZURE_NODE_RUNTIME_TARGET = 'node20';

const AZURE_WRAPPER_CODE_TEMPLATE = (fontBasePathForRuntime: string) => `
const { Hl7Message, ContentType, MedplumClient } = require("@medplum/core");
const fetch = require("node-fetch");
const PdfPrinter = require("pdfmake");
const path = require('path'); 
const userCode = require("./user.js");

module.exports = async function (context, request) { 
  context.log(\`[\${context.executionContext.functionName}] HTTP trigger function processed a request.\`);
  let event;
  try {
    event = request.body; 
    if (typeof request.body === 'string' && request.headers['content-type']?.includes('application/json')) {
        event = JSON.parse(request.body);
    }
  } catch (parseError) {
    context.log.error(\`[\${context.executionContext.functionName}] Failed to parse request body:\`, parseError);
    context.res = { status: 400, body: "Invalid JSON request body." }; return;
  }
  const { bot, baseUrl, accessToken, contentType, secrets, traceId, headers } = event;
  if (!bot || !baseUrl || !accessToken || !traceId) {
      const missing = ['bot', 'baseUrl', 'accessToken', 'traceId'].filter(k => !event[k]).join(', ');
      context.log.error(\`[\${context.executionContext.functionName}] Missing required event properties: \${missing}\`);
      context.res = { status: 400, body: \`Missing required event properties: \${missing}\` }; return;
  }
  const medplum = new MedplumClient({ baseUrl, fetch: function(url, options = {}) { options.headers ||= {}; options.headers['X-Trace-Id'] = traceId; options.headers['traceparent'] = headers?.['traceparent'] || traceId; return fetch(url, options); }, createPdf });
  medplum.setAccessToken(accessToken);
  try {
    let input = event.input;
    if (contentType === ContentType.HL7_V2 && typeof input === 'string') { input = Hl7Message.parse(input); }
    let result;
    if (typeof userCode.handler === 'function') { result = await userCode.handler(medplum, { bot, input, contentType, secrets, traceId, headers }); }
    else if (typeof userCode === 'function') { result = await userCode(medplum, { bot, input, contentType, secrets, traceId, headers }); }
    else { throw new Error('User code does not export a handler function.'); }
    if (contentType === ContentType.HL7_V2 && result instanceof Hl7Message) { result = result.toString(); }
    context.res = { status: 200, body: { success: true, returnValue: result, logs: context.invocationId }, headers: { 'Content-Type': 'application/json' } };
  } catch (err) {
    let errorMessage = "Unknown error"; if (err instanceof Error) { errorMessage = err.message; context.log.error(\`[\${context.executionContext.functionName}] Unhandled error: \${errorMessage}\\n\${err.stack || ''}\`); }
    else { errorMessage = JSON.stringify(err, undefined, 2); context.log.error(\`[\${context.executionContext.functionName}] Unhandled error object: \${errorMessage}\`); }
    context.res = { status: 500, body: { success: false, logResult: \`Function execution failed: \${errorMessage}\`, returnValue: undefined }, headers: { 'Content-Type': 'application/json' } };
  }
}
function createPdf(docDefinition, tableLayouts, fonts) {
  const runtimeFontBasePath = '${fontBasePathForRuntime}'; 
  if (!fonts) {
    fonts = { Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
      Roboto: { normal: path.join(runtimeFontBasePath, 'Roboto/Roboto-Regular.ttf'), bold: path.join(runtimeFontBasePath, 'Roboto/Roboto-Medium.ttf'), italics: path.join(runtimeFontBasePath, 'Roboto/Roboto-Italic.ttf'), bolditalics: path.join(runtimeFontBasePath, 'Roboto/Roboto-MediumItalic.ttf') },
      Avenir: { normal: path.join(runtimeFontBasePath, 'Avenir/Avenir.ttf') } };
  }
  return new Promise((resolve, reject) => {
    try { const printer = new PdfPrinter(fonts); const pdfDoc = printer.createPdfKitDocument(docDefinition, { tableLayouts }); const chunks = []; pdfDoc.on('data', (chunk) => chunks.push(chunk)); pdfDoc.on('end', () => resolve(Buffer.concat(chunks))); pdfDoc.on('error', (pdfError) => { console.error("PDF Error:", pdfError); reject(pdfError); }); pdfDoc.end(); }
    catch (pdfSetupError) { console.error("PDF Setup Error:", pdfSetupError); reject(pdfSetupError); }
  });
}`;

function getAzureFunctionName(bot: Bot): string {
  const prefix = 'medplum-bot-handler-';
  const botIdSanitized = bot.id?.replace(/[^a-zA-Z0-9-]/g, '-') || 'unknown';
  let name = prefix + botIdSanitized;
  if (name.length > 55) { name = name.substring(0, 55); }
  if (name.endsWith('-')) { name = name.substring(0, name.length - 1); }
  return name;
}

async function createAzureFunctionClient(config: AzureDeployConfig): Promise<WebSiteManagementClient> {
  const credential = new DefaultAzureCredential();
  return new WebSiteManagementClient(credential, config.botAzureSubscriptionId);
}

async function prepareFunctionFiles(
    userCodeStr: string,
    azureWrapperCodeStr: string,
    fontSourceDir?: string
): Promise<Record<string, string>> {
  const log = getLogger();
  const filesToDeploy: Record<string, string> = {};
  filesToDeploy['index.js'] = azureWrapperCodeStr;
  filesToDeploy['user.js'] = userCodeStr;
  if (fontSourceDir) {
    log.info(`Preparing font files from ${fontSourceDir}...`);
    const tempFontDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'medplum-fonts-'));
    try {
      const copyRecursive = async (src: string, destRelativeBase: string, baseDestDir: string) => {
        const entries = await fs.promises.readdir(src, { withFileTypes: true });
        for (let entry of entries) {
          const srcPath = path.join(src, entry.name);
          const destRelativePath = path.join(destRelativeBase, entry.name); 
          const actualDestPath = path.join(baseDestDir, destRelativePath); 
          if (entry.isDirectory()) {
            await fs.promises.mkdir(actualDestPath, { recursive: true });
            await copyRecursive(srcPath, destRelativePath, baseDestDir);
          } else {
            await fs.promises.copyFile(srcPath, actualDestPath);
            try { filesToDeploy[destRelativePath.replace(/\\/g, '/')] = await fs.promises.readFile(actualDestPath, 'utf-8'); }
            catch (readError) { log.warn(`Could not read font file ${actualDestPath} as utf-8. File might be binary.`, readError); }
          }
        }
      };
      await fs.promises.mkdir(path.join(tempFontDir, 'fonts'), {recursive: true}); 
      await copyRecursive(fontSourceDir, 'fonts', tempFontDir); 
      log.info(`Font files prepared for attempt: ${Object.keys(filesToDeploy).filter(k => k.startsWith('fonts/')).length}`);
    } catch (fontError) {
      log.error(`Failed to prepare font files from ${fontSourceDir}:`, fontError);
      log.warn('Proceeding without these font files due to error.');
    } finally {
        try { await fs.promises.rm(tempFontDir, {recursive: true, force: true}); }
        catch (cleanupError) { log.warn(`Failed to clean up temp font directory ${tempFontDir}:`, cleanupError); }
    }
  }
  return filesToDeploy;
}

function createFunctionJson(scriptFilePath: string = 'index.js'): object {
  return {
    bindings: [ { authLevel: 'function', type: 'httpTrigger', direction: 'in', name: 'request', methods: ['post'] },
               { type: 'http', direction: 'out', name: 'res' } ],
    scriptFile: scriptFilePath,
  };
}


interface KuduAuth {
    baseUrl: string;
    headers: Record<string, string>;
}

async function getKuduApiAuth(config: AzureDeployConfig): Promise<KuduAuth> {
    const log = getLogger();
    const appName = config.botAzureFunctionName;
    const scmDomain = process.env.WEBSITE_APPSERVICEAPPLOGS_SCM_DOMAIN || `${appName}.scm.azurewebsites.net`;
    const kuduBaseUrl = `https://${scmDomain}/api/`;

    const credentialOptions: DefaultAzureCredentialOptions = {};
    const credential = new DefaultAzureCredential(credentialOptions);
    
    const scope = 'https://management.azure.com/.default'; 
    log.info(`Attempting to get Azure AD token for Kudu API with scope: ${scope}`);
    try {
        const tokenResponse = await credential.getToken(scope);
        if (!tokenResponse?.token) {
            throw new Error('Azure AD token response was empty when trying to authenticate with Kudu.');
        }
        log.info('Successfully obtained Azure AD token for Kudu API.');
        return {
            baseUrl: kuduBaseUrl,
            headers: {
                'Authorization': `Bearer ${tokenResponse.token}`,
                'If-Match': '*' 
            }
        };
    } catch (tokenError) {
        log.error('Failed to get Azure AD token for Kudu API:', tokenError);
        throw new Error(`Failed to obtain Azure AD token for Kudu API. Ensure DefaultAzureCredential has permissions. Error: ${normalizeErrorString(tokenError)}`);
    }
}

async function ensureDirectoryViaKudu(dirPath: string, kuduAuth: KuduAuth): Promise<void> {
    const log = getLogger();
    const fullDirPath = kuduAuth.baseUrl + 'vfs/' + (dirPath.endsWith('/') ? dirPath : dirPath + '/');
    log.info(`Ensuring directory exists via Kudu VFS: ${fullDirPath}`);

    try {
        const putConfig: AxiosRequestConfig = {
            headers: { ...kuduAuth.headers } 
        };
        delete putConfig.headers?.['If-Match']; 

        await axios.put(fullDirPath, null, putConfig); 
        log.info(`Successfully ensured directory '${dirPath}' exists or was created.`);
    } catch (error) {
        const axiosError = error as AxiosError;
        if (axiosError.response && (axiosError.response.status === 409 || axiosError.response.status === 200 || axiosError.response.status === 201)) {
            log.info(`Directory '${dirPath}' likely already exists or creation was successful (status: ${axiosError.response.status}).`);
        } else {
            log.error(`Error ensuring directory '${dirPath}' via Kudu:`, error);
            if (axiosError.response) {
                log.error(`Kudu PUT (directory) error response: Status ${axiosError.response.status}, Data: ${JSON.stringify(axiosError.response.data)}`);
            }
            throw new Error(`Failed to ensure directory '${dirPath}' via Kudu: ${normalizeErrorString(error)}`);
        }
    }
}

async function checkAndUploadFileViaKudu(
    relativePath: string, 
    defaultContent: string,
    kuduAuth: KuduAuth
): Promise<void> {
    const log = getLogger();
    const filePath = kuduAuth.baseUrl + 'vfs/' + relativePath; 
    log.info(`Checking for file via Kudu VFS: ${filePath}`);

    const getHeaders = { ...kuduAuth.headers };
    delete getHeaders['If-Match']; 

    const axiosGetConfig: AxiosRequestConfig = {
        headers: getHeaders, 
        validateStatus: (status) => status < 500 
    };

    let fileExists = false;
    try {
        const response = await axios.get(filePath, axiosGetConfig);
        if (response.status === 200) {
            log.info(`File '${relativePath}' already exists.`);
            fileExists = true;
        } else if (response.status === 404) {
            log.info(`File '${relativePath}' does not exist.`);
            fileExists = false;
        } else {
            log.warn(`Unexpected status ${response.status} when checking for file '${relativePath}'. Data: ${JSON.stringify(response.data)}`);
        }
    } catch (error) {
        log.error(`Error checking file '${relativePath}' via Kudu:`, error);
        throw new Error(`Failed to check for file '${relativePath}' via Kudu: ${normalizeErrorString(error)}`);
    }

    if (!fileExists) {
        log.info(`Uploading default content for '${relativePath}'...`);
        try {
            const putHeaders: Record<string, string> = { ...kuduAuth.headers }; 
            
            if (relativePath.endsWith('.json')) {
                putHeaders['Content-Type'] = 'application/json';
            } else {
                putHeaders['Content-Type'] = 'application/octet-stream'; 
            }

            const putConfig: AxiosRequestConfig = { headers: putHeaders };
            
            await axios.put(filePath, defaultContent, putConfig);
            log.info(`Successfully uploaded default '${relativePath}'.`);
        } catch (error) {
            log.error(`Error uploading default file '${relativePath}' via Kudu:`, error);
            const axiosError = error as AxiosError;
            if (axiosError.response) {
                log.error(`Kudu PUT error response: Status ${axiosError.response.status}, Data: ${JSON.stringify(axiosError.response.data)}`);
            }
            throw new Error(`Failed to upload default file '${relativePath}' via Kudu: ${normalizeErrorString(error)}`);
        }
    }
}

async function listWwwrootDirViaKudu(kuduAuth: KuduAuth): Promise<boolean> {
    const log = getLogger();
    const dirToList = 'site/wwwroot/';
    const listPath = kuduAuth.baseUrl + 'vfs/' + dirToList;
    log.info(`Attempting to list directory contents via Kudu VFS: ${listPath}`);

    const getHeaders = { ...kuduAuth.headers };
    delete getHeaders['If-Match']; 

    const axiosGetConfig: AxiosRequestConfig = {
        headers: getHeaders,
        validateStatus: (status) => status < 500 
    };

    try {
        const response = await axios.get(listPath, axiosGetConfig);
        if (response.status === 200) {
            log.info(`Successfully listed '${dirToList}'. Files found:`, response.data);
            return true;
        } else if (response.status === 404) {
            log.warn(`Directory '${dirToList}' not found (404). This might be okay if it's an empty app, or indicates an issue with the path or Kudu access.`);
            return false; 
        } else {
            log.error(`Failed to list '${dirToList}'. Status: ${response.status}, Data: ${JSON.stringify(response.data)}`);
            return false;
        }
    } catch (error) {
        log.error(`Error listing directory '${dirToList}' via Kudu:`, error);
        return false;
    }
}


async function ensureAppInitialized(
    config: AzureDeployConfig
): Promise<void> {
    const log = getLogger();
    log.info(`Ensuring Function App '${config.botAzureFunctionName}' is initialized (directories, host.json, package.json)...`);
    try {
        const kuduAuth = await getKuduApiAuth(config); 

        const wwwrootAccessible = await listWwwrootDirViaKudu(kuduAuth);
        if (!wwwrootAccessible) {
            log.warn(`Could not successfully list or access site/wwwroot/. Attempting to create directories anyway.`);
        }

        await ensureDirectoryViaKudu('site/', kuduAuth); 
        await ensureDirectoryViaKudu('site/wwwroot/', kuduAuth); 

        await checkAndUploadFileViaKudu('site/wwwroot/host.json', DEFAULT_HOST_JSON, kuduAuth);
        await checkAndUploadFileViaKudu('site/wwwroot/package.json', DEFAULT_PACKAGE_JSON, kuduAuth);

        log.info(`Function App initialization check complete for '${config.botAzureFunctionName}'.`);
    } catch (error) {
        log.error(`Failed to ensure Function App initialization for '${config.botAzureFunctionName}':`, error);
        throw error; 
    }
}

// --- Main Deployment Function ---
export async function deployAzureFunction(bot: Bot, userCodeStr: string): Promise<void> {
  const log = getLogger();
  const config = getConfig() as AzureDeployConfig;

  if (!config.botAzureSubscriptionId || !config.botAzureResourceGroup || !config.botAzureFunctionName) {
     log.error('Azure configuration missing: botAzureSubscriptionId, botAzureResourceGroup, or botAzureFunctionName.');
     throw new Error('Azure configuration (botAzureSubscriptionId, botAzureResourceGroup, botAzureFunctionName) is missing.');
  }

  const client = await createAzureFunctionClient(config); 
  const functionName = getAzureFunctionName(bot);

  log.info(`Starting deployment for Azure function: ${functionName}`, {
      botId: bot.id,
      appName: config.botAzureFunctionName,
      resourceGroup: config.botAzureResourceGroup,
  });

  try {
    await ensureAppInitialized(config); 

    const runtimeFontBasePath = config.fontDirectoryPath ? './fonts' : './'; 
    const azureWrapperCodeStr = AZURE_WRAPPER_CODE_TEMPLATE(runtimeFontBasePath);

    const filesToDeploy = await prepareFunctionFiles(
        userCodeStr,
        azureWrapperCodeStr,
        config.fontDirectoryPath 
    );

    const functionJsonConfig = createFunctionJson('index.js');

    const functionEnvelope: FunctionEnvelope = {
      config: functionJsonConfig,
      files: filesToDeploy, 
    };

    log.info(`Attempting to create or update function '${functionName}' in app '${config.botAzureFunctionName}'...`);
    log.debug(`Files to deploy for ${functionName}:`, Object.keys(filesToDeploy));

    const poller = await client.webApps.beginCreateFunction(
      config.botAzureResourceGroup,
      config.botAzureFunctionName,
      functionName,
      functionEnvelope
    );

    const result = await poller.pollUntilDone();

    log.info(`Azure function '${functionName}' deployment completed successfully.`, {
        functionId: result?.id,
        status: result?.properties?.isDisabled ? 'Disabled' : 'Enabled'
    });

    try {
      log.info(`Syncing function triggers for app ${config.botAzureFunctionName}...`);
      await client.webApps.syncFunctionTriggers(config.botAzureResourceGroup, config.botAzureFunctionName);
      log.info('Trigger sync complete.');
    } catch (syncError) {
      log.warn(`Failed to sync function triggers for app ${config.botAzureFunctionName}:`, syncError);
    }

  } catch (error) {
    log.error(`Failed to deploy Azure function '${functionName}':`, error);
    const azureError = error as any;
    let detailMessage = normalizeErrorString(error);
    if (azureError.code) { detailMessage = `Azure API Error (${azureError.code}): ${detailMessage}`; }
    if (azureError.details) { try { detailMessage += ` | Details: ${JSON.stringify(azureError.details)}`; } catch (_) {} }
    if (azureError.body?.message) { detailMessage += ` | Body Message: ${azureError.body.message}`; }
    log.error(`Deployment Error Details: ${detailMessage}`);
    throw new Error(`Failed to deploy Azure function '${functionName}'. ${detailMessage}`);
  }
}
