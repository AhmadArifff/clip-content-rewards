import { Router } from 'express';
import { calendarController } from '../controllers/calendar.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

export const calendarRouter = Router();

calendarRouter.use(requireAuth);
calendarRouter.get('/calendar', calendarController.overview);
calendarRouter.post('/calendar/auto-schedule', calendarController.autoSchedule);
calendarRouter.patch('/clips/:clipId/schedule', calendarController.updateSchedule);
calendarRouter.get('/export/calendar.xlsx', calendarController.exportExcel);
