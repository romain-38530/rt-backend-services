import { contractRepository } from '../repositories/index.js';
import {
  Contract,
  ContractTemplate,
  Signature,
  SigningWorkflow,
  ContractAuditLog,
  ContractStatus,
  SignatureStatus,
  SignatureType,
  CreateContractTemplateInput,
  UpdateContractTemplateInput,
  CreateContractInput,
  UpdateContractInput,
  CreateSignatureInput,
  SignDocumentInput,
  DeclineSignatureInput,
  CreateSigningWorkflowInput,
  CreateAuditLogInput,
} from '@rt/contracts';

export class ContractService {
  // Contract Templates
  async createTemplate(input: CreateContractTemplateInput, createdBy: string): Promise<ContractTemplate> {
    return await contractRepository.createTemplate({
      ...input,
      createdBy,
    });
  }

  async getTemplateById(id: string): Promise<ContractTemplate | null> {
    return await contractRepository.getTemplateById(id);
  }

  async getAllTemplates(activeOnly = true): Promise<ContractTemplate[]> {
    return await contractRepository.getAllTemplates(activeOnly);
  }

  async updateTemplate(id: string, input: UpdateContractTemplateInput): Promise<ContractTemplate> {
    const template = await contractRepository.updateTemplate(id, input);
    if (!template) {
      throw new Error('Contract template not found');
    }
    return template;
  }

  async deactivateTemplate(id: string): Promise<boolean> {
    return await contractRepository.deactivateTemplate(id);
  }

  // Contracts
  async createContract(input: CreateContractInput, createdBy: string): Promise<Contract> {
    // Validate parties
    if (input.parties.length < 2) {
      throw new Error('Contract must have at least 2 parties');
    }

    // Validate sequential signing order
    if (input.isSequentialSigning) {
      const signingParties = input.parties.filter(p => p.signatureRequired);
      const hasValidOrder = signingParties.every(p => p.signatureOrder !== undefined);
      if (!hasValidOrder) {
        throw new Error('Sequential signing requires signatureOrder for all signing parties');
      }
    }

    // Create contract
    const contract = await contractRepository.createContract({
      title: input.title,
      type: input.type,
      status: ContractStatus.DRAFT,
      templateId: input.templateId,
      parties: input.parties.map((p, index) => ({
        ...p,
        id: `party-${index + 1}`,
      })),
      content: input.content,
      variables: input.variables,
      effectiveDate: input.effectiveDate,
      expirationDate: input.expirationDate,
      signingWorkflowId: '', // Will be set after workflow creation
      isSequentialSigning: input.isSequentialSigning,
      files: input.files,
      createdBy,
      metadata: input.metadata,
    });

    // Create signing workflow
    const signingParties = contract.parties.filter(p => p.signatureRequired);
    const workflow = await this.createSigningWorkflow({
      contractId: contract.id,
      name: `Workflow for ${contract.title}`,
      isSequential: contract.isSequentialSigning,
      steps: signingParties.map((party, index) => ({
        order: party.signatureOrder || index + 1,
        partyId: party.id,
        partyName: party.name,
        partyEmail: party.email,
        status: SignatureStatus.PENDING,
      })),
      reminderIntervalDays: 3,
      expirationDays: 30,
    });

    // Update contract with workflow ID
    const updatedContract = await contractRepository.updateContract(contract.id, {
      signingWorkflowId: workflow.id,
    });

    if (!updatedContract) {
      throw new Error('Failed to update contract with workflow ID');
    }

    // Create audit log
    await this.createAuditLog({
      contractId: contract.id,
      action: 'CONTRACT_CREATED',
      actor: createdBy,
      actorType: 'USER',
      details: {
        title: contract.title,
        type: contract.type,
        parties: contract.parties.length,
      },
    });

    return updatedContract;
  }

  async getContractById(id: string): Promise<Contract | null> {
    return await contractRepository.getContractById(id);
  }

  async getContractsByUserId(userId: string): Promise<Contract[]> {
    return await contractRepository.getContractsByUserId(userId);
  }

  async getContractsByPartyEmail(email: string): Promise<Contract[]> {
    return await contractRepository.getContractsByPartyEmail(email);
  }

  async updateContract(id: string, input: UpdateContractInput, updatedBy: string): Promise<Contract> {
    const contract = await contractRepository.getContractById(id);
    if (!contract) {
      throw new Error('Contract not found');
    }

    // Don't allow updates to signed contracts
    if (contract.status === ContractStatus.FULLY_SIGNED || contract.status === ContractStatus.COMPLETED) {
      throw new Error('Cannot update a signed or completed contract');
    }

    const updated = await contractRepository.updateContract(id, input);
    if (!updated) {
      throw new Error('Failed to update contract');
    }

    // Create audit log
    await this.createAuditLog({
      contractId: id,
      action: 'CONTRACT_UPDATED',
      actor: updatedBy,
      actorType: 'USER',
      details: { updates: Object.keys(input) },
    });

    return updated;
  }

