// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';                                 
import type { Parameters } from '@medplum/fhirtypes';                                         
                                                                                           
interface ChatMessage {                                                                  
  role: 'user' | 'assistant' | 'system' | 'tool';                                        
  content: string | null;                                                                
  tool_calls?: any[];                                                                    
  tool_call_id?: string;                                                                 
}                                                                                        
                                                                                          
export const SYSTEM_MESSAGE: ChatMessage = {                                             
  role: 'system',                                                                        
  content: `     

You are a **FHIR Request Translator**. 
Your SOLE purpose is to convert a user's healthcare request into a precise FHIR R4 tool call using the \`fhir_request\` function. 
                                                                                          
CRITICAL INSTRUCTIONS (ABSOLUTELY NO EXCEPTIONS):                                        
1.  **YOUR ONLY OUTPUT** must be a call to the \`fhir_request\` tool or a suggestion for 
the user if tool call is not possible.                                                   
2.  **NEVER** generate text, explanations, narratives, or reasoning before, during, or   
after the tool call.                                                                     
3.  **NEVER** attempt to execute the FHIR request yourself or provide a mock response.   
The result will be provided to you by the user's environment after the tool call.        
                                                                                          
CRITICAL INSTRUCTIONS:                                                                   
- You MUST use the fhir_request tool for ALL data operations (search, read, create,      
update, delete)                                                                          
- You CANNOT execute FHIR requests yourself - you can ONLY call the fhir_request tool    
- Do NOT narrate what you're doing - just call the tool immediately                      
- Do NOT explain your reasoning before calling the tool                                  
- Call the tool first, then wait for the result before responding to the user            
                                                                                          
VISUALIZATION FLAG:                                                                      
Set visualize: true when the user's request would benefit from a visual chart or graph:  
- Growth charts, weight/height over time                                                 
- Lab results trends (e.g., "graph my A1C levels")                                       
- Vital signs over time (blood pressure, heart rate trends)                              
- Medication timelines                                                                   
- Any request using words like: chart, graph, plot, visualize, trend, timeline, over time
                                                                                          
Set visualize: false (or omit) for:                                                      
- Simple lookups ("find patient John")                                                   
- Single data points ("what's my latest blood pressure")                                 
- Lists without temporal context ("show all medications")                                
- Creating or updating resources                                                         
                                                                                          
FHIR BASICS:                                                                             
FHIR (Fast Healthcare Interoperability Resources) is a standard for healthcare data      
exchange. Key concepts:                                                                  
- Resources: Structured data types like Patient, Observation, Medication                 
- References: Links between resources (e.g., Patient/123)                                
- Search: Query resources using parameters                                               
                                                                                          
SEARCH EXAMPLES:                                                                         
- Patient?name=John                                                                      
- Patient/abc-123                                                                        
- Observation?subject=Patient/123                                                        
- Task?patient=Patient/123                                                               
Use FHIR R4 syntax for all searches.                                                     
                                                                                          
COMMON TASKS:                                                                            
- "Find patient John" → Call fhir_request with GET Patient?name=John                     
- "Show patient details" → Call fhir_request with GET Patient/{id}                       
- "Create a task" → Call fhir_request with POST Task with body containing the Task       
resource                                                                                 
- "Find all observations for patient X" → Call fhir_request with GET                     
Observation?subject=Patient/{id}                                                         
- "Update patient X" → First GET Patient/{id}, then call fhir_request with PUT           
Patient/{id} with the full resource                                                      
- "Show growth chart for patient" → Call fhir_request with GET                           
Observation?subject=Patient/{id}&code=body-height,body-weight AND set visualize: true    
                                                                                          
UPDATE WORKFLOW (CRITICAL):                                                              
When the user asks to update a resource:                                                 
1. First, CHECK CONTEXT for the resource to be updated.                                  
2. If the resource is in context, immediately generate a PUT request with the modified   
resource body.                                                                           
3. If the resource is NOT in context, first call fhir_request with GET to fetch the      
current resource.                                                                        
Always maintain conversation context and reference previous searches or data when        
relevant.`,                                                                              
};                                                                                       
                                                                                          
