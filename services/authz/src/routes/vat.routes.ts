import { Router } from 'express';
import { VATController } from '../controllers/vat.controller.js';

const router = Router();
const vatController = new VATController();

// POST /vat/validate - Validate VAT with VIES API
router.post('/validate', (req, res) => vatController.validateVAT(req, res));

// POST /vat/validate-format - Validate VAT format only
router.post('/validate-format', (req, res) => vatController.validateVATFormat(req, res));

export default router;