  async sendForSignatures(contractId: string, sendBy: string): Promise<Contract> {
    const contract = await contractRepository.getContractById(contractId);
    if (!contract) {
      throw new Error('Contract not found');
    }

    if (contract.status !== ContractStatus.DRAFT) {
      throw new Error('Only draft contracts can be sent for signatures');
    }

    // Update contract status
    const updated = await contractRepository.updateContract(contractId, {
      status: ContractStatus.PENDING_SIGNATURES,
    });

    if (!updated) {
      throw new Error('Failed to send contract for signatures');
    }

    // Get workflow and start it
    const workflow = await contractRepository.getWorkflowById(contract.signingWorkflowId);
    if (workflow) {
      await contractRepository.updateWorkflow(workflow.id, {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      });

      // Create signatures for all parties
      const signingParties = contract.parties.filter(p => p.signatureRequired);
      for (const party of signingParties) {
        await this.createSignature({
          contractId: contract.id,
          signerEmail: party.email,
          type: SignatureType.SIMPLE,
          expirationDays: 30,
        });
      }
    }

    // Create audit log
    await this.createAuditLog({
      contractId,
      action: 'CONTRACT_SENT_FOR_SIGNATURES',
      actor: sendBy,
      actorType: 'USER',
      details: {
        parties: contract.parties.filter(p => p.signatureRequired).map(p => p.email),
      },
    });

    return updated;
  }

  async cancelContract(contractId: string, cancelledBy: string, reason?: string): Promise<Contract> {
    const contract = await contractRepository.getContractById(contractId);
    if (!contract) {
      throw new Error('Contract not found');
    }

    if (contract.status === ContractStatus.COMPLETED || contract.status === ContractStatus.CANCELLED) {
      throw new Error('Cannot cancel a completed or already cancelled contract');
    }

    const updated = await contractRepository.updateContract(contractId, {
      status: ContractStatus.CANCELLED,
    });

    if (!updated) {
      throw new Error('Failed to cancel contract');
    }

    // Cancel workflow
    const workflow = await contractRepository.getWorkflowById(contract.signingWorkflowId);
    if (workflow) {
      await contractRepository.updateWorkflow(workflow.id, {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      });
    }

    // Create audit log
    await this.createAuditLog({
      contractId,
      action: 'CONTRACT_CANCELLED',
      actor: cancelledBy,
      actorType: 'USER',
      details: { reason },
    });

    return updated;
  }

  // Signatures
  async createSignature(input: CreateSignatureInput): Promise<Signature> {
    const contract = await contractRepository.getContractById(input.contractId);
    if (!contract) {
      throw new Error('Contract not found');
    }

    // Find party by email
    const party = contract.parties.find(p => p.email === input.signerEmail);
    if (!party) {
      throw new Error('Signer not found in contract parties');
    }

    // Check if signature already exists
    const existing = await contractRepository.getSignatureByEmail(input.contractId, input.signerEmail);
    if (existing) {
      throw new Error('Signature request already exists for this signer');
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + input.expirationDays);

    const signature = await contractRepository.createSignature({
      contractId: input.contractId,
      workflowId: contract.signingWorkflowId,
      signerId: party.id,
      signerName: party.name,
      signerEmail: party.email,
      status: SignatureStatus.PENDING,
      type: input.type,
      expiresAt,
    });

    // Create audit log
    await this.createAuditLog({
      contractId: input.contractId,
      action: 'SIGNATURE_REQUESTED',
      actor: 'SYSTEM',
      actorType: 'SYSTEM',
      details: {
        signer: input.signerEmail,
        type: input.type,
      },
    });

    return signature;
  }

