import { Router } from 'express';
import { apiKeyController } from '../controllers/api-key.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

export const apiKeyRouter = Router();

apiKeyRouter.use(requireAuth);
apiKeyRouter.get('/', apiKeyController.list);
apiKeyRouter.post('/', apiKeyController.create);
apiKeyRouter.post('/:id/test', apiKeyController.testConnection);
apiKeyRouter.patch('/:id/toggle', apiKeyController.toggle);
apiKeyRouter.delete('/:id', apiKeyController.remove);
