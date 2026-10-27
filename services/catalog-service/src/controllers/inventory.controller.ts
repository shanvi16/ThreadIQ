import { inventoryService } from '../services/inventory.service';
import { asyncHandler } from '../utils/http';

export const inventoryController = {
  receive: asyncHandler(async (req, res) => {
    res.status(201).json({ data: await inventoryService.receive(req.body) });
  }),

  adjust: asyncHandler(async (req, res) => {
    res.status(201).json({ data: await inventoryService.adjust(req.body) });
  }),

  deductForSale: asyncHandler(async (req, res) => {
    const { reference, items } = req.body;
    res.status(200).json({ data: await inventoryService.deductForSale(reference, items) });
  }),

  restoreForSale: asyncHandler(async (req, res) => {
    const { reference, reason } = req.body;
    res.status(200).json({ data: await inventoryService.restoreForSale(reference, reason) });
  }),

  movements: asyncHandler(async (req, res) => {
    res.json(await inventoryService.listMovements(req.query as never));
  }),

  lowStock: asyncHandler(async (req, res) => {
    res.json(await inventoryService.lowStock(req.query as never));
  }),

  snapshot: asyncHandler(async (req, res) => {
    res.json({ data: await inventoryService.snapshot((req.query as { status: 'active' | 'all' }).status) });
  }),

  summary: asyncHandler(async (_req, res) => {
    res.json({ data: await inventoryService.summary() });
  }),
};
