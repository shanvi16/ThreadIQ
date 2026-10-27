import { productService } from '../services/product.service';
import { asyncHandler } from '../utils/http';

export const productController = {
  create: asyncHandler(async (req, res) => {
    const product = await productService.create(req.body);
    res.status(201).location(`/api/v1/products/${product.id}`).json({ data: product });
  }),

  list: asyncHandler(async (req, res) => {
    res.json(await productService.list(req.query as never));
  }),

  get: asyncHandler(async (req, res) => {
    res.json({ data: await productService.getById(req.params.id) });
  }),

  update: asyncHandler(async (req, res) => {
    res.json({ data: await productService.update(req.params.id, req.body) });
  }),

  archive: asyncHandler(async (req, res) => {
    res.json({ data: await productService.archive(req.params.id) });
  }),

  addVariant: asyncHandler(async (req, res) => {
    res.status(201).json({ data: await productService.addVariant(req.params.id, req.body) });
  }),

  updateVariant: asyncHandler(async (req, res) => {
    const { id, variantId } = req.params;
    res.json({ data: await productService.setReorderThreshold(id, variantId, req.body.reorderThreshold) });
  }),
};
