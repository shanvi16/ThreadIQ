import { Router } from 'express';
import { inventoryController } from '../controllers/inventory.controller';
import { productController } from '../controllers/product.controller';
import { validate } from '../middleware/validate';
import {
  adjustmentBody,
  listMovementsQuery,
  lowStockQuery,
  receiptBody,
  saleDeductionBody,
  saleRestorationBody,
  snapshotQuery,
} from '../validators/inventory.validators';
import {
  createProductBody,
  idParams,
  listProductsQuery,
  updateProductBody,
  updateVariantBody,
  variantInput,
  variantParams,
} from '../validators/product.validators';

export const apiRouter = Router();

// Products
apiRouter.get('/products', validate({ query: listProductsQuery }), productController.list);
apiRouter.post('/products', validate({ body: createProductBody }), productController.create);
apiRouter.get('/products/:id', validate({ params: idParams }), productController.get);
apiRouter.patch('/products/:id', validate({ params: idParams, body: updateProductBody }), productController.update);
apiRouter.delete('/products/:id', validate({ params: idParams }), productController.archive);
apiRouter.post('/products/:id/variants', validate({ params: idParams, body: variantInput }), productController.addVariant);
apiRouter.patch(
  '/products/:id/variants/:variantId',
  validate({ params: variantParams, body: updateVariantBody }),
  productController.updateVariant,
);

// Inventory
apiRouter.get('/inventory/low-stock', validate({ query: lowStockQuery }), inventoryController.lowStock);
apiRouter.get('/inventory/movements', validate({ query: listMovementsQuery }), inventoryController.movements);
apiRouter.get('/inventory/summary', inventoryController.summary);
apiRouter.get('/inventory/snapshot', validate({ query: snapshotQuery }), inventoryController.snapshot);
apiRouter.post('/inventory/receipts', validate({ body: receiptBody }), inventoryController.receive);
apiRouter.post('/inventory/adjustments', validate({ body: adjustmentBody }), inventoryController.adjust);
apiRouter.post('/inventory/sale-deductions', validate({ body: saleDeductionBody }), inventoryController.deductForSale);
apiRouter.post('/inventory/sale-restorations', validate({ body: saleRestorationBody }), inventoryController.restoreForSale);
