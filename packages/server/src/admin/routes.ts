import { Router } from 'express';
import { projectAdminRouter } from './project';
import { superAdminRouter } from './super';

export const adminRouter = Router();
adminRouter.use('/projects/', projectAdminRouter);
adminRouter.use('/super/', superAdminRouter);
