import { Request, Response, NextFunction } from 'express';
import { contractService } from '../services/index.js';
import {
  createContractTemplateSchema,
  updateContractTemplateSchema,
  createContractSchema,
  updateContractSchema,
  signDocumentSchema,
  declineSignatureSchema,
} from '@rt/contracts';

export class ContractController {
  // Contract Templates
  async createTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createContractTemplateSchema.parse(req.body);
      const createdBy = req.headers['x-user-id'] as string || 'system';
      const template = await contractService.createTemplate(input, createdBy);
      res.status(201).json({ success: true, data: template });
    } catch (error) {
      next(error);
    }
  }

  async getAllTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const activeOnly = req.query.activeOnly !== 'false';
      const templates = await contractService.getAllTemplates(activeOnly);
      res.json({ success: true, data: templates });
    } catch (error) {
      next(error);
    }
  }

  async getTemplateById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const template = await contractService.getTemplateById(id);

      if (!template) {
        res.status(404).json({ success: false, error: 'Contract template not found' });
        return;
      }

      res.json({ success: true, data: template });
    } catch (error) {
      next(error);
    }
  }

  async updateTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const input = updateContractTemplateSchema.parse(req.body);
      const template = await contractService.updateTemplate(id, input);
      res.json({ success: true, data: template });
    } catch (error) {
      next(error);
    }
  }

  async deactivateTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await contractService.deactivateTemplate(id);
      res.json({ success: true, message: 'Template deactivated successfully' });
    } catch (error) {
      next(error);
    }
  }

  // Contracts
  async createContract(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createContractSchema.parse(req.body);
      const createdBy = req.headers['x-user-id'] as string || 'system';
      const contract = await contractService.createContract(input, createdBy);
      res.status(201).json({ success: true, data: contract });
    } catch (error) {
      next(error);
    }
  }

  async getContractById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const contract = await contractService.getContractById(id);

      if (!contract) {
        res.status(404).json({ success: false, error: 'Contract not found' });
        return;
      }

      res.json({ success: true, data: contract });
    } catch (error) {
      next(error);
    }
  }

  async getContractsByUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;
      const contracts = await contractService.getContractsByUserId(userId);
      res.json({ success: true, data: contracts });
    } catch (error) {
      next(error);
    }
  }

  async getContractsByParty(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.params;
      const contracts = await contractService.getContractsByPartyEmail(email);
      res.json({ success: true, data: contracts });
    } catch (error) {
      next(error);
    }
  }

  async updateContract(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const input = updateContractSchema.parse(req.body);
      const updatedBy = req.headers['x-user-id'] as string || 'system';
      const contract = await contractService.updateContract(id, input, updatedBy);
      res.json({ success: true, data: contract });
    } catch (error) {
      next(error);
    }
  }

  async sendForSignatures(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const sendBy = req.headers['x-user-id'] as string || 'system';
      const contract = await contractService.sendForSignatures(id, sendBy);
      res.json({ success: true, data: contract });
    } catch (error) {
      next(error);
    }
  }

  async cancelContract(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const cancelledBy = req.headers['x-user-id'] as string || 'system';
      const contract = await contractService.cancelContract(id, cancelledBy, reason);
      res.json({ success: true, data: contract });
    } catch (error) {
      next(error);
    }
  }

  // Signatures
  async getSignaturesByContract(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { contractId } = req.params;
      const signatures = await contractService.getSignaturesByContractId(contractId);
      res.json({ success: true, data: signatures });
    } catch (error) {
      next(error);
    }
  }

  async signDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { signatureId } = req.params;
      const input = signDocumentSchema.parse(req.body);
      const ipAddress = req.ip || req.headers['x-forwarded-for'] as string;
      const userAgent = req.headers['user-agent'];

      const signature = await contractService.signDocument(signatureId, input, ipAddress, userAgent);
      res.json({ success: true, data: signature });
    } catch (error) {
      next(error);
    }
  }

  async declineSignature(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { signatureId } = req.params;
      const input = declineSignatureSchema.parse(req.body);
      const ipAddress = req.ip || req.headers['x-forwarded-for'] as string;
      const userAgent = req.headers['user-agent'];

      const signature = await contractService.declineSignature(signatureId, input, ipAddress, userAgent);
      res.json({ success: true, data: signature });
    } catch (error) {
      next(error);
    }
  }

  // Workflows
  async getWorkflowByContract(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { contractId } = req.params;
      const workflow = await contractService.getWorkflowByContractId(contractId);

      if (!workflow) {
        res.status(404).json({ success: false, error: 'Workflow not found' });
        return;
      }

      res.json({ success: true, data: workflow });
    } catch (error) {
      next(error);
    }
  }

  // Audit Logs
  async getAuditLogsByContract(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { contractId } = req.params;
      const logs = await contractService.getAuditLogsByContractId(contractId);
      res.json({ success: true, data: logs });
    } catch (error) {
      next(error);
    }
  }
}

export const contractController = new ContractController();
