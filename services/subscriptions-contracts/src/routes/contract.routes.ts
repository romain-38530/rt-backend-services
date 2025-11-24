import { Router } from 'express';
import { contractController } from '../controllers/index.js';

const router = Router();

// Contract Templates
router.post('/templates', contractController.createTemplate.bind(contractController));
router.get('/templates', contractController.getAllTemplates.bind(contractController));
router.get('/templates/:id', contractController.getTemplateById.bind(contractController));
router.put('/templates/:id', contractController.updateTemplate.bind(contractController));
router.delete('/templates/:id', contractController.deactivateTemplate.bind(contractController));

// Contracts
router.post('/contracts', contractController.createContract.bind(contractController));
router.get('/contracts/:id', contractController.getContractById.bind(contractController));
router.get('/contracts/user/:userId', contractController.getContractsByUser.bind(contractController));
router.get('/contracts/party/:email', contractController.getContractsByParty.bind(contractController));
router.put('/contracts/:id', contractController.updateContract.bind(contractController));
router.post('/contracts/:id/send', contractController.sendForSignatures.bind(contractController));
router.post('/contracts/:id/cancel', contractController.cancelContract.bind(contractController));

// Signatures
router.get('/contracts/:contractId/signatures', contractController.getSignaturesByContract.bind(contractController));
router.post('/signatures/:signatureId/sign', contractController.signDocument.bind(contractController));
router.post('/signatures/:signatureId/decline', contractController.declineSignature.bind(contractController));

// Workflows
router.get('/contracts/:contractId/workflow', contractController.getWorkflowByContract.bind(contractController));

// Audit Logs
router.get('/contracts/:contractId/audit-logs', contractController.getAuditLogsByContract.bind(contractController));

export default router;
