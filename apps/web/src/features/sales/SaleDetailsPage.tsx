import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Card, Section } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorState, Skeleton } from '../../components/ui/states';
import { formatDateTime, moneyExact } from '../../lib/format';
import { errorMessage } from '../../lib/http';
import { useSale } from './api';

export function SaleDetailsPage() {
  const { id } = useParams();
  const { data: sale, isLoading, error, refetch } = useSale(id);

  if (isLoading) return <Skeleton className="h-80 w-full" />;
  if (error || !sale) {
    return (
      <Card>
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      </Card>
    );
  }

  return (
    <>
      <Link to="/sales" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All sales
      </Link>
      <PageHeader title={`Sale ${sale.saleNumber}`} description={`Recorded ${formatDateTime(sale.createdAt)} · ${sale.unitsSold} unit${sale.unitsSold === 1 ? '' : 's'}`} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Items" className="lg:col-span-2" description="Names and prices are snapshots from the time of sale." bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="tbl">
              <caption className="sr-only">Sale items</caption>
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Variant</th>
                  <th scope="col" className="text-right">Unit price</th>
                  <th scope="col" className="text-right">Qty</th>
                  <th scope="col" className="text-right">Line total</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((i) => (
                  <tr key={i.variantId}>
                    <td>
                      <Link to={`/products/${i.productId}`} className="font-medium hover:underline">
                        {i.productName}
                      </Link>
                      <p className="text-xs text-muted">{i.category}</p>
                    </td>
                    <td>
                      {i.size} / {i.color}
                      <p className="font-mono text-xs text-muted">{i.sku}</p>
                    </td>
                    <td className="text-right tabular-nums">{moneyExact(i.unitPrice)}</td>
                    <td className="text-right tabular-nums">{i.quantity}</td>
                    <td className="text-right tabular-nums">{moneyExact(i.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Card className="h-fit p-5">
          <h2 className="text-base font-semibold">Totals</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal (gross sales)</dt>
              <dd className="tabular-nums">{moneyExact(sale.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Discount</dt>
              <dd className="tabular-nums">−{moneyExact(sale.discount)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
              <dt>Total (revenue)</dt>
              <dd className="tabular-nums">{moneyExact(sale.total)}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}