  async signDocument(
    signatureId: string,
    input: SignDocumentInput,
    ipAddress?: string,
    userAgent?: string
  ): Promise<Signature> {
    const signature = await contractRepository.getSignatureById(signatureId);
    if (!signature) {
      throw new Error('Signature not found');
    }

    if (signature.status !== SignatureStatus.PENDING) {
      throw new Error('Signature is not pending');
    }

    if (signature.expiresAt && signature.expiresAt < new Date()) {
      await contractRepository.updateSignature(signatureId, {
        status: SignatureStatus.EXPIRED,
      });
      throw new Error('Signature request has expired');
    }

    // Update signature
    const updated = await contractRepository.updateSignature(signatureId, {
      status: SignatureStatus.SIGNED,
      signedAt: new Date(),
      signatureData: input.signatureData,
      ipAddress: ipAddress || input.ipAddress,
      userAgent,
      geolocation: input.geolocation,
    });

    if (!updated) {
      throw new Error('Failed to update signature');
    }

    // Update workflow step
    const workflow = await contractRepository.getWorkflowById(signature.workflowId);
    if (workflow) {
      const stepIndex = workflow.steps.findIndex(s => s.partyEmail === signature.signerEmail);
      if (stepIndex !== -1) {
        workflow.steps[stepIndex].status = SignatureStatus.SIGNED;
        workflow.steps[stepIndex].completedAt = new Date();

        await contractRepository.updateWorkflow(workflow.id, {
          steps: workflow.steps,
          currentStep: workflow.currentStep + 1,
        });
      }

      // Check if all signatures are complete
      await this.checkContractCompletion(signature.contractId);
    }

    // Create audit log
    await this.createAuditLog({
      contractId: signature.contractId,
      action: 'DOCUMENT_SIGNED',
      actor: signature.signerEmail,
      actorType: 'USER',
      details: {
        signatureType: signature.type,
        ipAddress,
      },
      ipAddress,
      userAgent,
    });

    return updated;
  }

  async declineSignature(
    signatureId: string,
    input: DeclineSignatureInput,
    ipAddress?: string,
    userAgent?: string
  ): Promise<Signature> {
    const signature = await contractRepository.getSignatureById(signatureId);
    if (!signature) {
      throw new Error('Signature not found');
    }

    if (signature.status !== SignatureStatus.PENDING) {
      throw new Error('Signature is not pending');
    }

    // Update signature
    const updated = await contractRepository.updateSignature(signatureId, {
      status: SignatureStatus.DECLINED,
      declinedAt: new Date(),
      declineReason: input.reason,
    });

    if (!updated) {
      throw new Error('Failed to decline signature');
    }

    // Update contract status
    await contractRepository.updateContract(signature.contractId, {
      status: ContractStatus.CANCELLED,
    });

    // Update workflow
    await contractRepository.updateWorkflow(signature.workflowId, {
      status: 'CANCELLED',
      cancelledAt: new Date(),
    });

    // Create audit log
    await this.createAuditLog({
      contractId: signature.contractId,
      action: 'SIGNATURE_DECLINED',
      actor: signature.signerEmail,
      actorType: 'USER',
      details: {
        reason: input.reason,
      },
      ipAddress,
      userAgent,
    });

    return updated;
  }

  async getSignaturesByContractId(contractId: string): Promise<Signature[]> {
    return await contractRepository.getSignaturesByContractId(contractId);
  }

  // Signing Workflows
  async createSigningWorkflow(input: CreateSigningWorkflowInput): Promise<SigningWorkflow> {
    // Sort steps by order
    const sortedSteps = [...input.steps].sort((a, b) => a.order - b.order);

    const workflow = await contractRepository.createWorkflow({
      contractId: input.contractId,
      name: input.name,
      isSequential: input.isSequential,
      currentStep: 1,
      totalSteps: sortedSteps.length,
      steps: sortedSteps,
      status: 'PENDING',
      reminderIntervalDays: input.reminderIntervalDays,
      expirationDays: input.expirationDays,
    });

    return workflow;
  }

  async getWorkflowByContractId(contractId: string): Promise<SigningWorkflow | null> {
    return await contractRepository.getWorkflowByContractId(contractId);
  }

  // Audit Logs
  async createAuditLog(input: CreateAuditLogInput): Promise<ContractAuditLog> {
    return await contractRepository.createAuditLog(input);
  }

  async getAuditLogsByContractId(contractId: string): Promise<ContractAuditLog[]> {
    return await contractRepository.getAuditLogsByContractId(contractId);
  }

  // Helper methods
  private async checkContractCompletion(contractId: string): Promise<void> {
    const signatures = await contractRepository.getSignaturesByContractId(contractId);
    const allSigned = signatures.every(s => s.status === SignatureStatus.SIGNED);
    const anySigned = signatures.some(s => s.status === SignatureStatus.SIGNED);

    if (allSigned) {
      // All signatures complete
      await contractRepository.updateContract(contractId, {
        status: ContractStatus.FULLY_SIGNED,
      });

      // Complete workflow
      const contract = await contractRepository.getContractById(contractId);
      if (contract) {
        await contractRepository.updateWorkflow(contract.signingWorkflowId, {
          status: 'COMPLETED',
          completedAt: new Date(),
        });

        // Create audit log
        await this.createAuditLog({
          contractId,
          action: 'CONTRACT_FULLY_SIGNED',
          actor: 'SYSTEM',
          actorType: 'SYSTEM',
          details: {
            totalSignatures: signatures.length,
          },
        });
      }
    } else if (anySigned) {
      // Some signatures complete
      await contractRepository.updateContract(contractId, {
        status: ContractStatus.PARTIALLY_SIGNED,
      });
    }
  }
}

export const contractService = new ContractService();