const FHIR_TOOLS = [                                                                     
  {                                                                                      
    type: 'function',                                                                    
    function: {                                                                          
      name: 'fhir_request',                                                              
      description:                                                                       
        'REQUIRED for all FHIR operations. Make a FHIR request to the Medplum server. You MUST use this tool - you cannot execute FHIR requests yourself. For updates: first GET the resource, then PUT with the modified full resource.',                                
      parameters: {                                                                      
        type: 'object',                                                                  
        properties: {                                                                    
          method: {                                                                      
            type: 'string',                                                              
            enum: ['GET', 'POST', 'PUT', 'DELETE'],                                      
            description:                                                                 
              'HTTP method: GET for search/read, POST for create, PUT for update (requires full resource), DELETE for remove',                                            
          },                                                                             
          path: {                                                                        
            type: 'string',                                                              
            description: 'FHIR resource path, e.g., "Patient/123" or "Patient?name=John"',                                                                    
          },                                                                             
          body: {                                                                        
            type: 'object',                                                              
            description:                                                                 
              'Request body. For PUT: complete FHIR resource with all fields. For POST: full FHIR resource to create. Not used for GET/DELETE.',                                 
          },                                                                             
          visualize: {                                                                   
            type: 'boolean',                                                             
            description:                                                                 
              'Set to true if the results should be displayed as a chart/graph (e.g., growth charts, lab trends, vitals over time). Default is false.',                        
          },                                                                             
        },                                                                               
        required: ['method', 'path'],                                                    
        additionalProperties: false,                                                     
      },                                                                                 
    },                                                                                   
  },                                                                                     
];                                                                                       
                                                                                          
export async function handler(medplum: MedplumClient, event: BotEvent<Parameters>):      
Promise<Parameters> {                                                                    
  if (!event.secrets['OPENAI_API_KEY']?.valueString) {                                   
    throw new Error('OPENAI_API_KEY is required in project secrets');                    
  }                                                                                      
                                                                                          
  const apiKey = event.secrets['OPENAI_API_KEY'].valueString;                            
  const input = event.input;                                                             
                                                                                          
  const messagesParam = input.parameter?.find((p) => p.name === 'messages');             
  const modelParam = input.parameter?.find((p) => p.name === 'model');                   
                                                                                          
  if (!messagesParam?.valueString) {                                                     
    throw new Error('messages parameter is required');                                   
  }                                                                                      
                                                                                          
  const userMessages: ChatMessage[] = JSON.parse(messagesParam.valueString);             
  const model = modelParam?.valueString || 'gpt-4';                                      
                                                                                          
  const messages = [SYSTEM_MESSAGE, ...userMessages];                                    
                                                                                          
  const normalizedMessages = messages.map((msg) => {                                     
    if (msg.tool_calls && Array.isArray(msg.tool_calls)) {                               
      return {                                                                           
        ...msg,                                                                          
        tool_calls: msg.tool_calls.map((toolCall) => ({                                  
          ...toolCall,                                                                   
          function: {                                                                    
            ...toolCall.function,                                                        
            arguments:                                                                   
              typeof toolCall.function.arguments === 'string'                            
                ? toolCall.function.arguments                                            
                : JSON.stringify(toolCall.function.arguments),                           
          },                                                                             
        })),                                                                             
      };                                                                                 
    }                                                                                    
    return msg;                                                                          
  });                                                                                    
                                                                                          
  const aiParameters: Parameters = {                                                     
    resourceType: 'Parameters',                                                          
    parameter: [                                                                         
      {                                                                                  
        name: 'messages',                                                                
        valueString: JSON.stringify(normalizedMessages),                                 
      },                                                                                 
      {                                                                                  
        name: 'apiKey',                                                                  
        valueString: apiKey,                                                             
      },                                                                                 
      {                                                                                  
        name: 'model',                                                                   
        valueString: model,                                                              
      },                                                                                 
      {                                                                                  
        name: 'tools',                                                                   
        valueString: JSON.stringify(FHIR_TOOLS),                                         
      },                                                                                 
      {                                                                                  
        name: 'temperature',                                                             
        valueString: '0.3',                                                              
      },                                                                                 
    ],                                                                                   
  };                                                                                     
                                                                                          
  const response = await medplum.post(medplum.fhirUrl('$ai'), aiParameters);                                                                              
                                                                                          
  // Extract visualize flag from tool calls if present                                   
  const toolCallsParam = response.parameter?.find((p: { name: string }) => p.name === 'tool_calls');       
  let visualize = false;                                                                 
                                                                                          
  if (toolCallsParam?.valueString) {                                                     
    try {                                                                                
      const toolCalls = JSON.parse(toolCallsParam.valueString);                          
      for (const toolCall of toolCalls) {                                                
        if (toolCall.function?.name === 'fhir_request') {                                
          const args =                                                                   
            typeof toolCall.function.arguments === 'string'                              
              ? JSON.parse(toolCall.function.arguments)                                  
              : toolCall.function.arguments;                                             
          if (args.visualize === true) {                                                 
            visualize = true;                                                            
            break;                                                                       
          }                                                                              
        }                                                                                
      }                                                                                  
    } catch {                                                                            
      // Ignore parse errors                                                             
    }                                                                                    
  }                                                                                      
                                                                                          
  // Add visualize parameter to response                                                 
  return {                                                                               
    ...response,                                                                         
    parameter: [...(response.parameter || []), { name: 'visualize', valueBoolean:        
visualize }],                                                                            
  };                                                                                     
}                                                                                        
        