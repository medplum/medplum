/**
 * Tasks API Route
 * 
 * Manages FHIR Task resources for questionnaire assignments.
 * All requests are authenticated via Gateway and scoped to tenant.
 */

import { NextResponse } from 'next/server';
import { verifyGatewayAuth, GatewayAuthError } from '@/lib/gateway';
import { getMedplumClientFromAuth } from '@/lib/medplum';

/**
 * GET /api/tasks
 * 
 * Fetch all tasks for the authenticated tenant.
 * Optionally filter by status.
 */
export async function GET(request: Request) {
  try {
    // 1. Verify auth via Gateway - ALWAYS first
    const auth = await verifyGatewayAuth(request);
    
    // 2. Get tenant-scoped Medplum client
    const medplum = getMedplumClientFromAuth(auth);
    
    // 3. Parse query params
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'requested';
    
    // 4. Fetch tasks - automatically scoped to tenant's Medplum Project
    const tasks = await medplum.searchResources('Task', {
      status,
      _sort: '-_lastUpdated',
      _count: '50',
    });
    
    return NextResponse.json({
      data: tasks,
      meta: {
        tenant_id: auth.tenant_id,
        brand: auth.brand,
        count: tasks.length,
      },
    });
    
  } catch (error) {
    if (error instanceof GatewayAuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 401 }
      );
    }
    
    console.error('[HealthTalk] Tasks API error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks
 * 
 * Create a new task (questionnaire assignment).
 */
export async function POST(request: Request) {
  try {
    // 1. Verify auth via Gateway
    const auth = await verifyGatewayAuth(request);
    
    // 2. Get tenant-scoped Medplum client
    const medplum = getMedplumClientFromAuth(auth);
    
    // 3. Parse request body
    const body = await request.json();
    
    // 4. Validate required fields
    if (!body.patient || !body.questionnaire) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'patient and questionnaire are required' } },
        { status: 400 }
      );
    }
    
    // 5. Create Task resource
    const task = await medplum.createResource({
      resourceType: 'Task',
      status: 'requested',
      intent: 'order',
      code: {
        coding: [{
          system: 'http://healthtalk.ai/task-type',
          code: 'questionnaire-assignment',
          display: 'Questionnaire Assignment',
        }],
      },
      for: {
        reference: `Patient/${body.patient}`,
      },
      focus: {
        reference: `Questionnaire/${body.questionnaire}`,
      },
      authoredOn: new Date().toISOString(),
      requester: {
        reference: `Practitioner/${auth.user_id}`,
      },
      // Store organization context if provided
      ...(auth.organization_id && {
        owner: {
          reference: `Organization/${auth.organization_id}`,
        },
      }),
    });
    
    return NextResponse.json({
      data: task,
      meta: {
        tenant_id: auth.tenant_id,
        brand: auth.brand,
      },
    }, { status: 201 });
    
  } catch (error) {
    if (error instanceof GatewayAuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 401 }
      );
    }
    
    console.error('[HealthTalk] Tasks API error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
